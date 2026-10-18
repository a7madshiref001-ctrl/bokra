// Domain logic: settings, prayers, trackers, tasks, goals, shifts, reports, suggestions.
import * as db from './db.js';
import { dkey, parseKey, addDays, shiftKey, daysBetween, uid, nowISO, hmToMin, pad } from './util.js';
import { prayerTimes, PRAYERS } from './prayer.js';

const SEED_TS = '2000-01-01T00:00:00.000Z';

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  city: 'بني سويف', lat: 29.0661, lng: 31.0994, fajrAngle: 19.5, ishaAngle: 17.5,
  lead: 15, level: 4, sleepFrom: '05:00', sleepTo: '13:30', dayStartHour: 3, preShift: 60,
};
export function settings() { return { ...DEFAULT_SETTINGS, ...(db.data('settings') || {}) }; }
export function saveSettings(p) { db.put('setting', 'settings', { ...(db.data('settings') || {}), ...p }); }

// The day rolls over at dayStartHour (3 AM by default), so 1 AM still counts as "today".
export function logicalKey(date) {
  const d = new Date(date);
  if (d.getHours() < settings().dayStartHour) d.setDate(d.getDate() - 1);
  return dkey(d);
}
export const today = () => logicalKey(new Date());

// "HH:MM" on a logical day -> epoch ms (times before dayStartHour belong to the next calendar day)
export function atTime(k, hm) {
  const d = parseKey(k);
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  if (h < settings().dayStartHour) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function weekStartKey(k) {
  const d = parseKey(k);
  return dkey(addDays(d, -((d.getDay() + 1) % 7))); // Saturday
}
export function weekKeys(k) {
  const s = weekStartKey(k);
  return Array.from({ length: 7 }, (_, i) => shiftKey(s, i));
}

// ---------- prayers ----------
export const prayerId = (k, key) => `p:${k}:${key}`;
export const prayerDone = (k, key) => !!db.data(prayerId(k, key))?.done;
export function setPrayer(k, key, done) { db.put('prayer', prayerId(k, key), { date: k, key, done: !!done }); }

export function prayerDay(k) {
  const s = settings();
  const t = prayerTimes(parseKey(k), s.lat, s.lng, s.fajrAngle, s.ishaAngle);
  return PRAYERS.map((p) => ({ ...p, time: t[p.key], done: prayerDone(k, p.key) }));
}
export function prayerFocus(k) {
  const list = prayerDay(k);
  const now = new Date();
  // the prayer whose time window we're in now; it's the hero only while it's not prayed
  const passed = list.filter((p) => p.time <= now);
  const active = passed[passed.length - 1] || null;
  const current = active && !active.done ? active : null;
  let next = list.find((p) => p.time > now) || null;
  if (!next) { const t = prayerDay(shiftKey(k, 1))[0]; next = { ...t, tomorrow: true }; }
  const missed = passed.filter((p) => !p.done && p !== active);
  return { list, current, next, missed };
}
export function prayerWeekCount(k) {
  let v = 0;
  weekKeys(k).forEach((kk) => PRAYERS.forEach((p) => { if (prayerDone(kk, p.key)) v++; }));
  return v;
}

// ---------- trackers ----------
export const TYPES = {
  check: { label: 'صح ولا لأ', sub: 'عملتها ولا لأ', unit: '' },
  count: { label: 'عدد', sub: 'صفحات، مرات، قعدات', unit: 'مرة' },
  duration: { label: 'وقت', sub: 'بالدقايق، وفيه تايمر', unit: 'دقيقة' },
  number: { label: 'رقم', sub: 'أي رقم بتسجّله', unit: '' },
  money: { label: 'فلوس', sub: 'مصاريف أو دخل', unit: 'ج' },
  streak: { label: 'عداد أيام', sub: 'بعيد عن حاجة', unit: 'يوم' },
  sleep: { label: 'نوم', sub: 'نمت وصحيت امتى', unit: 'ساعة' },
};

export function trackers(includeArchived = false) {
  return db.all('tracker')
    .filter((t) => includeArchived || !t.data.archived)
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
}
export const entryId = (tid, k) => `e:${tid}:${k}`;
export const entry = (tid, k) => db.data(entryId(tid, k))?.value ?? null;
export function setEntry(tid, k, value) { db.put('entry', entryId(tid, k), { tracker: tid, date: k, value }); }

export function activeOn(t, k) {
  const days = t.data.days;
  return !days || !days.length || days.includes(parseKey(k).getDay());
}

export function sleepHours(v) {
  if (!v) return null;
  const a = hmToMin(v.slept), b = hmToMin(v.woke);
  if (a == null || b == null) return null;
  let d = b - a; if (d <= 0) d += 1440;
  return Math.round((d / 60) * 10) / 10;
}

export function dayValue(t, k) {
  const ty = t.data.type;
  if (ty === 'money') return expensesSum(t.id, k, k);
  const v = entry(t.id, k);
  if (ty === 'sleep') return sleepHours(v);
  return v;
}

export function isDoneDay(t, k) {
  const ty = t.data.type, v = dayValue(t, k), tg = Number(t.data.target) || 0;
  if (ty === 'check') return v === 1;
  if (ty === 'streak') return v !== 1;
  if (ty === 'sleep') return v != null;
  if (ty === 'money') return true;
  if (t.data.period === 'week' || !tg) return (Number(v) || 0) > 0;
  if (t.data.lowerIsBetter) return v != null && v <= tg;
  return (Number(v) || 0) >= tg;
}

export function weekSum(t, k) {
  let v = 0;
  weekKeys(k).forEach((kk) => {
    const dv = dayValue(t, kk);
    if (t.data.type === 'check') v += dv === 1 ? 1 : 0;
    else if (t.data.type === 'sleep') v += dv ? 1 : 0;
    else v += Number(dv) || 0;
  });
  return v;
}

export function progress(t, k) {
  const tg = Number(t.data.target) || 0;
  if (t.data.type === 'streak') { const v = streakDays(t, k); return { value: v, target: tg, ratio: tg ? Math.min(1, v / tg) : 0 }; }
  const v = t.data.period === 'week' ? weekSum(t, k) : (Number(dayValue(t, k)) || 0);
  let ratio = tg ? Math.min(1, v / tg) : 0;
  if (t.data.lowerIsBetter && tg) ratio = v <= tg ? 1 : Math.max(0, 1 - (v - tg) / tg);
  return { value: v, target: tg, ratio };
}

export function slipDates(t) {
  return db.all('entry').filter((e) => e.data.tracker === t.id && e.data.value === 1).map((e) => e.data.date).sort();
}
export function streakDays(t, k) {
  const slips = slipDates(t).filter((d) => d <= k);
  const last = slips[slips.length - 1];
  const start = t.data.start || k;
  const base = last && last >= start ? last : start;
  return Math.max(0, daysBetween(base, k));
}
export function bestStreak(t, k) {
  const start = t.data.start || k;
  const points = [start, ...slipDates(t).filter((d) => d >= start && d <= k), k];
  let best = 0;
  for (let i = 1; i < points.length; i++) best = Math.max(best, daysBetween(points[i - 1], points[i]));
  return best;
}

export function addTracker(d) {
  const { id: given, ...rest } = d;
  const id = given || uid('t_');
  const order = Math.max(-1, ...trackers(true).map((t) => t.data.order ?? 0)) + 1;
  db.put('tracker', id, { order, created_at: nowISO(), ...rest });
  return id;
}
export function moveTracker(id, dir) {
  const list = trackers();
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((t, n) => { if ((t.data.order ?? 0) !== n) db.patch(t.id, { order: n }); });
}

// ---------- money ----------
export function expenses(tid, from, to) {
  return db.all('expense')
    .filter((e) => (!tid || e.data.tracker === tid) && e.data.date >= from && e.data.date <= to)
    .sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || ''));
}
export const expensesSum = (tid, from, to) => expenses(tid, from, to).reduce((s, e) => s + (Number(e.data.amount) || 0), 0);
export function addExpense(d) {
  db.put('expense', uid('x_'), { tracker: d.tracker, amount: Number(d.amount), category: d.category || '', note: d.note || '', date: d.date, created_at: nowISO() });
}

