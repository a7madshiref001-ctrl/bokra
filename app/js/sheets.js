// Bottom sheets: every "add / edit" form lives here.
import * as M from './model.js';
import * as db from './db.js';
import { openSheet, closeSheet, chips } from './ui.js';
import { icon, ICON_NAMES } from './icons.js';
import { esc, shiftKey, parseKey, fmtDayMonth, DAY_NAMES, WEEK_ORDER, pad, toast } from './util.js';

const AREAS = ['عام', 'أثر', 'العيادات', 'الشغل', 'البيت', 'دين'];
const CATS = ['أكل', 'مواصلات', 'شحن ونت', 'البيت', 'الشغل', 'لبس', 'خروج', 'تاني'];
const nowHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- add menu ----------
export function addMenu() {
  const card = (act, ic, title, sub, acc = false) => `<button class="addcard" data-act="${act}"><span class="ai ${acc ? 'acc' : ''}">${icon(ic, 20)}</span><b class="en">${title}</b><span>${sub}</span></button>`;
  openSheet('Add', `<div class="addgrid">
    ${card('add-task', 'list', 'Task', 'حاجة هتعملها مرة، بميعاد أو من غير', true)}
    ${card('add-tracker', 'refresh', 'Habit', 'عادة أو رقم تتابعه كل يوم أو كل أسبوع')}
    ${card('add-expense', 'wallet', 'Money', 'مصروف أو فلوس دخلت')}
    ${card('add-inbox', 'inbox', 'Idea', 'اكتبها في دماغي ورتّبها بعدين')}
    <button class="addcard wide" data-act="add-goal"><span class="ai">${icon('target', 20)}</span><div><b class="en">Goal</b><br><span>هدف كبير مربوط بحاجة بتتابعها</span></div></button>
  </div>`);
}

// ---------- task ----------
export function taskForm(id, preset = {}) {
  const t = id ? db.get(id) : null;
  const k = M.today();
  const d = t ? t.data : { title: preset.title || '', date: preset.date === undefined ? k : preset.date, time: '', area: '', notes: '', top3: null };
  const mode = !d.date ? 'none' : d.date === k ? 'today' : d.date === shiftKey(k, 1) ? 'tomorrow' : 'pick';
  openSheet(t ? 'Edit task' : 'New task', `<form data-form="task" data-id="${id || ''}" data-inbox="${preset.inbox || ''}">
    <div class="field"><label class="lbl" for="f-title">المهمة</label><input id="f-title" class="in" name="title" value="${esc(d.title)}" required autofocus autocomplete="off"></div>
    <div class="field"><span class="lbl">امتى؟</span>${chips('when', [{ value: 'today', label: 'النهارده' }, { value: 'tomorrow', label: 'بكرة' }, { value: 'pick', label: 'يوم تاني' }, { value: 'none', label: 'من غير ميعاد' }], mode)}
      <input class="in ltr" type="date" name="date" value="${d.date || ''}" style="margin-top:8px" data-pick ${mode === 'pick' ? '' : 'hidden'} aria-label="التاريخ"></div>
    <div class="field"><label class="lbl" for="f-time">فكّرني الساعة (اختياري)</label><input id="f-time" class="in ltr" type="time" name="time" value="${d.time || ''}"></div>
    <div class="field"><span class="lbl">تبع إيه؟</span>${chips('area', AREAS, d.area)}</div>
    <label class="toggle" style="margin-top:16px"><span>من أهم 3<small>هتظهر في الويدجت</small></span><input type="checkbox" name="top3" ${d.top3 ? 'checked' : ''}></label>
    <div class="field"><label class="lbl" for="f-notes">ملاحظات</label><textarea id="f-notes" class="in" name="notes">${esc(d.notes || '')}</textarea></div>
    <div class="actions"><button class="btn btn-primary">${t ? 'احفظ' : 'ضيف'}</button>
      ${t ? `<button type="button" class="btn btn-danger" data-act="task-del" data-id="${id}">امسح</button>` : ''}</div>
  </form>`);
}

