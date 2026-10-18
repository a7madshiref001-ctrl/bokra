import * as M from '../model.js';
import * as sync from '../sync.js';
import { header, chips, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, fmtClock } from '../util.js';
import { CITIES } from '../prayer.js';
import { isNative, callJSON } from '../native.js';
import { SUPABASE_URL, SUPABASE_KEYS_PAGE } from '../config.js';

export const LEVELS = {
  1: 'وقت الصلاة بس، وتقدر تمسحه',
  2: 'قبل الصلاة بشوية، وتقدر تمسحه',
  3: 'يفضل موجود لحد ما تدوس «صليت»',
  4: 'ويرجع يفكرك وقت الأذان لو لسه',
  5: 'ويفضل يفكرك كل 20 دقيقة',
};
export const VERSION = '1.2.0';

export function render() {
  return `${header('Settings', 'المزامنة، والصلاة، والحاجات اللي بتتابعها')}
  <div class="cols2">
    <div>${syncCard()}${prayerCard()}${isNative ? phoneCard() : ''}</div>
    <div>${trackersCard()}${backupCard()}
      <p class="foot">BOKRA ${VERSION} · by .ATHR</p></div>
  </div>`;
}

function syncCard() {
  const cfg = sync.config();
  const ses = sync.session();
  const st = sync.state;
  let body;
  if (!cfg) {
    body = `<p class="hint" style="margin-top:0">خطوة واحدة: افتح صفحة المفاتيح، ودوس <b>Copy</b> جنب <b class="en">anon public</b>، والصقه هنا.</p>
      <div class="actions" style="margin-top:12px"><a class="btn" href="${SUPABASE_KEYS_PAGE}" target="_blank" rel="noopener">${icon('external', 18)} افتح صفحة المفاتيح</a></div>
      <form data-form="sync-cfg">
        <div class="field"><label class="lbl" for="s-key">anon public key</label><input id="s-key" class="in ltr" name="key" placeholder="eyJhbGciOi…" required autocomplete="off"></div>
        <details style="margin-top:12px"><summary class="meta" style="cursor:pointer">Project URL</summary>
          <input class="in ltr" name="url" value="${SUPABASE_URL}" style="margin-top:8px"></details>
        <div class="actions"><button class="btn btn-primary">احفظ</button></div>
      </form>`;
  } else if (!ses) {
    body = `<p class="meta en" style="direction:ltr;text-align:right">${esc(cfg.url.replace('https://', ''))}</p>
      <form data-form="sync-login">
        <div class="field"><label class="lbl" for="s-em">الإيميل</label><input id="s-em" class="in ltr" type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label class="lbl" for="s-pw">الباسورد</label><input id="s-pw" class="in ltr" type="password" name="password" autocomplete="current-password" minlength="6" required></div>
        <p class="err" data-err hidden></p>
        <div class="actions"><button class="btn btn-primary" name="mode" value="in">دخول</button><button class="btn" name="mode" value="up">حساب جديد</button></div>
      </form>
      <p class="hint"><button class="link" data-act="sync-reset">غيّر بيانات Supabase</button></p>`;
  } else {
    const label = { ok: 'متزامن', syncing: 'بيزامن دلوقتي', error: 'المزامنة وقفت', offline: 'مفيش نت', off: 'مش متوصل' }[st.status] || '';
    body = `<div class="srow"><span class="status ${st.status === 'ok' ? 'ok' : st.status === 'error' ? 'bad' : ''}"><i></i>${label}</span>
        <span class="meta">${st.at ? `آخر مرة ${fmtClock(st.at)}` : ''}</span></div>
      ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
      <div class="srow"><span class="meta en">${esc(ses.user?.email || '')}</span></div>
      <div class="actions"><button class="btn btn-primary" data-act="sync-now">${icon('refresh', 18)} زامن دلوقتي</button><button class="btn" data-act="sync-out">${icon('logout', 18)} خروج</button></div>`;
  }
  return `<div class="card" data-key="sync">${ch('Sync', 'cloud')}${body}</div>`;
}

