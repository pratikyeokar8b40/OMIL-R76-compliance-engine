// Durable browser storage for the working session and the offline outbox.
// IndexedDB (structured clone) so queued photo uploads keep their File
// objects; falls back to memory + localStorage if IndexedDB is unavailable
// (e.g. some private-browsing modes).

const DB_NAME = 'nawi-offline';
const DB_VERSION = 1;
const KV = 'kv';
const OUTBOX = 'outbox';
const WORKING_SESSION_KEY = 'working-session';
const SESSION_MAP_KEY = 'session-map';

let dbPromise = null;
const memory = { kv: new Map(), outbox: [], nextId: 1 };

function openDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function kvGet(key) {
  const db = await openDb();
  if (!db) return memory.kv.has(key) ? memory.kv.get(key) : readLocal(key);
  return run(KV, 'readonly', (store) => store.get(key));
}

async function kvSet(key, value) {
  const db = await openDb();
  if (!db) {
    memory.kv.set(key, value);
    writeLocal(key, value);
    return;
  }
  await run(KV, 'readwrite', (store) => store.put(value, key));
}

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(`nawi-${key}`) || 'null');
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(`nawi-${key}`, JSON.stringify(value));
  } catch {
    // storage full or blocked: memory copy still serves this tab
  }
}

function notifyOutboxChanged() {
  window.dispatchEvent(new Event('nawi:outbox-changed'));
}

export async function saveWorkingSession(session) {
  await kvSet(WORKING_SESSION_KEY, session);
}

// Callback style (used by pages inside effects).
export function loadWorkingSession(callback) {
  kvGet(WORKING_SESSION_KEY)
    .then((stored) => callback(stored || null))
    .catch(() => callback(null));
}

export async function clearWorkingSession() {
  await kvSet(WORKING_SESSION_KEY, null);
}

export async function queueOutbox(item) {
  const entry = { ...item, queuedAt: Date.now() };
  const db = await openDb();
  if (!db) {
    memory.outbox.push({ ...entry, id: memory.nextId++ });
  } else {
    await run(OUTBOX, 'readwrite', (store) => store.add(entry));
  }
  notifyOutboxChanged();
}

export async function listOutbox() {
  const db = await openDb();
  if (!db) return [...memory.outbox];
  return (await run(OUTBOX, 'readonly', (store) => store.getAll())) || [];
}

export async function removeOutbox(id) {
  const db = await openDb();
  if (!db) {
    memory.outbox = memory.outbox.filter((item) => item.id !== id);
  } else {
    await run(OUTBOX, 'readwrite', (store) => store.delete(id));
  }
  notifyOutboxChanged();
}

export async function getSessionMapping(localId) {
  const map = (await kvGet(SESSION_MAP_KEY)) || {};
  return map[localId] || null;
}

export async function setSessionMapping(localId, serverId) {
  const map = (await kvGet(SESSION_MAP_KEY)) || {};
  await kvSet(SESSION_MAP_KEY, { ...map, [localId]: serverId });
}
