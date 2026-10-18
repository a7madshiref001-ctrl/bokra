// Second tab: the habits you keep. Today's rows on top, the week as squares under them.
import * as M from '../model.js';
import { header, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, parseKey } from '../util.js';
import { habitRow, isComplete } from './parts.js';

const L = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

export function render() {
  const k = M.today();
  const list = M.trackers().filter((t) => t.data.period === 'week' || M.activeOn(t, k));
  const doneN = list.filter((t) => isComplete(t, k)).length;
  return `${header('Habits', '', `<span class="hchip num">${doneN}/${list.length}</span>`)}
  <div class="cols2">
    <div><div class="habits" style="margin-top:16px">${list.map((t) => habitRow(t, k)).join('')}
      <button class="habit add" data-act="add-tracker" data-key="add" aria-label="حاجة جديدة"><div class="hrow"><span class="hic">${icon('plus', 20)}</span></div></button>
    </div></div>
    <div>${weekGrid(k)}</div>
  </div>`;
}

// every habit × every day of this week: filled = done, faint = partly, dashed = still to come
function weekGrid(k) {
  const keys = M.weekKeys(k);
  const list = M.trackers().filter((t) => !['money', 'number'].includes(t.data.type));
  if (!list.length) return '';
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
  const head = keys.map((kk) => `<span class="${kk === k ? 'is-today' : ''}">${L[parseKey(kk).getDay()]}</span>`).join('');
  return `<div class="card" data-key="hgrid">${ch('This week', 'calendar')}
    <div class="hg">
      <div class="hg-row hg-head"><span></span><span class="hg-cells">${head}</span></div>
      ${list.map((t) => `<div class="hg-row" data-act="tracker-edit" data-id="${t.id}"><span class="hg-name">${icon(t.data.icon || 'diamond', 16)}<span>${esc(t.data.name)}</span></span>
        <span class="hg-cells">${keys.map((kk) => cell(t, kk)).join('')}</span></div>`).join('')}
    </div></div>`;
}
