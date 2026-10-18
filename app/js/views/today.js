import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { dayArc } from '../illus.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm } from '../util.js';
import { taskRow, tile } from './parts.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const shTxt = sh ? (sh.off ? 'إجازة النهارده' : `الشيفت ${fmtHm(sh.start)} ← ${fmtHm(sh.end)}`) : '';
  const sub = [fmtLongDate(d), fmtHijri(d), shTxt].filter(Boolean).join(' · ');
  const list = M.trackers().filter((t) => t.data.period === 'week' || M.activeOn(t, k));
  const doneN = list.filter((t) => ['check', 'count', 'duration'].includes(t.data.type) && M.progress(t, k).ratio >= 1).length;
  return `${header('Today', sub, '', { greet: true })}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}</section>
    <section class="a-top3">${top3Card(k)}</section>
    <section class="a-trk">
      <div class="sec en">Habits <span class="meta">${doneN} اتعملوا النهارده</span></div>
      <div class="grid">${list.map((t) => tile(t, k)).join('')}
        <button class="tile add-tile" data-act="add-tracker" data-key="add"><span class="ti">${icon('plus', 22)}</span><span>حاجة جديدة تتابعها</span></button>
      </div>
    </section>
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
      <button class="btn btn-accent pray-cta" data-act="pray" data-k="${k}" data-key="${current.key}">${icon('check', 20)} صليت</button>
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
  return `<div class="card pray">${hero}
    ${dayArc(list, now, current?.key)}
    <div class="pray-row">${row}</div>
    <div class="pray-foot"><span class="meta">${n} من 5 النهارده</span><span class="meta">${M.prayerWeekCount(k)} من 35 الأسبوع ده</span></div></div>`;
}

function top3Card(k) {
  const list = M.top3(k);
  const done = list.filter((t) => t.data.done).length;
  return `<div class="card">${ch('Top 3', 'diamond', `<button class="btn btn-sm" data-act="pick-top3" data-k="${k}">${list.length ? `${done}/${list.length} · غيّر` : `${icon('plus', 16)} اختار`}</button>`)}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>`
    : empty('اختار أهم 3 حاجات، لو عملتهم يبقى يومك اتعمل. هيظهروا في الويدجت كمان.', 'top3')}
  </div>`;
}

function tasksCard(k) {
  const list = M.todayTasks(k);
  const left = list.filter((t) => !t.data.done).length;
  return `<div class="card">${ch('Tasks', 'list', `<span class="meta">${left ? `${left} فاضلين` : ''}</span>`)}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : ''}
    <form class="quick" data-form="quick-task" data-date="${k}">
      <input class="in" name="title" placeholder="ضيف مهمة للنهارده" autocomplete="off" enterkeyhint="done" aria-label="مهمة جديدة">
      <button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button>
    </form></div>`;
}
