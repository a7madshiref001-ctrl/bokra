import * as M from '../model.js';
import { bar } from '../ui.js';
import { icon } from '../icons.js';
import { esc, fmtHm, fmtMinutes, fmtMoney, relDay, pad } from '../util.js';
import { isNative } from '../native.js';

// ---------- task row ----------
export function taskRow(t, k) {
  const d = t.data;
  const late = !d.done && d.date && d.date < k;
  const meta = [];
  if (d.date && d.date !== k) meta.push(late ? `<span class="late tag">${icon('clock', 14)}متأخرة · ${relDay(d.date, k)}</span>` : `<span class="tag">${icon('calendar', 14)}${relDay(d.date, k)}</span>`);
  if (d.time) meta.push(`<span class="tag">${icon('bell', 14)}${fmtHm(d.time)}</span>`);
  if (d.area) meta.push(`<span class="tag">${esc(d.area)}</span>`);
  if (d.source === 'claude') meta.push(`<span class="tag">${icon('sparkles', 14)}Claude</span>`);
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
const TK = 'bokra.timers';
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

// ---------- tracker tile ----------
const btnAttrs = (act, t, k, extra = '') => `data-act="${act}" data-id="${t.id}" data-k="${k}" ${extra}`;

export function tile(t, k) {
  const d = t.data;
  const ty = d.type;
  const p = M.progress(t, k);
  const weekly = d.period === 'week';
  let v = '', vCls = '', s = d.note ? esc(d.note) : '', a = '', b = '', met = false;

  switch (ty) {
    case 'check': {
      const on = M.entry(t.id, k) === 1;
      if (weekly) { v = `${p.value}<small>من ${p.target} الأسبوع ده</small>`; b = bar(p.ratio); met = p.ratio >= 1; }
      else { v = on ? 'اتعمل' : 'لسه'; vCls = 'ar'; met = on; }
      a = `<button class="btn btn-block ${on ? 'on' : ''}" ${btnAttrs('trk-check', t, k)}>${on ? `${icon('check', 16)} اتعمل` : `${icon('check', 16)} تم`}</button>`;
      break;
    }
    case 'count': {
      const val = Number(M.entry(t.id, k)) || 0;
      v = weekly ? `${p.value}<small>من ${p.target} الأسبوع ده</small>` : `${val}<small>${d.target ? `من ${d.target} ` : ''}${esc(d.unit || '')}</small>`;
      if (weekly && val) s = `النهارده ${val} ${esc(d.unit || '')}`;
      a = `<button class="btn sq" ${btnAttrs('trk-inc', t, k, 'data-n="-1"')} aria-label="ناقص واحد">${icon('minus', 16)}</button>
           <button class="btn" ${btnAttrs('trk-inc', t, k, 'data-n="1"')}>${icon('plus', 16)} ${esc(d.unit || '')}</button>`;
      b = bar(p.ratio); met = p.ratio >= 1;
      break;
    }
    case 'duration': {
      const val = Number(M.entry(t.id, k)) || 0;
      const run = timerFor(t.id);
      v = weekly ? `${Math.round(p.value)}<small>من ${p.target} د الأسبوع ده</small>` : `${val}<small>${d.target ? `من ${d.target} ` : ''}دقيقة</small>`;
      a = run
        ? `<button class="btn btn-block on" ${btnAttrs('timer-stop', t, k)}>${icon('stop', 16)} <span class="num" data-timer="${t.id}">${elapsed(run)}</span></button>`
        : `<button class="btn" ${btnAttrs('trk-inc', t, k, 'data-n="10"')}>+10</button>
           <button class="btn sq" ${btnAttrs('trk-number', t, k)} aria-label="اكتب الدقايق">${icon('edit', 16)}</button>
           <button class="btn sq" ${btnAttrs('timer-start', t, k)} aria-label="ابدأ تايمر">${icon('play', 16)}</button>`;
      b = bar(p.ratio); met = p.ratio >= 1;
      break;
    }
    case 'number': {
      const val = M.entry(t.id, k);
      if (d.auto === 'screen_time') {
        v = val == null ? '—' : `${(val / 60).toFixed(1)}<small>ساعة</small>`;
        s = isNative ? 'بيتحسب لوحده' : 'بيتحسب لوحده على الموبايل';
        if (d.target) s += ` · الحد ${fmtMinutes(d.target)}`;
      } else {
        v = val == null ? '—' : `${val}<small>${esc(d.unit || '')}</small>`;
      }
      a = `<button class="btn btn-block" ${btnAttrs('trk-number', t, k)}>${icon('edit', 16)} سجّل</button>`;
      if (d.target && val != null) b = bar(p.ratio);
      break;
    }
    case 'money': {
      const today = M.expensesSum(t.id, k, k);
      const wk = M.weekKeys(k);
      v = `${fmtMoney(today)}<small>${esc(d.unit || 'ج')} النهارده</small>`;
      s = `${fmtMoney(M.expensesSum(t.id, wk[0], wk[6]))} ${esc(d.unit || 'ج')} الأسبوع ده`;
      a = `<button class="btn btn-block" data-act="add-expense" data-id="${t.id}">${icon('plus', 16)} سجّل</button>`;
      break;
    }
    case 'streak': {
      const days = M.streakDays(t, k);
      v = `${days}<small>يوم</small>`;
      if (d.private) vCls = 'hide';
      s = d.private ? 'محدش شايفه غيرك · دوس عشان تشوف' : `أطول مرة: ${M.bestStreak(t, k)} يوم`;
      a = `<button class="btn btn-block" ${btnAttrs('trk-slip', t, k)}>وقعت</button>`;
      if (d.target) b = bar(p.ratio);
      break;
    }
    case 'sleep': {
      const e = M.entry(t.id, k);
      const h = M.sleepHours(e);
      v = h == null ? 'لسه' : `${h}<small>ساعة</small>`;
      if (h == null) vCls = 'ar';
      s = e ? `نمت ${fmtHm(e.slept)} · صحيت ${fmtHm(e.woke)}` : `هدف الصحيان ${fmtHm(d.target)}`;
      a = `<button class="btn btn-block" ${btnAttrs('trk-sleep', t, k)}>${icon('moon', 16)} ${e ? 'عدّل' : 'سجّل نومك'}</button>`;
      met = e && d.target ? e.woke <= d.target : false;
      break;
    }
    default: v = '—';
  }

  return `<div class="tile ${met ? 'met' : ''}" data-key="${t.id}">
    <div class="tile-h" data-act="tracker-edit" data-id="${t.id}"><span class="ti">${icon(met ? 'check' : d.icon || 'diamond', 18)}</span><span>${esc(d.name)}</span></div>
    <div class="tile-v ${vCls}" ${vCls === 'hide' ? 'data-act="reveal"' : ''}>${v}</div>
    ${s ? `<div class="tile-s">${s}</div>` : ''}
    ${b}
    <div class="tile-a">${a}</div>
  </div>`;
}
