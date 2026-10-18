// Voice inbox: speak what you did or want to do; it's saved to «دماغي» and Claude applies it later.
// Desktop/Chrome uses the Web Speech API (Egyptian Arabic). Android uses Google voice typing through the app.
import * as M from './model.js';
import { openSheet, closeSheet, buzz } from './ui.js';
import { icon } from './icons.js';
import { isNative, call } from './native.js';
import { toast } from './util.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => isNative || !!SR;
let rec = null;
let listening = false;
let finalText = '';

const box = () => document.querySelector('[data-voice]');
const area = () => document.querySelector('[data-voice-text]');
const hasText = () => (area()?.value || '').trim().length > 0;

function setState(state, msg) {
  const v = box();
  if (!v) return;
  v.dataset.state = state;
  v.querySelector('.vstate').textContent = msg;
  v.querySelector('[data-act="voice-toggle"]').innerHTML = state === 'on'
    ? `${icon('stop', 18)} وقّف`
    : `${icon('mic', 18)} ${hasText() ? 'كمّل كلام' : 'ابدأ'}`;
}

export function open() {
  openSheet('Voice', `<div class="voice" data-voice data-state="idle">
      <div class="vmic"><span class="ring"></span><span class="ring r2"></span><span class="core">${icon('mic', 30)}</span></div>
      <div class="vbars" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      <p class="vstate" aria-live="polite"></p>
      <textarea class="in" data-voice-text rows="4" placeholder="اللي هتقوله هيتكتب هنا، وتقدر تعدّل فيه…"></textarea>
      <div class="actions">
        <button class="btn" data-act="voice-toggle"></button>
        <button class="btn btn-primary" data-act="voice-save">${icon('check', 18)} احفظ لـ Claude</button>
      </div>
      <p class="hint">قول اللي عملته أو اللي عايز تعمله، زي: «قريت صفحتين قرآن ولعبت رياضة»، أو «صرفت 120 جنيه أكل»، أو «فكّرني أكلم العيادة بكرة الساعة 5». Claude هيحط كل حاجة في مكانها.</p>
    </div>`, { onClose: stop });
  if (!canListen()) { setState('idle', 'المتصفح ده مش بيدعم التسجيل. اكتب، أو استخدم مايك الكيبورد.'); return; }
  setState('idle', 'دوس ابدأ واتكلم');
  start();
}

export function start() {
  finalText = hasText() ? `${area().value.trim()} ` : '';
  if (isNative) {
    setState('on', 'بسمعك…');
    call('startVoice');
    return;
  }
  if (!SR) return;
  rec = new SR();
  rec.lang = 'ar-EG';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += `${r[0].transcript} `;
      else interim += r[0].transcript;
    }
    const a = area();
    if (a) a.value = (finalText + interim).trim();
  };
  rec.onerror = (e) => {
    listening = false;
    setState('idle', e.error === 'not-allowed' ? 'اسمح للمايك من المتصفح، وبعدين دوس ابدأ.' : 'وقف. دوس كمّل كلام.');
  };
  rec.onend = () => {
    listening = false;
    if (box()?.dataset.state === 'on') setState('idle', hasText() ? 'تمام. راجع الكلام واحفظه.' : 'مسمعتش حاجة. دوس ابدأ.');
  };
  try {
    rec.start();
    listening = true;
    setState('on', 'بسمعك…');
    buzz(12);
  } catch (e) {
    setState('idle', 'مقدرتش أشغّل المايك.');
  }
}

export function stop() {
  if (rec && listening) { try { rec.stop(); } catch (e) { /* already stopped */ } }
  listening = false;
}

export function toggle() {
  if (box()?.dataset.state === 'on') {
    stop();
    setState('idle', hasText() ? 'تمام. راجع الكلام واحفظه.' : 'دوس ابدأ واتكلم');
  } else start();
}

export function save() {
  const t = (area()?.value || '').trim();
  if (!t) { toast('مفيش كلام لسه'); return; }
  stop();
  M.addInbox(t, 'voice');
  buzz(18);
  closeSheet();
  toast('اتحفظ. Claude هيحطه في مكانه أول ما يتوصل');
}

// Android: text coming back from Google voice typing
window.bokraVoiceResult = (text, err) => {
  if (!box()) return;
  if (text) {
    const a = area();
    a.value = `${(a.value || '').trim()} ${text}`.trim();
    setState('idle', 'تمام. كمّل كلام أو احفظ.');
  } else {
    setState('idle', err === 'unavailable' ? 'مفيش تطبيق تسجيل صوت على الموبايل. فعّل Google voice typing.' : 'مسمعتش حاجة. دوس ابدأ.');
  }
};
