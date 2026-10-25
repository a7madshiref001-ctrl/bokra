import * as db from './db.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { isNative, call, callJSON } from './native.js';
import { icon } from './icons.js';
import { $, $$, toast, debounce, copyText, dlFile, shiftKey } from './util.js';
import { closeSheet, sheetOpen, morph, enableSheetSwipe, buzz, burst } from './ui.js';
import { CITIES } from './prayer.js';
import { SUPABASE_URL, DEMO } from './config.js';
import { seedDemo } from './demo.js';
import * as S from './sheets.js';
import * as V from './voice.js';
import * as audio from './audio.js';
import * as live from './live.js';
import * as setup from './setup.js';
import { startTimer, stopTimer, timers, elapsed, isComplete, afterChange } from './views/parts.js';
import { claudePrompt } from './views/review.js';
import { LEVELS } from './views/settings.js';
import * as today from './views/today.js';
import * as habits from './views/habits.js';
import * as week from './views/week.js';
import * as review from './views/review.js';
import * as settings from './views/settings.js';

const VIEWS = { today, habits, week, review, settings };
let current = 'today';
let deferred = false;
let booted = false; // the native side can call in (bokraResume) before the local database is open

// ---------- render ----------
function typing() {
  const a = document.activeElement;
  return a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
}
function render(reset = false) {
  if (!reset && typing()) { deferred = true; return; }
  deferred = false;
  const el = $('#view');
  const html = VIEWS[current].render();
  if (reset) {
    el.innerHTML = html;
    // stagger: cards one after another; inside them, chips / blocks / squares / bars in order
    $$('.card, .habit, .sec, .sugg, .quick', el).forEach((n, i) => n.style.setProperty('--d', `${Math.min(i, 12) * 60 + 120}ms`));
    ['.pray-row .pchip', '.tl-block', '.hc', '.mb i'].forEach((sel) => $$(sel, el).forEach((n, i) => n.style.setProperty('--i', i)));
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    clearTimeout(render.t); render.t = setTimeout(() => el.classList.remove('enter'), 1800);
    window.scrollTo(0, 0);
  } else {
    morph(el, html);
  }
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === current));
  moveTabIndicator();
  const pend = M.inbox().length;
  $$('[data-voice-badge]').forEach((b) => { b.hidden = !pend; b.textContent = pend; });
}
function route() {
  const h = (location.hash || '#today').slice(1);
  current = VIEWS[h] ? h : 'today'; // old #tasks links land on Today, where tasks live now
  if (current !== 'week') week.state.off = 0;
  render(true);
}
document.addEventListener('focusout', () => setTimeout(() => { if (deferred && !typing()) render(); }, 0));

function chrome() {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22, el.className); });
}

// ---------- native bridge ----------
const pushNative = debounce(() => { if (isNative) call('updateState', M.nativeState()); }, 400);
function drainNative() {
  if (!isNative) return;
  const acts = callJSON('drainActions');
  if (acts && acts.length) M.applyNativeActions(acts);
  if (booted) V.takeFromWidget(); // voice notes recorded from the home-screen button
}
function screenTime() {
  if (!isNative) return;
  const m = Number(call('screenTimeMinutes'));
  if (!(m >= 0)) return;
  const k = M.today();
  M.trackers().filter((t) => t.data.auto === 'screen_time').forEach((t) => { if (M.entry(t.id, k) !== m) M.setEntry(t.id, k, m); });
}
window.bokraResume = () => { drainNative(); screenTime(); sync.syncNow(); render(); setup.refresh(); };
window.bokraBack = () => {
  if (setup.isOpen()) return false; // back on the setup screen leaves the app, like any first screen
  if (closeSheet()) return true;
  if (current !== 'today') { location.hash = '#today'; return true; }
  return false;
};