// ---------- tracker ----------
function historyStrip(t) {
  const k = M.today();
  const keys = Array.from({ length: 14 }, (_, i) => shiftKey(k, i - 13));
  const d = t.data;
  const raw = keys.map((kk) => M.dayValue(t, kk));
  const max = Math.max(1, ...raw.map((v) => Number(v) || 0));
  const dayTarget = d.period === 'week' ? null : Number(d.target) || null;
  const bars = keys.map((kk, i) => {
    const v = raw[i];
    let r;
    if (d.type === 'check') r = v === 1 ? 1 : 0.05;
    else if (d.type === 'streak') r = v === 1 ? 0.05 : 1;
    else if (d.type === 'sleep') r = v ? Math.min(1, v / 9) : 0.05;
    else if (dayTarget && !d.lowerIsBetter) r = Math.min(1, (Number(v) || 0) / dayTarget);
    else r = (Number(v) || 0) / max;
    const met = !['money', 'number'].includes(d.type) && M.isDoneDay(t, kk) && r >= 0.99;
    return `<i class="${met ? 'met' : ''} ${kk === k ? 'today' : ''}" style="height:${Math.max(6, Math.round(r * 100))}%"></i>`;
  }).join('');
  return `<div class="hist" aria-label="آخر 14 يوم">${bars}</div><p class="meta" style="margin-top:6px">آخر 14 يوم</p>`;
}

export function trackerForm(id) {
  const t = id ? db.get(id) : null;
  const d = t ? t.data : { name: '', type: 'check', unit: '', target: '', period: 'day', days: [], icon: 'diamond', private: false, remind: '', note: '' };
  const typeOpts = Object.entries(M.TYPES).map(([v, o]) => ({ value: v, label: `${o.label}<small>${o.sub}</small>` }));
  openSheet(t ? esc(d.name) : 'New habit', `${t && !(d.private && d.type === 'streak') ? historyStrip(t) : ''}
  <form data-form="tracker" data-id="${id || ''}">
    <div class="field"><label class="lbl" for="t-name">اسمها</label><input id="t-name" class="in" name="name" value="${esc(d.name)}" required placeholder="مثلًا: أشرب مية" autofocus autocomplete="off"></div>
    <div class="field"><span class="lbl">نوعها</span><div class="types">${chips('type', typeOpts, d.type).replace('<div class="chips">', '').replace(/<\/div>$/, '')}</div></div>
    <div class="row field">
      <div><label class="lbl" for="t-target" data-target-lbl>الهدف</label><input id="t-target" class="in ltr" name="target" value="${esc(d.target ?? '')}" inputmode="decimal"></div>
      <div data-unit-wrap><label class="lbl" for="t-unit">الوحدة</label><input id="t-unit" class="in" name="unit" value="${esc(d.unit || '')}" placeholder="صفحة، كوباية…"></div>
    </div>
    <div class="field" data-period-wrap><span class="lbl">الهدف ده كل</span>${chips('period', [{ value: 'day', label: 'يوم' }, { value: 'week', label: 'أسبوع' }], d.period || 'day')}</div>
    <div class="field" data-start-wrap hidden><label class="lbl" for="t-start">بدأت من يوم</label><input id="t-start" class="in ltr" type="date" name="start" value="${d.start || M.today()}"></div>
    <div class="field"><span class="lbl">الأيام (سيبها فاضية يبقى كل يوم)</span>${chips('days', WEEK_ORDER.map((n) => ({ value: n, label: DAY_NAMES[n] })), d.days || [], true)}</div>
    <div class="field"><label class="lbl" for="t-remind">فكّرني الساعة (اختياري)</label><input id="t-remind" class="in ltr" type="time" name="remind" value="${d.remind || ''}"></div>
    <div class="field"><label class="lbl" for="t-note">سطر توضيح (اختياري)</label><input id="t-note" class="in" name="note" value="${esc(d.note || '')}" autocomplete="off"></div>
    <div class="field"><span class="lbl">الأيقونة</span><div class="chips icons">${ICON_NAMES.map((n) => `<label class="chip"><input type="radio" name="icon" value="${n}" ${n === d.icon ? 'checked' : ''}><span>${icon(n, 20)}</span></label>`).join('')}</div></div>
    <label class="toggle" style="margin-top:16px"><span>خاصة<small>متظهرش في الإشعارات ولا الويدجت، والرقم بيبقى متغطّي</small></span><input type="checkbox" name="private" ${d.private ? 'checked' : ''}></label>
    <div class="actions"><button class="btn btn-primary">${t ? 'احفظ' : 'ضيفها'}</button>
      ${t ? `<button type="button" class="btn" data-act="trk-archive" data-id="${id}">شيلها</button>` : ''}</div>
  </form>`, { ar: !!t });
  syncTrackerForm(document.querySelector('form[data-form="tracker"]'), true);
}

