import * as M from '../model.js';
import * as sync from '../sync.js';
import { header, chips, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, fmtClock } from '../util.js';
import { CITIES } from '../prayer.js';
import { isNative, callJSON } from '../native.js';
import { SUPABASE_URL, SUPABASE_KEYS_PAGE, DEMO } from '../config.js';

export const LEVELS = {
  1: 'وقت الأذان بس',
  2: 'قبلها بشوية',
  3: 'يفضل لحد ما تصلي',
  4: 'ويرجع وقت الأذان',
  5: 'كل 20 دقيقة',
};
export const VERSION = '1.5.0';

export function render() {
  return `${header('Settings')}
  <div class="cols2">
    <div>${syncCard()}${prayerCard()}${isNative ? phoneCard() : ''}</div>
    <div>${trackersCard()}${claudeCard()}
      <p class="foot">BOKRA ${VERSION} · by .ATHR</p></div>
  </div>`;
}

function syncCard() {
  if (DEMO) {
    return `<div class="card" data-key="demo">${ch('Demo', 'sparkles')}
      <p class="hint" style="margin-top:0">نسخة تجريبية. كل حاجة على جهازك بس.</p>
      <div class="actions"><button class="btn" data-act="demo-reset">${icon('refresh', 18)} رجّع الداتا التجريبية</button></div></div>`;
  }
  const cfg = sync.config();
  const ses = sync.session();
  const st = sync.state;
  let body;
  if (!cfg) {
    body = `<form data-form="sync-cfg">
        <div class="row" style="align-items:flex-end">
          <div><label class="lbl" for="s-key">anon public key</label><input id="s-key" class="in ltr" name="key" placeholder="eyJhbGciOi…" required autocomplete="off"></div>
          <a class="btn sq-btn" href="${SUPABASE_KEYS_PAGE}" target="_blank" rel="noopener" aria-label="افتح صفحة المفاتيح">${icon('external', 18)}</a>
        </div>
        <input type="hidden" name="url" value="${SUPABASE_URL}">
        <div class="actions"><button class="btn btn-primary">احفظ</button></div>
      </form>`;
  } else if (!ses) {
    body = `<form data-form="sync-login">
        <div class="field" style="margin-top:0"><input class="in ltr" type="email" name="email" autocomplete="username" placeholder="Email" required aria-label="الإيميل"></div>
        <div class="field" style="margin-top:10px"><input class="in ltr" type="password" name="password" autocomplete="current-password" minlength="6" placeholder="Password" required aria-label="الباسورد"></div>
        <p class="err" data-err hidden></p>
        <div class="actions"><button class="btn btn-primary" name="mode" value="in">دخول</button><button class="btn" name="mode" value="up">حساب جديد</button></div>
      </form>
      <button class="link" data-act="sync-reset" style="margin-top:12px">غيّر المفتاح</button>`;
  } else {
    const ok = st.status === 'ok';
    body = `<div class="srow"><span class="status ${ok ? 'ok' : st.status === 'error' ? 'bad' : ''}"><i></i><span class="en">${esc(ses.user?.email || '')}</span></span>
        <span class="meta">${st.at ? fmtClock(st.at) : ''}</span></div>
      ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
      <div class="actions"><button class="btn" data-act="sync-now" aria-label="زامن">${icon('refresh', 18)}</button><button class="btn" data-act="sync-out">${icon('logout', 18)} خروج</button></div>`;
  }
  return `<div class="card" data-key="sync">${ch('Sync', 'cloud')}${body}</div>`;
}