// ---------- motion helpers ----------
// the soft pill behind the active tab slides to wherever you go
function moveTabIndicator() {
  const bar = $('.tabbar');
  const ind = $('.tab-ind');
  if (!bar || !ind) return;
  const a = $('.tabbar a.on');
  if (!a) { ind.classList.remove('on'); return; }
  const b = bar.getBoundingClientRect();
  const r = a.getBoundingClientRect();
  ind.style.width = `${r.width - 6}px`;
  ind.style.transform = `translateX(${r.left - b.left + 3}px)`;
  ind.classList.add('on');
}

// a quiet ripple from where your finger touched
const PRESS = '.btn, .hbtn, .ibtn, .pchip, .addcard, .tab-mic, .tabbar a, .tl-row, .chip > span';
function enablePress() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(PRESS);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 2.2;
    const rip = document.createElement('span');
    rip.className = 'rip';
    rip.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    el.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  }, { passive: true });
}

// "+1" that floats up from the button
function floatText(el, text) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'floater';
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 850);
}

// pull down at the top of the page to sync now
function enablePullToSync() {
  const ptr = $('#ptr');
  if (!ptr) return;
  let y0 = null; let dy = 0;
  document.addEventListener('touchstart', (e) => {
    y0 = window.scrollY <= 0 && !sheetOpen() ? e.touches[0].clientY : null; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (!dy) return;
    const p = Math.min(1, dy / 90);
    ptr.classList.add('pull');
    ptr.style.opacity = String(p);
    ptr.style.transform = `translate(-50%, ${-60 + p * 84}px) rotate(${p * 180}deg)`;
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (y0 == null) return;
    y0 = null;
    ptr.classList.remove('pull');
    if (dy > 90) {
      ptr.classList.add('go');
      ptr.style.transform = 'translate(-50%, 24px)';
      buzz(14);
      await sync.syncNow();
      drainNative();
      render();
      setTimeout(() => { ptr.classList.remove('go'); ptr.style.opacity = '0'; ptr.style.transform = 'translate(-50%, -60px)'; }, 500);
    } else {
      ptr.style.opacity = '0'; ptr.style.transform = 'translate(-50%, -60px)';
    }
  });
}

// ---------- actions ----------
const loginError = (m) => ({
  'Invalid login credentials': 'الإيميل أو الباسورد غلط',
  'Email not confirmed': 'أكّد الإيميل الأول من الرسالة اللي جتلك',
  'User already registered': 'الإيميل ده عليه حساب. دوس دخول',
}[m] || m);

