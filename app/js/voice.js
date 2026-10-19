// Voice: tap the mic and talk. What you say is kept as your voice (not typed text) and sent to Claude,
// who listens to it, puts each thing in its place, and writes his notes right under the recording.
// Old phone app (before mic permission) falls back to Google voice typing, saved as text.
import * as M from './model.js';
import * as db from './db.js';
import * as audio from './audio.js';
import * as sync from './sync.js';
import { openSheet, closeSheet, sheetOpen, buzz } from './ui.js';
import { icon } from './icons.js';
import { isNative, call } from './native.js';
import { toast } from './util.js';
import { DEMO } from './config.js';

const BARS = 30;
const MAX_SEC = 600;
const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const nativeMic = () => typeof window.BokraNative?.hasMic === 'function';
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder) && (!isNative || nativeMic());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let rec = null;

export const recording = () => !!rec;
export const fmtDur = (s) => { s = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const $rec = () => document.querySelector('[data-rec]');

function setState(state, hint) {
  const r = $rec();
  if (!r) return;
  r.dataset.state = state;
  const h = r.querySelector('[data-rec-hint]');
  if (h && hint != null) h.textContent = hint;
}

export function open() {
  if (rec) return;
  if (isNative && !nativeMic()) { typeSheet('نزّل آخر نسخة من التطبيق عشان صوتك يتحفظ صوت. لحد كده: دوس المايك واتكلم، أو اكتب.', true); return; }
  openSheet('Voice', `<div class="rec" data-rec data-state="wait">
      <div class="rec-wave" aria-hidden="true">${'<i></i>'.repeat(BARS)}</div>
      <p class="rec-time num" data-rec-time>0:00</p>
      <p class="rec-hint" data-rec-hint aria-live="polite">بجهّز المايك…</p>
      <div class="rec-actions">
        <button class="rec-side" data-act="voice-cancel" aria-label="الغي التسجيل">${icon('trash', 20)}</button>
        <button class="rec-go" data-act="voice-done" aria-label="خلصت، ابعته لـ Claude">${icon('check', 32)}</button>
        <button class="rec-side" data-act="voice-type" aria-label="اكتب بدل الصوت">${icon('pen', 20)}</button>
      </div>
    </div>`, { onClose: () => finish(true) }); // closing the sheet keeps what you said; only the trash button throws it away
  start();
}

async function start() {
  if (!canRecord()) { typeSheet('التسجيل مش متاح هنا. اكتب بدل الصوت.'); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    typeSheet(denied ? 'المايك مقفول. اسمح له من الإعدادات وجرب تاني، أو اكتب.' : 'مقدرتش أشغّل المايك. اكتب بدل الصوت.');
    return;
  }
  if (!sheetOpen() || !$rec()) { stream.getTracks().forEach((t) => t.stop()); return; } // sheet closed while the mic was starting
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); } catch (e) { mr = new MediaRecorder(stream); }
  const r = { stream, mr, chunks: [], levels: [], t0: performance.now(), mime: mr.mimeType || mime || 'audio/webm' };
  mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
  mr.start(1000);
  rec = r;
  meter(r);
  setState('on', 'بسمعك… لما تخلص دوس ✓');
  buzz(14);
}

// live level bars + timer; the levels also become the little waveform saved with the note
function meter(r) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    r.ctx = new Ctx();
    if (r.ctx.state === 'suspended') r.ctx.resume();
    r.an = r.ctx.createAnalyser();
    r.an.fftSize = 1024;
    r.ctx.createMediaStreamSource(r.stream).connect(r.an);
    r.buf = new Float32Array(r.an.fftSize);
  } catch (e) { r.an = null; }
  const bars = [...document.querySelectorAll('.rec-wave i')];
  const shown = new Array(bars.length).fill(0.08);
  let lastSec = -1;
  // a timer, not requestAnimationFrame: keeps sampling (and the 10-minute cap) even with the screen off
  r.tick = setInterval(() => {
    if (rec !== r) return;
    let rms = 0;
    if (r.an) {
      r.an.getFloatTimeDomainData(r.buf);
      let sum = 0;
      for (let i = 0; i < r.buf.length; i++) sum += r.buf[i] * r.buf[i];
      rms = Math.sqrt(sum / r.buf.length);
    }
    r.levels.push(rms); // raw, so the saved waveform keeps loud vs quiet
    shown.shift(); shown.push(Math.max(0.08, Math.min(1, rms * 5)));
    bars.forEach((el, i) => { el.style.transform = `scaleY(${shown[i].toFixed(3)})`; });
    const sec = Math.floor((performance.now() - r.t0) / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      const el = document.querySelector('[data-rec-time]');
      if (el) el.textContent = fmtDur(sec);
      if (sec >= MAX_SEC) closeSheet();
    }
  }, 90);
}

function peaks(levels, n = 40) {
  if (!levels.length) return [];
  const out = [];
  const step = levels.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let m = 0;
    for (let j = a; j < b && j < levels.length; j++) m = Math.max(m, levels[j]);
    out.push(m);
  }
  const top = Math.max(...out, 0.01);
  return out.map((v) => Math.max(1, Math.round((v / top) * 9)));
}