function prayerCard() {
  const s = M.settings();
  const known = CITIES.find((c) => c.name === s.city);
  return `<div class="card" data-key="prayer">${ch('الصلاة والتذكيرات', 'mosque', '', true)}
  <form data-form="settings-prayer">
    <div class="field"><label class="lbl" for="p-city">المدينة</label>
      <select id="p-city" class="in" name="city">${CITIES.map((c) => `<option ${c.name === s.city ? 'selected' : ''}>${c.name}</option>`).join('')}<option value="custom" ${known ? '' : 'selected'}>مكان تاني</option></select></div>
    <div class="row field" data-custom ${known ? 'hidden' : ''}>
      <div><label class="lbl" for="p-lat">Latitude</label><input id="p-lat" class="in ltr" name="lat" value="${s.lat}" inputmode="decimal"></div>
      <div><label class="lbl" for="p-lng">Longitude</label><input id="p-lng" class="in ltr" name="lng" value="${s.lng}" inputmode="decimal"></div>
    </div>
    <div class="field"><span class="lbl">التذكير قبل الصلاة</span>${chips('lead', [5, 10, 15, 20, 30].map((n) => ({ value: n, label: `${n} د` })), s.lead)}</div>
    <div class="field"><label class="lbl" for="p-level">قوة التذكير: <b data-level-label>${LEVELS[s.level]}</b></label>
      <input id="p-level" type="range" name="level" min="1" max="5" step="1" value="${s.level}">
      <div class="range-l"><span>هادي</span><span>يزن</span></div></div>
    <div class="field"><span class="lbl">ساعات نومك (التذكيرات بتيجي من غير صوت)</span>
      <div class="row"><input class="in ltr" type="time" name="sleepFrom" value="${s.sleepFrom}" aria-label="من"><input class="in ltr" type="time" name="sleepTo" value="${s.sleepTo}" aria-label="لحد"></div></div>
    <div class="field"><span class="lbl">اليوم بيقلب الساعة</span>${chips('dayStartHour', [0, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 0 ? '12 بالليل' : `${n} الفجر` })), s.dayStartHour)}
      <p class="hint">قبل الساعة دي، اللي بتسجّله بيتحسب على اليوم اللي فات.</p></div>
    <div class="field"><span class="lbl">فكّرني قبل الشيفت بـ</span>${chips('preShift', [30, 60, 90, 120].map((n) => ({ value: n, label: n < 60 ? `${n} د` : `${n / 60} ساعة` })), s.preShift)}</div>
    <div class="actions"><button class="btn btn-primary">احفظ</button></div>
  </form></div>`;
}

function phoneCard() {
  const p = callJSON('permissions') || {};
  const row = (ok, name, sub, which) => `<div class="srow"><div><b style="font-weight:500">${name}</b><p class="meta">${sub}</p></div>
    ${ok ? `<span class="status ok"><i></i>تمام</span>` : `<button class="btn btn-sm" data-act="native-settings" data-which="${which}">افتح</button>`}</div>`;
  return `<div class="card" data-key="phone">${ch('Phone', 'phone')}
    ${row(p.notifications, 'الإشعارات', 'عشان تذكير الصلاة والمهام', 'notifications')}
    ${row(p.exact, 'التذكير في ميعاده بالظبط', 'من غيره التذكير ممكن يتأخر', 'exact')}
    ${row(p.battery, 'البطارية', 'Realme بيقفل التطبيقات اللي في الخلفية', 'battery')}
    ${row(p.usage, 'وقت الموبايل', 'عشان يتحسب لوحده', 'usage')}
    <div class="actions"><button class="btn" data-act="native-test">${icon('bell', 18)} جرّب إشعار</button></div></div>`;
}

function trackersCard() {
  const all = M.trackers(true);
  const act = all.filter((t) => !t.data.archived);
  const arch = all.filter((t) => t.data.archived);
  const row = (t) => `<div class="srow ${t.data.archived ? 'arch' : ''}">
    <div class="nm"><span class="ti">${icon(t.data.icon || 'diamond', 18)}</span><span>${esc(t.data.name)}</span><span class="meta">${M.TYPES[t.data.type]?.label || ''}</span></div>
    <div class="tools">
      ${t.data.archived ? `<button class="btn btn-sm" data-act="trk-restore" data-id="${t.id}">رجّعها</button>` : `
      <button class="ibtn" data-act="trk-move" data-id="${t.id}" data-n="-1" aria-label="لفوق">${icon('chevU', 16)}</button>
      <button class="ibtn" data-act="trk-move" data-id="${t.id}" data-n="1" aria-label="لتحت">${icon('chevD', 16)}</button>`}
      <button class="ibtn" data-act="tracker-edit" data-id="${t.id}" aria-label="عدّل">${icon('edit', 16)}</button>
    </div></div>`;
  return `<div class="card" data-key="trackers">${ch('Trackers', 'activity', `<button class="btn btn-sm" data-act="add-tracker">${icon('plus', 16)} جديدة</button>`)}
    ${act.map(row).join('')}
    ${arch.length ? `<details style="margin-top:8px"><summary class="meta" style="cursor:pointer;padding:8px 0">متشالة (${arch.length})</summary>${arch.map(row).join('')}</details>` : ''}
  </div>`;
}

function backupCard() {
  return `<div class="card" data-key="backup">${ch('Backup', 'download')}
    <p class="hint" style="margin-top:0">كل حاجة متسجلة على الجهاز ده. لو المزامنة شغالة فهي متسجلة على السيرفر كمان.</p>
    <div class="actions"><button class="btn" data-act="backup-out">${icon('download', 18)} صدّر</button><button class="btn" data-act="backup-in">${icon('upload', 18)} استورد</button></div></div>`;
}
