import * as M from '../model.js';
import { header } from '../ui.js';
import { icon } from '../icons.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm } from '../util.js';
import { taskRow, tile } from './parts.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const shTxt = sh ? (sh.off ? 'إجازة النهارده' : `الشيفت من ${fmtHm(sh.start)} لـ ${fmtHm(sh.end)}`) : '';
  const hij = fmtHijri(d);
  const sub = [fmtLongDate(d), hij, shTxt].filter(Boolean).join(' · ');
  const tiles = M.trackers().filter((t) => t.data.period === 'week' || M.activeOn(t, k)).map((t) => tile(t, k)).join('');
  return `${header('Today', sub)}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}</section>
    <section class="a-top3">${top3Card(k)}</section>
    <section class="a-trk"><div class="grid">${tiles}
      <button class="tile add-tile" data-act="add-tracker">${icon('plus', 22)}<span>حاجة جديدة تتابعها</span></button>
    </div></section>
    <section class="a-tasks">${tasksCard(k)}</section>
  </div>`;
}

function prayerCard(k) {
  const { list, current, next } = M.prayerFocus(k);
  const now = new Date();
  let hero;
  if (current) {
    const mins = Math.max(0, Math.round((now - current.time) / 60000));
    hero = `<div class="pray-top">
      <div><p class="ov">دلوقتي</p><p class="pray-name">${current.name}</p>
      <p class="pray-meta">دخل من ${fmtMinutes(mins)} · ${fmtClock(current.time)}</p></div>
      <button class="btn btn-primary" data-act="pray" data-k="${k}" data-key="${current.key}">${icon('check', 18)} صليت</button>
    </div>`;
  } else {
    const mins = Math.max(0, Math.round((next.time - now) / 60000));
    hero = `<div class="pray-top"><div>
      <p class="ov">${next.tomorrow ? 'الصلاة الجاية · بكرة' : 'الصلاة الجاية'}</p>
      <p class="pray-name">${next.name}</p>
      <p class="pray-meta"><b>بعد ${fmtMinutes(mins)}</b> · ${fmtClock(next.time)}</p>
    </div></div>`;
  }
  const row = list.map((p) => {
    const passed = p.time <= now;
    const cls = p.done ? 'done' : current && p.key === current.key ? 'now' : passed ? 'miss' : '';
    return `<button class="pchip ${cls}" data-act="pray-toggle" data-k="${k}" data-key="${p.key}" aria-pressed="${p.done}" aria-label="${p.name}">
      <b>${p.short}</b><span>${fmtClock(p.time).replace(/ [صم]$/, '')}</span></button>`;
  }).join('');
  const n = list.filter((p) => p.done).length;
  return `<div class="card pray">${hero}<div class="pray-row">${row}</div>
    <p class="meta" style="margin-top:12px">${n} من 5 النهارده · ${M.prayerWeekCount(k)} من 35 الأسبوع ده</p></div>`;
}

function top3Card(k) {
  const list = M.top3(k);
  return `<div class="card"><div class="card-h"><h2>أهم 3</h2>
    <button class="btn btn-sm" data-act="pick-top3" data-k="${k}">${list.length ? 'غيّر' : 'اختار'}</button></div>
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>`
    : '<p class="hint">اختار أهم 3 حاجات، لو عملتهم يبقى يومك اتعمل. هيظهروا في الويدجت كمان.</p>'}
  </div>`;
}

function tasksCard(k) {
  const list = M.todayTasks(k);
  const left = list.filter((t) => !t.data.done).length;
  return `<div class="card"><div class="card-h"><h2>مهام النهارده</h2><span class="meta">${left ? `${left} فاضلين` : ''}</span></div>
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : ''}
    <form class="quick" data-form="quick-task" data-date="${k}">
      <input class="in" name="title" placeholder="ضيف مهمة للنهارده" autocomplete="off" enterkeyhint="done" aria-label="مهمة جديدة">
      <button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button>
    </form></div>`;
}