// keep = save it for Claude; otherwise throw it away
async function finish(keep) {
  const r = rec;
  if (!r) return;
  rec = null;
  clearInterval(r.tick);
  const dur = (performance.now() - r.t0) / 1000;
  if (r.mr.state !== 'inactive') {
    const stopped = new Promise((res) => { r.mr.onstop = res; });
    try { r.mr.stop(); } catch (e) { /* already stopped */ }
    await Promise.race([stopped, wait(1500)]);
  }
  r.stream.getTracks().forEach((t) => t.stop());
  try { r.ctx?.close(); } catch (e) { /* closed */ }
  if (!keep) return;
  if (dur < 1) { toast('قصير أوي، متحفظش'); return; }
  const blob = new Blob(r.chunks, { type: r.mime });
  if (!blob.size) { toast('مفيش صوت اتسجّل'); return; }
  const id = M.newVoiceId();
  await audio.save(id, blob);
  M.addVoice(id, { mime: r.mime, dur: Math.round(dur), size: blob.size, peaks: peaks(r.levels) });
  buzz(18);
  toast(DEMO ? 'اتحفظ صوتك. في النسخة الحقيقية Claude بيسمعه ويكتب تحته'
    : sync.isReady() ? 'اتحفظ صوتك. Claude هيسمعه ويكتب ملاحظاته تحته'
      : 'اتحفظ صوتك هنا. وصّل المزامنة عشان يوصل لـ Claude');
}

export const done = () => closeSheet();
export async function cancel() { await finish(false); closeSheet(); toast('اتلغى'); }
export async function toText() { await finish(false); typeSheet(''); }

// typed note (or the old phone app's voice typing)
function typeSheet(hint, legacy = false) {
  const body = `<div class="rec typed" data-rec data-state="type">
      ${hint ? `<p class="rec-hint">${hint}</p>` : ''}
      <textarea class="in" data-voice-text rows="4" placeholder="«قريت صفحتين قرآن ولعبت رياضة»"></textarea>
      <div class="actions">
        ${legacy ? `<button class="btn" data-act="voice-legacy">${icon('mic', 18)} اتكلم</button>` : ''}
        <button class="btn btn-primary" data-act="voice-save-text">${icon('check', 18)} احفظ لـ Claude</button>
      </div>
    </div>`;
  const r = $rec();
  if (r) { r.outerHTML = body; } else openSheet('Voice', body);
  if (!legacy) setTimeout(() => document.querySelector('[data-voice-text]')?.focus(), 80);
}

export function saveText() {
  const t = (document.querySelector('[data-voice-text]')?.value || '').trim();
  if (!t) { toast('مفيش كلام لسه'); return; }
  M.addInbox(t, 'text');
  buzz(18);
  closeSheet();
  toast('اتحفظ. Claude هيحطه في مكانه');
}

export function legacyListen() { call('startVoice'); }
// old Android app: text coming back from Google voice typing
window.bokraVoiceResult = (text) => {
  const a = document.querySelector('[data-voice-text]');
  if (a && text) a.value = `${(a.value || '').trim()} ${text}`.trim();
};

// ---------- playback ----------
const player = { id: null, a: null, url: null, raf: 0 };
export const playing = () => !!(player.a && !player.a.paused);

export function playerState(id) {
  if (player.id !== id || !player.a) return { playing: false, p: 0 };
  const dur = Number(db.get(id)?.data.audio?.dur) || player.a.duration || 1;
  return { playing: !player.a.paused, p: Math.min(1, player.a.currentTime / dur) };
}

function paint() {
  cancelAnimationFrame(player.raf);
  document.querySelectorAll('.vn').forEach((el) => {
    const s = playerState(el.dataset.vn);
    el.classList.toggle('playing', s.playing);
    el.querySelector('.vwave')?.style.setProperty('--p', s.p.toFixed(4));
    const b = el.querySelector('.vplay');
    if (b && b.dataset.on !== String(s.playing)) { b.dataset.on = String(s.playing); b.innerHTML = icon(s.playing ? 'pause' : 'play', 18); }
  });
  if (player.a && !player.a.paused) player.raf = requestAnimationFrame(paint);
}

function stopPlayer() {
  if (player.a) { player.a.pause(); player.a.src = ''; }
  if (player.url) URL.revokeObjectURL(player.url);
  player.id = null; player.a = null; player.url = null;
}

export async function play(id) {
  if (player.id === id && player.a) {
    if (player.a.paused) player.a.play().catch(() => {}); else player.a.pause();
    return;
  }
  stopPlayer();
  const it = db.get(id);
  if (!it) return;
  player.id = id;
  document.querySelector(`.vn[data-vn="${id}"]`)?.classList.add('loading');
  let blob = null;
  try { blob = await audio.blobFor(it); } catch (e) { blob = null; }
  document.querySelector(`.vn[data-vn="${id}"]`)?.classList.remove('loading');
  if (player.id !== id) return;
  if (!blob) { player.id = null; toast(sync.isReady() ? 'مقدرتش أجيب الصوت، جرب تاني' : 'الصوت ده متسجّل على جهاز تاني'); return; }
  const a = new Audio();
  player.a = a;
  player.url = URL.createObjectURL(blob);
  a.src = player.url;
  a.onplay = paint;
  a.onpause = paint;
  a.onended = () => { stopPlayer(); paint(); };
  a.play().catch(() => { stopPlayer(); paint(); });
}

export async function remove(id) {
  const it = db.get(id);
  if (!it) return;
  if (player.id === id) { stopPlayer(); paint(); }
  db.remove(id);
  audio.drop(id, it.data.audio?.path);
}
