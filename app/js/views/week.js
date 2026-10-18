import * as M from '../model.js';
import * as db from '../db.js';
import { header, bar, empty, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, shiftKey, parseKey, fmtDayMonth, fmtHm, fmtMoney, hmToMin, DAY_NAMES } from '../util.js';

export const state = { off: 0 };

// the drawn day runs 6 AM → 6 AM so night shifts stay in one piece
const DAY0 = 360;
const pos = (hm) => (((hmToMin(hm) - DAY0) % 1440) + 1440) % 1440 / 1440;

export function render() {
  const k = M.today();
  const base = shiftKey(k, state.off * 7);
  const keys = M.weekKeys(base);
  const nav = `<span class="vh-nav">
    <button class="ibtn" data-act="week-nav" data-n="-1" aria-label="الأسبوع اللي فات">${icon('chevR')}</button>
    <button class="ibtn" data-act="week-nav" data-n="1" aria-label="الأسبوع الجاي">${icon('chevL')}</button></span>`;
  const range = `${fmtDayMonth(parseKey(keys[0]))} – ${fmtDayMonth(parseKey(keys[6]))}`;
  return `${header('Week', range, nav)}
  <div class="cols2">
    <div>${shiftsCard(keys, k)}${goalsCard(base)}</div>
    <div>${habitsCard(keys, k)}${moneyCard(keys, k)}</div>
  </div>`;
}

function shiftsCard(keys, k) {
  const now = new Date();
  const nowPos = pos(`${now.getHours()}:${now.getMinutes()}`);
  const rows = keys.map((kk) => {
    const sh = M.shift(kk);
    const dd = parseKey(kk);
    let track;
    if (!sh) track = '<span class="tl-track none"></span>';
    else if (sh.off) track = `<span class="tl-track off">${icon('sun', 15)}</span>`;
    else {
      const a = pos(sh.start);
      let b = pos(sh.end);
      if (b <= a) b = 1;
      track = `<span class="tl-track"><span class="tl-block" style="inset-inline-start:${(a * 100).toFixed(1)}%;width:${((b - a) * 100).toFixed(1)}%"><span>${fmtHm(sh.start).replace(/:00/, '')} – ${fmtHm(sh.end).replace(/:00/, '')}</span></span>${kk === k ? `<i class="tl-now" style="inset-inline-start:${(nowPos * 100).toFixed(1)}%"></i>` : ''}</span>`;
    }
    return `<button class="tl-row ${kk === k ? 'is-today' : ''}" data-act="shift-edit" data-k="${kk}" data-key="${kk}">
      <span class="tl-day"><b>${DAY_NAMES[dd.getDay()]}</b><i class="num">${dd.getDate()}</i></span>${track}</button>`;
  }).join('');
  const hasNote = !!db.data(`n:schedule:${keys[0]}`);
  return `<div class="card" data-key="shifts">${ch('Shifts', 'briefcase', `<span class="ch-r">
      <button class="ibtn ${hasNote ? 'on' : ''}" data-act="schedule-paste" data-week="${keys[0]}" aria-label="الصق جدول الشغل">${icon('copy', 17)}</button>
      <button class="ibtn" data-act="shift-copy" data-k="${keys[0]}" aria-label="كرّر الأسبوع اللي فات">${icon('refresh', 17)}</button></span>`)}
    <div class="tl">
      <div class="tl-ticks" aria-hidden="true"><span style="inset-inline-start:0%">6ص</span><span style="inset-inline-start:25%">12م</span><span style="inset-inline-start:50%">6م</span><span style="inset-inline-start:75%">12ص</span></div>
      ${rows}
    </div></div>`;
}

function goalsCard(base) {
  const list = M.goals();
  return `<div class="card" data-key="goals">${ch('Goals', 'target', `<button class="ibtn" data-act="add-goal" aria-label="هدف جديد">${icon('plus', 17)}</button>`)}
    ${list.length ? list.map((g) => {
      const p = M.goalProgress(g, base);
      const r = p.target ? p.value / p.target : 0;
      const gi = g.data.tracker === 'prayer' ? 'mosque' : (db.data(g.data.tracker)?.icon || 'target');
      return `<div class="goal" data-act="goal-edit" data-id="${g.id}" data-key="${g.id}" role="button" tabindex="0">
        <div class="goal-r"><span class="gt">${icon(gi, 18)}${esc(g.data.title)}</span><span class="v num">${Math.round(p.value)}/${p.target}</span></div>
        ${bar(r, r >= 1 ? 'thick ok-bar' : 'thick')}</div>`;
    }).join('') : empty('', 'goals')}
  </div>`;
}

// every habit × every day of the week as small squares: filled = done, faint = partly, outline = still to come
function habitsCard(keys, k) {
  const list = M.trackers().filter((t) => !['money', 'number'].includes(t.data.type));
  const cell = (t, kk) => {
    const d = t.data;
    if (kk > k) return '<i class="hc future"></i>';
    if (d.period !== 'week' && !M.activeOn(t, kk)) return '<i class="hc rest"></i>';
    const v = M.entry(t.id, kk);
    if (d.type === 'check') return `<i class="hc ${v === 1 ? 'on' : ''}"></i>`;
    if (d.type === 'streak') return `<i class="hc ${v === 1 ? 'slip' : kk >= (d.start || kk) ? 'on' : ''}"></i>`;
    if (d.type === 'sleep') return `<i class="hc ${v && d.target && v.woke <= d.target ? 'on' : ''}" style="--r:${v ? 0.45 : 0}"></i>`;
    const n = Number(v) || 0;
    if (d.period === 'week') return `<i class="hc ${n > 0 ? 'on' : ''}"></i>`;
    const tg = Number(d.target) || 0;
    if (tg && n >= tg) return '<i class="hc on"></i>';
    return `<i class="hc" style="--r:${tg ? Math.min(1, n / tg).toFixed(2) : 0}"></i>`;
  };
  const L = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  const head = keys.map((kk) => `<span class="${kk === k ? 'is-today' : ''}">${L[parseKey(kk).getDay()]}</span>`).join('');
  return `<div class="card" data-key="hgrid">${ch('Habits', 'activity')}
    <div class="hg">
      <div class="hg-row hg-head"><span></span><span class="hg-cells">${head}</span></div>
      ${list.map((t) => `<div class="hg-row" data-act="tracker-edit" data-id="${t.id}"><span class="hg-name">${icon(t.data.icon || 'diamond', 16)}<span>${esc(t.data.name)}</span></span>
        <span class="hg-cells">${keys.map((kk) => cell(t, kk)).join('')}</span></div>`).join('')}
    </div></div>`;
}

function moneyCard(keys, k) {
  const t = M.trackers().find((x) => x.data.type === 'money');
  if (!t) return '';
  const days = keys.map((kk) => M.expensesSum(t.id, kk, kk));
  const max = Math.max(1, ...days);
  const total = days.reduce((a, b) => a + b, 0);
  return `<div class="card" data-key="money">${ch(esc(t.data.name), 'wallet', `<button class="ibtn" data-act="add-expense" data-id="${t.id}" aria-label="سجّل">${icon('plus', 17)}</button>`, true)}
    <p class="money-total"><b class="num">${fmtMoney(total)}</b> ${esc(t.data.unit || 'ج')}</p>
    <div class="mbars">${keys.map((kk, i) => `<span class="mb ${kk === k ? 'is-today' : ''}" title="${fmtMoney(days[i])}"><i style="height:${Math.round((days[i] / max) * 100)}%"></i><em>${['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'][parseKey(kk).getDay()]}</em></span>`).join('')}</div>
  </div>`;
}
