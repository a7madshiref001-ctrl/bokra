// Supabase sync over plain REST (no SDK). Push dirty items, then pull everything changed since last pull.
import * as db from './db.js';
import { isNative, call, callJSON } from './native.js';
import { debounce } from './util.js';
import { DEMO } from './config.js';

const K_CFG = 'bokra.sync.cfg';
const K_SES = 'bokra.sync.session';
const K_LAST = 'bokra.sync.last';
const TABLE = 'bokra_items';

const listeners = new Set();
export const state = { status: 'off', at: null, error: '' };
function set(status, extra = {}) { Object.assign(state, { status, ...extra }); listeners.forEach((f) => f(state)); }
export const onStatus = (fn) => listeners.add(fn);

export function config() {
  try { return JSON.parse(localStorage.getItem(K_CFG) || 'null'); } catch (e) { return null; }
}
export function setConfig(cfg) {
  localStorage.setItem(K_CFG, JSON.stringify({ url: cfg.url.replace(/\/+$/, ''), key: cfg.key.trim() }));
}

export function session() {
  if (isNative) { const s = callJSON('getSession'); return s && s.access_token ? s : null; }
  try { return JSON.parse(localStorage.getItem(K_SES) || 'null'); } catch (e) { return null; }
}
function saveSession(s) {
  const cfg = config();
  if (isNative) call('setSession', s ? { ...s, url: cfg?.url, key: cfg?.key } : {});
  else if (s) localStorage.setItem(K_SES, JSON.stringify(s));
  else localStorage.removeItem(K_SES);
}
export const isReady = () => !DEMO && !!(config() && session());

function toSession(j) {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: { id: j.user?.id, email: j.user?.email },
  };
}

async function authCall(path, body) {
  const cfg = config();
  if (!cfg) throw new Error('حط بيانات Supabase الأول');
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.msg || j.message || `خطأ ${res.status}`);
  return j;
}

export async function signIn(email, password) {
  if (DEMO) throw new Error('دي نسخة تجريبية');
  const j = await authCall('token?grant_type=password', { email, password });
  saveSession(toSession(j));
  localStorage.removeItem(K_LAST);
  db.markAllDirty(); // first sign-in on this device: upload what's here
  await syncNow();
}

export async function signUp(email, password) {
  if (DEMO) throw new Error('دي نسخة تجريبية');
  const j = await authCall('signup', { email, password });
  if (j.access_token) { saveSession(toSession(j)); db.markAllDirty(); await syncNow(); return 'in'; }
  return 'confirm'; // email confirmation is on
}

export function signOut() { saveSession(null); localStorage.removeItem(K_LAST); set('off'); }

async function refresh(s) {
  try {
    const j = await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    const ns = toSession(j); saveSession(ns); return ns;
  } catch (e) {
    // another device-side process may have refreshed already
    const again = session();
    if (again && again.refresh_token !== s.refresh_token) return again;
    saveSession(null); set('off', { error: 'محتاج تدخل تاني' });
    throw e;
  }
}

export async function token() {
  let s = session();
  if (!s) return null;
  if (Date.now() / 1000 > (s.expires_at || 0) - 90) s = await refresh(s);
  return s;
}

// for Storage (voice recordings) and Realtime
export async function storageAuth() {
  const cfg = config();
  const s = await token();
  if (!cfg || !s) throw new Error('not signed in');
  return { url: cfg.url, key: cfg.key, token: s.access_token, userId: s.user.id };
}

// work that has to happen before the rows go up (e.g. uploading voice recordings)
const before = [];
export const beforePush = (fn) => before.push(fn);

async function rest(method, query, body, prefer) {
  const cfg = config();
  let s = await token();
  if (!cfg || !s) throw new Error('not signed in');
  const go = (ses) => fetch(`${cfg.url}/rest/v1/${TABLE}${query}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${ses.access_token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await go(s);
  if (res.status === 401) { s = await refresh(s); res = await go(s); }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 160) || `HTTP ${res.status}`);
  }
  return method === 'GET' ? res.json() : null;
}

async function push() {
  const s = session();
  const dirty = db.dirtyItems();
  for (let i = 0; i < dirty.length; i += 200) {
    const chunk = dirty.slice(i, i + 200);
    const rows = chunk.map((it) => ({ id: it.id, user_id: s.user.id, kind: it.kind, data: it.data, updated_at: it.updated_at, deleted: !!it.deleted }));
    await rest('POST', '?on_conflict=user_id,id', rows, 'resolution=merge-duplicates,return=minimal');
    db.markClean(chunk);
  }
}

async function pull() {
  let since = localStorage.getItem(K_LAST) || '1970-01-01T00:00:00Z';
  // re-read the last 2 minutes every time; applying a row twice is harmless
  const overlap = new Date(new Date(since).getTime() - 120000).toISOString();
  let from = since === '1970-01-01T00:00:00Z' ? since : overlap;
  for (let page = 0; page < 50; page++) {
    const rows = await rest('GET', `?select=id,kind,data,updated_at,deleted,synced_at&synced_at=gt.${encodeURIComponent(from)}&order=synced_at.asc&limit=500`);
    if (!rows.length) break;
    db.applyRemote(rows);
    from = rows[rows.length - 1].synced_at;
    if (from > since) since = from;
    if (rows.length < 500) break;
  }
  localStorage.setItem(K_LAST, since);
}

let running = false;
let again = false;
export async function syncNow() {
  if (!isReady()) { set('off'); return; }
  if (!navigator.onLine) { set('offline'); return; }
  if (running) { again = true; return; }
  running = true; set('syncing');
  try {
    for (const fn of before) { try { await fn(); } catch (e) { console.warn('before push', e); } }
    await push();
    await pull();
    set('ok', { at: new Date(), error: '' });
  } catch (e) {
    set('error', { error: String(e.message || e) });
  } finally {
    running = false;
    if (again) { again = false; syncNow(); }
  }
}

export function start() {
  if (DEMO) { set('off'); return; }
  const soon = debounce(syncNow, 1500);
  db.onLocalChange(soon);
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 45000);
  syncNow();
}
