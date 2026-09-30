import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import LiveValidationRow from '@/components/LiveValidationRow';

export function TemperatureNoLoadModule({
  session = {},
  rows = [],
  onAdd,
  preview,
  unit = 'g',
}) {
  const [temperature, setTemperature] = useState('20.0');
  const [zeroReading, setZeroReading] = useState('0');
  const [additionalLoad, setAdditionalLoad] = useState('0');

  const e = session.verificationScaleInterval || session.verification_scale_interval || '1';
  const numeric = (v) => String(v).trim() !== '' && !Number.isNaN(Number(v));
  const liveValidation =
    preview && numeric(zeroReading)
      ? preview({ appliedLoad: '0', indication: String(zeroReading), additionalLoad: String(additionalLoad || '0') })
      : null;

  const handleCapture = async () => {
    if (!numeric(zeroReading) || !numeric(temperature)) return;
    const saved = await onAdd({
      applied_load: '0',
      indication: String(zeroReading),
      additional_load: String(additionalLoad || '0'),
      zero_error: '0',
      chamber_temperature_c: String(temperature),
    });
    // Keep the values when the server refused them, so they can be corrected.
    if (saved !== false) setZeroReading('0');
  };

  return (
    <div className="animate-rise space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-[#58746f]">
        OIML R 76-1 §3.9.2.3: Zero-point determination at no-load condition under chamber temperatures.
        Applied load is fixed at 0. Zero drift must not exceed 1e ({e} {unit}).
      </p>

      <div className="rounded-lg border border-[#c9d9d1] bg-[#fbfdfb] p-5 shadow-sm max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="eyebrow">Chamber Temp (°C)</span>
            <input
              type="number"
              step="0.5"
              value={temperature}
              onChange={(ev) => setTemperature(ev.target.value)}
              className="measure-input mt-2 w-full font-mono text-sm"
              data-testid="input-temp-chamber"
            />
          </label>

          <label>
            <span className="eyebrow">No-Load Indication (I₀)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={zeroReading}
              onChange={(ev) => setZeroReading(ev.target.value)}
              className="measure-input mt-2 w-full font-mono text-sm"
              data-testid="input-temp-zero-reading"
            />
          </label>

          <label>
            <span className="eyebrow">Add. load ΔL / {unit}</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={additionalLoad}
              onChange={(ev) => setAdditionalLoad(ev.target.value)}
              className="measure-input mt-2 w-full font-mono text-sm"
              data-testid="input-temp-add-load"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-[#7b9690]">
          <span>Applied load is locked to 0 (No-load test)</span>
          <span className="font-mono">Allowed zero drift: 1e = {e} {unit}</span>
        </div>

        {liveValidation && <LiveValidationRow evaluation={liveValidation} unit={unit} />}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!numeric(temperature) || !numeric(zeroReading)}
            className="button-brass inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold"
            data-testid="button-capture-temp-zero"
          >
            <Plus size={14} /> Capture No-Load Zero Point
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">Captured No-Load Determinations ({rows.length})</div>
          <div className="divide-y divide-[#e5ece8] rounded-lg border border-[#d7e0db] bg-white overflow-hidden">
            {rows.map((r, index) => (
              <div key={r.id || index} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-[#17333c]">
                    Observation #{r.sequence_no ?? index + 1}
                    {r.chamber_temperature_c != null ? ` at ${r.chamber_temperature_c} °C` : ''}: Indication = {r.indication} {unit}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#66837d]">
                    Corrected Error = {r.corrected_error ?? '—'} {unit} · Limit = ±{r.mpe_limit ?? '—'} {unit}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                    r.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#fdeceb] text-[#b24b43]'
                  }`}
                >
                  {r.verdict || 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TemperatureNoLoadModule;
