import React from 'react';
import { CheckCircle2, Shield, Thermometer, Layers } from 'lucide-react';

export function IdentificationModule({ session = {} }) {
  const isInitial = (session.evaluation_mode || session.evaluationMode) !== 'in_service';
  const startTemp = session.start_temp_c ?? session.envValues?.start_temp_c ?? '—';
  const humidity = session.humidity_pct ?? session.envValues?.humidity_pct ?? '—';
  const pressure = session.pressure_hpa ?? session.envValues?.pressure_hpa ?? '—';

  return (
    <div className="animate-rise space-y-6">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-lg bg-[#edf4ef] p-5">
          <div className="eyebrow">Instrument Identity</div>
          <div className="mt-3 text-lg font-semibold text-[#17333c]">
            {[session.manufacturer, session.model].filter(Boolean).join(' ') || session.asset || 'Instrument'}
          </div>
          <div className="mt-1 font-mono text-xs text-[#66837d]">
            Serial Number: <span className="font-bold text-[#33545a]">{session.serial || session.serial_number || '—'}</span>
          </div>
        </div>

        <div className="rounded-lg bg-[#fbf4e4] p-5">
          <div className="eyebrow !text-[#92713a]">Metrology Parameters</div>
          <div className="mt-3 text-lg font-semibold text-[#17333c]">
            Class {session.accuracyClass || session.accuracy_class || 'III'}
          </div>
          <div className="mt-1 text-xs text-[#92713a]">
            Max {session.capacity || session.max_capacity || '—'} {session.unit || session.base_unit || 'g'} · Min {session.minCapacity || session.min_capacity || '—'} {session.unit || session.base_unit || 'g'}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#92713a]">
            e = {session.verificationScaleInterval || session.verification_scale_interval || '—'} {session.unit || session.base_unit || 'g'}
            {session.displayInterval || session.display_interval ? ` · d = ${session.displayInterval || session.display_interval} ${session.unit || session.base_unit || 'g'}` : ''}
          </div>
        </div>

        <div className="rounded-lg bg-[#eaf1f4] p-5">
          <div className="eyebrow !text-[#3c6b7e]">Evaluation Regime</div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isInitial ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#fbeae7] text-[#a6423b]'}`}>
              <Shield size={12} />
              {isInitial ? 'Initial Verification' : 'In-Service Verification'}
            </span>
          </div>
          <div className="mt-2 text-xs text-[#527d8e]">
            {isInitial ? '1× Table 6 MPE limits (§3.5.1)' : '2× Table 6 MPE limits (§3.5.2)'}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#33545a]">
          <Thermometer size={15} className="text-[#2e7568]" />
          <span>Starting Environmental Baseline (Recorded at session opening)</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
          <div className="rounded bg-white p-3 border border-[#e5ece8]">
            <div className="text-[10px] uppercase text-[#7b9690]">Start Temperature</div>
            <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{startTemp}°C</div>
          </div>
          <div className="rounded bg-white p-3 border border-[#e5ece8]">
            <div className="text-[10px] uppercase text-[#7b9690]">Relative Humidity</div>
            <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{humidity}% RH</div>
          </div>
          <div className="rounded bg-white p-3 border border-[#e5ece8]">
            <div className="text-[10px] uppercase text-[#7b9690]">Atmospheric Pressure</div>
            <div className="mt-1 font-mono text-sm font-bold text-[#17333c]">{pressure} hPa</div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl">
        <h3 className="text-base font-semibold">OIML R-76 Pre-Test Verification</h3>
        <div className="mt-4 space-y-3 text-sm leading-6 text-[#58746f]">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-1 shrink-0 text-[#2e7568]" size={16} />
            <span>Confirm descriptive markings and serial number match the submitted instrument profile.</span>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="mt-1 shrink-0 text-[#2e7568]" size={16} />
            <span>Verify the instrument is level and has completed warm-up under laboratory conditions.</span>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="mt-1 shrink-0 text-[#2e7568]" size={16} />
            <span>Ensure all reference standards and weights are calibrated with valid certificates.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IdentificationModule;

