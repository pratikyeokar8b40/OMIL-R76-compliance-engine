import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Save, Thermometer, Wind } from 'lucide-react';
import { EnvironmentCard } from '@/components/Card';

// Laboratory environment capture and drift monitoring (R 76-1 §3.9.2.3).
// Start conditions were recorded at session creation. Current / end conditions
// are patched via PATCH /sessions/{id} (end_temp_c, humidity_pct, pressure_hpa).
export function EnvironmentModule({
  values,
  setValues,
  onSave,
  saving,
  saveState,
  driftInfo,
  driftLoading,
  startValues = {},
}) {
  const [touched, setTouched] = useState(false);

  const startTemp = startValues.start_temp_c ?? values.start_temp_c ?? '—';
  const startHumidity = startValues.humidity_pct ?? '—';
  const startPressure = startValues.pressure_hpa ?? '—';

  return (
    <div className="animate-rise space-y-7">
      <p className="max-w-2xl text-sm leading-6 text-[#58746f]">
        Record the ending laboratory conditions for this campaign. The backend Metrology Watchdog compares the
        ambient temperature change against the allowable drift for this accuracy class (§3.9.2.3).
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Baseline (Start) Reference */}
        <div className="rounded-lg border border-[#c9d9d1] bg-[#f4f8f6] p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2e7568]">
            <Thermometer size={15} />
            <span>Campaign Start Conditions (Baseline)</span>
          </div>
          <p className="mt-1 text-[11px] text-[#66837d]">Captured when this evaluation campaign was created.</p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded bg-white p-3 border border-[#d7e0db]">
              <div className="text-[10px] uppercase text-[#7b9690]">Start Temp</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{startTemp !== '—' ? `${startTemp} °C` : '—'}</div>
            </div>
            <div className="rounded bg-white p-3 border border-[#d7e0db]">
              <div className="text-[10px] uppercase text-[#7b9690]">Start Humidity</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{startHumidity !== '—' ? `${startHumidity} %` : '—'}</div>
            </div>
            <div className="rounded bg-white p-3 border border-[#d7e0db]">
              <div className="text-[10px] uppercase text-[#7b9690]">Start Pressure</div>
              <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{startPressure !== '—' ? `${startPressure} hPa` : '—'}</div>
            </div>
          </div>
        </div>

        {/* Current / End Form */}
        <div className="rounded-lg border border-[#c9d9d1] bg-[#fbfdfb] p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#33545a]">
            <Activity size={15} className="text-[#c69852]" />
            <span>Current / End Environmental Readings</span>
          </div>
          <p className="mt-1 text-[11px] text-[#66837d]">Updated at test completion for final drift verification.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label>
              <span className="eyebrow">End Temp</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={values.end_temp_c || ''}
                  onChange={(e) => {
                    setTouched(true);
                    setValues({ ...values, end_temp_c: e.target.value });
                  }}
                  placeholder="21.8"
                  className="measure-input w-full font-mono text-sm"
                  data-testid="input-env-end-temp"
                />
                <span className="font-mono text-xs text-[#7b9690]">°C</span>
              </div>
            </label>

            <label>
              <span className="eyebrow">Humidity</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  step="1"
                  inputMode="decimal"
                  value={values.humidity_pct || ''}
                  onChange={(e) => {
                    setTouched(true);
                    setValues({ ...values, humidity_pct: e.target.value });
                  }}
                  placeholder="45"
                  className="measure-input w-full font-mono text-sm"
                  data-testid="input-env-humidity"
                />
                <span className="font-mono text-xs text-[#7b9690]">%</span>
              </div>
            </label>

            <label>
              <span className="eyebrow">Pressure</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  step="1"
                  inputMode="decimal"
                  value={values.pressure_hpa || ''}
                  onChange={(e) => {
                    setTouched(true);
                    setValues({ ...values, pressure_hpa: e.target.value });
                  }}
                  placeholder="1013"
                  className="measure-input w-full font-mono text-sm"
                  data-testid="input-env-pressure"
                />
                <span className="font-mono text-xs text-[#7b9690]">hPa</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="button-brass inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold"
          data-testid="button-save-environment"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Update Environment &amp; Check Drift
        </button>
        {saveState === 'saved' && (
          <span className="flex items-center gap-1.5 text-xs text-[#2e7568]">
            <CheckCircle2 size={14} /> Saved &amp; drift verified by backend
          </span>
        )}
        {saveState === 'queued' && (
          <span className="flex items-center gap-1.5 text-xs text-[#92713a]">
            <Activity size={14} /> Offline — queued, will sync automatically
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1.5 text-xs text-[#a6423b]">
            <AlertTriangle size={14} /> Could not save — check connection
          </span>
        )}
        {touched && !saveState && <span className="text-[10px] text-[#9ab0a9]">Unsaved changes</span>}
      </div>

      {/* Drift Watchdog Report */}
      <div
        className={`rounded-lg border p-5 ${
          driftInfo?.level === 'warn' || driftInfo?.level === 'red'
            ? 'border-[#e7b5ae] bg-[#fff5f3] text-[#a6423b]'
            : driftInfo
            ? 'border-[#9bc8bb] bg-[#eaf4ef] text-[#2e7568]'
            : 'border-[#c9d9d1] bg-[#f8fbf8] text-[#66837d]'
        }`}
      >
        <div className="flex items-start gap-3">
          <Thermometer className="mt-0.5 shrink-0" size={18} />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-sm">
              Backend Drift Watchdog (OIML R 76-1 §3.9.2.3)
            </div>
            {driftLoading ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 size={13} className="animate-spin" /> Computing temperature delta against regulatory limits…
              </div>
            ) : driftInfo ? (
              <div>
                <div className="font-medium">
                  {driftInfo.deltaC !== null ? `Temperature Delta: ΔT = ${driftInfo.deltaC} °C` : 'Delta evaluated'}
                  {driftInfo.allowedDrift !== null ? ` (Allowed drift limit: ${driftInfo.allowedDrift})` : ''}
                </div>
                <div className="mt-1">
                  {driftInfo.level === 'red' ? (
                    <span className="font-bold text-[#b24b43]">
                      TEST VOID (RED): Temperature is outside the instrument's static temperature range. Tests must be re-run.
                    </span>
                  ) : driftInfo.level === 'warn' ? (
                    <span className="font-bold text-[#b24b43]">
                      WARNING: Ambient drift exceeds recommended tolerance. Approving officer review required.
                    </span>
                  ) : (
                    <span className="text-[#2e7568]">
                      Within allowable limits: Zero drift rate satisfies regulatory bounds.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                Enter and save an ending temperature to compute the ambient drift against the initial baseline.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnvironmentModule;