// adjust the tracker form to the chosen type
export function syncTrackerForm(f, initial = false) {
  if (!f) return;
  const type = f.querySelector('input[name="type"]:checked')?.value || 'check';
  const target = f.elements.target;
  const lbl = f.querySelector('[data-target-lbl]');
  const unitWrap = f.querySelector('[data-unit-wrap]');
  const periodWrap = f.querySelector('[data-period-wrap]');
  const startWrap = f.querySelector('[data-start-wrap]');
  const unit = f.elements.unit;
  const T = M.TYPES[type];
  target.type = type === 'sleep' ? 'time' : 'text';
  if (!initial && type === 'sleep' && !/^\d\d:\d\d$/.test(target.value)) target.value = '13:30';
  if (!initial && type !== 'sleep' && /:/.test(target.value)) target.value = '';
  lbl.textContent = { sleep: 'ميعاد الصحيان اللي عايزه', streak: 'هدف الأيام', money: 'حد أقصى (اختياري)', check: 'كام مرة', number: 'الهدف (اختياري)' }[type] || 'الهدف';
  unitWrap.hidden = ['check', 'sleep', 'streak'].includes(type);
  periodWrap.hidden = ['sleep', 'streak', 'money'].includes(type);
  startWrap.hidden = type !== 'streak';
  if (!initial && (!unit.value || Object.values(M.TYPES).some((x) => x.unit === unit.value))) unit.value = T.unit;
  if (type === 'check' && !initial && !target.value) target.value = '1';
}

// ---------- money ----------
export function expenseForm(tid) {
  let money = M.trackers().filter((t) => t.data.type === 'money');
  if (!money.length) { M.addTracker({ id: 't_money', name: 'المصاريف', icon: 'wallet', type: 'money', unit: 'ج', target: 0, period: 'day' }); money = M.trackers().filter((t) => t.data.type === 'money'); }
  tid = tid && db.get(tid) ? tid : money[0].id;
  openSheet('Money', `<form data-form="expense">
    <div class="field"><label class="lbl" for="x-amt">المبلغ</label><input id="x-amt" class="in ltr" name="amount" inputmode="decimal" required autofocus placeholder="0" autocomplete="off"></div>
    ${money.length > 1 ? `<div class="field"><span class="lbl">في</span>${chips('tracker', money.map((t) => ({ value: t.id, label: esc(t.data.name) })), tid)}</div>` : `<input type="hidden" name="tracker" value="${tid}">`}
    <div class="field"><span class="lbl">في إيه؟</span>${chips('category', CATS, '')}</div>
    <div class="field"><label class="lbl" for="x-note">ملاحظة</label><input id="x-note" class="in" name="note" autocomplete="off"></div>
    <div class="field"><span class="lbl">امتى؟</span>${chips('day', [{ value: 'today', label: 'النهارده' }, { value: 'yesterday', label: 'امبارح' }], 'today')}</div>
    <div class="actions"><button class="btn btn-primary">سجّل</button></div>
  </form>`);
}

