import { icon, dm3 } from './icons.js';
import { esc } from './util.js';
import * as sync from './sync.js';
import { illus } from './illus.js';

const SYNC_LABEL = { ok: 'متزامن', syncing: 'بيزامن', error: 'المزامنة وقفت', offline: 'مفيش نت', off: 'المزامنة مش متوصلة' };

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 15) return { ic: 'sun', t: 'صباح الخير يا أحمد' };
  if (h >= 15 && h < 19) return { ic: 'sun', t: 'مساء الخير يا أحمد' };
  return { ic: 'moon', t: 'مساء الخير يا أحمد' };
}

// title: English unless opts.ar. sub: Arabic line under the Anchor Line.
export function header(title, sub = '', right = '', opts = {}) {
  const st = sync.state.status;
  const g = opts.greet ? greeting() : null;
  return `<header class="vh">
    <div class="vh-row">
      <a class="mark" href="#today">بكرة ${dm3()}</a>
      <div class="vh-tools">
        <a href="#settings" class="sync s-${st}" title="${SYNC_LABEL[st] || ''}" aria-label="${SYNC_LABEL[st] || ''}"><i></i></a>
        <a class="ibtn" href="#settings" aria-label="Settings">${icon('sliders', 19)}</a>
      </div>
    </div>
    ${g ? `<p class="greet">${icon(g.ic, 16)}${g.t}</p>` : ''}
    <h1 class="vh-title"><span class="t ${opts.ar ? 'ar' : ''}">${esc(title)}</span>${right}</h1>
    <div class="anchor"><span></span>${dm3()}</div>
    ${sub ? `<p class="vh-sub">${sub}</p>` : ''}
  </header>`;
}

// card heading: English by default, Arabic for prayer / Quran / personal things
export const ch = (title, ic = '', right = '', ar = false) =>
  `<div class="card-h"><h2 class="${ar ? '' : 'en'}">${ic ? `<span class="hi">${icon(ic, 17)}</span>` : ''}${title}</h2>${right}</div>`;

export const bar = (r, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, r || 0)) * 100)}%"></i></div>`;
export const empty = (msg, art = 'tasks') => `<div class="empty">${illus(art)}<p>${msg}</p></div>`;

export function chips(name, options, value, multi = false) {
  const vals = multi ? (value || []).map(String) : [String(value ?? '')];
  return `<div class="chips">${options.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return `<label class="chip"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(v)}" ${vals.includes(String(v)) ? 'checked' : ''}><span>${l}</span></label>`;
  }).join('')}</div>`;
}

// ---------- morph: update the DOM in place so nothing flickers and CSS transitions run ----------
export function morph(target, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(target, tpl.content);
}
function same(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || (a.getAttribute('data-key') || '') === (b.getAttribute('data-key') || ''));
}
function patchChildren(a, b) {
  const an = [...a.childNodes];
  const bn = [...b.childNodes];
  bn.forEach((nb, i) => {
    const na = an[i];
    if (!na) { a.appendChild(nb); return; }
    if (!same(na, nb)) { a.replaceChild(nb, na); return; }
    if (na.nodeType !== 1) {
      if (na.nodeValue !== nb.nodeValue) {
        na.nodeValue = nb.nodeValue;
        const t = na.parentElement?.closest('[data-anim]');
        if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
      }
      return;
    }
    patchEl(na, nb);
  });
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}
function patchEl(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  if (a.tagName === 'INPUT') {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    return;
  }
  if (a.tagName === 'TEXTAREA') return; // never wipe what's being typed
  if (a.tagName === 'DETAILS' && a.open !== b.hasAttribute('open')) { /* keep user's open state */ if (a.open) a.setAttribute('open', ''); }
  patchChildren(a, b);
}

// ---------- sheet ----------
let sheetOnClose = null;
let closeTimer = null;
export function openSheet(title, body, opts = {}) {
  const el = document.getElementById('sheet');
  clearTimeout(closeTimer);
  el.classList.remove('closing');
  el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" data-grip></div>
      <h2 class="${opts.ar ? '' : 'en'}">${title}</h2>
      <div class="anchor"><span></span>${dm3()}</div>
      ${body}
    </div>`;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  sheetOnClose = opts.onClose || null;
  const f = el.querySelector('[autofocus]');
  if (f && window.matchMedia('(min-width: 900px)').matches) setTimeout(() => f.focus(), 60);
}
export function closeSheet() {
  const el = document.getElementById('sheet');
  if (!el.classList.contains('open') || el.classList.contains('closing')) return false;
  el.classList.add('closing');
  document.activeElement?.blur?.();
  closeTimer = setTimeout(() => {
    el.classList.remove('open', 'closing');
    el.innerHTML = '';
    document.body.style.overflow = '';
  }, 200);
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  return true;
}
export const sheetOpen = () => {
  const el = document.getElementById('sheet');
  return el.classList.contains('open') && !el.classList.contains('closing');
};

// drag the sheet down to close it (phones)
export function enableSheetSwipe() {
  const root = document.getElementById('sheet');
  let startY = 0, dy = 0, dragging = false, sheet = null;
  root.addEventListener('touchstart', (e) => {
    sheet = e.target.closest('.sheet');
    if (!sheet || window.matchMedia('(min-width: 900px)').matches) return;
    if (sheet.scrollTop > 0 && !e.target.closest('[data-grip]')) return;
    if (e.target.closest('input, textarea, select')) return;
    dragging = true; startY = e.touches[0].clientY; dy = 0;
    sheet.style.transition = 'none';
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  root.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
  });
}

// short vibration on Android for key actions
export function buzz(ms = 10) {
  try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* not supported */ }
}
