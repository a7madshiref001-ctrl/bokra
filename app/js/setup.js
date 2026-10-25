// First open on the phone: everything BOKRA needs, one tap each, before the app.
// It comes back on every open until it's all on («مش دلوقتي» lets you in meanwhile).
// Only with the APK that has the record widget and the social lock (BokraNative.ask).
import { isNative, call, callJSON } from './native.js';
import { icon } from './icons.js';
import { DEMO } from './config.js';
import { buzz, burst } from './ui.js';
import { toast } from './util.js';

const STEPS = [
  { k: 'notifications', ic: 'bell', t: 'Notifications', ar: 'الإشعارات', d: 'تذكير الصلاة والمهام يوصلك، حتى والموبايل مقفول.' },
  { k: 'mic', ic: 'mic', t: 'Microphone', ar: 'المايك', d: 'تسجّل صوتك من التطبيق ومن زرار الشاشة الرئيسية.' },
  {
    k: 'guard', ic: 'lock', t: 'Social lock', ar: 'قفل السوشيال', d: 'الفيد والريلز والشورتس بتتقفل. الرسايل بتفضل شغالة.',
    help: `شغّل BOKRA من <b class="en">Downloaded apps</b>.<br>
      لو ظهرلك <b class="en">Restricted setting</b>: دوس <b class="en">App info</b> هنا، ومنها النقط التلاتة فوق، وبعدين <b class="en">Allow restricted settings</b>.`,
    extra: { k: 'app', label: 'App info' },
  },
  { k: 'battery', ic: 'bolt', t: 'Battery', ar: 'البطارية', d: 'عشان Realme ميقفلش BOKRA وهو شغال في الخلفية.' },
  { k: 'usage', ic: 'phone', t: 'Screen time', ar: 'وقت الموبايل', d: 'عشان يحسب وقتك على الموبايل كل يوم.', help: 'دوّر على BOKRA وشغّله.' },
  { k: 'exact', ic: 'clock', t: 'Exact alarms', ar: 'التذكير في ميعاده', d: 'عشان التذكير ييجي في ميعاده بالظبط.' },
];
const LATER = 'bokra.setup.later';

let open = false;
let finished = false; // everything got turned on while this screen was up: show «All set» once
let seen = {};

const supported = () => isNative && !DEMO && typeof window.BokraNative?.ask === 'function';
const perms = () => callJSON('permissions') || {};
let steps = STEPS;
const missing = (p) => steps.filter((s) => !p[s.k]);
const $el = () => document.getElementById('setup');

function later(v) {
  try { if (v === undefined) return sessionStorage.getItem(LATER) === '1'; sessionStorage.setItem(LATER, v ? '1' : ''); } catch (e) { /* private storage off */ }
  return false;
}

export const isOpen = () => open;

// on boot: show it if anything is still off
export function start() {
  if (!supported() || later() || !missing(perms()).length) return;
  open = true;
  finished = false;
  seen = perms();
  steps = STEPS.filter((s) => s.k !== 'exact' || !seen.exact); // automatic on Android 13+: only a step when it's off
  const el = document.createElement('div');
  el.id = 'setup';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Permissions');
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  render(true);
}

// back from a settings page or a permission dialog
export function refresh() {
  if (!open) return;
  const p = perms();
  if (!missing(p).length && !finished) { finished = true; buzz(24); }
  render(false);
}

function close() {
  const el = $el();
  open = false;
  document.body.style.overflow = '';
  if (!el) return;
  el.classList.add('closing');
  setTimeout(() => el.remove(), 380);
}

function render(first) {
  const el = $el();
  if (!el) return;
  const p = perms();
  const miss = missing(p);
  if (finished) { el.innerHTML = doneView(p); setTimeout(() => burst(el.querySelector('.big-ok')), 120); return; }
  const now = miss[0];
  const n = steps.length - miss.length;
  const rows = steps.map((s, i) => {
    const on = !!p[s.k];
    const pop = on && !seen[s.k] && !first;
    const cur = s === now;
    return `<li class="step ${on ? 'done' : cur ? 'now' : ''}" style="--d:${first ? 120 + i * 60 : 0}ms">
      <span class="st-ic">${icon(on ? 'check' : s.ic, 20)}</span>
      <div class="st-tx">
        <b>${s.t}</b>
        <p>${s.d}</p>
        ${cur && s.help ? `<p class="st-help">${s.help}</p>` : ''}
        ${cur && s.extra ? `<button class="btn btn-sm st-extra" data-act="setup-ask" data-k="${s.extra.k}"><span class="en">${s.extra.label}</span></button>` : ''}
      </div>
      ${on ? `<span class="st-ok ${pop ? 'pop' : ''}" aria-label="شغال">${icon('check', 18)}</span>` : ''}
    </li>`;
  }).join('');
  seen = p;
  el.innerHTML = `<div class="setup-in ${first ? 'enter' : ''}">
      <div class="setup-mark"><b>بكرة</b><span class="dm3"><i></i><i></i><i></i></span></div>
      <h1 class="setup-t"><span dir="ltr">Permissions</span></h1>
      <div class="anchor"><span></span><span class="dm3"><i></i><i></i><i></i></span></div>
      <p class="setup-sub">BOKRA محتاج دول عشان يشتغل. كل واحدة دوسة.</p>
      <div class="setup-prog"><span class="bar"><i style="--p:${(n / steps.length).toFixed(3)}"></i></span><span class="num">${n}/${steps.length}</span></div>
      <ol class="steps">${rows}</ol>
    </div>
    <div class="setup-foot">
      <button class="btn btn-accent" data-act="setup-ask" data-k="${now.k}">${icon(now.ic, 18)} فعّل ${now.ar}</button>
      <button class="link" data-act="setup-later">مش دلوقتي</button>
    </div>`;
  // the next step (and its help) above the button, on small screens too
  if (!first) setTimeout(() => el.querySelector('.step.now')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
}

function doneView(p) {
  const widget = p.widget ? '' : `<div class="card setup-widget">
      <div class="sw-h"><span class="sw-ic">${icon('mic', 20)}</span><b class="en">Record widget</b></div>
      <p class="hint">زرار صغير على الشاشة الرئيسية: دوسة تسجّل، ودوسة تحفظ. من غير ما تفتح BOKRA.</p>
      ${p.pin ? `<div class="actions" style="margin-top:14px"><button class="btn" data-act="setup-ask" data-k="widget">${icon('plus', 18)} حطه على الشاشة</button></div>`
        : '<p class="hint">دوس مطوّل على الشاشة الرئيسية، وبعدين <b class="en">Widgets</b>، و<b class="en">BOKRA</b>، و<b class="en">Record</b>.</p>'}
    </div>`;
  return `<div class="setup-in setup-done">
      <div class="big-ok">${icon('check', 44)}</div>
      <h1 class="setup-t"><span dir="ltr">All set</span></h1>
      <p class="setup-sub">كله شغال. الفيد مقفول، والرسايل مفتوحة.</p>
      ${widget}
    </div>
    <div class="setup-foot"><button class="btn btn-primary" data-act="setup-close">ادخل</button></div>`;
}

export const actions = {
  'setup-ask': (el) => {
    const k = el.dataset.k;
    if (k === 'widget') { call('ask', 'widget'); setTimeout(() => toast('وافق على «Add» وهيتحط على الشاشة'), 400); return; }
    call('ask', k);
  },
  'setup-later': () => { later(true); close(); },
  'setup-close': () => { buzz(14); close(); },
};
