#!/usr/bin/env python3
"""BOKRA <-> Claude bridge (stdlib only).

  python tools/bokra.py brief            one or two lines for the start of a Claude session (silent if not set up)
  python tools/bokra.py pull [--days 14]  compact JSON of the last N days, for a review
  python tools/bokra.py push FILE.json    upload {"items":[...]} (reports, suggestions, notes)
  python tools/bokra.py apply FILE.json   apply {"ops":[...]} from voice/inbox notes (entries, prayers, expenses, tasks)
  python tools/bokra.py voice            download voice notes Claude hasn't heard, transcribe them here (Whisper), write the text back
  python tools/bokra.py whoami            check the connection
  python tools/bokra.py login             one time: paste the anon key, type email + password (password is never saved)

Reads bokra/.env (SUPABASE_URL, SUPABASE_ANON_KEY; BOKRA_EMAIL/BOKRA_PASSWORD optional)
and keeps a renewable session in bokra/.bokra-session.json.
"""
import datetime as dt
import getpass
import json
import pathlib
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
SESSION = ROOT / ".bokra-session.json"
PUSHABLE = {"report", "suggestion", "note"}
BUCKET = "bokra-voice"
VOICE_DIR = pathlib.Path("F:/bokra-voice") if pathlib.Path("F:/").exists() else ROOT / ".voice"
PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def load_env():
    env = {}
    if not ENV.exists():
        return env
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def configured(env):
    if not (env.get("SUPABASE_URL") and env.get("SUPABASE_ANON_KEY")):
        return False
    return SESSION.exists() or bool(env.get("BOKRA_EMAIL") and env.get("BOKRA_PASSWORD"))


def set_env(key, value):
    lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
    out, done = [], False
    for line in lines:
        if line.split("=", 1)[0].strip() == key:
            out.append(f"{key}={value}")
            done = True
        else:
            out.append(line)
    if not done:
        out.append(f"{key}={value}")
    ENV.write_text("\n".join(out) + "\n", encoding="utf-8")


def http(method, url, headers, body=None, timeout=15):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw else None


