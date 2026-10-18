#!/usr/bin/env python3
"""BOKRA <-> Claude bridge (stdlib only).

  python tools/bokra.py brief            one or two lines for the start of a Claude session (silent if not set up)
  python tools/bokra.py pull [--days 14]  compact JSON of the last N days, for a review
  python tools/bokra.py push FILE.json    upload {"items":[...]} (reports, suggestions, notes)
  python tools/bokra.py whoami            check the connection
  python tools/bokra.py login             one time: paste the anon key, type email + password (password is never saved)

Reads bokra/.env (SUPABASE_URL, SUPABASE_ANON_KEY; BOKRA_EMAIL/BOKRA_PASSWORD optional)
and keeps a renewable session in bokra/.bokra-session.json.
"""
import datetime as dt
import getpass
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
SESSION = ROOT / ".bokra-session.json"
PUSHABLE = {"report", "suggestion", "note"}
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
        "inbox": [{"id": i["id"], "text": i["data"].get("text"), "at": i["data"].get("created_at")}
                  for i in sorted(by_kind.get("inbox", []), key=by_created) if not i["data"].get("processed")],
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
        parts.append(f"{len(inbox)} حاجات في «دماغي»")
    print("BOKRA (سيستم أحمد اليومي): " + " · ".join(parts) + ".")
    if due:
        print("لو مناسب، اعرض عليه في سطر واحد تعمل مراجعة BOKRA دلوقتي بالـ skill bokra-review.")


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
