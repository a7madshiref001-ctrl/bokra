// Opening screen: the prayer you're in (with the day arc), then today's tasks.
import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { dayArc } from '../illus.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm, esc, shiftKey } from '../util.js';
import { taskRow } from './parts.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const chip = sh ? `<span class="hchip">${icon(sh.off ? 'sun' : 'briefcase', 15)}${sh.off ? 'إجازة' : `${fmtHm(sh.start)} – ${fmtHm(sh.end)}`}</span>` : '';
  return `${header('Today', `${fmtLongDate(d)} · ${fmtHijri(d)}`, chip)}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}${voiceCard()}</section>
    <section class="a-tasks">${top3Card(k)}${tasksCard(k)}${inboxCard()}${laterCard(k)}</section>
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
  return `<div class="card pray" data-key="pray">
    <div class="pray-top">
      <div><p class="pray-name">${p.name}</p>
        <p class="pray-meta">${icon('clock', 15)}${current ? `دخل من ${fmtMinutes(mins)}` : `<b>بعد ${fmtMinutes(mins)}</b>`}</p></div>
      ${current ? `<button class="btn btn-accent pray-cta" data-act="pray" data-k="${k}" data-key="${current.key}">${icon('check', 20)} صليت</button>` : ''}
    </div>
    ${dayArc(list, now, current?.key)}
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
  const right = `<span class="ch-r">${list.length ? `<span class="count num">${done}/${list.length}</span>` : ''}<button class="ibtn" data-act="pick-top3" data-k="${k}" aria-label="اختار">${icon(list.length ? 'edit' : 'plus', 17)}</button></span>`;
  return `<div class="card" data-key="top3">${ch('Top 3', 'diamond', right)}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : empty('', 'top3')}
  </div>`;
}

function tasksCard(k) {
  const list = M.todayTasks(k);
  const left = list.filter((t) => !t.data.done).length;
  return `<div class="card" data-key="tasks">${ch('Tasks', 'list', left ? `<span class="count num">${left}</span>` : '')}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : ''}
    <form class="quick" data-form="quick-task" data-date="${k}">
      <input class="in" name="title" placeholder="مهمة جديدة…" autocomplete="off" enterkeyhint="done" aria-label="مهمة جديدة">
      <button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button>
    </form>
  </div>`;
}

// what's not for today, folded so the screen stays about today
function laterCard(k) {
  const open = M.tasks().filter((t) => !t.data.done).sort(M.byTask);
  const tom = shiftKey(k, 1);
  const groups = [
    ['Tomorrow', 'moon', open.filter((t) => t.data.date === tom)],
    ['Upcoming', 'calendar', open.filter((t) => t.data.date && t.data.date > tom)],
    ['Someday', 'inbox', open.filter((t) => !t.data.date)],
  ].filter(([, , l]) => l.length);
  const n = groups.reduce((s, [, , l]) => s + l.length, 0);
  if (!n) return '';
  return `<div class="card" data-key="later"><details class="fold"><summary>${ch('Later', 'clock', `<span class="ch-r"><span class="count num">${n}</span>${icon('chevD', 16)}</span>`)}</summary>
    ${groups.map(([name, ic, l]) => `<p class="sub en">${icon(ic, 14)}${name}</p><ul class="tl">${l.map((t) => taskRow(t, k)).join('')}</ul>`).join('')}
  </details></div>`;
}

function inboxCard() {
  const items = M.inbox();
  if (!items.length) return '';
  return `<div class="card" data-key="inbox">${ch('Inbox', 'inbox', `<span class="count num">${items.length}</span>`)}
    <ul class="tl">${items.map((i) => `<li class="task" data-key="${i.id}">
      <span class="ini">${icon(i.data.source === 'voice' ? 'mic' : 'pen', 16)}</span>
      <div class="t-main"><div class="t-title">${esc(i.data.text)}</div></div>
      <button class="ibtn" data-act="inbox-task" data-id="${i.id}" aria-label="حوّلها لمهمة">${icon('plus', 17)}</button>
      <button class="ibtn" data-act="inbox-del" data-id="${i.id}" aria-label="امسح">${icon('trash', 17)}</button>
    </li>`).join('')}</ul></div>`;
}
