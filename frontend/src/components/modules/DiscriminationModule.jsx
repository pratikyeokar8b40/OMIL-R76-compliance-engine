import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { Plus } from 'lucide-react';
import LiveValidationRow from '@/components/LiveValidationRow';

export function DiscriminationModule({
  session = {},
  rows = [],
  onAdd,
  preview,
  unit = 'g',
  source = 'manual',
  setSource,
}) {
  // R 76-2 records discrimination at Min, ½ Max and Max; start at Min
  // (a fixed "500" was above Max for kg instruments).
  const [appliedLoad, setAppliedLoad] = useState(() => String(session.minCapacity || session.min_capacity || ''));
  const [indication1, setIndication1] = useState('');
  const d = session.displayInterval || session.display_interval || session.verificationScaleInterval || '1';
  // Break-out load of 1/10 d (a fixed "0.1" exceeded e on kg instruments).
  const [additionalLoad, setAdditionalLoad] = useState(() => {
    try {
      return new Decimal(d).div(10).toFixed();
    } catch {
      return '0';
    }
  });
  const [indication2, setIndication2] = useState('');
  const numeric = (v) => v !== '' && !Number.isNaN(Number(v));

  // Client preview (decimal-exact, same rules as the server); the server verdict is final.
  const provisional =
    preview && numeric(indication1) && numeric(indication2) && numeric(appliedLoad)
      ? preview({
          appliedLoad: String(appliedLoad),
          indication: String(indication1),
          additionalLoad: String(additionalLoad || '0'),
          secondIndication: String(indication2),
        })
      : null;

  const handleCapture = async () => {
    if (!numeric(indication1) || !numeric(indication2)) return;
    const saved = await onAdd({
      applied_load: String(appliedLoad || '0'),
      indication: String(indication1),
      additional_load: String(additionalLoad || '0'),
      second_indication: String(indication2),
      zero_error: '0',
    });
    // Keep the values when the server refused them, so they can be corrected.
    if (saved !== false) {
      setIndication1('');
      setIndication2('');
    }
  };

  return (
    <div className="animate-rise space-y-6">
      <div>
        <p className="max-w-2xl text-sm leading-6 text-[#58746f]">
          OIML R 76-1 §3.8.2.2 / §A.4.8.2: An extra load of 1.4d is placed gently on the loaded load receptor with an initial small load (1/10 d).
          The indication must increase unambiguously by at least one verification interval (I₂ - I₁ ≥ d).
        </p>
      </div>

      <div className="rounded-lg border border-[#c9d9d1] bg-[#fbfdfb] p-5 shadow-sm max-w-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#e5ece8]">
          <div className="eyebrow">Discrimination Capture Step</div>
          <span className="font-mono text-xs text-[#2e7568] font-bold">d = {d} {unit}</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="eyebrow">1. Applied Base Load (L)</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={appliedLoad}
                onChange={(e) => setAppliedLoad(e.target.value)}
                className="measure-input w-full font-mono text-sm"
                data-testid="input-discrimination-applied-load"
              />
              <span className="font-mono text-xs text-[#7b9690]">{unit}</span>
            </div>
          </label>

          <label>
            <span className="eyebrow">2. Break-out load (≈ 1/10 d)</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={additionalLoad}
                onChange={(e) => setAdditionalLoad(e.target.value)}
                className="measure-input w-full font-mono text-sm"
                data-testid="input-discrimination-additional-load"
              />
              <span className="font-mono text-xs text-[#7b9690]">{unit}</span>
            </div>
          </label>

          <label>
            <span className="eyebrow">3. Initial Indication (I₁)</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={indication1}
                onChange={(e) => setIndication1(e.target.value)}
                className="measure-input w-full font-mono text-sm"
                data-testid="input-discrimination-indication-1"
              />
              <span className="font-mono text-xs text-[#7b9690]">{unit}</span>
            </div>
          </label>

          <label>
            <span className="eyebrow">4. Indication after +1.4d (I₂)</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={indication2}
                onChange={(e) => setIndication2(e.target.value)}
                className="measure-input w-full font-mono text-sm"
                data-testid="input-discrimination-indication-2"
              />
              <span className="font-mono text-xs text-[#7b9690]">{unit}</span>
            </div>
          </label>
        </div>

        {provisional?.invalid && <LiveValidationRow evaluation={provisional} unit={unit} />}
        {provisional && !provisional.invalid && (
          <div
            className={`mt-4 flex items-center justify-between rounded-md p-3 text-xs font-mono font-bold ${
              provisional.verdict === 'PASS'
                ? 'bg-[#eaf4ef] text-[#2e7568] border border-[#9bc8bb]'
                : 'bg-[#fdeceb] text-[#b24b43] border border-[#e7b5ae]'
            }`}
          >
            <span>
              Delta: I₂ - I₁ = {provisional.correctedError} {unit} (Threshold: ≥ {provisional.mpeLimit} {unit})
            </span>
            <span>Preview: {provisional.verdict}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!indication1 || !indication2}
            className="button-brass inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold"
            data-testid="button-capture-discrimination"
          >
            <Plus size={14} /> Capture Discrimination Observation
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">Captured Discrimination Records ({rows.length})</div>
          <div className="divide-y divide-[#e5ece8] rounded-lg border border-[#d7e0db] bg-white overflow-hidden">
            {rows.map((r, index) => {
              const delta = r.second_indication !== null && r.second_indication !== undefined
                ? Number(r.second_indication) - Number(r.indication)
                : null;
              return (
                <div key={r.id || index} className="p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-[#17333c]">
                      Load: {r.applied_load} {unit} · I₁ = {r.indication} {unit} → I₂ = {r.second_indication} {unit}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#66837d]">
                      ΔI = {delta !== null ? delta.toFixed(3) : '—'} {unit} · Seq #{r.sequence_no ?? index}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                      r.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#fdeceb] text-[#b24b43]'
                    }`}
                  >
                    {r.verdict}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DiscriminationModule;