// ---------- tasks ----------
export const tasks = () => db.all('task');
export function addTask(d) {
  const id = uid('k_');
  db.put('task', id, {
    title: d.title, date: d.date || null, time: d.time || null, area: d.area || '', notes: d.notes || '',
    top3: d.top3 || null, top3_order: d.top3_order ?? 0, done: false, created_at: nowISO(), source: d.source || null,
  });
  return id;
}
export function toggleTask(id) {
  const t = db.get(id); if (!t) return;
  const done = !t.data.done;
  db.patch(id, { done, done_at: done ? nowISO() : null });
}
export function top3(k) {
  return tasks().filter((t) => t.data.top3 === k).sort((a, b) => (a.data.top3_order ?? 0) - (b.data.top3_order ?? 0));
}
export function setTop3(id, k) {
  const t = db.get(id); if (!t) return false;
  if (t.data.top3 === k) { db.patch(id, { top3: null }); return true; }
  const cur = top3(k);
  if (cur.length >= 3) return false;
  db.patch(id, { top3: k, top3_order: cur.length, date: t.data.date && t.data.date > k ? k : (t.data.date || k) });
  return true;
}
export function doneOn(t, k) { return t.data.done && t.data.done_at && logicalKey(new Date(t.data.done_at)) === k; }
export function todayTasks(k) {
  return tasks().filter((t) => {
    const d = t.data;
    if (d.top3 === k) return false;
    if (d.done) return doneOn(t, k);
    return d.date && d.date <= k;
  }).sort(byTask);
}
export function byTask(a, b) {
  if (a.data.done !== b.data.done) return a.data.done ? 1 : -1;
  const ad = a.data.date || '9999', bd = b.data.date || '9999';
  if (ad !== bd) return ad.localeCompare(bd);
  const at = a.data.time || '99', bt = b.data.time || '99';
  if (at !== bt) return at.localeCompare(bt);
  return (a.data.created_at || '').localeCompare(b.data.created_at || '');
}

