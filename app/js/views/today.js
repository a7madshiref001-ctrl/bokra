// Opening screen: the prayer you're in (with the day arc), then today's tasks.
import * as M from '../model.js';
import { header, ch, empty } from '../ui.js';
import { icon } from '../icons.js';
import { dayArc } from '../illus.js';
import { fmtClock, fmtLongDate, fmtHijri, parseKey, fmtMinutes, fmtHm, esc, shiftKey } from '../util.js';
import { taskRow } from './parts.js';
import { playerState, fmtDur } from '../voice.js';
import * as sync from '../sync.js';
import { DEMO } from '../config.js';

export function render() {
  const k = M.today();
  const d = parseKey(k);
  const sh = M.shift(k);
  const chip = sh ? `<span class="hchip">${icon(sh.off ? 'sun' : 'briefcase', 15)}${sh.off ? 'إجازة' : `${fmtHm(sh.start)} – ${fmtHm(sh.end)}`}</span>` : '';
  return `${header('Today', `${fmtLongDate(d)} · ${fmtHijri(d)}`, chip)}
  <div class="today-grid">
    <section class="a-pray">${prayerCard(k)}${voiceCard()}</section>
    <section class="a-tasks">${top3Card(k)}${routineCard(k)}${tasksCard(k)}${inboxCard()}${laterCard(k)}</section>
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

// your recordings, and under each one what Claude heard, what he put where, and his notes
function voiceCard() {
  const notes = M.voiceNotes();
  const typed = M.inboxDone(12).filter((i) => !i.data.seen && !i.data.audio); // typed notes Claude already handled
  if (!notes.length && !typed.length) return '';
  const anyDone = typed.length || notes.some((n) => n.data.processed);
  const right = anyDone ? `<button class="ibtn" data-act="voice-seen" aria-label="تمام، خبّي اللي خلص">${icon('check', 17)}</button>` : '';
  return `<div class="card vcard" data-key="vcard">${ch('Voice', 'mic', right)}
    ${notes.length ? `<ul class="vlist">${notes.slice(0, 6).map(voiceRow).join('')}</ul>` : ''}
    ${typed.slice(0, 2).map((i) => `<p class="vres">${icon('sparkles', 15)}<span>${esc(i.data.result)}</span></p>`).join('')}
  </div>`;
}

function statusOf(i) {
  const st = M.voiceStatus(i);
  if (st === 'local') return DEMO ? ['local', 'Demo · من غير Claude'] : sync.isReady() ? ['up', 'بيتبعت…'] : ['local', 'مستني المزامنة'];
  return { sent: ['wait', 'مستني Claude'], heard: ['wait', 'Claude بيحلله'], done: ['done', 'Claude خلّصه'] }[st];
}

function when(iso) {
  const d = new Date(iso);
  const k = M.logicalKey(d);
  const t = M.today();
  return `${k === t ? '' : k === shiftKey(t, -1) ? 'امبارح ' : `${fmtLongDate(parseKey(k))} `}${fmtClock(d)}`;
}

function voiceRow(i) {
  const d = i.data;
  const a = d.audio || {};
  const ps = playerState(i.id);
  const [cls, label] = statusOf(i);
  const pk = a.peaks && a.peaks.length ? a.peaks : Array(40).fill(3);
  const bars = pk.map((h) => `<i style="--h:${h}"></i>`).join('');
  const said = d.clean || d.transcript;
  return `<li class="vn st-${cls} ${ps.playing ? 'playing' : ''}" data-key="vn-${i.id}" data-vn="${i.id}">
    <div class="vn-row">
      <button class="vplay" data-act="voice-play" data-id="${i.id}" data-on="${ps.playing}" aria-label="اسمع">${icon(ps.playing ? 'pause' : 'play', 18)}</button>
      <div class="vwave" style="--p:${ps.p.toFixed(4)}" aria-hidden="true"><span class="vw-b">${bars}</span><span class="vw-f">${bars}</span></div>
      <span class="vdur num">${fmtDur(a.dur)}</span>
    </div>
    <div class="vn-meta"><span class="vst"><i></i>${label}</span><span class="vtime">${when(d.created_at)}</span>
      <button class="ibtn vdel" data-act="voice-del" data-id="${i.id}" aria-label="امسح التسجيل">${icon('trash', 15)}</button></div>
    ${d.result ? `<p class="vres">${icon('sparkles', 15)}<span>${esc(d.result)}</span></p>` : ''}
    ${d.notes && d.notes.length ? `<ul class="vnotes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${said ? `<details class="vsaid"><summary>${icon('chevD', 14)}اللي قلته</summary><p>${esc(said)}</p></details>` : ''}
  </li>`;
}

function top3Card(k) {
  const list = M.top3(k);
  const done = list.filter((t) => t.data.done).length;
  const right = `<span class="ch-r">${list.length ? `<span class="count num">${done}/${list.length}</span>` : ''}<button class="ibtn" data-act="pick-top3" data-k="${k}" aria-label="اختار">${icon(list.length ? 'edit' : 'plus', 17)}</button></span>`;
  return `<div class="card" data-key="top3">${ch('Top 3', 'diamond', right)}
    ${list.length ? `<ul class="tl">${list.map((t) => taskRow(t, k)).join('')}</ul>` : empty('', 'top3')}
  </div>`;
}

// today's recurring must-dos: Quran, study, the work shift…; done ones sink to the bottom
function routineCard(k) {
  const list = M.routineItems(k);
  if (!list.length) return '';
  const done = list.filter((r) => r.done).length;
  const row = (r) => {
    const box = r.kind === 'shift'
      ? `<button class="cb shift" data-act="routine-open" data-key="${r.key}" data-k="${k}" aria-label="الشيفت">${icon('briefcase', 15)}</button>`
      : `<button class="cb" data-act="routine-tap" data-key="${r.key}" data-k="${k}" aria-label="${r.done ? 'اتعمل' : 'تم'}">${icon('check', 16)}</button>`;
    const meta = [r.metaText ? `<span class="tag num">${esc(r.metaText)}</span>` : '', r.time && r.kind !== 'shift' ? `<span class="tag">${icon('bell', 14)}${fmtHm(r.time)}</span>` : ''].join('');
    return `<li class="task routine ${r.done ? 'done' : ''}" data-key="r-${r.key}">${box}
      <div class="t-main" data-act="routine-open" data-key="${r.key}" data-k="${k}"><div class="t-title">${esc(r.title)}</div>${meta ? `<div class="t-meta">${meta}</div>` : ''}</div>
      <span class="rt-ic">${icon(r.kind === 'shift' ? 'clock' : r.icon || 'refresh', 16)}</span></li>`;
  };
  return `<div class="card" data-key="routine">${ch('Routine', 'refresh', `<span class="count num">${done}/${list.length}</span>`)}
    <ul class="tl">${list.map(row).join('')}</ul></div>`;
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
  const items = M.inbox().filter((i) => !i.data.audio); // recordings live in the Voice card
  if (!items.length) return '';
  return `<div class="card" data-key="inbox">${ch('Inbox', 'inbox', `<span class="count num">${items.length}</span>`)}
    <ul class="tl">${items.map((i) => `<li class="task" data-key="${i.id}">
      <span class="ini">${icon(i.data.source === 'voice' ? 'mic' : 'pen', 16)}</span>
      <div class="t-main"><div class="t-title">${esc(i.data.text)}</div></div>
      <button class="ibtn" data-act="inbox-task" data-id="${i.id}" aria-label="حوّلها لمهمة">${icon('plus', 17)}</button>
      <button class="ibtn" data-act="inbox-del" data-id="${i.id}" aria-label="امسح">${icon('trash', 17)}</button>
    </li>`).join('')}</ul></div>`;
}
