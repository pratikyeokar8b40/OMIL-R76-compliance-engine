// Offline outbox sync: replays queued writes in order when the server is
// reachable. The server re-evaluates every reading (server wins).
//
// - Network errors / 5xx: stop and keep the rest queued for the next attempt.
// - 409 on an observation: it already exists on the server -> done.
// - Other 4xx: the server rejected the item for good -> drop it and report.
import { api } from '@/api/client';
import { getSessionMapping, listOutbox, removeOutbox, setSessionMapping } from './offlineStore';

let running = false;

function emit(state, detail = {}) {
  window.dispatchEvent(new CustomEvent('nawi:sync-state', { detail: { state, ...detail } }));
}

const isRetryable = (err) => !err?.status || err.status >= 500 || err.status === 401;

async function resolveSessionId(sessionId) {
  if (!sessionId) return null;
  return String(sessionId).startsWith('local-') ? getSessionMapping(sessionId) : sessionId;
}

async function findOrCreateInstrument(payload) {
  const found = await api.instruments(payload.serial_number, 0, 50);
  const match = (found.items || []).find(
    (i) => String(i.serial_number).toLowerCase() === String(payload.serial_number).toLowerCase()
  );
  return match || api.createInstrument(payload);
}

async function replay(item) {
  if (item.kind === 'session') {
    const { instrument, ...sessionFields } = item.payload;
    const inst = await findOrCreateInstrument(instrument);
    const created = await api.createSession({ instrument_id: inst.id, ...sessionFields });
    await setSessionMapping(item.localId, created.id);
    window.dispatchEvent(new CustomEvent('nawi:session-synced', {
      detail: { localSessionId: item.localId, serverSessionId: created.id },
    }));
    return;
  }
  const sessionId = await resolveSessionId(item.sessionId);
  if (!sessionId) {
    const err = new Error('Session not yet created on the server.');
    err.retry = true;
    throw err;
  }
  if (item.kind === 'observation') {
    try {
      await api.addObservation(sessionId, item.payload);
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  } else if (item.kind === 'environment') await api.patchSession(sessionId, item.payload);
  else if (item.kind === 'test-plan') await api.updateTestPlan(sessionId, item.payload);
  else if (item.kind === 'checklist') await api.updateChecklistItem(sessionId, item.payload);
  else if (item.kind === 'attachment' && item.file) await api.upload(sessionId, item.file);
}

export async function syncOutbox() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const items = await listOutbox();
    if (!items.length) return;
    emit('syncing');
    const rejected = [];
    for (const item of items) {
      try {
        await replay(item);
        await removeOutbox(item.id);
      } catch (err) {
        if (err.retry || isRetryable(err)) {
          emit('failed', { error: 'Server unreachable; queued changes will sync automatically.' });
          return;
        }
        rejected.push(err.message || 'rejected by server');
        await removeOutbox(item.id);
      }
    }
    if (rejected.length) {
      emit('failed', { error: `The server rejected ${rejected.length} queued change(s): ${rejected.join('; ')}` });
    } else {
      emit('idle');
    }
  } catch (err) {
    emit('failed', { error: err?.message || 'Synchronization failed.' });
  } finally {
    running = false;
  }
}
