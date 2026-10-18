import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { dayArc } from '../illus.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm, esc } from '../util.js';
import { taskRow, habitRow, isComplete } from './parts.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const shTxt = sh ? (sh.off ? 'إجازة النهارده' : `الشيفت ${fmtHm(sh.start)} ← ${fmtHm(sh.end)}`) : '';
  const sub = [fmtLongDate(d), fmtHijri(d), shTxt].filter(Boolean).join(' · ');
  const list = M.trackers().filter((t) => t.data.period === 'week' || M.activeOn(t, k));
  const doneN = list.filter((t) => isComplete(t, k)).length;
  return `${header('Today', sub, '', { greet: true })}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}</section>
    <section class="a-top3">${voiceCard()}${top3Card(k)}</section>
    <section class="a-trk">
      <div class="sec en">Habits <span class="meta">${doneN} اتعملوا النهارده</span></div>
      <div class="habits">${list.map((t) => habitRow(t, k)).join('')}
        <button class="habit add" data-act="add-tracker" data-key="add"><div class="hrow"><span class="hic">${icon('plus', 20)}</span><div class="hmain"><div class="hname">حاجة جديدة تتابعها</div><div class="hmeta">عادة، رقم، وقت، أو فلوس</div></div></div></button>
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
    <div class="pray-foot"><span class="meta" data-anim>${n} من 5 النهارده</span><span class="meta" data-anim>${M.prayerWeekCount(k)} من 35 الأسبوع ده</span></div></div>`;
}

function voiceCard() {
  const done = M.inboxDone(12).filter((i) => !i.data.seen);
  const pend = M.inbox().filter((i) => i.data.source === 'voice');
  if (!done.length && !pend.length) return '';
  const right = done.length
    ? `<button class="ibtn" data-act="voice-seen" aria-label="تمام">${icon('check', 16)}</button>`
    : `<span class="meta">${pend.length} مستني Claude</span>`;
  const cut = (t) => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
  return `<div class="card" data-key="vcard">${ch('Voice', 'mic', right)}
    ${done.slice(0, 3).map((i) => `<div class="vres"><p class="vq">«${esc(cut(i.data.text))}»</p><p class="va">${icon('sparkles', 14)}<span>${esc(i.data.result)}</span></p></div>`).join('')}
    ${pend.length ? `<p class="hint" style="margin-top:${done.length ? 8 : 0}px">${done.length ? `و${pend.length} لسه` : 'اتسجّل'}. أول ما Claude يتوصل هيحط كل حاجة في مكانها.</p>` : ''}
  </div>`;
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
