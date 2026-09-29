import React from 'react';
import { Pause, Play, Plus, RotateCcw } from 'lucide-react';
import LiveValidationRow from '@/components/LiveValidationRow';

// Backend-required creep capture points are 0 / 5 / 15 / 30 minutes,
// recorded as positions '1'..'4' (R 76-1 §A.4.11.1) — must match
// TEST_MODULES in lib/requirements.js exactly.
const CHECKPOINTS = [
  { seconds: 0, position: '1' },
  { seconds: 300, position: '2' },
  { seconds: 900, position: '3' },
  { seconds: 1800, position: '4' },
];

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function CreepModule({
  value,
  setValue,
  appliedLoad,
  setAppliedLoad,
  source,
  setSource,
  liveValidation,
  unit = 'g',
  rows = [],
  elapsedMs = 0,
  running = false,
  onStart,
  onStop,
  onReset,
  onCapture,
}) {
  const capturedFor = (pos) => rows.find((r) => r.position === pos);
  const dueCheckpoint = CHECKPOINTS.find((c) => !capturedFor(c.position) && elapsedMs / 1000 >= c.seconds);
  const activeCheckpoint = dueCheckpoint || CHECKPOINTS.find((c) => !capturedFor(c.position)) || CHECKPOINTS[0];

  const first = capturedFor('1');
  const last = [...rows].reverse().find(Boolean);
  const drift = first && last && rows.length > 1 ? Number(last.indication) - Number(first.indication) : null;
  const requiredCount = CHECKPOINTS.length;
  const progress = Math.min((rows.length / requiredCount) * 100, 100);

  return (
    <div className="animate-rise">
      <div className="mb-6 rounded-xl border border-[#c9d9d1] bg-gradient-to-r from-[#edf4ef] to-[#f7faf8] p-4 shadow-[0_1px_0_rgba(23,51,60,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66837d]">Requirement progress</div>
            <div className="mt-1 text-lg font-semibold text-[#17333c]">{rows.length} / {requiredCount} checkpoints recorded</div>
          </div>
          <div className="rounded-full border border-[#9bc8bb] bg-white px-2.5 py-1 font-mono text-sm font-bold text-[#2e7568]">
            {rows.length} of {requiredCount}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#d7e0db]">
          <div className="h-full rounded-full bg-[#2e7568] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="max-w-xl text-sm leading-6 text-[#58746f]">
        Apply the test load once and hold it in place. Capture the indication at 0, 5, 15 and 30 minutes to measure
        how much the reading drifts over time.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-4 rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#c9d9d1] bg-white">
          <span className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-[#2e7568] animate-pulse' : 'bg-[#c9d9d1]'}`} />
        </div>
        <div>
          <div className="eyebrow">Elapsed time</div>
          <div className="font-mono text-3xl tracking-tight text-[#17333c]" data-testid="text-creep-elapsed">
            {formatElapsed(elapsedMs)}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {!running ? (
            <button onClick={onStart} className="button-brass inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold" data-testid="button-start-creep-timer">
              <Play size={14} /> {elapsedMs > 0 ? 'Resume timer' : 'Start creep timer'}
            </button>
          ) : (
            <button onClick={onStop} className="button-quiet inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold" data-testid="button-stop-creep-timer">
              <Pause size={14} /> Stop timer
            </button>
          )}
          <button onClick={onReset} className="button-quiet inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-xs font-semibold" title="Reset timer (keeps captured readings)" data-testid="button-reset-creep-timer">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CHECKPOINTS.map((c) => {
          const captured = !!capturedFor(c.position);
          const due = !captured && running && elapsedMs / 1000 >= c.seconds;
          return (
            <span
              key={c.position}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${
                captured ? 'border-[#9bc8bb] bg-[#eaf4ef] text-[#2e7568]' : due ? 'border-[#e3cf9c] bg-[#fbf4e4] text-[#92713a]' : 'border-[#d7e0db] text-[#7b9690]'
              }`}
            >
              {c.seconds / 60} min {captured ? '✓' : due ? '· due' : ''}
            </span>
          );
        })}
      </div>

      <div className="mt-6 max-w-2xl rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-5">
        <div className="grid gap-4 sm:grid-cols-[.6fr_.8fr_1fr_auto]">
          <div>
            <span className="eyebrow">Position</span>
            <div className="measure-input mt-2 grid place-items-center font-mono text-sm font-bold">{activeCheckpoint.position}</div>
          </div>
          <label>
            <span className="eyebrow">Applied load / {unit}</span>
            <input type="number" inputMode="decimal" value={appliedLoad} onChange={(e) => setAppliedLoad(e.target.value)} className="measure-input mt-2 w-full" data-testid="input-creep-applied-load" />
          </label>
          <label>
            <span className="eyebrow">Indication / {unit}</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCapture(activeCheckpoint.position)}
              inputMode="decimal"
              placeholder="0.000"
              className="measure-input mt-2 w-full"
              data-testid="input-creep-reading"
            />
          </label>
          <button
            onClick={() => onCapture(activeCheckpoint.position)}
            disabled={!!capturedFor(activeCheckpoint.position)}
            className="button-brass self-end rounded-md px-4 py-3 text-xs font-bold"
            data-testid="button-capture-creep"
          >
            <Plus size={15} />
            <span className="sr-only">Capture creep reading</span>
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-[#7b9690]">
          <span>Captures the reading for position {activeCheckpoint.position} ({activeCheckpoint.seconds / 60} min)</span>
          <span className="font-mono">source: {source}</span>
        </div>
        {liveValidation && <LiveValidationRow evaluation={liveValidation} unit={unit} />}
      </div>

      {rows.length > 0 && (
        <div className="mt-7 max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="eyebrow">Timestamped captures</div>
            {drift !== null && (
              <span className="font-mono text-[10px] text-[#66837d]" data-testid="text-creep-drift">
                Drift {drift >= 0 ? '+' : ''}{drift.toFixed(3)} {unit}
              </span>
            )}
          </div>
          <div className="divide-y divide-[#e5ece8] rounded-lg border border-[#d7e0db] bg-white">
            {rows.map((item, index) => (
              <div key={`${item.position}-${index}`} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-mono text-xs text-[#66837d]">Position {item.position}</span>
                <span className="font-mono font-bold text-[#17333c]">
                  {item.indication} <span className="font-sans text-xs font-normal text-[#7b9690]">{unit}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#f7dfdc] text-[#b24b43]'}`}>
                  {item.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CreepModule;