// ---------- inbox (دماغي) ----------
export const inbox = () => db.all('inbox').filter((i) => !i.data.processed).sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || ''));
export function addInbox(text) { db.put('inbox', uid('i_'), { text, created_at: nowISO(), processed: false }); }

// ---------- goals ----------
export const goals = () => db.all('goal').sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
export function goalProgress(g, k) {
  const d = g.data, tg = Number(d.target) || 0;
  if (d.tracker === 'prayer') return { value: prayerWeekCount(k), target: tg || 35, unit: 'صلاة', label: 'الأسبوع ده' };
  const t = db.get(d.tracker);
  if (!t) return { value: 0, target: tg, unit: '', label: '' };
  if (t.data.type === 'streak') return { value: streakDays(t, k), target: tg || 30, unit: 'يوم', label: 'من غير ما توقع' };
  return { value: weekSum(t, k), target: tg || Number(t.data.target) || 0, unit: t.data.unit || '', label: 'الأسبوع ده' };
}
export function addGoal(d) {
  const order = Math.max(-1, ...goals().map((g) => g.data.order ?? 0)) + 1;
  db.put('goal', uid('g_'), { order, created_at: nowISO(), ...d });
}

// ---------- shifts ----------
export const shiftId = (k) => `sh:${k}`;
export const shift = (k) => db.data(shiftId(k));
export function setShift(k, v) {
  if (!v) db.remove(shiftId(k));
  else db.put('shift', shiftId(k), { date: k, ...v });
}