const A = {
  ...setup.actions,
  'sheet-close': () => closeSheet(),
  add: () => S.addMenu(),
  'add-task': () => S.taskForm(),
  'add-tracker': () => S.trackerForm(),
  'add-expense': (el) => S.expenseForm(el.dataset.id),
  'add-inbox': () => { closeSheet(); setTimeout(() => V.open(), 220); },
  'add-goal': () => S.goalForm(),

  pray: (el) => { buzz(18); burst(el); M.setPrayer(el.dataset.k, el.dataset.key, true); toast('تقبّل الله'); },
  voice: () => V.open(),
  'voice-done': () => V.done(),
  'voice-cancel': () => V.cancel(),
  'voice-type': () => V.toText(),
  'voice-save-text': () => V.saveText(),
  'voice-legacy': () => V.legacyListen(),
  'voice-play': (el) => V.play(el.dataset.id),
  'voice-del': (el) => {
    if (!el.classList.contains('arm')) {
      el.classList.add('arm'); toast('دوس تاني عشان تمسحه');
      clearTimeout(el.armT); el.armT = setTimeout(() => el.classList.remove('arm'), 3000);
      return;
    }
    V.remove(el.dataset.id); toast('اتمسح');
  },
  'voice-seen': () => {
    M.voiceNotes().filter((i) => i.data.processed).forEach((i) => db.patch(i.id, { seen: true }));
    M.inboxDone(12).forEach((i) => db.patch(i.id, { seen: true }));
  },
  'pray-toggle': (el) => { buzz(); const { k, key } = el.dataset; M.setPrayer(k, key, !M.prayerDone(k, key)); },

  'task-toggle': (el) => { buzz(); M.toggleTask(el.dataset.id); },
  'task-edit': (el) => S.taskForm(el.dataset.id),
  'task-top3': (el) => { buzz(); if (!M.setTop3(el.dataset.id, el.dataset.k)) toast('Top 3 مليانين. شيل واحدة الأول'); },
  'task-del': (el) => { db.remove(el.dataset.id); closeSheet(); toast('اتمسحت'); },
  'pick-top3': (el) => S.top3Picker(el.dataset.k),
  'top3-pick': (el) => { buzz(); if (!M.setTop3(el.dataset.id, el.dataset.k)) toast('3 بس'); S.top3Picker(el.dataset.k); },

  'trk-check': (el) => {
    buzz(); const { id, k } = el.dataset; const was = isComplete(db.get(id), k);
    M.setEntry(id, k, M.entry(id, k) === 1 ? 0 : 1); afterChange(id, k, was);
  },
  'trk-inc': (el) => {
    buzz(); const { id, k, n } = el.dataset; const was = isComplete(db.get(id), k);
    M.setEntry(id, k, Math.max(0, (Number(M.entry(id, k)) || 0) + Number(n))); afterChange(id, k, was);
    floatText(el, Number(n) > 0 ? `+${n}` : `${n}`);
  },
  'trk-number': (el) => S.numberForm(el.dataset.id, el.dataset.k),
  'trk-sleep': (el) => S.sleepForm(el.dataset.id, el.dataset.k),
  'trk-slip': (el) => S.slipConfirm(el.dataset.id, el.dataset.k),
  'slip-yes': (el) => { M.setEntry(el.dataset.id, el.dataset.k, 1); closeSheet(); toast('اتسجّل. العداد بدأ من النهارده'); },
  'routine-tap': (el) => {
    const { key, k } = el.dataset;
    const r = M.routineItems(k).find((x) => x.key === key);
    if (!r) return;
    if (r.op === 'open') { A['routine-open'](el); return; }
    buzz();
    const was = isComplete(db.get(r.tracker), k);
    M.setEntry(r.tracker, k, r.next);
    if (r.op === 'inc') floatText(el, '+1');
    afterChange(r.tracker, k, was);
  },
  'routine-open': (el) => {
    const { key, k } = el.dataset;
    if (key.startsWith('sh:')) { S.shiftForm(k); return; }
    const t = db.get(key);
    if (t && (t.data.type === 'count' || t.data.type === 'duration')) S.numberForm(key, k); else S.trackerForm(key);
  },
  'timer-start': (el) => { startTimer(el.dataset.id, el.dataset.k); render(); },
  'timer-stop': (el) => {
    const r = stopTimer(el.dataset.id);
    if (r) {
      const was = isComplete(db.get(el.dataset.id), r.k);
      M.setEntry(el.dataset.id, r.k, (Number(M.entry(el.dataset.id, r.k)) || 0) + r.minutes);
      floatText(el, `+${r.minutes} د`);
      afterChange(el.dataset.id, r.k, was);
    }
    render();
  },
  'tracker-edit': (el) => S.trackerForm(el.dataset.id),
  'trk-archive': (el) => { db.patch(el.dataset.id, { archived: true }); closeSheet(); toast('اتشالت. ترجّعها من الإعدادات'); },
  'trk-restore': (el) => db.patch(el.dataset.id, { archived: false }),
  'trk-move': (el) => M.moveTracker(el.dataset.id, Number(el.dataset.n)),
  reveal: (el) => { el.classList.remove('hide'); setTimeout(() => el.classList.add('hide'), 4000); },
  'entry-clear': (el) => { db.remove(M.entryId(el.dataset.id, el.dataset.k)); closeSheet(); },

  'inbox-task': (el) => { const i = db.get(el.dataset.id); if (i) S.taskForm(null, { title: i.data.text, inbox: i.id }); },
  'inbox-done': (el) => db.patch(el.dataset.id, { processed: true }),
  'inbox-del': (el) => db.remove(el.dataset.id),

  'week-nav': (el) => { week.state.off += Number(el.dataset.n); render(); window.scrollTo(0, 0); },
  'shift-edit': (el) => S.shiftForm(el.dataset.k),
  'schedule-paste': (el) => S.scheduleForm(el.dataset.week),
  'shift-copy': (el) => {
    const start = el.dataset.k; let n = 0;
    for (let i = 0; i < 7; i++) {
      const src = M.shift(shiftKey(start, i - 7));
      if (src && !M.shift(shiftKey(start, i))) { const { date, ...rest } = src; M.setShift(shiftKey(start, i), rest); n++; }
    }
    toast(n ? `اتنسخ ${n} يوم` : 'مفيش حاجة تتنسخ');
  },
  'goal-edit': (el) => S.goalForm(el.dataset.id),
  'goal-del': (el) => { db.remove(el.dataset.id); closeSheet(); },
  'exp-del': (el) => db.remove(el.dataset.id),

  sugg: (el) => { buzz(); const yes = el.dataset.yes === '1'; M.decide(el.dataset.id, yes); toast(yes ? 'اتنفّذ' : 'اتشال'); },
  'copy-claude': () => S.copyClaudeMenu(),
  'copy-claude-go': async (el) => { const ok = await copyText(claudePrompt(el.dataset.type)); closeSheet(); toast(ok ? 'اتنسخ. الصقه في شات Claude' : 'مقدرتش أنسخ'); },
  'paste-claude': () => S.pasteClaude(),

  'sync-now': () => sync.syncNow(),
  'sync-out': () => { sync.signOut(); render(); },
  'sync-reset': () => { localStorage.removeItem('bokra.sync.cfg'); sync.signOut(); render(); },
  // newer APK: the system dialog when there is one (ask); older: the settings page
  'native-settings': (el) => call(typeof window.BokraNative?.ask === 'function' ? 'ask' : 'openSettings', el.dataset.which),
  'native-test': () => call('testNotification'),
  'backup-out': () => {
    const text = JSON.stringify({ app: 'BOKRA', at: new Date().toISOString(), items: db.everything().map(({ dirty, ...r }) => r) });
    if (isNative) call('share', { title: 'BOKRA backup', text }); else dlFile(`bokra-${M.today()}.json`, text);
  },
  'backup-in': () => S.backupIn(),
  'demo-reset': async () => {
    localStorage.removeItem('bokra-demo.items'); localStorage.removeItem('bokra-demo.timers');
    await new Promise((r) => { const q = indexedDB.deleteDatabase('bokra-demo'); q.onsuccess = q.onerror = q.onblocked = () => r(); setTimeout(r, 1500); });
    location.reload();
  },
};

