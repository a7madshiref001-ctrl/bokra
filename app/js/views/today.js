import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm, esc } from '../util.js';
import { taskRow, habitRow, isComplete } from './parts.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const chip = sh ? `<span class="hchip">${icon(sh.off ? 'sun' : 'briefcase', 15)}${sh.off ? 'إجازة' : `${fmtHm(sh.start)} – ${fmtHm(sh.end)}`}</span>` : '';
  const list = M.trackers().filter((t) => t.data.period === 'week' || M.activeOn(t, k));
  const doneN = list.filter((t) => isComplete(t, k)).length;
  return `${header('Today', `${fmtLongDate(d)} · ${fmtHijri(d)}`, chip)}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}</section>
    <section class="a-top3">${voiceCard()}${top3Card(k)}</section>
    <section class="a-trk">
      <div class="sec en">Habits <span class="count num">${doneN}/${list.length}</span></div>
      <div class="habits">${list.map((t) => habitRow(t, k)).join('')}
        <button class="habit add" data-act="add-tracker" data-key="add" aria-label="حاجة جديدة"><div class="hrow"><span class="hic">${icon('plus', 20)}</span></div></button>
      </div>
    </section>
  </div>`;
}

function prayerCard(k) {
  const { list, current, next } = M.prayerFocus(k);
  const now = new Date();
  const p = current || next;
  const mins = Math.max(0, Math.round(Math.abs(p.time - now) / 60000));
  const row = list.map((x) => {
    const cls = x.done ? 'done' : current && x.key === current.key ? 'now' : x.time <= now ? 'miss' : '';
    return `<button class="pchip ${cls}" data-act="pray-toggle" data-k="${k}" data-key="${x.key}" aria-pressed="${x.done}" aria-label="${x.name}">
      <b>${x.short}</b><span>${fmtClock(x.time).replace(/ [صم]$/, '')}</span></button>`;
  }).join('');
  return `<div class="card pray">
    <div class="pray-top">
      <div><p class="pray-name">${p.name}</p>
        <p class="pray-meta">${icon('clock', 15)}${current ? `دخل من ${fmtMinutes(mins)}` : `<b>بعد ${fmtMinutes(mins)}</b>`}</p></div>
      ${current ? `<button class="btn btn-accent pray-cta" data-act="pray" data-k="${k}" data-key="${current.key}">${icon('check', 20)} صليت</button>` : ''}
    </div>
    <div class="pray-row">${row}</div>
  </div>`;
}

function voiceCard() {
  const done = M.inboxDone(12).filter((i) => !i.data.seen);
  const pend = M.inbox().filter((i) => i.data.source === 'voice').length;
  if (!done.length && !pend) return '';
  return `<div class="card vcard" data-key="vcard">
    ${done.slice(0, 2).map((i) => `<p class="va">${icon('sparkles', 15)}<span>${esc(i.data.result)}</span></p>`).join('')}
    ${pend ? `<p class="va muted">${icon('mic', 15)}<span>${pend} مستني Claude</span></p>` : ''}
    ${done.length ? `<button class="ibtn vx" data-act="voice-seen" aria-label="تمام">${icon('x', 15)}</button>` : ''}
  </div>`;
}

function top3Card(k) {
  const list = M.top3(k);
  const done = list.filter((t) => t.data.done).length;
  const others = M.todayTasks(k).filter((t) => !t.data.done).length;
  const right = `${list.length ? `<span class="count num">${done}/${list.length}</span>` : ''}<button class="ibtn" data-act="pick-top3" data-k="${k}" aria-label="اختار">${icon(list.length ? 'edit' : 'plus', 17)}</button>`;
  return `<div class="card">${ch('Top 3', 'diamond', `<span class="ch-r">${right}</span>`)}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : empty('', 'top3')}
    ${others ? `<a class="more-link" href="#tasks">${icon('list', 16)}<span>${others} مهام تانية النهارده</span>${icon('chevL', 16)}</a>` : ''}
  </div>`;
}
