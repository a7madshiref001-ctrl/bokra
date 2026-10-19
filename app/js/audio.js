// Voice notes stay real audio: kept on this device (IndexedDB) and uploaded to Supabase Storage,
// where Claude picks them up, listens (Whisper on Ahmed's PC), and writes back what he heard.
import * as db from './db.js';
import * as sync from './sync.js';
import { DEMO } from './config.js';

const DB_NAME = DEMO ? 'bokra-demo-audio' : 'bokra-audio';
const BUCKET = 'bokra-voice';
const mem = new Map(); // fast path, and the only copy if IndexedDB is unavailable
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    const t = setTimeout(() => resolve(null), 2500);
    const done = (v) => { clearTimeout(t); resolve(v); };
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => done(req.result);
    req.onerror = req.onblocked = () => done(null);
  });
  return dbp;
}

export async function save(id, blob) {
  mem.set(id, blob);
  const idb = await open();
  if (!idb) return;
  await new Promise((r) => {
    const tx = idb.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(blob, id);
    tx.oncomplete = tx.onerror = tx.onabort = () => r();
  });
}

export async function local(id) {
  if (mem.has(id)) return mem.get(id);
  const idb = await open();
  if (!idb) return null;
  return new Promise((r) => {
    const req = idb.transaction('blobs').objectStore('blobs').get(id);
    req.onsuccess = () => r(req.result || null);
    req.onerror = () => r(null);
  });
}

export async function drop(id, path) {
  mem.delete(id);
  const idb = await open();
  if (idb) idb.transaction('blobs', 'readwrite').objectStore('blobs').delete(id);
  if (path && sync.isReady()) {
    try { const a = await sync.storageAuth(); await fetch(`${a.url}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: headers(a) }); } catch (e) { /* stays in storage, harmless */ }
  }
}

const headers = (a, extra = {}) => ({ apikey: a.key, Authorization: `Bearer ${a.token}`, ...extra });
const ext = (mime) => (/mp4|aac|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm');

async function upload(id, blob, mime) {
  const a = await sync.storageAuth();
  const path = `${a.userId}/${id}.${ext(mime)}`;
  const res = await fetch(`${a.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: headers(a, { 'Content-Type': (mime || 'audio/webm').split(';')[0], 'x-upsert': 'true' }),
    body: blob,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return path;
}

async function download(path) {
  const a = await sync.storageAuth();
  const res = await fetch(`${a.url}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: headers(a) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return res.blob();
}

// the recording, from this device or (recorded on the other one) from storage
export async function blobFor(item) {
  let b = await local(item.id);
  if (b) return b;
  const path = item.data.audio?.path;
  if (!path || !sync.isReady()) return null;
  b = await download(path);
  await save(item.id, b);
  return b;
}

// runs before every sync push: recordings made offline / before sign-in go up first
export async function uploadPending() {
  const waiting = db.all('inbox').filter((i) => i.data.audio && !i.data.audio.up);
  for (const it of waiting) {
    const blob = await local(it.id);
    if (!blob) continue; // recorded on another device that hasn't uploaded yet
    const path = await upload(it.id, blob, it.data.audio.mime || blob.type);
    const cur = db.get(it.id);
    if (cur) db.patch(it.id, { audio: { ...cur.data.audio, up: true, path } });
  }
}
