import * as M from '../model.js';
import * as db from '../db.js';
import { burst, buzz } from '../ui.js';
import { icon } from '../icons.js';
import { esc, fmtHm, fmtMinutes, fmtMoney, relDay, pad } from '../util.js';
import { isNative } from '../native.js';
import { DEMO } from '../config.js';

// ---------- task row ----------
export function taskRow(t, k) {
  const d = t.data;
  const late = !d.done && d.date && d.date < k;
  const meta = [];
  if (d.date && d.date !== k) meta.push(late ? `<span class="late tag">${icon('clock', 14)}متأخرة · ${relDay(d.date, k)}</span>` : `<span class="tag">${icon('calendar', 14)}${relDay(d.date, k)}</span>`);
  if (d.time) meta.push(`<span class="tag">${icon('bell', 14)}${fmtHm(d.time)}</span>`);
  if (d.area) meta.push(`<span class="tag">${esc(d.area)}</span>`);
  if (d.source === 'claude') meta.push(`<span class="tag">${icon('sparkles', 14)}Claude</span>`);
  if (d.source === 'voice') meta.push(`<span class="tag voice">${icon('mic', 14)}من صوتك</span>`);
  return `<li class="task ${d.done ? 'done' : ''}" data-key="${t.id}">
    <button class="cb" data-act="task-toggle" data-id="${t.id}" aria-label="${d.done ? 'رجّعها' : 'خلصت'}">${icon('check', 16)}</button>
    <div class="t-main" data-act="task-edit" data-id="${t.id}">
      <div class="t-title">${esc(d.title)}</div>
      ${meta.length ? `<div class="t-meta">${meta.join('')}</div>` : ''}
    </div>
    <button class="star ${d.top3 === k ? 'on' : ''}" data-act="task-top3" data-id="${t.id}" data-k="${k}" aria-label="Top 3">${icon('diamond', 18)}</button>
  </li>`;
}

// ---------- timers (per device) ----------
const TK = DEMO ? 'bokra-demo.timers' : 'bokra.timers';
export function timers() { try { return JSON.parse(localStorage.getItem(TK) || '{}'); } catch (e) { return {}; } }
export const timerFor = (id) => timers()[id] || null;
export function startTimer(id, k) { const t = timers(); t[id] = { start: Date.now(), k }; localStorage.setItem(TK, JSON.stringify(t)); }
export function stopTimer(id) {
  const t = timers(); const r = t[id]; delete t[id]; localStorage.setItem(TK, JSON.stringify(t));
  return r ? { minutes: Math.max(1, Math.round((Date.now() - r.start) / 60000)), k: r.k } : null;
}
export function elapsed(r) {
  const s = Math.max(0, Math.floor((Date.now() - r.start) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

// ---------- habit row: a list item with a liquid progress fill ----------
const btnAttrs = (act, t, k, extra = '') => `data-act="${act}" data-id="${t.id}" data-k="${k}" ${extra}`;

// finished for the day (or for the week, for weekly ones)?
export function isComplete(t, k) {
  if (!t) return false;
  const d = t.data;
  switch (d.type) {
    case 'check': return d.period === 'week' ? M.progress(t, k).ratio >= 1 : M.entry(t.id, k) === 1;
    case 'count': case 'duration': return M.progress(t, k).ratio >= 1;
    case 'sleep': { const e = M.entry(t.id, k); return !!(e && d.target && e.woke && e.woke <= d.target); }
    case 'streak': return !!d.target && M.streakDays(t, k) >= Number(d.target);
    default: return false;
  }
}

// a row that just got finished keeps "celebrate" for a moment, so re-renders don't cut the animation
const party = new Map();
const celebrating = (id) => (party.get(id) || 0) > Date.now();

// call after changing a habit: if it just crossed into "done", celebrate it once
export function afterChange(id, k, wasDone) {
  const t = db.get(id);
  if (wasDone || !isComplete(t, k)) return;
  party.set(id, Date.now() + 1600);
  buzz(28);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const row = document.querySelector(`.habit[data-key="${id}"]`);
    if (!row) return;
    row.classList.add('celebrate');
    burst(row.querySelector('.hic'), true);
  }));
}