// ---------- reports & suggestions ----------
export const reports = () => db.all('report').sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || ''));
export const pendingSuggestions = () => db.all('suggestion').filter((s) => s.data.status === 'pending')
  .sort((a, b) => (a.data.created_at || '').localeCompare(b.data.created_at || ''));

export function decide(id, accept) {
  const s = db.get(id); if (!s) return;
  if (accept) applyAction(s.data.action);
  db.patch(id, { status: accept ? 'accepted' : 'rejected', decided_at: nowISO() });
}

export function applyAction(a) {
  if (!a || !a.type) return;
  switch (a.type) {
    case 'set_target': if (db.get(a.tracker)) db.patch(a.tracker, { target: a.target, ...(a.period ? { period: a.period } : {}) }); break;
    case 'update_tracker': if (db.get(a.tracker)) db.patch(a.tracker, a.patch || {}); break;
    case 'add_tracker': addTracker(a.tracker || {}); break;
    case 'archive_tracker': if (db.get(a.tracker)) db.patch(a.tracker, { archived: true }); break;
    case 'create_task': addTask({ title: a.title, date: a.date, time: a.time, area: a.area, top3: a.top3, source: 'claude' }); if (a.inbox && db.get(a.inbox)) db.patch(a.inbox, { processed: true }); break;
    case 'set_top3': {
      const k = a.date;
      top3(k).forEach((t) => db.patch(t.id, { top3: null }));
      (a.tasks || []).slice(0, 3).forEach((x, i) => {
        let id = x && x.id && db.get(x.id) ? x.id : null;
        if (!id) id = addTask({ title: typeof x === 'string' ? x : x.title, date: k, source: 'claude' });
        const cur = db.get(id);
        db.patch(id, { top3: k, top3_order: i, date: cur.data.date && cur.data.date <= k ? cur.data.date : k });
      });
      break;
    }
    case 'set_shifts': (a.days || []).forEach((d) => setShift(d.date, d.off ? { off: true } : { start: d.start, end: d.end })); break;
    case 'set_setting': saveSettings({ [a.key]: a.value }); break;
    case 'set_goal': if (db.get(a.goal)) db.patch(a.goal, a.patch || {}); break;
    case 'add_goal': addGoal(a.goal || {}); break;
    case 'process_inbox': (a.ids || []).forEach((i) => { if (db.get(i)) db.patch(i, { processed: true }); }); break;
    default: break;
  }
}

// ---------- first run ----------
export function seed() {
  if (db.get('tracker:seeded')) return;
  const k = today();
  const T = [
    ['t_quran', { name: 'القرآن', icon: 'book', type: 'count', unit: 'صفحة', target: 2, period: 'day', note: 'الورد' }],
    ['t_study', { name: 'مذاكرة', icon: 'school', type: 'duration', unit: 'دقيقة', target: 30, period: 'day', note: 'Performance marketing' }],
    ['t_clinics', { name: 'قعدات العيادات', icon: 'briefcase', type: 'count', unit: 'قعدة', target: 5, period: 'week', note: 'Mom Test' }],
    ['t_podcast', { name: 'بودكاست', icon: 'headphones', type: 'check', target: 1, period: 'day', note: '«لماذا ننام» — دوباميكافين' }],
    ['t_sport', { name: 'رياضة', icon: 'activity', type: 'check', target: 4, period: 'week' }],
    ['t_sleep', { name: 'النوم', icon: 'moon', type: 'sleep', target: '14:00', period: 'day', note: 'ميعاد الصحيان المستهدف' }],
    ['t_screen', { name: 'الموبايل', icon: 'phone', type: 'number', unit: 'دقيقة', target: 180, period: 'day', lowerIsBetter: true, auto: 'screen_time' }],
    ['t_money', { name: 'المصاريف', icon: 'wallet', type: 'money', unit: 'ج', target: 0, period: 'day' }],
    ['t_vow', { name: 'العهد', icon: 'lock', type: 'streak', unit: 'يوم', private: true, start: k, target: 30 }],
  ];
  T.forEach(([id, d], i) => { if (!db.get(id)) db.put('tracker', id, { ...d, order: i }, SEED_TS); });
  const G = [
    ['g_prayer', { title: 'أنتظم في الصلاة', tracker: 'prayer', target: 35, order: 0 }],
    ['g_clinics', { title: 'أبدأ مبيعات في العيادات', tracker: 't_clinics', target: 5, order: 1, why: '10 قعدات Mom Test في أول أسبوعين' }],
    ['g_vow', { title: 'العهد', tracker: 't_vow', target: 30, order: 2 }],
  ];
  G.forEach(([id, d]) => { if (!db.get(id)) db.put('goal', id, d, SEED_TS); });
  db.put('meta', 'tracker:seeded', { at: nowISO() }, SEED_TS);
}

