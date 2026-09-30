import React, { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, Loader2, Plus, UploadCloud, XCircle } from 'lucide-react';
import LiveValidationRow from '@/components/LiveValidationRow';
import { api } from '@/api/client';
import { queueOutbox } from '@/lib/offlineStore';

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/;

export function ReadingModule({
  title,
  description,
  value,
  setValue,
  appliedLoad,
  setAppliedLoad,
  source,
  setSource,
  preview,
  rows = [],
  onAdd,
  unit = 'g',
  sessionId,
  fixedAppliedLoad = null,
  requiredCount = 1,
}) {
  const [additionalLoad, setAdditionalLoad] = useState('0');
  const [zeroError, setZeroError] = useState('0');
  const load = String(fixedAppliedLoad ?? appliedLoad ?? '');
  // Preview with the ΔL / E0 typed here, not just L and I.
  const liveValidation =
    preview && value && !Number.isNaN(Number(value)) && load.trim()
      ? preview({ appliedLoad: load, indication: String(value), additionalLoad, zeroError })
      : null;
  // ΔL (changeover extra load) is part of E = I + e/2 - ΔL - L; hiding it
  // left every reading carrying a +e/2 bias, so it is visible by default.
  const [showAdvanced, setShowAdvanced] = useState(true);
  const capturedCount = rows.length;
  const required = Math.max(Number(requiredCount) || 1, 1);
  const progress = Math.min((capturedCount / required) * 100, 100);

  const [connection, setConnection] = useState({ status: 'idle', message: '' });
  const [lastLine, setLastLine] = useState('');
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' });
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const keepReadingRef = useRef(false);

  const disconnectScale = async () => {
    keepReadingRef.current = false;
    try {
      await readerRef.current?.cancel();
    } catch {}
    try {
      readerRef.current?.releaseLock();
    } catch {}
    try {
      await portRef.current?.close();
    } catch {}
    portRef.current = null;
    readerRef.current = null;
    setConnection({ status: 'idle', message: '' });
    if (source === 'serial') setSource('manual');
  };

  useEffect(() => () => { keepReadingRef.current = false; readerRef.current?.cancel().catch(() => {}); }, []);

  const runReadLoop = async (port) => {
    const textStream = port.readable.pipeThrough(new TextDecoderStream());
    const reader = textStream.getReader();
    readerRef.current = reader;
    let buffer = '';
    try {
      while (keepReadingRef.current) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          setLastLine(trimmed);
          const match = trimmed.match(NUMBER_PATTERN);
          if (match) {
            setValue(match[0]);
          }
        }
      }
    } catch (err) {
      if (keepReadingRef.current) {
        setConnection({ status: 'error', message: err.message || 'Serial connection dropped.' });
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }
  };

  const connectScale = async () => {
    if (connection.status === 'connected') {
      await disconnectScale();
      return;
    }
    if (!('serial' in navigator)) {
      window.alert('Web Serial is available in Chromium-based browsers. You can continue with manual capture.');
      return;
    }
    try {
      setConnection({ status: 'connecting', message: '' });
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      keepReadingRef.current = true;
      setSource('serial');
      setConnection({ status: 'connected', message: '' });
      runReadLoop(port);
    } catch (err) {
      keepReadingRef.current = false;
      setSource('manual');
      setConnection({ status: 'error', message: err.message || 'Could not open the serial port.' });
    }
  };

  const readPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // A photo is evidence only: it must not change the provenance of the
    // readings typed afterwards (OCR reading is deliberately deferred, D-30).
    const isSyncedSession = sessionId && !String(sessionId).startsWith('local-');
    if (!isSyncedSession) {
      setUploadState({ status: 'error', message: 'Sync this session to the server before attaching photos.' });
      event.target.value = '';
      return;
    }
    setUploadState({ status: 'uploading', message: '' });
    try {
      await api.upload(sessionId, file);
      setUploadState({ status: 'uploaded', message: file.name });
    } catch (err) {
      try {
        await queueOutbox({ kind: 'attachment', sessionId, file, addedAt: Date.now() });
        setUploadState({ status: 'queued', message: 'Will upload once the connection returns.' });
      } catch {
        setUploadState({ status: 'error', message: err.message || 'Upload failed.' });
      }
    } finally {
      event.target.value = '';
    }
  };

  const handleCapture = async () => {
    if (!value || Number.isNaN(Number(value))) return;
    const saved = await onAdd({
      applied_load: load,
      indication: String(value),
      additional_load: String(additionalLoad || '0'),
      zero_error: String(zeroError || '0'),
    });
    // ΔL is measured per load, so it must not silently carry over to the
    // next reading; E0 (zero error of the series) is kept.
    if (saved !== false) setAdditionalLoad('0');
  };

  return (
    <div className="animate-rise">
      <div className="mb-6 rounded-xl border border-[#c9d9d1] bg-gradient-to-r from-[#edf4ef] to-[#f7faf8] p-4 shadow-[0_1px_0_rgba(23,51,60,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66837d]">Requirement progress</div>
            <div className="mt-1 text-lg font-semibold text-[#17333c]">{capturedCount} / {required} required</div>
          </div>
          <div className="rounded-full border border-[#9bc8bb] bg-white px-2.5 py-1 font-mono text-sm font-bold text-[#2e7568]">
            {capturedCount} of {required}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#d7e0db]">
          <div className="h-full rounded-full bg-[#2e7568] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="max-w-xl text-sm leading-6 text-[#58746f]">{description}</p>

      <div className="mt-8 max-w-2xl rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[.8fr_1fr_auto]">
          {fixedAppliedLoad === null ? (
            <label>
              <span className="eyebrow">Applied load / {unit}</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={appliedLoad}
                onChange={(e) => setAppliedLoad(e.target.value)}
                className="measure-input mt-2 w-full font-mono"
                data-testid="input-applied-load"
              />
            </label>
          ) : (
            <div>
              <span className="eyebrow">Applied load</span>
              <div className="measure-input mt-2 font-mono text-sm font-bold bg-[#edf4ef]">
                {fixedAppliedLoad} {unit} (Fixed)
              </div>
            </div>
          )}

          <label>
            <span className="eyebrow">Indication / {unit}</span>
            <input
              id="measurement"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
              inputMode="decimal"
              placeholder="0.000"
              className="measure-input mt-2 w-full font-mono"
              data-testid={`input-${title.toLowerCase().replaceAll(' ', '-')}`}
            />
          </label>

          <button
            type="button"
            onClick={handleCapture}
            disabled={!value}
            className="button-brass self-end rounded-md px-4 py-3 text-xs font-bold"
            data-testid={`button-capture-${title.toLowerCase().replaceAll(' ', '-')}`}
          >
            <Plus size={15} />
            <span className="sr-only">Capture reading</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#e5ece8] pt-4">
            <label>
              <span className="eyebrow">Add. load (ΔL) / {unit}</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={additionalLoad}
                onChange={(e) => setAdditionalLoad(e.target.value)}
                className="measure-input mt-1.5 w-full font-mono text-xs"
              />
            </label>
            <label>
              <span className="eyebrow">Zero error (E₀) / {unit}</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={zeroError}
                onChange={(e) => setZeroError(e.target.value)}
                className="measure-input mt-1.5 w-full font-mono text-xs"
              />
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f4f2] pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={connectScale}
              className="button-quiet inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold"
              data-testid="button-connect-serial"
            >
              {connection.status === 'connecting' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Activity size={13} className={connection.status === 'connected' ? 'text-[#2e7568]' : ''} />
              )}
              {connection.status === 'connected'
                ? 'Disconnect scale'
                : connection.status === 'connecting'
                ? 'Connecting…'
                : 'Connect scale'}
            </button>
            <label className="button-quiet inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold">
              {uploadState.status === 'uploading' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <UploadCloud size={13} />
              )}
              Display photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={readPhoto}
                className="sr-only"
                data-testid="input-display-photo"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[10px] text-[#7b9690] hover:underline"
          >
            {showAdvanced ? 'Hide ΔL / E₀ parameters' : 'Show ΔL / E₀ parameters'}
          </button>
        </div>

        {connection.status === 'connected' && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#9bc8bb] bg-[#eaf4ef] px-3 py-2 text-[10px] text-[#2e7568]">
            <span className="status-dot" />
            Live from serial{lastLine ? ` · last line: ${lastLine}` : ' · waiting for data…'}
          </div>
        )}
        {connection.status === 'error' && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#e7b5ae] bg-[#fff5f3] px-3 py-2 text-[10px] text-[#a6423b]">
            <XCircle size={13} />
            {connection.message}
          </div>
        )}
        {uploadState.status !== 'idle' && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] ${
              uploadState.status === 'error'
                ? 'border-[#e7b5ae] bg-[#fff5f3] text-[#a6423b]'
                : uploadState.status === 'uploaded'
                ? 'border-[#9bc8bb] bg-[#eaf4ef] text-[#2e7568]'
                : 'border-[#e3cf9c] bg-[#fbf4e4] text-[#92713a]'
            }`}
          >
            {uploadState.status === 'uploaded' ? (
              <CheckCircle2 size={13} />
            ) : uploadState.status === 'uploading' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <UploadCloud size={13} />
            )}
            {uploadState.status === 'uploaded'
              ? `Uploaded ${uploadState.message}`
              : uploadState.status === 'uploading'
              ? 'Uploading display photo…'
              : uploadState.message}
          </div>
        )}

        {liveValidation && <LiveValidationRow evaluation={liveValidation} unit={unit} />}
      </div>

      {rows.length > 0 && (
        <div className="mt-7 max-w-2xl">
          <div className="eyebrow mb-3">Captured Observations ({rows.length})</div>
          <div className="divide-y divide-[#e5ece8] rounded-lg border border-[#d7e0db] bg-white overflow-hidden">
            {rows.map((r, index) => (
              <div key={r.id || `${r.sequence_no}-${index}`} className="flex items-center justify-between p-4 text-xs">
                <div>
                  <div className="font-semibold text-[#17333c]">
                    Observation #{r.sequence_no ?? index + 1}: Load = {r.applied_load} {unit} → Indication = {r.indication} {unit}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#66837d]">
                    Ec = {r.corrected_error ?? '—'} {unit} · MPE = ±{r.mpe_limit ?? '—'} {unit} · source: {r.source || 'manual'}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                    r.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#fdeceb] text-[#b24b43]'
                  }`}
                >
                  {r.verdict || 'RECORDED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReadingModule;

