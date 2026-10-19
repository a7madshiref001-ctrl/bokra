// Live: what Claude (or the other device) writes shows up the moment it's saved (Supabase Realtime),
// and a new version of the app loads by itself, so the phone app is never reinstalled for screen changes.
import * as sync from './sync.js';
import { isNative, call } from './native.js';
import { sheetOpen } from './ui.js';
import { recording, playing } from './voice.js';
import { debounce } from './util.js';
import { DEMO } from './config.js';

// ---------- realtime: any change to his rows → pull now ----------
const TOPIC = 'realtime:bokra';
let ws = null;
let hb = 0;
let ref = 0;
let retry = 0;
let retryT = 0;
let tokenT = 0;
let joinRef = '';
const pullSoon = debounce(() => sync.syncNow(), 250);
const send = (m) => {
  const r = String(++ref);
  const jr = m.event === 'phx_join' ? r : m.topic === TOPIC ? joinRef : undefined;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ...m, ref: r, ...(jr ? { join_ref: jr } : {}) }));
  return r;
};

async function connect() {
  if (ws || !sync.isReady() || !navigator.onLine || document.visibilityState !== 'visible') return;
  let a;
  try { a = await sync.storageAuth(); } catch (e) { return; }
  if (ws) return;
  const sock = new WebSocket(`${a.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(a.key)}&vsn=1.0.0`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    joinRef = send({ topic: TOPIC, event: 'phx_join', payload: {
      config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'bokra_items' }] },
      access_token: a.token,
    } });
    clearInterval(hb);
    hb = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
    // the access token lasts an hour: hand the socket a fresh one before it runs out
    clearInterval(tokenT);
    tokenT = setInterval(async () => {
      try { const t = await sync.storageAuth(); send({ topic: TOPIC, event: 'access_token', payload: { access_token: t.token } }); } catch (e) { /* signed out */ }
    }, 20 * 60000);
  };
  sock.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.event === 'postgres_changes') pullSoon();
    else if (m.event === 'phx_reply' && m.payload?.status === 'ok' && m.ref === joinRef) sync.syncNow(); // joined: catch up once
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    clearInterval(hb); clearInterval(tokenT);
    if (document.visibilityState === 'visible' && sync.isReady()) {
      clearTimeout(retryT);
      retryT = setTimeout(connect, Math.min(30000, 1500 * 2 ** retry++));
    }
  };
  sock.onerror = () => { try { sock.close(); } catch (err) { /* closing */ } };
}

function disconnect() {
  clearTimeout(retryT);
  const s = ws;
  ws = null;
  if (s) { try { s.close(); } catch (e) { /* closed */ } }
}

// ---------- app updates ----------
let pending = false;
let bootVersion = null;
let lastTouch = Date.now();
const typing = () => { const a = document.activeElement; return !!a && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };
const busy = () => sheetOpen() || recording() || playing() || typing();
const idleFor = () => Date.now() - lastTouch;

function apply(now = false) {
  if (!pending || busy()) return;
  if (!now && idleFor() < 12000) return; // never pull the screen from under a finger
  pending = false;
  try { sessionStorage.setItem('bokra.updated', '1'); } catch (e) { /* private mode */ }
  location.reload();
}

// the phone app tells us when it has downloaded a new version
window.bokraUpdateReady = () => { pending = true; apply(document.visibilityState !== 'visible'); return true; };

async function checkWeb() {
  try {
    const r = await fetch(`${new URL('../version.json', import.meta.url).href}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.json()).version;
    if (!bootVersion) bootVersion = v;
    else if (v && v !== bootVersion) { pending = true; apply(); }
  } catch (e) { /* offline */ }
}

function check() {
  if (isNative) call('checkUpdate'); // native downloads the new files, then calls bokraUpdateReady
  else if (location.protocol === 'https:') checkWeb();
}

export const justUpdated = () => {
  try { const u = sessionStorage.getItem('bokra.updated'); sessionStorage.removeItem('bokra.updated'); return !!u; } catch (e) { return false; }
};

export function start() {
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => document.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { apply(true); check(); connect(); } else disconnect();
  });
  window.addEventListener('online', connect);
  sync.onStatus((s) => { if (s.status === 'ok') connect(); else if (s.status === 'off') disconnect(); });
  setInterval(() => { if (document.visibilityState === 'visible') { check(); apply(); } }, 90000);
  setInterval(() => apply(), 5000);
  check();
  if (!DEMO) connect();
}