export function habitRow(t, k) {
  const d = t.data;
  const p = M.progress(t, k);
  const weekly = d.period === 'week';
  const unit = esc(d.unit || '');
  let meta = '';
  let act = '';
  let ratio = 0;
  let kind = '';

  switch (d.type) {
    case 'check': {
      const on = M.entry(t.id, k) === 1;
      if (weekly) { ratio = p.ratio; meta = `<b>${p.value}</b> من ${p.target} الأسبوع ده${on ? ' · اتعمل النهارده' : ''}`; }
      else { ratio = on ? 1 : 0; meta = on ? 'اتعمل النهارده' : (d.note ? esc(d.note) : 'لسه'); }
      act = `<button class="hbtn tick ${on ? 'on' : ''}" ${btnAttrs('trk-check', t, k)} aria-label="${on ? 'رجّعها' : 'تم'}">${icon('check', 20)}</button>`;
      break;
    }
    case 'count': {
      const val = Number(M.entry(t.id, k)) || 0;
      ratio = p.ratio;
      meta = weekly ? `<b>${p.value}</b> من ${p.target} ${unit} الأسبوع ده` : `<b>${val}</b> من ${d.target || '—'} ${unit}`;
      act = `<button class="hbtn" ${btnAttrs('trk-inc', t, k, 'data-n="-1"')} aria-label="ناقص واحد">${icon('minus', 18)}</button>
        <button class="hbtn primary" ${btnAttrs('trk-inc', t, k, 'data-n="1"')} aria-label="زوّد واحد">${icon('plus', 18)}</button>`;
      break;
    }
    case 'duration': {
      const val = Number(M.entry(t.id, k)) || 0;
      const run = timerFor(t.id);
      ratio = p.ratio;
      if (run) meta = `شغال <b class="num" data-timer="${t.id}">${elapsed(run)}</b>`;
      else if (weekly) meta = `<b>${Math.round(p.value)}</b> من ${p.target} دقيقة الأسبوع ده`;
      else meta = `<b>${val}</b> من ${d.target || '—'} دقيقة${d.note ? ` · ${esc(d.note)}` : ''}`;
      act = run
        ? `<button class="hbtn primary" ${btnAttrs('timer-stop', t, k)} aria-label="وقّف التايمر">${icon('stop', 18)}</button>`
        : `<button class="hbtn txt" ${btnAttrs('trk-inc', t, k, 'data-n="10"')}>+10</button>
           <button class="hbtn primary" ${btnAttrs('timer-start', t, k)} aria-label="ابدأ تايمر">${icon('play', 18)}</button>`;
      break;
    }
    case 'number': {
      const val = M.entry(t.id, k);
      if (d.auto === 'screen_time') meta = val == null ? (isNative ? 'بيتحسب لوحده' : 'بيتحسب لوحده على الموبايل') : `<b>${(val / 60).toFixed(1)}</b> ساعة${d.target ? ` · الحد ${fmtMinutes(d.target)}` : ''}`;
      else meta = val == null ? 'لسه' : `<b>${val}</b> ${unit}`;
      if (d.target && val != null) ratio = Math.min(1, val / d.target);
      kind = d.lowerIsBetter && val != null && d.target && val > d.target ? 'gauge over' : 'gauge';
      act = `<button class="hbtn" ${btnAttrs('trk-number', t, k)} aria-label="سجّل">${icon('edit', 18)}</button>`;
      break;
    }
    case 'money': {
      const wk = M.weekKeys(k);
      meta = `<b>${fmtMoney(M.expensesSum(t.id, k, k))}</b> ${unit} النهارده · ${fmtMoney(M.expensesSum(t.id, wk[0], wk[6]))} الأسبوع ده`;
      kind = 'gauge';
      act = `<button class="hbtn primary" data-act="add-expense" data-id="${t.id}" aria-label="سجّل">${icon('plus', 18)}</button>`;
      break;
    }
    case 'streak': {
      const days = M.streakDays(t, k);
      ratio = d.target ? Math.min(1, days / Number(d.target)) : 0;
      meta = d.private ? `<span class="hide" data-act="reveal"><b>${days}</b> يوم</span> · محدش شايفه غيرك` : `<b>${days}</b> يوم · أطول مرة ${M.bestStreak(t, k)}`;
      act = `<button class="hbtn txt" ${btnAttrs('trk-slip', t, k)}>وقعت</button>`;
      break;
    }
    case 'sleep': {
      const e = M.entry(t.id, k);
      const h = M.sleepHours(e);
      ratio = h ? Math.min(1, h / 8) : 0;
      meta = e ? `<b>${h}</b> ساعة · صحيت ${fmtHm(e.woke)}` : `هدف الصحيان ${fmtHm(d.target)}`;
      if (e && !isComplete(t, k)) kind = 'gauge';
      act = `<button class="hbtn" ${btnAttrs('trk-sleep', t, k)} aria-label="سجّل نومك">${icon('moon', 18)}</button>`;
      break;
    }
    default: break;
  }

  const done = isComplete(t, k);
  const cls = ['habit', done ? 'done' : '', kind, ratio <= 0 ? 'empty' : '', celebrating(t.id) ? 'celebrate' : ''].filter(Boolean).join(' ');
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `<div class="${cls}" data-key="${t.id}" style="--p:${pct}%">
    <div class="hfill" aria-hidden="true"></div>
    <div class="hrow">
      <span class="hic" data-act="tracker-edit" data-id="${t.id}">${icon(done ? 'check' : d.icon || 'diamond', 20)}</span>
      <div class="hmain" data-act="tracker-edit" data-id="${t.id}">
        <div class="hname"><span>${esc(d.name)}</span>${weekly ? '<span class="hwk">أسبوعي</span>' : ''}</div>
        <div class="hmeta" data-anim>${meta}</div>
      </div>
      <div class="hact">${act}</div>
    </div>
  </div>`;
}
