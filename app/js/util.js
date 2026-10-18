export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = (n) => String(n).padStart(2, '0');
export const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const shiftKey = (k, n) => dkey(addDays(parseKey(k), n));
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowISO = () => new Date().toISOString();
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// "HH:MM" <-> minutes
export const hmToMin = (s) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
export const minToHm = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

// Egyptian-style 12h time: "3:52 م"
export function fmtClock(date) {
  let h = date.getHours(); const m = date.getMinutes();
  const suf = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${suf}`;
}
export function fmtHm(hm) {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return fmtClock(d);
}
export function fmtMinutes(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min} د`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}س ${m}د` : `${h} ساعة`;
}
export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export const DAY_NAMES = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
// week order in Egypt starts Saturday
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const dateFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' });
export const fmtDayMonth = (d) => dateFmt.format(d);
export function fmtLongDate(d) {
  return `${DAY_NAMES[d.getDay()]} ${dateFmt.format(d)}`;
}
let hijriFmt = null;
try { hijriFmt = new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { /* not supported */ }
export const fmtHijri = (d) => (hijriFmt ? hijriFmt.format(d).replace(/\s*هـ$/, '') : '');

export function relDay(k, today) {
  const diff = daysBetween(today, k);
  if (diff === 0) return 'النهارده';
  if (diff === 1) return 'بكرة';
  if (diff === -1) return 'امبارح';
  if (diff > 1 && diff < 7) return DAY_NAMES[parseKey(k).getDay()];
  return fmtDayMonth(parseKey(k));
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 2400);
}

export function dlFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove(); return ok;
  }
}
