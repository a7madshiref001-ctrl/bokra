import * as M from '../model.js';
import { header, empty } from '../ui.js';
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
    ['متأخرة', open.filter((t) => t.data.date && t.data.date < k)],
    ['النهارده', open.filter((t) => t.data.date === k)],
    ['بكرة', open.filter((t) => t.data.date === tom)],
    ['الأيام الجاية', open.filter((t) => t.data.date && t.data.date > tom)],
    ['من غير ميعاد', open.filter((t) => !t.data.date)],
  ].filter(([, l]) => l.length);
  const done = all.filter((t) => t.data.done && t.data.done_at && Date.now() - new Date(t.data.done_at) < 7 * 864e5)
    .sort((a, b) => b.data.done_at.localeCompare(a.data.done_at));

  return `${header('Tasks', open.length ? `${open.length} مهمة مفتوحة` : 'مفيش حاجة مفتوحة')}
  <form class="quick" data-form="quick-task" data-date="${k}" style="margin-top:16px">
    <input class="in" name="title" placeholder="مهمة جديدة للنهارده" autocomplete="off" enterkeyhint="done" aria-label="مهمة جديدة">
    <button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button>
  </form>
  <p class="hint">عايز ميعاد أو تذكير؟ دوس على <b>+</b> تحت واختار «مهمة».</p>
  ${inboxCard()}
  ${groups.map(([name, list]) => `<div class="card"><div class="card-h"><h2>${name}</h2><span class="meta">${list.length}</span></div>
     <ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul></div>`).join('')}
  ${!groups.length && !M.inbox().length ? empty('مفيش مهام مفتوحة. ضيف واحدة من فوق.') : ''}
  ${done.length ? `<div class="card"><details><summary class="card-h"><h2>خلصت الأسبوع ده</h2><span class="meta">${done.length}</span></summary>
     <ul class="tl">${done.map((t) => taskRow(t, k)).join('')}</ul></details></div>` : ''}`;
}

function inboxCard() {
  const items = M.inbox();
  if (!items.length) return '';
  return `<div class="card"><div class="card-h"><h2>دماغي</h2><span class="meta">${items.length} مستنيين ترتيب</span></div>
    <ul class="tl">${items.map((i) => `<li class="task">
      <div class="t-main"><div class="t-title">${esc(i.data.text)}</div><div class="t-meta">${ago(i.data.created_at)}</div></div>
      <button class="ibtn" data-act="inbox-task" data-id="${i.id}" aria-label="حوّلها لمهمة">${icon('plus', 18)}</button>
      <button class="ibtn" data-act="inbox-done" data-id="${i.id}" aria-label="خلاص">${icon('check', 18)}</button>
      <button class="ibtn" data-act="inbox-del" data-id="${i.id}" aria-label="امسح">${icon('trash', 18)}</button>
    </li>`).join('')}</ul>
    <p class="hint">لو سبتهم، Claude هيقترح يحوّلهم لمهام في المراجعة الجاية.</p></div>`;
}