def http_bytes(url, headers, timeout=60):
    req = urllib.request.Request(url, method="GET", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save_session(j):
    s = {"access_token": j["access_token"], "refresh_token": j.get("refresh_token"),
         "expires_at": j.get("expires_at") or time.time() + j.get("expires_in", 3600),
         "user_id": j["user"]["id"], "email": j["user"].get("email")}
    SESSION.write_text(json.dumps(s), encoding="utf-8")
    return s


def login(env, timeout=15):
    url = env["SUPABASE_URL"].rstrip("/")
    headers = {"apikey": env["SUPABASE_ANON_KEY"], "Content-Type": "application/json"}
    s = None
    try:
        s = json.loads(SESSION.read_text(encoding="utf-8"))
        if s.get("expires_at", 0) - 120 > time.time():
            return s
    except Exception:
        s = None
    if s and s.get("refresh_token"):
        try:
            return save_session(http("POST", f"{url}/auth/v1/token?grant_type=refresh_token", headers, {"refresh_token": s["refresh_token"]}, timeout))
        except urllib.error.HTTPError:
            pass  # refresh token no longer valid, fall back below
    if env.get("BOKRA_EMAIL") and env.get("BOKRA_PASSWORD"):
        return save_session(http("POST", f"{url}/auth/v1/token?grant_type=password", headers,
                                 {"email": env["BOKRA_EMAIL"], "password": env["BOKRA_PASSWORD"]}, timeout))
    raise SystemExit("BOKRA: الجلسة خلصت. شغّل: python C:/Users/Ahmed/bokra/tools/bokra.py login")


def cmd_login(env):
    url = env.get("SUPABASE_URL") or "https://mjadsoyufdddbqezgrcy.supabase.co"
    if not env.get("SUPABASE_URL"):
        set_env("SUPABASE_URL", url)
    key = env.get("SUPABASE_ANON_KEY")
    if not key:
        key = input("الصق anon public key (من Supabase → Settings → API Keys → Legacy): ").strip()
        set_env("SUPABASE_ANON_KEY", key)
    email = input("إيميل BOKRA: ").strip()
    password = getpass.getpass("باسورد BOKRA (مش هيتحفظ): ")
    j = http("POST", f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
             {"apikey": key, "Content-Type": "application/json"}, {"email": email, "password": password})
    s = save_session(j)
    print(f"تمام. Claude متوصل بـ {s['email']}.")


def rest_headers(env, s, extra=None):
    h = {"apikey": env["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {s['access_token']}", "Content-Type": "application/json"}
    h.update(extra or {})
    return h


def fetch(env, s, query, timeout=20):
    url = env["SUPABASE_URL"].rstrip("/")
    out, offset = [], 0
    while True:
        rows = http("GET", f"{url}/rest/v1/bokra_items?{query}&order=synced_at.asc&limit=1000&offset={offset}", rest_headers(env, s), timeout=timeout)
        out.extend(rows)
        if len(rows) < 1000:
            return out
        offset += 1000


# ---------- summary (mirrors summaryForClaude in app/js/model.js) ----------
def logical_today(day_start):
    now = dt.datetime.now()
    if now.hour < day_start:
        now -= dt.timedelta(days=1)
    return now.date()


def summarize(rows, days):
    items = {r["id"]: r for r in rows if not r.get("deleted")}
    by_kind = {}
    for r in items.values():
        by_kind.setdefault(r["kind"], []).append(r)
    settings = (items.get("settings") or {}).get("data", {})
    today = logical_today(int(settings.get("dayStartHour", 3)))
    start = today - dt.timedelta(days=days - 1)
    keys = [(start + dt.timedelta(days=i)).isoformat() for i in range(days)]
    trackers = sorted(by_kind.get("tracker", []), key=lambda t: t["data"].get("order", 0))
    money_ids = {t["id"] for t in trackers if t["data"].get("type") == "money"}

    def logical_key(iso):
        if not iso:
            return None
        try:
            d = dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
        except ValueError:
            return None
        if d.hour < int(settings.get("dayStartHour", 3)):
            d -= dt.timedelta(days=1)
        return d.date().isoformat()

    day_map = {}
    for k in keys:
        entries = {}
        for t in trackers:
            if t["id"] in money_ids:
                total = sum(float(e["data"].get("amount") or 0) for e in by_kind.get("expense", [])
                            if e["data"].get("tracker") == t["id"] and e["data"].get("date") == k)
                if total:
                    entries[t["id"]] = total
                continue
            e = items.get(f"e:{t['id']}:{k}")
            if e and e["data"].get("value") is not None:
                entries[t["id"]] = e["data"]["value"]
        sh = (items.get(f"sh:{k}") or {}).get("data")
        day_map[k] = {
            "prayers": [p for p in PRAYERS if (items.get(f"p:{k}:{p}") or {}).get("data", {}).get("done")],
            "entries": entries,
            "shift": None if not sh else ("off" if sh.get("off") else f"{sh.get('start')}-{sh.get('end')}"),
            "tasks_done": [t["data"].get("title") for t in by_kind.get("task", [])
                           if t["data"].get("done") and logical_key(t["data"].get("done_at")) == k],
        }

    shifts_next = {}
    for i in range(1, 8):
        k = (today + dt.timedelta(days=i)).isoformat()
        sh = (items.get(f"sh:{k}") or {}).get("data")
        if sh:
            shifts_next[k] = "off" if sh.get("off") else f"{sh.get('start')}-{sh.get('end')}"

    tasks = by_kind.get("task", [])
    tk = today.isoformat()
    by_created = lambda r: r["data"].get("created_at") or ""
    return {
        "app": "BOKRA",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "today": tk,
        "now_local": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "weekday": ["الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"][dt.datetime.now().weekday()],
        "settings": settings,
        "trackers": [{"id": t["id"], **t["data"]} for t in trackers],
        "goals": [{"id": g["id"], **g["data"]} for g in sorted(by_kind.get("goal", []), key=lambda g: g["data"].get("order", 0))],
        "days": day_map,
        "shifts_next": shifts_next,
        "top3_today": [{"id": t["id"], "title": t["data"].get("title"), "done": bool(t["data"].get("done"))}
                       for t in tasks if t["data"].get("top3") == tk],
        "tasks_open": [{"id": t["id"], "title": t["data"].get("title"), "date": t["data"].get("date"),
                        "time": t["data"].get("time"), "area": t["data"].get("area")}
                       for t in sorted(tasks, key=lambda t: (t["data"].get("date") or "9999")) if not t["data"].get("done")],
        # voice notes appear here once `voice` has transcribed them (text = what Whisper heard, may have mistakes)
        "inbox": [{"id": i["id"], "text": i["data"].get("transcript") if i["data"].get("audio") else i["data"].get("text"),
                   "source": i["data"].get("source", "text"), "at": i["data"].get("created_at"),
                   **({"seconds": i["data"]["audio"].get("dur")} if i["data"].get("audio") else {})}
                  for i in sorted(by_kind.get("inbox", []), key=by_created)
                  if not i["data"].get("processed") and (not i["data"].get("audio") or i["data"].get("heard_at"))],
        "voice_not_heard_yet": sum(1 for i in by_kind.get("inbox", []) if i["data"].get("audio") and not i["data"].get("heard_at") and not i["data"].get("processed")),
        "schedule_notes": [n["data"] for n in sorted(by_kind.get("note", []), key=by_created) if n["data"].get("type") == "schedule"][-2:],
        "recent_reports": [{"id": r["id"], **r["data"]} for r in sorted(by_kind.get("report", []), key=by_created, reverse=True)[:4]],
        "recent_suggestions": [{"id": x["id"], "title": x["data"].get("title"), "status": x["data"].get("status"), "action": x["data"].get("action")}
                               for x in sorted(by_kind.get("suggestion", []), key=by_created, reverse=True)[:15]],
    }


# ---------- commands ----------
def cmd_brief(env):
    if not configured(env):
        return
    try:
        s = login(env, timeout=5)
        rows = fetch(env, s, "select=id,kind,data,deleted&kind=in.(report,suggestion,inbox)&deleted=is.false", timeout=5)
    except Exception:
        return
    reports = sorted([r for r in rows if r["kind"] == "report"], key=lambda r: r["data"].get("created_at") or "", reverse=True)
    pending = [r for r in rows if r["kind"] == "suggestion" and r["data"].get("status") == "pending"]
    inbox = [r for r in rows if r["kind"] == "inbox" and not r["data"].get("processed")]
    parts = []
    due = True
    if reports:
        last = reports[0]["data"]
        try:
            age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600
            parts.append(f"آخر مراجعة ({last.get('type')}) من {age:.0f} ساعة")
            due = age > 16
        except Exception:
            parts.append(f"آخر مراجعة: {last.get('type')}")
    else:
        parts.append("لسه مفيش ولا مراجعة")
    if pending:
        parts.append(f"{len(pending)} مقترحات مستنية موافقته")
    if inbox:
        voice = sum(1 for r in inbox if r["data"].get("source") == "voice")
        parts.append(f"{len(inbox)} حاجات في «دماغي» مستنية تتعالج" + (f" ({voice} بصوته)" if voice else ""))
        due = True
    print("BOKRA (سيستم أحمد اليومي): " + " · ".join(parts) + ".")
    if due:
        print("لو مناسب، اعرض عليه في سطر واحد تعالج «دماغي» وتعمل مراجعة BOKRA دلوقتي بالـ skill bokra-review.")


def cmd_pull(env, days):
    s = login(env)
    rows = fetch(env, s, "select=id,kind,data,updated_at,deleted")
    print(json.dumps(summarize(rows, days), ensure_ascii=False, separators=(",", ":")))


def cmd_push(env, path):
    s = login(env)
    j = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    items = j.get("items", j if isinstance(j, list) else [])
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    rows = []
    for it in items:
        if not it or it.get("kind") not in PUSHABLE or not it.get("id"):
            print(f"skip: {it.get('id') if it else it}", file=sys.stderr)
            continue
        data = dict(it.get("data") or {})
        data.setdefault("created_at", now)
        if it["kind"] == "suggestion":
            data.setdefault("status", "pending")
        rows.append({"id": it["id"], "user_id": s["user_id"], "kind": it["kind"], "data": data, "updated_at": now, "deleted": False})
    if not rows:
        print("nothing to push")
        return
    url = env["SUPABASE_URL"].rstrip("/")
    http("POST", f"{url}/rest/v1/bokra_items?on_conflict=user_id,id", rest_headers(env, s, {"Prefer": "resolution=merge-duplicates,return=minimal"}), rows)
    print(f"pushed {len(rows)} items: " + ", ".join(r["id"] for r in rows))


def short_id(prefix):
    return prefix + format(int(time.time() * 1000), "x")[-8:] + secrets.token_hex(3)


def cmd_apply(env, path):
    """Apply what he said in «دماغي» (voice or text) directly to his data. Ops:
    entry {tracker,date,value|add} · prayer {date,key,done} · sleep {tracker,date,slept,woke}
    expense {tracker,date,amount,category,note} · task {title,date,time,area} · task_done {id}
    inbox_done {id,result,clean?,notes?}  result = one Arabic line of what was applied (shown under the note);
                                          clean = his words with Whisper's mistakes fixed; notes = 1-3 short observations
    """
    s = login(env)
    j = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    ops = j.get("ops", [])
    url = env["SUPABASE_URL"].rstrip("/")
    need = set()
    for o in ops:
        if o.get("op") == "entry" and "add" in o:
            need.add(f"e:{o['tracker']}:{o['date']}")
        if o.get("op") in ("task_done", "inbox_done"):
            need.add(o["id"])
    current = {}
    if need:
        ids = ",".join('"' + i.replace('"', "") + '"' for i in need)
        for r in http("GET", f"{url}/rest/v1/bokra_items?select=id,kind,data&id=in.({urllib.parse.quote(ids)})", rest_headers(env, s)):
            current[r["id"]] = r
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    rows, log = {}, []

    def put(id_, kind, data):
        rows[id_] = {"id": id_, "user_id": s["user_id"], "kind": kind, "data": data, "updated_at": now, "deleted": False}

    for o in ops:
        op = o.get("op")
        if op == "entry":
            eid = f"e:{o['tracker']}:{o['date']}"
            if "add" in o:
                base = (rows.get(eid) or current.get(eid) or {}).get("data", {}).get("value") or 0
                value = (float(base) if not isinstance(base, dict) else 0) + float(o["add"])
                value = int(value) if value == int(value) else value
            else:
                value = o.get("value")
            put(eid, "entry", {"tracker": o["tracker"], "date": o["date"], "value": value})
            log.append(f"{o['tracker']} {o['date']} = {value}")
        elif op == "prayer":
            put(f"p:{o['date']}:{o['key']}", "prayer", {"date": o["date"], "key": o["key"], "done": o.get("done", True)})
            log.append(f"prayer {o['date']} {o['key']}")
        elif op == "sleep":
            put(f"e:{o['tracker']}:{o['date']}", "entry", {"tracker": o["tracker"], "date": o["date"], "value": {"slept": o["slept"], "woke": o["woke"]}})
            log.append(f"sleep {o['date']}")
        elif op == "expense":
            put(short_id("x_"), "expense", {"tracker": o.get("tracker", "t_money"), "amount": float(o["amount"]), "category": o.get("category", ""),
                                             "note": o.get("note", ""), "date": o["date"], "created_at": now})
            log.append(f"expense {o['amount']}")
        elif op == "task":
            put(short_id("k_"), "task", {"title": o["title"], "date": o.get("date"), "time": o.get("time"), "area": o.get("area", ""), "notes": "",
                                         "top3": o.get("top3"), "top3_order": 0, "done": False, "created_at": now, "source": "voice"})
            log.append(f"task {o['title']}")
        elif op == "task_done":
            cur = current.get(o["id"])
            if not cur:
                print(f"skip task_done: {o['id']} not found", file=sys.stderr)
                continue
            put(o["id"], "task", {**cur["data"], "done": True, "done_at": now})
            log.append(f"done {cur['data'].get('title')}")
        elif op == "inbox_done":
            cur = current.get(o["id"])
            data = {**(cur["data"] if cur else {}), "processed": True, "processed_at": now, "result": o.get("result", "")}
            if o.get("clean"):
                data["clean"] = o["clean"]
            if o.get("notes"):
                data["notes"] = [str(n) for n in (o["notes"] if isinstance(o["notes"], list) else [o["notes"]])][:4]
            put(o["id"], "inbox", data)
            log.append(f"inbox {o['id']} processed")
        else:
            print(f"skip unknown op: {op}", file=sys.stderr)
    if not rows:
        print("nothing to apply")
        return
    http("POST", f"{url}/rest/v1/bokra_items?on_conflict=user_id,id", rest_headers(env, s, {"Prefer": "resolution=merge-duplicates,return=minimal"}), list(rows.values()))
    print(f"applied {len(rows)} changes: " + " | ".join(log))


def cmd_voice(env):
    """Voice notes are stored as audio. Download the ones not heard yet, transcribe them on this PC,
    and save the text onto each note (the app then shows «Claude سمعه»). Prints what was heard as JSON."""
    s = login(env)
    url = env["SUPABASE_URL"].rstrip("/")
    rows = fetch(env, s, "select=id,kind,data&kind=eq.inbox&deleted=is.false")
    voice = [r for r in rows if r["data"].get("audio") and not r["data"].get("processed")]
    todo = [r for r in voice if r["data"]["audio"].get("up") and r["data"]["audio"].get("path") and not r["data"].get("heard_at")]
    not_up = sum(1 for r in voice if not r["data"]["audio"].get("up"))
    if not todo:
        print(json.dumps({"heard": [], "still_on_phone": not_up}, ensure_ascii=False))
        return
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import listen
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    heard = []
    for r in todo:
        a = r["data"]["audio"]
        local = VOICE_DIR / pathlib.Path(a["path"]).name
        if not local.exists():
            local.write_bytes(http_bytes(f"{url}/storage/v1/object/authenticated/{BUCKET}/{urllib.parse.quote(a['path'])}", rest_headers(env, s)))
        t0 = time.time()
        text, secs = listen.transcribe(local)
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        row = {"id": r["id"], "user_id": s["user_id"], "kind": "inbox", "data": {**r["data"], "transcript": text, "heard_at": now}, "updated_at": now, "deleted": False}
        s = login(env)  # long transcriptions can outlive the token
        http("POST", f"{url}/rest/v1/bokra_items?on_conflict=user_id,id", rest_headers(env, s, {"Prefer": "resolution=merge-duplicates,return=minimal"}), [row])
        heard.append({"id": r["id"], "at": r["data"].get("created_at"), "seconds": a.get("dur") or secs, "text": text, "took": round(time.time() - t0)})
        print(f"heard {r['id']} ({a.get('dur') or secs}s in {round(time.time() - t0)}s)", file=sys.stderr)
    print(json.dumps({"heard": heard, "still_on_phone": not_up}, ensure_ascii=False))


def main():
    env = load_env()
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "brief":
        cmd_brief(env)
        return
    if cmd == "login":
        try:
            cmd_login(env)
        except urllib.error.HTTPError as e:
            print(f"الدخول فشل ({e.code}): {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
            sys.exit(1)
        return
    if not configured(env):
        print("BOKRA مش متوصل: شغّل مرة واحدة: python C:/Users/Ahmed/bokra/tools/bokra.py login")
        sys.exit(2)
    try:
        if cmd == "pull":
            days = int(args[args.index("--days") + 1]) if "--days" in args else 14
            cmd_pull(env, days)
        elif cmd == "push":
            cmd_push(env, args[1])
        elif cmd == "apply":
            cmd_apply(env, args[1])
        elif cmd == "voice":
            cmd_voice(env)
        elif cmd == "whoami":
            s = login(env)
            print(f"ok: {s['email']} ({s['user_id']})")
        else:
            print(__doc__)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"network: {e.reason}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
