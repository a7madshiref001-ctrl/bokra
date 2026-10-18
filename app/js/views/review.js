import * as M from '../model.js';
import { header, empty, ch } from '../ui.js';
import { icon } from '../icons.js';
import { esc, fmtLongDate, parseKey, fmtClock } from '../util.js';

export const TYPE = {
  morning: { en: 'Morning plan', ar: 'خطة اليوم', plan: 'النهارده', planEn: 'Today', ic: 'sun' },
  night: { en: 'Night review', ar: 'مراجعة الليلة', plan: 'بكرة', planEn: 'Tomorrow', ic: 'moon' },
  weekly: { en: 'Weekly review', ar: 'مراجعة الأسبوع', plan: 'الأسبوع الجاي', planEn: 'Next week', ic: 'calendar' },
};

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const k = M.logicalKey(d);
  const today = M.today();
  const day = k === today ? 'النهارده' : fmtLongDate(parseKey(k));
  return `${day} ${fmtClock(d)}`;
}

export function render() {
  const pend = M.pendingSuggestions();
  const reps = M.reports();
  const latest = reps[0];
  const sub = latest ? `آخر ${TYPE[latest.data.type]?.ar || 'مراجعة'} من Claude · ${when(latest.data.created_at)}` : 'Claude بيكتب هنا بعد ما يراجع يومك';
  return `${header('Review', sub)}
  ${pend.length ? `<div class="sec en">Suggestions <span class="meta">وافق بضغطة</span></div>${pend.map(suggCard).join('')}` : ''}
  ${latest ? reportCard(latest) : `<div class="card" data-key="empty">${empty('لسه مفيش مراجعة. أول ما Claude يراجع، التقرير والمقترحات هيظهروا هنا.', 'review')}</div>`}
  ${manualCard()}
  ${reps.length > 1 ? `<div class="card" data-key="hist">${ch('History', 'clock')}${reps.slice(1, 15).map((r) => `<details class="old">
      <summary><span>${TYPE[r.data.type]?.ar || 'مراجعة'} · ${when(r.data.created_at)}</span>${icon('chevD', 16)}</summary>
      ${reportBody(r)}</details>`).join('')}</div>` : ''}`;
}

function suggCard(s) {
  const ic = { set_target: 'target', create_task: 'list', set_top3: 'diamond', set_shifts: 'briefcase', set_setting: 'sliders', add_tracker: 'plus', update_tracker: 'edit', archive_tracker: 'x', add_goal: 'target', set_goal: 'target', process_inbox: 'inbox' }[s.data.action?.type] || 'sparkles';
  return `<div class="sugg" data-key="${s.id}"><span class="si">${icon(ic, 18)}</span><div class="sb"><h3>${esc(s.data.title)}</h3>${s.data.why ? `<p>${esc(s.data.why)}</p>` : ''}
    <div class="actions">
      <button class="btn btn-primary btn-sm" data-act="sugg" data-id="${s.id}" data-yes="1">${icon('check', 16)} موافق</button>
      <button class="btn btn-sm" data-act="sugg" data-id="${s.id}" data-yes="0">لأ</button>
    </div></div></div>`;
}

function reportBody(r) {
  const d = r.data;
  const t = TYPE[d.type] || TYPE.night;
  return `${d.verdict ? `<p class="verdict">${esc(d.verdict)}</p>` : ''}
    ${(d.stats || []).length ? `<div class="stats">${d.stats.map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
    ${(d.insights || []).length ? `<div class="sec en" style="margin-top:24px">Insights</div>${d.insights.map((x) => `<p class="insight">${esc(x)}</p>`).join('')}` : ''}
    ${(d.plan || []).length ? `<div class="sec en" style="margin-top:24px">${t.planEn} <span class="meta">${t.plan}</span></div><ol class="plan">${d.plan.map((x, i) => `<li><b>0${i + 1}</b><span>${esc(x)}</span></li>`).join('')}</ol>` : ''}`;
}

function reportCard(r) {
  const t = TYPE[r.data.type] || TYPE.night;
  return `<div class="card" data-key="${r.id}"><p class="ov en" style="display:flex;align-items:center;gap:8px">${icon(t.ic, 16)}${t.en}</p>${reportBody(r)}</div>`;
}

function manualCard() {
  return `<div class="card" data-key="manual">${ch('Manual review', 'copy')}
    <p class="hint" style="margin-top:0">لو المراجعة التلقائية مش شغالة: انسخ بياناتك، ابعتها لـ Claude في أي شات، وبعدين الصق رده هنا.</p>
    <div class="actions">
      <button class="btn" data-act="copy-claude">${icon('copy', 18)} انسخ بياناتي</button>
      <button class="btn" data-act="paste-claude">${icon('download', 18)} الصق رد Claude</button>
    </div></div>`;
}

export function claudePrompt(type) {
  const s = M.summaryForClaude(14);
  const k = s.today;
  const t = TYPE[type] || TYPE.night;
  return `راجع بيانات BOKRA بتاعتي (السيستم اللي بنظّم بيه يومي). اعمل «${t.ar}».
اكتب بالمصري، قصير ومباشر، من غير كلام تحفيزي فاضي.
- verdict: جملة حكم واحدة، 25 كلمة بالكتير، مبنية على الأرقام.
- insights: من 2 لـ 4 ملاحظات بأرقام حقيقية من البيانات (أنماط، علاقة النوم بالصلاة والمذاكرة، الحاجات اللي بتتأجل).
- plan: أهم 3 حاجات لـ «${t.plan}».
- suggestions: من 1 لـ 4، كل واحد معاه action ينفع يتنفذ. متغيّرش هدف إلا لو الأرقام بتقول: حقق 85% أو أكتر أسبوعين ورا بعض → زوّده خطوة صغيرة. أقل من 50% أسبوعين → قلّله أو غيّر ميعاده. الصحيان يتقدّم نص ساعة بالكتير كل أسبوع.
- أي tracker عليه private: اتكلم عن الرقم بس، متسألش ومتخمنش هو إيه.
- لو فيه حاجات في inbox، اقترح تحويلها لمهام (create_task مع inbox: id).
- لو فيه schedule_notes للأسبوع الجاي، اقترح set_shifts.

رد بـ JSON بس، بالشكل ده بالظبط:
{"items":[
 {"kind":"report","id":"r:${k}:${type}","data":{"type":"${type}","date":"${k}","verdict":"…","stats":[{"label":"الصلاة","value":"4/5"}],"insights":["…"],"plan":["…","…","…"]}},
 {"kind":"suggestion","id":"s:${k}:${type}:1","data":{"title":"…","why":"…","status":"pending","action":{"type":"set_target","tracker":"t_quran","target":3}}}
]}
أنواع action: set_target {tracker,target} · create_task {title,date,time?,inbox?} · set_top3 {date,tasks:[{id}|{title}]} · set_shifts {days:[{date,start:"HH:MM",end:"HH:MM"}|{date,off:true}]} · set_setting {key,value} · update_tracker {tracker,patch} · add_tracker {tracker:{name,type,unit,target,period,icon}} · process_inbox {ids}

البيانات:
${JSON.stringify(s)}`;
}
