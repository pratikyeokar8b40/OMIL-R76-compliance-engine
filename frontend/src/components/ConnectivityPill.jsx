import React, { useEffect, useState } from 'react';
import { LoaderCircle, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { health } from '@/api/client';
import { listOutbox } from '@/lib/offlineStore';

export default function ConnectivityPill() {
  const [online, setOnline] = useState(navigator.onLine);
  const [server, setServer] = useState(false);
  const [syncState, setSyncState] = useState('idle');
  const [pending, setPending] = useState(0);

  const refresh = () => listOutbox().then((items) => setPending(items.length));

  useEffect(() => {
    const check = () => {
      setOnline(navigator.onLine);
      health().then(setServer);
      refresh();
    };
    check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    window.addEventListener('nawi:outbox-changed', refresh);
    const onSync = (e) => {
      setSyncState(e.detail?.state || 'idle');
      refresh();
    };
    window.addEventListener('nawi:sync-state', onSync);
    const t = setInterval(check, 30000);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      window.removeEventListener('nawi:outbox-changed', refresh);
      window.removeEventListener('nawi:sync-state', onSync);
    };
  }, []);

  const live = online && server;
  const failed = syncState === 'failed';
  const syncing = syncState === 'syncing';
  const label = failed ? 'Sync failed' : syncing ? 'Syncing' : live ? 'Connected' : 'Offline';
  const Icon = failed ? AlertTriangle : syncing ? LoaderCircle : live ? Wifi : WifiOff;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-[#c9d9d1] bg-white/80 px-3 py-1.5 text-[13px] font-medium text-[#466762] shadow-sm"
      data-testid="status-offline"
    >
      <Icon size={12} className={syncing ? 'animate-spin' : ''} />
      <span>{label}{pending > 0 ? ` · ${pending} pending` : ''}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${failed ? 'bg-[#b24b43]' : live ? 'bg-[#2e7568]' : 'bg-[#c69852]'}`} />
    </div>
  );
}