const F = {
  ...S.forms,
  capture(f, fd) {
    const t = (fd.get('text') || '').trim();
    if (!t) return;
    M.addInbox(t); f.reset(); toast('اتحفظت في دماغي');
  },
  'quick-task'(f, fd) {
    const t = (fd.get('title') || '').trim();
    if (!t) return;
    M.addTask({ title: t, date: f.dataset.date || M.today() });
    f.reset();
  },
  'top3-new'(f, fd) {
    const t = (fd.get('title') || '').trim();
    if (!t) return;
    const id = M.addTask({ title: t, date: f.dataset.k });
    if (!M.setTop3(id, f.dataset.k)) toast('3 بس، اتضافت كمهمة عادية');
    S.top3Picker(f.dataset.k);
  },
  'schedule-note'(f, fd) {
    const text = (fd.get('text') || '').trim();
    const w = f.dataset.week;
    if (!text) { db.remove(`n:schedule:${w}`); return; }
    db.put('note', `n:schedule:${w}`, { type: 'schedule', week: w, text, created_at: new Date().toISOString() });
    closeSheet();
    toast('اتحفظ. Claude هيقراه في المراجعة');
  },
  'sync-cfg'(f, fd) {
    let url = (fd.get('url') || SUPABASE_URL).trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    sync.setConfig({ url, key: fd.get('key') || '' });
    document.activeElement?.blur();
    render();
  },
  async 'sync-login'(f, fd, submitter) {
    const err = f.querySelector('[data-err]');
    err.hidden = true;
    const btns = $$('button', f); btns.forEach((b) => { b.disabled = true; });
    try {
      if (submitter?.value === 'up') {
        const r = await sync.signUp(fd.get('email'), fd.get('password'));
        if (r === 'confirm') { err.textContent = 'بعتنالك إيميل تأكيد. أكّده وبعدين دوس دخول.'; err.hidden = false; return; }
      } else {
        await sync.signIn(fd.get('email'), fd.get('password'));
      }
      document.activeElement?.blur();
      render(); toast('اتوصلت');
    } catch (e) {
      err.textContent = loginError(e.message); err.hidden = false;
    } finally { btns.forEach((b) => { b.disabled = false; }); }
  },
  'settings-prayer'(f, fd) {
    const city = fd.get('city');
    const c = CITIES.find((x) => x.name === city);
    const p = c ? { city: c.name, lat: c.lat, lng: c.lng } : { city: 'مكان تاني', lat: Number(fd.get('lat')) || 0, lng: Number(fd.get('lng')) || 0 };
    Object.assign(p, {
      lead: Number(fd.get('lead')) || 15, level: Number(fd.get('level')) || 4,
      sleepFrom: fd.get('sleepFrom') || '05:00', sleepTo: fd.get('sleepTo') || '13:30',
      dayStartHour: Number(fd.get('dayStartHour') ?? 3), preShift: Number(fd.get('preShift')) || 60,
    });
    M.saveSettings(p);
    document.activeElement?.blur();
    toast('اتحفظ');
  },
};

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape') closeSheet();
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = F[f.dataset.form];
  if (fn) fn(f, new FormData(f), e.submitter);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  const f = t.form;
  if (!f) return;
  if (t.name === 'when') { const p = f.querySelector('[data-pick]'); if (p) p.hidden = t.value !== 'pick'; }
  if (t.name === 'mode') { const w = f.querySelector('[data-work]'); if (w) w.hidden = t.value !== 'work'; }
  if (t.name === 'type' && f.dataset.form === 'tracker') S.syncTrackerForm(f);
  if (t.name === 'city') { const c = f.querySelector('[data-custom]'); if (c) c.hidden = t.value !== 'custom'; }
});
document.addEventListener('input', (e) => {
  if (e.target.name === 'level') { const l = e.target.form?.querySelector('[data-level-label]'); if (l) l.textContent = LEVELS[e.target.value]; }
});