// ---------- goal ----------
export function goalForm(id) {
  const g = id ? db.get(id) : null;
  const d = g ? g.data : { title: '', tracker: '', target: '', why: '' };
  const opts = [{ value: 'prayer', label: 'الصلاة' }, ...M.trackers().filter((t) => t.data.type !== 'money').map((t) => ({ value: t.id, label: esc(t.data.name) }))];
  openSheet(g ? 'Edit goal' : 'New goal', `<form data-form="goal" data-id="${id || ''}">
    <div class="field"><label class="lbl" for="g-title">الهدف</label><input id="g-title" class="in" name="title" value="${esc(d.title)}" required autofocus placeholder="مثلًا: أختم القرآن في شهرين" autocomplete="off"></div>
    <div class="field"><span class="lbl">بيتقاس بإيه؟</span>${chips('tracker', opts, d.tracker)}
      <p class="hint">مش لاقي اللي يقيسه؟ ضيف «حاجة بتتكرر» الأول.</p></div>
    <div class="field"><label class="lbl" for="g-target">المطلوب في الأسبوع</label><input id="g-target" class="in ltr" name="target" value="${esc(d.target ?? '')}" inputmode="decimal">
      <p class="hint">لو بيتقاس بعداد أيام، الرقم ده عدد الأيام.</p></div>
    <div class="field"><label class="lbl" for="g-why">ليه؟ (اختياري)</label><input id="g-why" class="in" name="why" value="${esc(d.why || '')}" autocomplete="off"></div>
    <div class="actions"><button class="btn btn-primary">احفظ</button>
      ${g ? `<button type="button" class="btn btn-danger" data-act="goal-del" data-id="${id}">امسح</button>` : ''}</div>
  </form>`);
}

// ---------- quick entries ----------
export function sleepForm(tid, k) {
  const e = M.entry(tid, k) || {};
  openSheet('Sleep', `<form data-form="sleep" data-id="${tid}" data-k="${k}">
    <div class="row field">
      <div><label class="lbl" for="sl-a">نمت الساعة</label><input id="sl-a" class="in ltr" type="time" name="slept" value="${e.slept || '05:00'}" required></div>
      <div><label class="lbl" for="sl-b">صحيت الساعة</label><input id="sl-b" class="in ltr" type="time" name="woke" value="${e.woke || nowHm()}" required></div>
    </div>
    <div class="actions"><button class="btn btn-primary">احفظ</button>
      ${e.slept ? `<button type="button" class="btn btn-danger" data-act="entry-clear" data-id="${tid}" data-k="${k}">امسح</button>` : ''}</div>
  </form>`);
}

export function numberForm(tid, k) {
  const t = db.get(tid);
  const v = M.entry(tid, k);
  const d = t.data;
  const q = d.type === 'duration' ? 'كام دقيقة النهارده؟' : d.auto === 'screen_time' ? 'كام دقيقة على الموبايل النهارده؟' : `الرقم${d.unit ? ` (${esc(d.unit)})` : ''}`;
  openSheet(esc(d.name), `<form data-form="number" data-id="${tid}" data-k="${k}">
    <div class="field"><label class="lbl" for="n-v">${q}</label><input id="n-v" class="in ltr" name="value" inputmode="decimal" value="${v ?? ''}" autofocus autocomplete="off"></div>
    <div class="actions"><button class="btn btn-primary">احفظ</button></div>
  </form>`, { ar: true });
}

export function slipConfirm(tid, k) {
  openSheet('وقعت؟', `<p>العداد هيرجع صفر، ومش هيتسجل غير التاريخ.</p>
    <p class="hint">Claude هيدوّر على النمط (أنهي يوم، أنهي ساعة)، مش على اللوم.</p>
    <div class="actions"><button class="btn btn-primary" data-act="slip-yes" data-id="${tid}" data-k="${k}">سجّل</button><button class="btn" data-act="sheet-close">لأ</button></div>`, { ar: true });
}

// ---------- shifts ----------
export function shiftForm(k) {
  const sh = M.shift(k) || {};
  let prev = {};
  for (let i = 1; i <= 14; i++) { const p = M.shift(shiftKey(k, -i)); if (p && p.start) { prev = p; break; } }
  const d = parseKey(k);
  const mode = sh.off ? 'off' : 'work';
  openSheet(`${DAY_NAMES[d.getDay()]} ${fmtDayMonth(d)}`, `<form data-form="shift" data-k="${k}">
    <div class="field">${chips('mode', [{ value: 'work', label: 'شغل' }, { value: 'off', label: 'إجازة' }, { value: 'none', label: 'لسه مش عارف' }], mode)}</div>
    <div class="row field" data-work ${mode === 'work' ? '' : 'hidden'}>
      <div><label class="lbl" for="sh-a">من</label><input id="sh-a" class="in ltr" type="time" name="start" value="${sh.start || prev.start || '16:00'}"></div>
      <div><label class="lbl" for="sh-b">لحد</label><input id="sh-b" class="in ltr" type="time" name="end" value="${sh.end || prev.end || '01:00'}"></div>
    </div>
    <div class="actions"><button class="btn btn-primary">احفظ</button></div>
  </form>`, { ar: true });
}

