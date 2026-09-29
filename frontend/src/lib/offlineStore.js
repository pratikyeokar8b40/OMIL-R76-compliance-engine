const KEY = 'nawi-offline-store-v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{"sessions":{},"outbox":[],"observations":{}}'); }
  catch { return { sessions: {}, outbox: [], observations: {} }; }
}
function write(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
function localId() { return `local-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`; }

export async function saveWorkingSession(session) {
  const db = read();
  db.sessions[session.id] = { ...(db.sessions[session.id] || {}), ...session, updatedAt: new Date().toISOString() };
  write(db);
  localStorage.setItem('nawi-session', JSON.stringify(db.sessions[session.id]));
  return db.sessions[session.id];
}

export async function loadWorkingSession(id = null, callback = null) {
  const db = read();
  let result = id && db.sessions[id] ? db.sessions[id] : null;
  if (!result) {
    try { result = JSON.parse(localStorage.getItem('nawi-session') || 'null'); } catch { result = null; }
  }
  if (result) result = { ...result, observations: result.observations || [] };
  if (typeof id === 'function') callback = id;
  if (typeof callback === 'function') callback(result);
  return result;
}

export async function queueOutbox({ kind, sessionId, payload }) {
  const db = read();
  const item = { id: localId(), kind, sessionId, payload, createdAt: new Date().toISOString() };
  db.outbox.push(item);
  write(db);
  return item;
}

export async function listOutbox() { return read().outbox; }
export async function getSessionMapping(localSessionId) {
  const db = read();
  return db.sessions[localSessionId]?.server_id || db.sessions[`__mapping__${localSessionId}`]?.server_id || null;
}
export async function setGenericMapping(key, serverId) {
  const db = read(); db.sessions[`__mapping__${key}`] = { server_id: serverId }; write(db);
}
export async function removeOutbox(id) { const db = read(); db.outbox = db.outbox.filter((x) => x.id !== id); write(db); }
export async function updateSessionMapping(localIdValue, serverId) {
  const db = read();
  if (db.sessions[localIdValue]) db.sessions[localIdValue].server_id = serverId;
  write(db);
}
export function createLocalSessionId() { return localId(); }
