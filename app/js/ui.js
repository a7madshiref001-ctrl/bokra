import { icon, dm3 } from './icons.js';
import { esc } from './util.js';
import * as sync from './sync.js';

const SYNC_LABEL = { ok: 'متزامن', syncing: 'بيزامن', error: 'المزامنة وقفت', offline: 'مفيش نت', off: 'المزامنة مش متوصلة' };

export function header(title, sub = '', right = '') {
  const st = sync.state.status;
  return `<header class="vh">
    <div class="vh-row">
      <a class="mark" href="#today">بكرة ${dm3()}</a>
      <div class="vh-tools">
        <a href="#settings" class="sync s-${st}" title="${SYNC_LABEL[st] || ''}" aria-label="${SYNC_LABEL[st] || ''}"><i></i></a>
        <a class="ibtn" href="#settings" aria-label="الإعدادات">${icon('sliders')}</a>
      </div>
    </div>
    <h1 class="vh-title"><span class="t">${esc(title)}</span>${right}</h1>
    <div class="anchor"><span></span>${dm3()}</div>
    ${sub ? `<p class="vh-sub">${sub}</p>` : ''}
  </header>`;
}

export const bar = (r, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, r || 0)) * 100)}%"></i></div>`;
export const empty = (msg) => `<div class="empty">${dm3()}<p>${msg}</p></div>`;

export function chips(name, options, value, multi = false) {
  const vals = multi ? (value || []).map(String) : [String(value ?? '')];
  return `<div class="chips">${options.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return `<label class="chip"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(v)}" ${vals.includes(String(v)) ? 'checked' : ''}><span>${l}</span></label>`;
  }).join('')}</div>`;
}

// ---------- sheet ----------
let sheetOnClose = null;
export function openSheet(title, body, opts = {}) {
  const el = document.getElementById('sheet');
  el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <h2>${title}</h2>
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
  if (!el.classList.contains('open')) return false;
  el.classList.remove('open');
  el.innerHTML = '';
  document.body.style.overflow = '';
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  return true;
}
export const sheetOpen = () => document.getElementById('sheet').classList.contains('open');
