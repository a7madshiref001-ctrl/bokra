import * as M from '../model.js';
import * as db from '../db.js';
import { header, bar, empty, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, shiftKey, parseKey, fmtDayMonth, fmtHm, fmtMoney, fmtMinutes, DAY_NAMES } from '../util.js';

export const state = { off: 0 };

export function render() {
  const k = M.today();
  const base = shiftKey(k, state.off * 7);
  const keys = M.weekKeys(base);
  const label = state.off === 0 ? 'الأسبوع ده' : state.off === 1 ? 'الأسبوع الجاي' : state.off === -1 ? 'الأسبوع اللي فات' : '';
  const range = `${fmtDayMonth(parseKey(keys[0]))} – ${fmtDayMonth(parseKey(keys[6]))}${label ? ` · ${label}` : ''}`;
  const nav = `<span class="vh-nav">
    <button class="ibtn" data-act="week-nav" data-n="-1" aria-label="الأسبوع اللي فات">${icon('chevR')}</button>
    <button class="ibtn" data-act="week-nav" data-n="1" aria-label="الأسبوع الجاي">${icon('chevL')}</button></span>`;
  const isFriday = parseKey(k).getDay() === 5;

  return `${header('Week', range, nav)}
  ${isFriday && state.off === 0 ? `<div class="card" data-key="friday">${ch('Friday', 'calendar')}<p>النهارده الجمعة. حط جدول الأسبوع الجاي عشان Claude يرتّب عليه.</p>
     <div class="actions"><button class="btn btn-primary" data-act="week-nav" data-n="1">افتح الأسبوع الجاي</button></div></div>` : ''}
  <div class="cols2">
    <div>${shiftsCard(keys, k)}${scheduleCard(keys[0])}</div>
    <div>${goalsCard(base)}${trackersCard(keys)}${moneyCard(keys)}</div>
  </div>`;
}

function shiftsCard(keys, k) {
  const rows = keys.map((kk) => {
    const sh = M.shift(kk);
    const dd = parseKey(kk);
    const txt = !sh ? '<span class="s none">مش متسجل</span>'
      : sh.off ? '<span class="s off">إجازة</span>'
        : `<span class="s">${icon('briefcase', 15)}${fmtHm(sh.start)} ← ${fmtHm(sh.end)}</span>`;
    return `<div class="shrow ${kk === k ? 'is-today' : ''}" data-act="shift-edit" data-k="${kk}" data-key="${kk}" role="button" tabindex="0">
      <b>${DAY_NAMES[dd.getDay()]}<span class="d">${dd.getDate()}/${dd.getMonth() + 1}</span></b>${txt}${icon('chevL', 16)}</div>`;
  }).join('');
  return `<div class="card" data-key="shifts">${ch('Shifts', 'briefcase', `<button class="btn btn-sm" data-act="shift-copy" data-k="${keys[0]}">${icon('copy', 16)} انسخ اللي فات</button>`)}${rows}</div>`;
}

function scheduleCard(weekKey) {
  const note = db.data(`n:schedule:${weekKey}`);
  return `<div class="card" data-key="sched">${ch('Work schedule', 'clock')}
    <p class="hint" style="margin-top:0">الصق الجدول زي ما جالك، أو ابعت صورته لـ Claude في الشات. في مراجعة الجمعة هيقراه ويقترح الشيفتات وخطة الأسبوع.</p>
    <form data-form="schedule-note" data-week="${weekKey}">
      <textarea class="in" name="text" style="margin-top:12px" placeholder="مثلًا: السبت 4م-1ص، الحد 4م-1ص، الاتنين إجازة…">${esc(note?.text || '')}</textarea>
      <div class="actions"><button class="btn btn-primary">احفظه لـ Claude</button></div>
    </form></div>`;
}