// ---------- boot ----------
async function boot() {
  await db.init();
  booted = true;
  if (DEMO) seedDemo(); else M.seed();
  drainNative();
  screenTime();
  chrome();
  enableSheetSwipe();
  route();
  window.addEventListener('hashchange', route);
  db.onChange(() => { render(); pushNative(); });
  sync.onStatus((s) => {
    $$('.sync').forEach((el) => { el.className = `sync s-${s.status}`; });
    if (current === 'settings' && s.status !== 'syncing') render();
  });
  if (!DEMO) sync.beforePush(audio.uploadPending);
  sync.start();
  live.start();
  pushNative();
  setInterval(() => {
    const ts = timers();
    $$('[data-timer]').forEach((el) => { const r = ts[el.dataset.timer]; if (r) el.textContent = elapsed(r); });
  }, 1000);
  setInterval(() => { if (!sheetOpen()) render(); pushNative(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { drainNative(); render(); } });
  // let the intro finish (about 0.75s from page start), then fade it out
  // after a self-update reload, skip the intro and just say so
  const updated = live.justUpdated();
  setTimeout(() => $('#splash')?.classList.add('gone'), updated ? 0 : Math.max(120, 750 - performance.now()));
  if (updated) setTimeout(() => toast('اتحدّث لآخر نسخة'), 500);
  setup.start();
  enablePress();
  enablePullToSync();
  window.addEventListener('resize', moveTabIndicator);
  if (!isNative && !DEMO && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
