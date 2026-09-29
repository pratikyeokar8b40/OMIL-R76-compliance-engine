import { api } from '@/api/client';
import { listOutbox, removeOutbox, getSessionMapping, updateSessionMapping, setGenericMapping } from '@/lib/offlineStore';

export async function syncOutbox() {
  const queue = await listOutbox();
  const rejected = [];
  let pushed = 0;
  window.dispatchEvent(new CustomEvent('nawi:sync-state', { detail: { state: 'syncing' } }));
  try {
    for (const item of queue) {
      let serverId = await getSessionMapping(item.sessionId);
      if (item.kind === 'instrument-create') {
        const instrument = await api.createInstrument(item.payload);
        await setGenericMapping(`instrument:${item.id}`, instrument.id);
        // Session-create items carry the temporary instrument reference.
        for (const later of (await listOutbox())) {
          if (later.kind === 'session-create' && later.payload?.__instrumentQueueId === item.id) {
            later.payload = { ...later.payload, instrument_id: instrument.id };
          }
        }
        await removeOutbox(item.id); pushed++; continue;
      }
      if (!serverId && item.kind === 'session-create') {
        const session = await api.createSession(item.payload);
        serverId = session.id;
        await updateSessionMapping(item.sessionId, serverId);
        window.dispatchEvent(new CustomEvent('nawi:session-synced', { detail: { localId: item.sessionId, serverId } }));
        await removeOutbox(item.id); pushed++; continue;
      }
      if (!serverId) continue;
      if (item.kind === 'observation') {
        await api.addObservation(serverId, item.payload);
      } else if (item.kind === 'environment') {
        await api.patchSession(serverId, item.payload);
      } else if (item.kind === 'test-plan') {
        await api.updateTestPlan(serverId, item.payload);
      } else if (item.kind === 'checklist') {
        await api.updateChecklistItem(serverId, item.payload);
      }
      await removeOutbox(item.id); pushed++;
    }
    window.dispatchEvent(new CustomEvent('nawi:sync-state', { detail: { state: 'idle' } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('nawi:sync-state', { detail: { state: 'failed', error: err.message } }));
    return { pushed, rejected, error: err.message };
  }
  return { pushed, rejected };
}