function goalsCard(base) {
  const list = M.goals();
  return `<div class="card" data-key="goals">${ch('Goals', 'target', `<button class="btn btn-sm" data-act="add-goal">${icon('plus', 16)} هدف</button>`)}
    ${list.length ? list.map((g) => {
      const p = M.goalProgress(g, base);
      const r = p.target ? p.value / p.target : 0;
      const gi = g.data.tracker === 'prayer' ? 'mosque' : (db.data(g.data.tracker)?.icon || 'target');
      return `<div class="goal" data-act="goal-edit" data-id="${g.id}" data-key="${g.id}" role="button" tabindex="0">
        <div class="goal-r"><span class="gt">${icon(gi, 18)}${esc(g.data.title)}</span><span class="v">${Math.round(p.value)} / ${p.target} ${esc(p.unit)}</span></div>
        ${bar(r, r >= 1 ? 'thick ok-bar' : 'thick')}
        ${g.data.why ? `<p class="why">${esc(g.data.why)}</p>` : ''}</div>`;
    }).join('') : empty('مفيش أهداف لسه. ضيف هدف واربطه بحاجة بتتابعها.', 'goals')}
  </div>`;
}

function trackersCard(keys) {
  const rows = M.trackers().filter((t) => !['money', 'streak'].includes(t.data.type)).map((t) => {
    const d = t.data;
    const active = keys.filter((kk) => M.activeOn(t, kk));
    let val = '';
    if (d.type === 'check') {
      const n = keys.filter((kk) => M.entry(t.id, kk) === 1).length;
      val = `${n} / ${d.period === 'week' ? d.target : active.length} يوم`;
    } else if (d.type === 'count' || d.type === 'duration') {
      const sum = keys.reduce((s, kk) => s + (Number(M.entry(t.id, kk)) || 0), 0);
      const tg = d.period === 'week' ? Number(d.target) : Number(d.target) * active.length;
      val = d.type === 'duration' ? `${fmtMinutes(sum)} / ${fmtMinutes(tg)}` : `${sum} / ${tg || '—'} ${esc(d.unit || '')}`;
    } else if (d.type === 'sleep') {
      const hs = keys.map((kk) => M.sleepHours(M.entry(t.id, kk))).filter((h) => h != null);
      val = hs.length ? `متوسط ${(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1)} ساعة` : '—';
    } else {
      const vs = keys.map((kk) => M.entry(t.id, kk)).filter((v) => v != null).map(Number);
      val = vs.length ? (d.auto === 'screen_time' ? `متوسط ${fmtMinutes(vs.reduce((a, b) => a + b, 0) / vs.length)}` : `متوسط ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1)}`) : '—';
    }
    return `<tr><td>${icon(d.icon || 'diamond', 16)}${esc(d.name)}</td><td>${val}</td></tr>`;
  }).join('');
  return `<div class="card" data-key="stats">${ch('Stats', 'activity')}<table class="wk">${rows}</table></div>`;
}

function moneyCard(keys) {
  const money = M.trackers().filter((t) => t.data.type === 'money');
  if (!money.length) return '';
  const k = M.today();
  const monthStart = `${k.slice(0, 8)}01`;
  return money.map((t) => {
    const list = M.expenses(t.id, keys[0], keys[6]);
    return `<div class="card" data-key="m-${t.id}">${ch(esc(t.data.name), 'wallet', `<button class="btn btn-sm" data-act="add-expense" data-id="${t.id}">${icon('plus', 16)} سجّل</button>`, true)}
      <div class="stats" style="margin-top:0">
        <div class="stat"><b>${fmtMoney(M.expensesSum(t.id, keys[0], keys[6]))}</b><span>الأسبوع ده</span></div>
        <div class="stat"><b>${fmtMoney(M.expensesSum(t.id, monthStart, k))}</b><span>الشهر ده</span></div>
      </div>
      ${list.slice(0, 8).map((e) => `<div class="exp"><span>${esc(e.data.category || e.data.note || '—')}${e.data.note && e.data.category ? ` · ${esc(e.data.note)}` : ''}</span>
        <span><span class="amt">${fmtMoney(e.data.amount)}</span>
        <button class="btn btn-ghost btn-sm" data-act="exp-del" data-id="${e.id}" aria-label="امسح">${icon('x', 16)}</button></span></div>`).join('')}
    </div>`;
  }).join('');
}