// ---------- top 3 ----------
export function top3Picker(k) {
  const cands = M.tasks().filter((t) => t.data.top3 === k || (!t.data.done && (!t.data.date || t.data.date <= k))).sort(M.byTask);
  openSheet('Top 3', `<p class="hint" style="margin-top:0">اختار لحد 3. هيظهروا في الويدجت.</p>
    ${cands.length ? `<ul class="tl">${cands.map((t) => `<li class="task">
      <button type="button" class="cb ${t.data.top3 === k ? 'on' : ''}" data-act="top3-pick" data-id="${t.id}" data-k="${k}" aria-label="اختار">${icon('check', 16)}</button>
      <div class="t-main" data-act="top3-pick" data-id="${t.id}" data-k="${k}"><div class="t-title">${esc(t.data.title)}</div></div></li>`).join('')}</ul>` : ''}
    <form class="quick" data-form="top3-new" data-k="${k}"><input class="in" name="title" placeholder="أو اكتب حاجة جديدة" autocomplete="off" aria-label="حاجة جديدة"><button class="btn btn-primary" aria-label="ضيف">${icon('plus')}</button></form>
    <div class="actions"><button class="btn" data-act="sheet-close">تمام</button></div>`);
}

// ---------- Claude manual ----------
export function copyClaudeMenu() {
  openSheet('Copy for Claude', `<p class="hint" style="margin-top:0">اختار نوع المراجعة. هتتنسخ البيانات مع التعليمات، الصقها في شات Claude.</p>
    <div class="addgrid">
      <button class="addcard" data-act="copy-claude-go" data-type="morning"><span class="ai">${icon('sun', 20)}</span><b class="en">Morning plan</b><span>أول ما تصحى</span></button>
      <button class="addcard" data-act="copy-claude-go" data-type="night"><span class="ai">${icon('moon', 20)}</span><b class="en">Night review</b><span>بعد الشيفت</span></button>
      <button class="addcard wide" data-act="copy-claude-go" data-type="weekly"><span class="ai">${icon('calendar', 20)}</span><div><b class="en">Weekly review</b><br><span>كل جمعة، ومعاها جدول الأسبوع الجاي</span></div></button>
    </div>`);
}
export function pasteClaude() {
  openSheet("Paste Claude's reply", `<form data-form="claude-reply">
    <textarea class="in ltr" name="text" style="min-height:220px" placeholder='{"items":[…]}' required></textarea>
    <p class="err" data-err hidden></p>
    <div class="actions"><button class="btn btn-primary">استورد</button></div></form>`);
}
export function backupIn() {
  openSheet('Import', `<form data-form="backup">
    <input class="in" type="file" name="file" accept=".json,application/json" style="padding-top:10px">
    <p class="hint">أو الصق محتوى الملف:</p>
    <textarea class="in ltr" name="text" style="min-height:140px"></textarea>
    <p class="err" data-err hidden></p>
    <div class="actions"><button class="btn btn-primary">استورد</button></div></form>`);
}

