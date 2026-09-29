import React, { useState } from 'react';
import { Plus, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';

const PROCEDURES = {
  damp_heat: {
    title: 'Damp heat, steady state',
    contextLabel: 'Exposure / phase',
    contexts: ['Pre-exposure', 'After 48 h exposure'],
    appliedLabel: 'Applied test load',
    indicationLabel: 'Indication',
    hint: 'Record the instrument indication before and after the prescribed 40 °C / 85 % RH exposure.'
  },
  voltage_variations: {
    title: 'Voltage variations',
    contextLabel: 'Supply condition',
    contexts: ['Nominal Unom', 'Upper +10%', 'Lower -15%'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: 'Capture a measurement at each prescribed supply-voltage condition. Record the actual supply condition in the context.'
  },
  sensitivity: {
    title: 'Sensitivity',
    contextLabel: 'Measurement condition',
    contexts: ['Sensitivity check'],
    appliedLabel: 'Test load',
    indicationLabel: 'Indication / deflection',
    hint: 'Record the indication/deflection produced by the prescribed additional load.'
  },
  equilibrium: {
    title: 'Stability of equilibrium',
    contextLabel: 'Stability check',
    contexts: ['Stable equilibrium'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: 'Record the indication observed while the instrument is in the required stable-equilibrium condition.'
  },
  tilting: {
    title: 'Tilting',
    contextLabel: 'Tilt orientation',
    contexts: ['Longitudinal 5%', 'Transverse 5%'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: 'Record the result at each prescribed 5% tilt orientation.'
  },
  warm_up: {
    title: 'Warm-up time',
    contextLabel: 'Warm-up phase',
    contexts: ['Immediately after power-on', 'After manufacturer warm-up'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: 'Capture comparable observations immediately after power-on and after the specified warm-up period.'
  },
  span_stability: {
    title: 'Span stability',
    contextLabel: 'Periodic measurement',
    contexts: ['Measurement 1','Measurement 2','Measurement 3','Measurement 4','Measurement 5','Measurement 6','Measurement 7','Measurement 8'],
    appliedLabel: 'Reference load',
    indicationLabel: 'Indication',
    hint: 'Record the eight periodic span measurements required over the stability period.'
  },
  endurance: {
    title: 'Endurance',
    contextLabel: 'Endurance phase',
    contexts: ['Before endurance', 'After endurance', 'Post-cycle verification'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: 'Record the prescribed endurance-cycle verification observations before and after the endurance sequence.'
  },
  emc_disturbances: {
    title: 'EMC disturbances',
    contextLabel: 'Disturbance',
    contexts: ['Electrical bursts', 'Electrostatic discharge', 'RF field'],
    appliedLabel: 'Applied load / test condition',
    indicationLabel: 'Indication / observed result',
    hint: 'Record the observation associated with each prescribed disturbance. Detailed EMC equipment parameters belong in the laboratory record.'
  },
};

export default function R76ProcedureModule({ testType, module, session = {}, rows = [], onAdd, unit = 'g' }) {
  const config = PROCEDURES[testType] || {
    title: module?.label || testType,
    contextLabel: 'Condition',
    contexts: ['Test condition'],
    appliedLabel: 'Applied load',
    indicationLabel: 'Indication',
    hint: module?.hint || 'Record the prescribed observation.'
  };
  const [context, setContext] = useState(config.contexts[0]);
  const [applied, setApplied] = useState('');
  const [indication, setIndication] = useState('');
  const [additional, setAdditional] = useState('0');

  const contextPositions = config.contexts.map((_, index) => String(index + 1));
  const position = String(Math.min(rows.length + 1, contextPositions.length));
  const capturedForContext = rows.length;
  const requiredCount = contextPositions.length;
  const progress = Math.min((capturedForContext / requiredCount) * 100, 100);


  const capture = () => {
    if (!indication.trim() || Number.isNaN(Number(indication))) return;
    onAdd({
      position,
      applied_load: applied || '0',
      indication,
      additional_load: additional || '0',
      zero_error: '0',
    });
    setIndication('');
  };

  return (
    <div className="animate-rise space-y-6">
      <div className="rounded-xl border border-[#c9d9d1] bg-gradient-to-r from-[#edf4ef] to-[#f7faf8] p-4 shadow-[0_1px_0_rgba(23,51,60,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66837d]">Requirement progress</div>
            <div className="mt-1 text-lg font-semibold text-[#17333c]">{capturedForContext} / {requiredCount} required</div>
          </div>
          <div className="rounded-full border border-[#9bc8bb] bg-white px-2.5 py-1 font-mono text-sm font-bold text-[#2e7568]">
            {capturedForContext} of {requiredCount}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#d7e0db]">
          <div className="h-full rounded-full bg-[#2e7568] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rounded-lg border border-[#c9d9d1] bg-[#fbfdfb] p-5">
        <div className="eyebrow">OIML R-76 procedure</div>
        <h3 className="mt-2 text-lg font-semibold text-[#17333c]">{config.title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#58746f]">{config.hint}</p>
        <div className="mt-3 text-[11px] text-[#7b9690]">{module?.clause}</div>
      </div>

      <div className="rounded-lg border border-[#c9d9d1] bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="md:col-span-2 lg:col-span-2">
            <span className="eyebrow">{config.contextLabel}</span>
            <div className="relative mt-2">
              <select
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full appearance-none rounded-md border border-[#c9d9d1] bg-white px-4 py-3 pr-12 font-sans text-base font-semibold leading-6 tracking-normal text-[#17333c] outline-none transition-colors focus:border-[#c69852]"
              >
                {config.contexts.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#66837d]"
              />
            </div>
          </label>
          <label>
            <span className="eyebrow">{config.appliedLabel} / {unit}</span>
            <input value={applied} onChange={(e) => setApplied(e.target.value)} type="number" step="any" className="measure-input mt-2 w-full font-mono text-sm" />
          </label>
          <label>
            <span className="eyebrow">{config.indicationLabel} / {unit}</span>
            <input value={indication} onChange={(e) => setIndication(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && capture()} type="number" step="any" className="measure-input mt-2 w-full font-mono text-sm" />
          </label>
          <label>
            <span className="eyebrow">Additional load ΔL / {unit}</span>
            <input value={additional} onChange={(e) => setAdditional(e.target.value)} type="number" step="any" className="measure-input mt-2 w-full font-mono text-sm" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-[#7b9690]">
          <span>e = {session.verificationScaleInterval || session.verification_scale_interval || '—'} {unit}</span>
          <span>Position {position} · {capturedForContext} captured for this test</span>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={capture} disabled={!indication.trim()} className="button-brass inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold">
            <Plus size={14} /> Capture observation
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div>
          <div className="eyebrow mb-3">Captured observations</div>
          <div className="divide-y divide-[#e5ece8] rounded-lg border border-[#d7e0db] bg-white overflow-hidden">
            {rows.map((row, index) => (
              <div key={row.id || `${row.test_type}-${row.sequence_no}-${index}`} className="flex flex-col gap-2 p-4 text-xs md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-[#17333c]">{row.position ? `${config.contexts[Number(row.position) - 1] || `Position ${row.position}`} · Position ${row.position}` : 'Test condition'} · Load {row.applied_load} {unit} · Indication {row.indication} {unit}</div>
                  <div className="mt-1 font-mono text-[10px] text-[#66837d]">Sequence #{row.sequence_no ?? index} · Error {row.corrected_error ?? '—'} · MPE {row.mpe_limit ?? '—'}</div>
                </div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${row.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : row.verdict === 'FAIL' ? 'bg-[#fdeceb] text-[#b24b43]' : 'bg-[#f4f7f3] text-[#66837d]'}`}>
                  {row.verdict === 'PASS' ? <CheckCircle2 size={12} /> : row.verdict === 'FAIL' ? <AlertCircle size={12} /> : null}{row.verdict || 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