// ---------- Android state ----------
export function nativeState() {
  const s = settings(); const k = today();
  const prayed = {};
  [shiftKey(k, -1), k, shiftKey(k, 1)].forEach((kk) => { prayed[kk] = PRAYERS.filter((p) => prayerDone(kk, p.key)).map((p) => p.key); });
  const t3 = top3(k).map((t) => ({ id: t.id, title: t.data.title, done: !!t.data.done, item: { id: t.id, kind: 'task', data: t.data } }));
  return {
    today: k, dayStartHour: s.dayStartHour, lat: s.lat, lng: s.lng, fajrAngle: s.fajrAngle, ishaAngle: s.ishaAngle,
    lead: s.lead, level: s.level, sleepFrom: s.sleepFrom, sleepTo: s.sleepTo,
    prayed, top3: t3, reminders: buildReminders(k),
  };
}

function buildReminders(k) {
  const out = [];
  const now = Date.now(), horizon = now + 48 * 3600e3;
  const s = settings();
  tasks().forEach((t) => {
    const d = t.data;
    if (d.done || !d.date || !d.time) return;
    const at = atTime(d.date, d.time);
    if (at > now && at < horizon) out.push({ id: t.id, kind: 'task', title: d.title, body: d.area ? `مهمة · ${d.area}` : 'مهمة', at, item: { id: t.id, kind: 'task', data: d } });
  });
  trackers().forEach((t) => {
    const d = t.data;
    if (!d.remind || d.private) return;
    [k, shiftKey(k, 1)].forEach((kk) => {
      if (!activeOn(t, kk)) return;
      if (d.period !== 'week' && isDoneDay(t, kk)) return;
      const at = atTime(kk, d.remind);
      if (at <= now || at >= horizon) return;
      const r = { id: `${t.id}:${kk}`, kind: 'tracker', title: d.name, body: d.note || 'فكّرتك', at };
      if (d.type === 'check') r.item = { id: entryId(t.id, kk), kind: 'entry', data: { tracker: t.id, date: kk, value: 1 } };
      out.push(r);
    });
  });
  [k, shiftKey(k, 1)].forEach((kk) => {
    const sh = shift(kk);
    if (!sh || sh.off || !sh.start) return;
    const lead = s.preShift || 60;
    const at = atTime(kk, sh.start) - lead * 60000;
    const left = top3(kk).filter((t) => !t.data.done).map((t) => t.data.title);
    if (at > now && at < horizon && left.length) {
      out.push({ id: `shift:${kk}`, kind: 'nudge', title: lead >= 60 ? `فاضل ${lead / 60 === 1 ? 'ساعة' : `${lead / 60} ساعات`} على الشيفت` : `فاضل ${lead} دقيقة على الشيفت`, body: `لسه فاضل: ${left.join('، ')}`, at });
    }
  });
  return out.sort((a, b) => a.at - b.at).slice(0, 40);
}