function prayerCard() {
  const s = M.settings();
  const known = CITIES.find((c) => c.name === s.city);
  return `<div class="card" data-key="prayer">${ch('الصلاة', 'mosque', '', true)}
  <form data-form="settings-prayer">
    <select class="in" name="city" aria-label="المدينة">${CITIES.map((c) => `<option ${c.name === s.city ? 'selected' : ''}>${c.name}</option>`).join('')}<option value="custom" ${known ? '' : 'selected'}>مكان تاني</option></select>
    <div class="row field" data-custom ${known ? 'hidden' : ''}>
      <input class="in ltr" name="lat" value="${s.lat}" inputmode="decimal" aria-label="Latitude">
      <input class="in ltr" name="lng" value="${s.lng}" inputmode="decimal" aria-label="Longitude">
    </div>
    <div class="field"><div class="lvl">${icon('bell', 16)}<b data-level-label>${LEVELS[s.level]}</b></div>
      <input type="range" name="level" min="1" max="5" step="1" value="${s.level}" aria-label="قوة التذكير"></div>
    <details class="more"><summary>${icon('sliders', 16)}<span class="en">More</span>${icon('chevD', 16)}</summary>
      <div class="field"><span class="lbl">${icon('clock', 15)} قبل الصلاة</span>${chips('lead', [5, 10, 15, 20, 30].map((n) => ({ value: n, label: `${n} د` })), s.lead)}</div>
      <div class="field"><span class="lbl">${icon('moon', 15)} نومك (تذكير من غير صوت)</span>
        <div class="row"><input class="in ltr" type="time" name="sleepFrom" value="${s.sleepFrom}" aria-label="من"><input class="in ltr" type="time" name="sleepTo" value="${s.sleepTo}" aria-label="لحد"></div></div>
      <div class="field"><span class="lbl">${icon('refresh', 15)} اليوم يبدأ الساعة</span>${chips('dayStartHour', [0, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 0 ? '12' : `${n}` })), s.dayStartHour)}</div>
      <div class="field"><span class="lbl">${icon('briefcase', 15)} قبل الشيفت</span>${chips('preShift', [30, 60, 90, 120].map((n) => ({ value: n, label: n < 60 ? `${n} د` : `${n / 60} س` })), s.preShift)}</div>
    </details>
    <div class="actions"><button class="btn btn-primary">احفظ</button></div>
  </form></div>`;
}

function phoneCard() {
  const p = callJSON('permissions') || {};
  const items = [
    ['notifications', 'bell', 'الإشعارات', p.notifications],
    ['exact', 'clock', 'التذكير في ميعاده', p.exact],
    ['battery', 'bolt', 'البطارية', p.battery],
    ['usage', 'phone', 'وقت الموبايل', p.usage],
  ];
  const missing = items.filter((x) => !x[3]);
  return `<div class="card" data-key="phone">${ch('Phone', 'phone', missing.length ? '' : '<span class="status ok"><i></i></span>')}
    ${missing.map(([w, ic, name]) => `<div class="srow"><span class="nm"><span class="ti">${icon(ic, 18)}</span><span>${name}</span></span>
      <button class="btn btn-sm" data-act="native-settings" data-which="${w}">فعّل</button></div>`).join('')}
    <div class="actions" style="margin-top:${missing.length ? 16 : 0}px"><button class="btn" data-act="native-test">${icon('bell', 18)} جرّب إشعار</button></div></div>`;
}

function trackersCard() {
  const all = M.trackers(true);
  const act = all.filter((t) => !t.data.archived);
  const arch = all.filter((t) => t.data.archived);
  const row = (t) => `<div class="srow ${t.data.archived ? 'arch' : ''}" data-key="${t.id}">
    <div class="nm"><span class="ti">${icon(t.data.icon || 'diamond', 18)}</span><span>${esc(t.data.name)}</span></div>
    <div class="tools">
      ${t.data.archived ? `<button class="ibtn" data-act="trk-restore" data-id="${t.id}" aria-label="رجّعها">${icon('refresh', 16)}</button>` : `
      <button class="ibtn" data-act="trk-move" data-id="${t.id}" data-n="-1" aria-label="لفوق">${icon('chevU', 16)}</button>
      <button class="ibtn" data-act="trk-move" data-id="${t.id}" data-n="1" aria-label="لتحت">${icon('chevD', 16)}</button>`}
      <button class="ibtn" data-act="tracker-edit" data-id="${t.id}" aria-label="عدّل">${icon('edit', 16)}</button>
    </div></div>`;
  return `<div class="card" data-key="trackers">${ch('Habits', 'activity', `<button class="ibtn" data-act="add-tracker" aria-label="جديدة">${icon('plus', 17)}</button>`)}
    ${act.map(row).join('')}
    ${arch.length ? `<details class="more"><summary>${icon('trash', 16)}<span class="num">${arch.length}</span>${icon('chevD', 16)}</summary>${arch.map(row).join('')}</details>` : ''}
  </div>`;
}

function claudeCard() {
  return `<div class="card" data-key="claude">${ch('Claude', 'sparkles')}
    <div class="actions" style="margin-top:4px">
      <button class="btn" data-act="copy-claude">${icon('copy', 18)} انسخ بياناتي</button>
      <button class="btn" data-act="paste-claude">${icon('download', 18)} الصق الرد</button>
    </div>
    <details class="more"><summary>${icon('download', 16)}<span class="en">Backup</span>${icon('chevD', 16)}</summary>
      <div class="actions"><button class="btn" data-act="backup-out">${icon('download', 18)} صدّر</button><button class="btn" data-act="backup-in">${icon('upload', 18)} استورد</button></div>
    </details></div>`;
}