// ---------- submit handlers ----------
export const forms = {
  task(f, fd) {
    const title = (fd.get('title') || '').trim();
    if (!title) return;
    const k = M.today();
    const w = fd.get('when');
    const date = w === 'today' ? k : w === 'tomorrow' ? shiftKey(k, 1) : w === 'pick' ? fd.get('date') || null : null;
    const p = { title, date, time: fd.get('time') || null, area: fd.get('area') || '', notes: fd.get('notes') || '' };
    const wantTop3 = fd.get('top3') === 'on';
    const id = f.dataset.id;
    if (id) {
      const cur = db.get(id);
      db.patch(id, p);
      const tk = date || k;
      if (wantTop3 && cur.data.top3 !== tk) { if (cur.data.top3) db.patch(id, { top3: null }); if (!M.setTop3(id, tk)) toast('أهم 3 مليانين'); }
      if (!wantTop3 && cur.data.top3) db.patch(id, { top3: null });
    } else {
      const nid = M.addTask(p);
      if (wantTop3 && !M.setTop3(nid, date || k)) toast('أهم 3 مليانين، اتضافت كمهمة عادية');
      if (f.dataset.inbox && db.get(f.dataset.inbox)) db.patch(f.dataset.inbox, { processed: true });
    }
    closeSheet();
    toast(id ? 'اتحفظت' : 'اتضافت');
  },
  tracker(f, fd) {
    const name = (fd.get('name') || '').trim();
    if (!name) return;
    const type = fd.get('type') || 'check';
    let target = (fd.get('target') || '').trim();
    target = type === 'sleep' ? target || '13:30' : target === '' ? (type === 'check' ? 1 : 0) : Number(target);
    const p = {
      name, type, target, unit: fd.get('unit') || M.TYPES[type].unit,
      period: ['sleep', 'streak', 'money'].includes(type) ? 'day' : fd.get('period') || 'day',
      days: fd.getAll('days').map(Number), remind: fd.get('remind') || '', note: fd.get('note') || '',
      icon: fd.get('icon') || 'diamond', private: fd.get('private') === 'on',
    };
    if (type === 'streak') p.start = fd.get('start') || M.today();
    const id = f.dataset.id;
    if (id) db.patch(id, p); else M.addTracker(p);
    closeSheet();
    toast(id ? 'اتحفظت' : 'اتضافت، هتلاقيها في Today');
  },
  expense(f, fd) {
    const amount = Number(String(fd.get('amount')).replace(',', '.'));
    if (!(amount > 0)) { toast('اكتب المبلغ'); return; }
    const k = M.today();
    M.addExpense({ tracker: fd.get('tracker'), amount, category: fd.get('category') || '', note: fd.get('note') || '', date: fd.get('day') === 'yesterday' ? shiftKey(k, -1) : k });
    closeSheet(); toast('اتسجّل');
  },
  goal(f, fd) {
    const title = (fd.get('title') || '').trim();
    if (!title) return;
    const p = { title, tracker: fd.get('tracker') || '', target: Number(fd.get('target')) || 0, why: fd.get('why') || '' };
    if (f.dataset.id) db.patch(f.dataset.id, p); else M.addGoal(p);
    closeSheet(); toast('اتحفظ');
  },
  sleep(f, fd) { M.setEntry(f.dataset.id, f.dataset.k, { slept: fd.get('slept'), woke: fd.get('woke') }); closeSheet(); },
  number(f, fd) {
    const raw = String(fd.get('value') || '').trim();
    if (raw === '') db.remove(M.entryId(f.dataset.id, f.dataset.k));
    else M.setEntry(f.dataset.id, f.dataset.k, Number(raw.replace(',', '.')) || 0);
    closeSheet();
  },
  shift(f, fd) {
    const mode = fd.get('mode');
    const k = f.dataset.k;
    if (mode === 'none') M.setShift(k, null);
    else if (mode === 'off') M.setShift(k, { off: true });
    else M.setShift(k, { start: fd.get('start'), end: fd.get('end') });
    closeSheet();
  },
  'claude-reply'(f, fd) {
    const err = f.querySelector('[data-err]');
    try {
      const n = M.importClaudeReply(fd.get('text') || '');
      closeSheet(); toast(n ? `اتضاف ${n}` : 'مفيش حاجة اتضافت');
    } catch (e) { err.textContent = `الرد مش مفهوم: ${e.message}`; err.hidden = false; }
  },
  async backup(f, fd) {
    const err = f.querySelector('[data-err]');
    try {
      let text = (fd.get('text') || '').trim();
      const file = fd.get('file');
      if (!text && file && file.size) text = await file.text();
      const j = JSON.parse(text);
      const n = db.importItems(Array.isArray(j) ? j : j.items || []);
      closeSheet(); toast(`اتضاف ${n}`);
    } catch (e) { err.textContent = 'الملف مش مفهوم'; err.hidden = false; }
  },
};