export function applyNativeActions(list) {
  (list || []).forEach((a) => {
    switch (a.type) {
      case 'prayer': setPrayer(a.date, a.key, a.done !== false); break;
      case 'task_done': { const t = db.get(a.id); if (t && !t.data.done) db.patch(a.id, { done: true, done_at: a.at ? new Date(a.at).toISOString() : nowISO() }); break; }
      case 'task_undone': { const t = db.get(a.id); if (t && t.data.done) db.patch(a.id, { done: false, done_at: null }); break; }
      case 'task_postpone': {
        const t = db.get(a.id); if (!t) break;
        const nk = shiftKey(today(), 1);
        db.patch(a.id, { date: nk, top3: t.data.top3 ? nk : null });
        break;
      }
      case 'tracker_done': setEntry(a.tracker, a.date, 1); break;
      default: break;
    }
  });
}

// ---------- data for Claude ----------
export function summaryForClaude(days = 14) {
  const k = today();
  const from = shiftKey(k, -(days - 1));
  const tr = trackers(true);
  const dayMap = {};
  for (let i = 0; i < days; i++) {
    const kk = shiftKey(from, i);
    const entries = {};
    tr.forEach((t) => {
      if (t.data.type === 'money') { const v = expensesSum(t.id, kk, kk); if (v) entries[t.id] = v; return; }
      const v = entry(t.id, kk);
      if (v != null) entries[t.id] = v;
    });
    const sh = shift(kk);
    dayMap[kk] = {
      prayers: PRAYERS.filter((p) => prayerDone(kk, p.key)).map((p) => p.key),
      entries,
      shift: sh ? (sh.off ? 'off' : `${sh.start}-${sh.end}`) : null,
      tasks_done: tasks().filter((t) => doneOn(t, kk)).map((t) => t.data.title),
    };
  }
  const next7 = {};
  for (let i = 1; i <= 7; i++) { const kk = shiftKey(k, i); const sh = shift(kk); if (sh) next7[kk] = sh.off ? 'off' : `${sh.start}-${sh.end}`; }
  return {
    app: 'BOKRA', generated_at: nowISO(), today: k, now_local: `${dkey(new Date())} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
    settings: settings(),
    trackers: tr.map((t) => ({ id: t.id, ...t.data })),
    goals: goals().map((g) => ({ id: g.id, ...g.data, progress: goalProgress(g, k) })),
    days: dayMap,
    shifts_next: next7,
    top3_today: top3(k).map((t) => ({ id: t.id, title: t.data.title, done: !!t.data.done })),
    tasks_open: tasks().filter((t) => !t.data.done).sort(byTask).map((t) => ({ id: t.id, title: t.data.title, date: t.data.date, time: t.data.time, area: t.data.area })),
    inbox: inbox().map((i) => ({ id: i.id, text: i.data.text, at: i.data.created_at })),
    schedule_notes: db.all('note').filter((n) => n.data.type === 'schedule').slice(-2).map((n) => n.data),
    recent_reports: reports().slice(0, 4).map((r) => ({ id: r.id, ...r.data })),
    recent_suggestions: db.all('suggestion').sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || '')).slice(0, 15).map((s) => ({ id: s.id, title: s.data.title, status: s.data.status, action: s.data.action })),
  };
}

export function importClaudeReply(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('مفيش JSON في الرد');
  const j = JSON.parse(text.slice(a, b + 1));
  const items = Array.isArray(j.items) ? j.items : [];
  let n = 0;
  items.forEach((it) => {
    if (!it || !it.id || !['report', 'suggestion'].includes(it.kind)) return;
    const d = { created_at: nowISO(), ...it.data };
    if (it.kind === 'suggestion' && !d.status) d.status = 'pending';
    db.put(it.kind, it.id, d); n++;
  });
  return n;
}
