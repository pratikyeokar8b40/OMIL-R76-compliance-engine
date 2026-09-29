import React from 'react';
import { Plus } from 'lucide-react';
import LiveValidationRow from '@/components/LiveValidationRow';

// Backend-required positions for the eccentricity test are exactly
// '1'..'4' (R 76-1 §A.4.7.1, four quarter segments) — this must match
// TEST_MODULES in lib/requirements.js exactly, since the finalize gate
// checks for observations logged at these positions.
const POSITIONS = ['1', '2', '3', '4'];

export function EccentricityModule({
  reading,
  setReading,
  rows = [],
  onAdd,
  unit = 'g',
  liveValidation,
  appliedLoad,
  setAppliedLoad,
  activePosition,
  setActivePosition,
}) {
  const capturedFor = (pos) => rows.find((r) => r.position === pos);
  const nextRequired = POSITIONS.find((p) => !capturedFor(p));
  const current = activePosition || nextRequired || POSITIONS[0];
  const capturedCount = rows.length;
  const progress = Math.min((capturedCount / POSITIONS.length) * 100, 100);

  return (
    <div className="animate-rise">
      <div className="mb-6 rounded-xl border border-[#c9d9d1] bg-gradient-to-r from-[#edf4ef] to-[#f7faf8] p-4 shadow-[0_1px_0_rgba(23,51,60,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66837d]">Requirement progress</div>
            <div className="mt-1 text-lg font-semibold text-[#17333c]">{capturedCount} / {POSITIONS.length} positions recorded</div>
          </div>
          <div className="rounded-full border border-[#9bc8bb] bg-white px-2.5 py-1 font-mono text-sm font-bold text-[#2e7568]">
            {capturedCount} of {POSITIONS.length}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#d7e0db]">
          <div className="h-full rounded-full bg-[#2e7568] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="max-w-xl text-sm leading-6 text-[#58746f]">
        Apply the test load successively at the four quarter positions. The greatest difference from center will be
        compared against the maximum permissible error.
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[210px_1fr]">
        <div className="grid-paper relative mx-auto aspect-square w-full max-w-[210px] rounded-lg border border-[#c9d9d1] bg-[#f8fbf8]">
          <div className="absolute inset-[24%] grid place-items-center rounded-full border border-dashed border-[#9dbbb2]">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#7b9690]">load</span>
          </div>
          {POSITIONS.map((position, index) => {
            const row = capturedFor(position);
            const isCurrent = position === current;
            const corner = [
              'left-3 top-3',
              'right-3 top-3',
              'bottom-3 left-3',
              'bottom-3 right-3',
            ][index];
            return (
              <button
                key={position}
                type="button"
                onClick={() => setActivePosition?.(position)}
                className={`absolute grid h-9 w-9 place-items-center rounded-full border text-[11px] font-semibold ${corner} ${
                  row
                    ? row.verdict === 'FAIL'
                      ? 'border-[#c47b73] bg-[#fbeae7] text-[#a6423b]'
                      : 'border-[#9bc8bb] bg-[#eaf4ef] text-[#2e7568]'
                    : isCurrent
                    ? 'border-[#c69852] bg-[#fbf4e4] text-[#92713a]'
                    : 'border-[#c9d9d1] bg-white text-[#66837d]'
                }`}
                data-testid={`button-eccentricity-position-${position}`}
              >
                {position}
              </button>
            );
          })}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="eyebrow">Position readings</div>
            <span className="rounded-full border border-[#d7e0db] bg-[#f6faf7] px-2.5 py-1 font-mono text-[11px] font-bold text-[#2e7568]">{capturedCount} / {POSITIONS.length} captured</span>
          </div>

          <div className="rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-4">
            <div className="grid gap-3 sm:grid-cols-[.5fr_.65fr_1fr_auto]">
              <div>
                <span className="eyebrow">Position</span>
                <div className="measure-input mt-2 grid place-items-center font-mono text-sm font-bold" data-testid="text-eccentricity-active-position">
                  {current}
                </div>
              </div>
              <label>
                <span className="eyebrow">Applied load</span>
                <input
                  type="number"
                  value={appliedLoad}
                  onChange={(e) => setAppliedLoad(e.target.value)}
                  className="measure-input mt-2 w-full"
                />
              </label>
              <label>
                <span className="eyebrow">Indication / {unit}</span>
                <input
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAdd(current)}
                  inputMode="decimal"
                  placeholder="0.000"
                  className="measure-input mt-2 w-full"
                  aria-label="Eccentricity reading"
                  data-testid="input-eccentricity-reading"
                />
              </label>
              <button
                onClick={() => onAdd(current)}
                disabled={!!capturedFor(current)}
                className="button-brass self-end rounded-md px-4 py-3 text-xs font-bold"
                data-testid="button-capture-eccentricity"
              >
                <Plus size={15} />
              </button>
            </div>
            {liveValidation && <LiveValidationRow evaluation={liveValidation} unit={unit} />}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {POSITIONS.map((position) => {
              const row = capturedFor(position);
              return (
                <div
                  key={position}
                  className={`rounded border p-2 text-center ${row ? 'border-[#9bc8bb] bg-[#eaf4ef]' : 'border-[#d7e0db]'}`}
                >
                  <div className="font-mono text-[9px] text-[#7b9690]">Position {position}</div>
                  <div className="mt-1 font-mono text-xs font-bold text-[#33545a]">{row ? row.indication : '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EccentricityModule;
