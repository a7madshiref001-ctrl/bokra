import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { esc, shiftKey } from '../util.js';
import { taskRow } from './parts.js';

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `من ${Math.max(1, m)} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `من ${h} ساعة`;
  return `من ${Math.round(h / 24)} يوم`;
}

export function render() {
  const k = M.today();
  const all = M.tasks();
  const open = all.filter((t) => !t.data.done).sort(M.byTask);
  const tom = shiftKey(k, 1);
  const groups = [
    ['Overdue', 'clock', open.filter((t) => t.data.date && t.data.date < k)],
    ['Today', 'sun', open.filter((t) => t.data.date === k)],
    ['Tomorrow', 'moon', open.filter((t) => t.data.date === tom)],
    ['Upcoming', 'calendar', open.filter((t) => t.data.date && t.data.date > tom)],
    ['Someday', 'inbox', open.filter((t) => !t.data.date)],
  ].filter(([, , l]) => l.length);
  const done = all.filter((t) => t.data.done && t.data.done_at && Date.now() - new Date(t.data.done_at) < 7 * 864e5)
    .sort((a, b) => b.data.done_at.localeCompare(a.data.done_at));

  return `${header('Tasks', open.length ? `${open.length} مهمة مفتوحة` : 'مفيش حاجة مفتوحة')}
  <form class="quick" data-form="quick-task" data-date="${k}" style="margin-top:16px">
    <input class="in" name="title" placeholder="مهمة جديدة للنهارده" autocomplete="off" enterkeyhint="done" aria-label="مهمة جديدة">
    <button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button>
  </form>
  <p class="hint">عايز ميعاد أو تذكير؟ دوس على <b>+</b> واختار Task.</p>
  ${inboxCard()}
  ${doneCard()}
  ${groups.map(([name, ic, list]) => `<div class="card" data-key="g-${name}">${ch(name, ic, `<span class="meta">${list.length}</span>`)}
     <ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul></div>`).join('')}
  ${!groups.length && !M.inbox().length ? `<div class="card">${empty('مفيش مهام مفتوحة. ضيف واحدة من فوق.', 'tasks')}</div>` : ''}
  ${done.length ? `<div class="card" data-key="done"><details><summary>${ch('Done this week', 'check', `<span class="meta">${done.length} ${icon('chevD', 14)}</span>`)}</summary>
     <ul class="tl">${done.map((t) => taskRow(t, k)).join('')}</ul></details></div>` : ''}`;
}

function inboxCard() {
  const items = M.inbox();
  if (!items.length) return '';
  return `<div class="card" data-key="inbox">${ch('Inbox', 'inbox', `<span class="meta">دماغي · ${items.length}</span>`)}
    <ul class="tl">${items.map((i) => `<li class="task" data-key="${i.id}">
      <div class="t-main"><div class="t-title">${esc(i.data.text)}</div><div class="t-meta">${i.data.source === 'voice' ? `<span class="tag voice">${icon('mic', 14)}صوت</span>` : ''}<span class="tag">${ago(i.data.created_at)}</span></div></div>
      <button class="ibtn" data-act="inbox-task" data-id="${i.id}" aria-label="حوّلها لمهمة">${icon('plus', 18)}</button>
      <button class="ibtn" data-act="inbox-done" data-id="${i.id}" aria-label="خلاص">${icon('check', 18)}</button>
      <button class="ibtn" data-act="inbox-del" data-id="${i.id}" aria-label="امسح">${icon('trash', 18)}</button>
    </li>`).join('')}</ul>
    <p class="hint">Claude هيحط كل واحدة في مكانها أول ما يتوصل: يسجّل اللي عملته، ويعمل المهام، ويسجّل المصاريف.</p></div>`;
}

function doneCard() {
  const items = M.inboxDone(48);
  if (!items.length) return '';
  return `<div class="card" data-key="inbox-done"><details><summary>${ch('Claude applied', 'sparkles', `<span class="meta">${items.length} ${icon('chevD', 14)}</span>`)}</summary>
    ${items.map((i) => `<div class="vres" data-key="${i.id}"><p class="vq">«${esc(i.data.text)}»</p><p class="va">${icon('check', 14)}<span>${esc(i.data.result)}</span></p></div>`).join('')}
  </details></div>`;
}
