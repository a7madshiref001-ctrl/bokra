// Local-first store: everything lives in memory + IndexedDB, and sync.js mirrors it to Supabase.
// An item = { id, kind, data, updated_at, deleted, dirty }
import { nowISO } from './util.js';

const DB_NAME = 'bokra';
const STORE = 'items';
let idb = null;
const mem = new Map();
const changeFns = new Set();
const localFns = new Set();
let queue = [];
let flushing = false;

function openIDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function init() {
  idb = await openIDB();
  if (!idb) {
    try { (JSON.parse(localStorage.getItem('bokra.items') || '[]')).forEach((i) => mem.set(i.id, i)); } catch (e) { /* empty */ }
    return;
  }
  await new Promise((resolve) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => { (req.result || []).forEach((i) => mem.set(i.id, i)); resolve(); };
    req.onerror = () => resolve();
  });
}

function persist(item) {
  queue.push(item);
  if (!flushing) { flushing = true; Promise.resolve().then(flush); }
}
function flush() {
  const batch = queue; queue = []; flushing = false;
  if (!batch.length) return;
  if (!idb) {
    try { localStorage.setItem('bokra.items', JSON.stringify([...mem.values()])); } catch (e) { /* quota */ }
    return;
  }
  const tx = idb.transaction(STORE, 'readwrite');
  const st = tx.objectStore(STORE);
  batch.forEach((i) => st.put(i));
}

let notifyScheduled = false;
function notify(local) {
  if (local) localFns.forEach((f) => f());
  if (notifyScheduled) return;
  notifyScheduled = true;
  requestAnimationFrame(() => { notifyScheduled = false; changeFns.forEach((f) => f()); });
}

export const onChange = (fn) => changeFns.add(fn);
export const onLocalChange = (fn) => localFns.add(fn);

export function get(id) { const i = mem.get(id); return i && !i.deleted ? i : null; }
export function data(id) { const i = get(id); return i ? i.data : null; }
export function all(kind) {
  const out = [];
  for (const i of mem.values()) if (i.kind === kind && !i.deleted) out.push(i);
  return out;
}
export function everything() { return [...mem.values()]; }

// ts lets seeds use an ancient timestamp so real data from another device always wins.
export function put(kind, id, d, ts) {
  const item = { id, kind, data: d, updated_at: ts || nowISO(), deleted: false, dirty: 1 };
  mem.set(id, item); persist(item); notify(true);
  return item;
}
export function patch(id, partial) {
  const cur = get(id);
  if (!cur) return null;
  return put(cur.kind, id, { ...cur.data, ...partial });
}
export function remove(id) {
  const cur = mem.get(id);
  if (!cur) return;
  const item = { ...cur, deleted: true, updated_at: nowISO(), dirty: 1 };
  mem.set(id, item); persist(item); notify(true);
}

// ---- used by sync ----
export function dirtyItems() { return [...mem.values()].filter((i) => i.dirty); }
export function markClean(pushed) {
  pushed.forEach((p) => {
    const cur = mem.get(p.id);
    if (cur && cur.updated_at === p.updated_at && cur.dirty) { const c = { ...cur, dirty: 0 }; mem.set(p.id, c); persist(c); }
  });
}
export function applyRemote(rows) {
  let changed = false;
  rows.forEach((r) => {
    const cur = mem.get(r.id);
    if (cur && cur.updated_at > r.updated_at) return; // local is newer, it will be pushed
    if (cur && cur.updated_at === r.updated_at && !cur.dirty) return;
    const item = { id: r.id, kind: r.kind, data: r.data || {}, updated_at: r.updated_at, deleted: !!r.deleted, dirty: 0 };
    mem.set(r.id, item); persist(item); changed = true;
  });
  if (changed) notify(false);
  return changed;
}
export function markAllDirty() {
  for (const [id, i] of mem) { const c = { ...i, dirty: 1 }; mem.set(id, c); persist(c); }
  notify(true);
}

// Import a backup (array of items). Newer wins.
export function importItems(items) {
  let n = 0;
  items.forEach((r) => {
    if (!r || !r.id || !r.kind) return;
    const cur = mem.get(r.id);
    if (cur && cur.updated_at >= (r.updated_at || '')) return;
    const item = { id: r.id, kind: r.kind, data: r.data || {}, updated_at: r.updated_at || nowISO(), deleted: !!r.deleted, dirty: 1 };
    mem.set(r.id, item); persist(item); n++;
  });
  notify(true);
  return n;
}
