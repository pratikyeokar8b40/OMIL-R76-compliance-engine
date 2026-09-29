import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Search, Thermometer, ShieldCheck, AlertTriangle } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import Button from '@/components/Button';
import { saveWorkingSession, queueOutbox } from '@/lib/offlineStore';
import { TEST_MODULES } from '@/lib/requirements';
import { calculateMinCapacity, convertValue } from '@/lib/metrology';
import { api } from '@/api/client';

const cleanNumber = (value) => String(value ?? '').replaceAll(',', '').trim();

export function NewEvaluation() {
  const [, setLocation] = useLocation();

  // Instrument specifications
  const [manufacturer, setManufacturer] = useState('Mettler Toledo');
  const [model, setModel] = useState('MS6002S');
  const [serial, setSerial] = useState('B723814');
  const [unit, setUnit] = useState('g');
  const [accuracyClass, setAccuracyClass] = useState('III');
  const [verificationScaleInterval, setVerificationScaleInterval] = useState('1');
  const [displayInterval, setDisplayInterval] = useState('1');
  const [minCapacity, setMinCapacity] = useState(() => calculateMinCapacity('III', '1', '1', 'g'));
  const [capacity, setCapacity] = useState('6200');
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [instrumentMatches, setInstrumentMatches] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [registerNew, setRegisterNew] = useState(false);

  // Evaluation configuration
  const [evaluationMode, setEvaluationMode] = useState('initial_verification');

  // Initial environmental conditions
  const [startTemp, setStartTemp] = useState('21.5');
  const [humidity, setHumidity] = useState('45');
  const [pressure, setPressure] = useState('1013');

  const [operatorNote, setOperatorNote] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamically update default min_capacity when accuracyClass, e, or d changes if user hasn't explicitly entered a custom value
  const calculatedFloor = calculateMinCapacity(accuracyClass, verificationScaleInterval, displayInterval, unit);

  const searchRegistry = async () => {
    try {
      const result = await api.instruments(instrumentQuery.trim());
      setInstrumentMatches(result.items || []);
      setValidationError('');
    } catch (err) {
      setValidationError(err.message || 'Unable to search the instrument registry.');
    }
  };

  const selectInstrument = (instrument) => {
    setSelectedInstrument(instrument);
    setRegisterNew(false);
    setManufacturer(instrument.manufacturer);
    setModel(instrument.model);
    setSerial(instrument.serial_number);
    setAccuracyClass(instrument.accuracy_class);
    setUnit(instrument.base_unit);
    setCapacity(String(instrument.max_capacity));
    setMinCapacity(String(instrument.min_capacity));
    setVerificationScaleInterval(String(instrument.verification_scale_interval));
    setDisplayInterval(String(instrument.display_interval || instrument.verification_scale_interval));
  };

  const handleUnitChange = (nextUnit) => {
    if (nextUnit === unit) return;
    setCapacity(convertValue(capacity, unit, nextUnit));
    setMinCapacity(convertValue(minCapacity, unit, nextUnit));
    setVerificationScaleInterval(convertValue(verificationScaleInterval, unit, nextUnit));
    setDisplayInterval(convertValue(displayInterval, unit, nextUnit));
    setUnit(nextUnit);
  };

  const handleClassChange = (newClass) => {
    setAccuracyClass(newClass);
    setMinCapacity(calculateMinCapacity(newClass, verificationScaleInterval, displayInterval, unit));
  };

  const handleIntervalChange = (newE) => {
    setVerificationScaleInterval(newE);
    if (!displayInterval || displayInterval === verificationScaleInterval) {
      setDisplayInterval(newE);
    }
    setMinCapacity(calculateMinCapacity(accuracyClass, newE, displayInterval || newE, unit));
  };

  const handleDisplayIntervalChange = (newD) => {
    setDisplayInterval(newD);
    setMinCapacity(calculateMinCapacity(accuracyClass, verificationScaleInterval, newD, unit));
  };

  const validate = () => {
    if (!manufacturer.trim()) return 'Manufacturer is required.';
    if (!model.trim()) return 'Model is required.';
    if (!serial.trim()) return 'Serial number is required.';

    const maxCapNum = Number(cleanNumber(capacity));
    if (!capacity || Number.isNaN(maxCapNum) || maxCapNum <= 0) {
      return 'Maximum capacity must be a positive number.';
    }

    const minCapNum = Number(cleanNumber(minCapacity));
    if (!minCapacity || Number.isNaN(minCapNum) || minCapNum <= 0) {
      return `Minimum capacity must be greater than 0 (Regulatory minimum for Class ${accuracyClass} is ${calculatedFloor} ${unit}).`;
    }

    if (minCapNum < Number(calculatedFloor)) {
      return `Minimum capacity cannot be below the regulatory minimum of ${calculatedFloor} ${unit}.`;
    }
    if (minCapNum > maxCapNum) {
      return 'Minimum capacity cannot exceed maximum capacity.';
    }

    const eNum = Number(cleanNumber(verificationScaleInterval));
    if (!verificationScaleInterval || Number.isNaN(eNum) || eNum <= 0) {
      return 'Verification interval (e) must be a positive number.';
    }

    const dNum = Number(cleanNumber(displayInterval));
    if (!displayInterval || Number.isNaN(dNum) || dNum <= 0) {
      return 'Scale display interval (d) must be a positive number.';
    }

    if (dNum > eNum) {
      return `Scale display interval d (${dNum}) must not exceed verification scale interval e (${eNum}).`;
    }

    if (startTemp && Number.isNaN(Number(cleanNumber(startTemp)))) {
      return 'Starting temperature must be a valid number.';
    }
    if (humidity && Number.isNaN(Number(cleanNumber(humidity)))) {
      return 'Relative humidity must be a valid number.';
    }
    if (pressure && Number.isNaN(Number(cleanNumber(pressure)))) {
      return 'Air pressure must be a valid number.';
    }

    return '';
  };

  const start = async () => {
    const errorMsg = validate();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }

    setSubmitting(true);
    setValidationError('');

    const instrumentPayload = {
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      serial_number: serial.trim(),
      min_capacity: cleanNumber(minCapacity),
      max_capacity: cleanNumber(capacity),
      base_unit: unit,
      accuracy_class: accuracyClass,
      verification_scale_interval: cleanNumber(verificationScaleInterval),
      display_interval: cleanNumber(displayInterval || verificationScaleInterval),
    };

    const sessionCreatePayload = {
      evaluation_mode: evaluationMode,
      start_temp_c: startTemp ? cleanNumber(startTemp) : null,
      humidity_pct: humidity ? cleanNumber(humidity) : null,
      pressure_hpa: pressure ? cleanNumber(pressure) : null,
    };

    const localSessionFields = {
      asset: `${manufacturer.trim()} ${model.trim()}`.trim(),
      model: model.trim(),
      manufacturer: manufacturer.trim(),
      serial: serial.trim(),
      capacity: cleanNumber(capacity),
      unit,
      accuracyClass,
      verificationScaleInterval: cleanNumber(verificationScaleInterval),
      displayInterval: cleanNumber(displayInterval || verificationScaleInterval),
      minCapacity: cleanNumber(minCapacity),
      evaluation_mode: evaluationMode,
      start_temp_c: sessionCreatePayload.start_temp_c,
      humidity_pct: sessionCreatePayload.humidity_pct,
      pressure_hpa: sessionCreatePayload.pressure_hpa,
      envValues: {
        start_temp_c: sessionCreatePayload.start_temp_c || '',
        end_temp_c: '',
        humidity_pct: sessionCreatePayload.humidity_pct || '',
        pressure_hpa: sessionCreatePayload.pressure_hpa || '',
      },
      operatorNote,
      startedAt: new Date().toISOString(),
      observations: [],
    };

    try {
      // Find or register instrument
      const instrument = selectedInstrument || (registerNew ? await api.createInstrument(instrumentPayload) : null);
      if (!instrument) {
        setValidationError('Select a registered instrument or choose Register New Instrument before continuing.');
        return;
      }

      // Create session on server
      const serverSession = await api.createSession({
        instrument_id: instrument.id,
        ...sessionCreatePayload,
      });

      const nextSession = {
        ...serverSession,
        ...localSessionFields,
        id: serverSession.id,
        instrumentId: instrument.id,
        synced: true,
      };

      localStorage.setItem('nawi-session', JSON.stringify(nextSession));
      await saveWorkingSession(nextSession);
      setLocation('/sessions/active');
    } catch (err) {
      if (err.status === 422 || err.status === 400 || err.status === 409) {
        setValidationError(err.message || 'Validation error from server. Please review the values.');
        setSubmitting(false);
        return;
      }

      // Offline fallback: queue for sync
      const localId = `local-${Date.now()}`;
      const nextSession = { ...localSessionFields, id: localId, pendingCreate: true };
      localStorage.setItem('nawi-session', JSON.stringify(nextSession));
      await saveWorkingSession(nextSession);
      if (selectedInstrument?.id) {
        await queueOutbox({
          kind: 'session-create',
          sessionId: localId,
          payload: { instrument_id: selectedInstrument.id, ...sessionCreatePayload },
        });
      } else {
        const instrumentQueue = await queueOutbox({
          kind: 'instrument-create',
          sessionId: localId,
          payload: instrumentPayload,
        });
        await queueOutbox({
          kind: 'session-create',
          sessionId: localId,
          payload: { __instrumentQueueId: instrumentQueue.id, ...sessionCreatePayload },
        });
      }
      setLocation('/sessions/active');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionHeader
        eyebrow="New record / 01"
        title="Set up an evaluation."
        detail="Define the instrument specifications, regulatory regime, and initial ambient conditions before placing test loads."
        action={
          <Link href="/dashboard" className="button-quiet inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold" data-testid="link-cancel-evaluation">
            <ArrowLeft size={15} /> Back to overview
          </Link>
        }
      />

      {validationError && (
        <div className="panel mb-6 flex items-center gap-3 border-[#e7b5ae] bg-[#fff5f3] p-4 text-xs text-[#a6423b]">
          <AlertTriangle size={16} className="shrink-0 text-[#b24b43]" />
          <div>{validationError}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="panel p-5 md:p-7">
          <div className="eyebrow">Instrument profile</div>
          <h2 className="mt-2 text-lg font-semibold">What are you testing?</h2>

          <div className="mt-5 rounded-lg border border-[#d7e0db] bg-[#fbfdfb] p-4">
            <div className="eyebrow">Registry-first identification</div>
            <div className="mt-3 flex gap-2">
              <input value={instrumentQuery} onChange={(e) => setInstrumentQuery(e.target.value)} placeholder="Search serial number or instrument ID" className="min-w-0 flex-1 rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm" data-testid="input-search-instrument" />
              <Button size="sm" variant="quiet" onClick={() => void searchRegistry()}><Search size={14} /> Search</Button>
            </div>
            {instrumentMatches.length > 0 && <div className="mt-3 space-y-2">{instrumentMatches.map((item) => <button key={item.id} type="button" onClick={() => selectInstrument(item)} className="w-full rounded-md border border-[#c9d9d1] bg-white p-3 text-left text-xs hover:border-[#2e7568]"><strong>{item.manufacturer} {item.model}</strong><span className="mt-1 block font-mono text-[#66837d]">SN {item.serial_number} · Class {item.accuracy_class} · Max {item.max_capacity} {item.base_unit} · Min {item.min_capacity} {item.base_unit}</span></button>)}</div>}
            {!selectedInstrument && instrumentQuery && !instrumentMatches.length && <div className="mt-3 text-xs text-[#66837d]">No registered instrument found. <button type="button" className="font-semibold text-[#2e7568] underline" onClick={() => setRegisterNew(true)}>Register new instrument</button></div>}
            {selectedInstrument && <div className="mt-3 flex items-center justify-between text-xs text-[#2e7568]"><span>Instrument selected: {selectedInstrument.serial_number}</span><button type="button" className="underline" onClick={() => setSelectedInstrument(null)}>Change</button></div>}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Manufacturer</span>
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} disabled={!!selectedInstrument} className="w-full rounded-md border border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 text-sm text-[#17333c] outline-none transition focus:border-[#c69852] disabled:bg-[#edf4ef]" data-testid="input-manufacturer" />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Model</span>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-[#7b9690]" size={16} />
                <input value={model} onChange={(e) => setModel(e.target.value)} disabled={!!selectedInstrument} className="w-full rounded-md border border-[#c9d9d1] bg-[#fbfdfb] py-3 pl-10 pr-3 text-sm text-[#17333c] outline-none transition focus:border-[#c69852] disabled:bg-[#edf4ef]" data-testid="input-model" />
              </div>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Serial number</span>
              <input value={serial} onChange={(e) => setSerial(e.target.value)} disabled={!!selectedInstrument} className="w-full rounded-md border border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 font-mono text-sm outline-none transition focus:border-[#c69852] disabled:bg-[#edf4ef]" data-testid="input-serial" />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">
                Accuracy class
              </span>
              <select
                value={accuracyClass}
                onChange={(e) => handleClassChange(e.target.value)} disabled={!!selectedInstrument}
                className="w-full rounded-md border border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 text-sm font-semibold text-[#33545a] outline-none focus:border-[#c69852]"
                data-testid="select-accuracy-class"
              >
                <option value="I">Class I (Special)</option>
                <option value="II">Class II (High)</option>
                <option value="III">Class III (Medium)</option>
                <option value="IIII">Class IIII (Ordinary)</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Verification interval (e)</span>
              <div className="flex">
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={verificationScaleInterval}
                  onChange={(e) => handleIntervalChange(e.target.value)} disabled={!!selectedInstrument}
                  className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 font-mono text-sm outline-none focus:border-[#c69852]"
                  data-testid="input-verification-interval"
                />
                <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">{unit}</span>
              </div>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Scale/display interval (d)</span>
              <div className="flex">
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={displayInterval}
                  onChange={(e) => handleDisplayIntervalChange(e.target.value)} disabled={!!selectedInstrument}
                  className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 font-mono text-sm outline-none focus:border-[#c69852]"
                  data-testid="input-display-interval"
                />
                <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">{unit}</span>
              </div>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">
                Minimum capacity (Min)
                <span className="ml-1 text-[10px] font-normal text-[#66837d]">
                  (Table 3 floor: {calculatedFloor} {unit})
                </span>
              </span>
              <div className="flex">
                <input
                  type="number"
                  step="any"
                  value={minCapacity}
                  readOnly
                  className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#edf4ef] px-3 py-3 font-mono text-sm outline-none"
                  data-testid="input-min-capacity"
                />
                <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">{unit}</span>
              </div>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Maximum capacity (Max)</span>
              <div className="flex">
                <input
                  type="number"
                  step="any"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)} disabled={!!selectedInstrument}
                  className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 font-mono text-sm outline-none focus:border-[#c69852]"
                  data-testid="input-capacity"
                />
                <select
                  value={unit}
                  onChange={(e) => handleUnitChange(e.target.value)} disabled={!!selectedInstrument}
                  className="rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 text-sm font-semibold text-[#33545a] outline-none"
                  data-testid="select-unit"
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </label>
          </div>

          <div className="mt-8 border-t border-[#d7e0db] pt-6">
            <div className="eyebrow">Evaluation Regime / MPE Scope</div>
            <h3 className="mt-2 text-sm font-semibold text-[#17333c]">Evaluation Mode (OIML R 76-1 §3.5)</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${
                  evaluationMode === 'initial_verification'
                    ? 'border-[#2e7568] bg-[#eaf4ef]'
                    : 'border-[#c9d9d1] bg-white hover:bg-[#fbfdfb]'
                }`}
              >
                <input
                  type="radio"
                  name="evaluation_mode"
                  value="initial_verification"
                  checked={evaluationMode === 'initial_verification'}
                  onChange={() => setEvaluationMode('initial_verification')}
                  className="mt-1"
                  data-testid="radio-mode-initial"
                />
                <div>
                  <div className="text-xs font-bold text-[#17333c]">Initial Verification</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[#66837d]">
                    1× Table 6 MPE limits. For pattern approval and new instrument type examination.
                  </div>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${
                  evaluationMode === 'in_service'
                    ? 'border-[#2e7568] bg-[#eaf4ef]'
                    : 'border-[#c9d9d1] bg-white hover:bg-[#fbfdfb]'
                }`}
              >
                <input
                  type="radio"
                  name="evaluation_mode"
                  value="in_service"
                  checked={evaluationMode === 'in_service'}
                  onChange={() => setEvaluationMode('in_service')}
                  className="mt-1"
                  data-testid="radio-mode-inservice"
                />
                <div>
                  <div className="text-xs font-bold text-[#17333c]">In-Service Verification</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[#66837d]">
                    2× Table 6 MPE limits (§3.5.2). For subsequent re-verification in the field.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-8 border-t border-[#d7e0db] pt-6">
            <div className="eyebrow">Initial Lab Conditions</div>
            <h3 className="mt-2 text-sm font-semibold text-[#17333c]">Start Environment</h3>
            <p className="mt-1 text-xs text-[#66837d]">Captured at campaign opening and persisted with the session.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[#33545a]">Starting temperature</span>
                <div className="flex">
                  <input
                    type="number"
                    step="0.1"
                    value={startTemp}
                    onChange={(e) => setStartTemp(e.target.value)}
                    className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-2.5 font-mono text-sm outline-none focus:border-[#c69852]"
                    data-testid="input-start-temp"
                  />
                  <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">°C</span>
                </div>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[#33545a]">Relative humidity</span>
                <div className="flex">
                  <input
                    type="number"
                    step="1"
                    value={humidity}
                    onChange={(e) => setHumidity(e.target.value)}
                    className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-2.5 font-mono text-sm outline-none focus:border-[#c69852]"
                    data-testid="input-start-humidity"
                  />
                  <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">% RH</span>
                </div>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-semibold text-[#33545a]">Air pressure</span>
                <div className="flex">
                  <input
                    type="number"
                    step="1"
                    value={pressure}
                    onChange={(e) => setPressure(e.target.value)}
                    className="min-w-0 flex-1 rounded-l-md border border-r-0 border-[#c9d9d1] bg-[#fbfdfb] px-3 py-2.5 font-mono text-sm outline-none focus:border-[#c69852]"
                    data-testid="input-start-pressure"
                  />
                  <span className="grid place-items-center rounded-r-md border border-[#c9d9d1] bg-[#edf4ef] px-3 font-mono text-xs text-[#66837d]">hPa</span>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-8 border-t border-[#d7e0db] pt-6">
            <label>
              <span className="mb-2 block text-xs font-semibold text-[#33545a]">Operator note <span className="font-normal text-[#7b9690]">(optional)</span></span>
              <textarea value={operatorNote} onChange={(e) => setOperatorNote(e.target.value)} rows={2} placeholder="Record bench setup or instrument condition notes." className="w-full resize-none rounded-md border border-[#c9d9d1] bg-[#fbfdfb] px-3 py-2.5 text-sm outline-none placeholder:text-[#9ab0a9] focus:border-[#c69852]" data-testid="input-operator-note" />
            </label>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#d7e0db] pt-5 sm:flex-row sm:justify-end">
            <Link href="/dashboard" className="button-quiet rounded-md px-4 py-3 text-center text-sm font-semibold" data-testid="link-cancel-form">Cancel</Link>
            <Button onClick={() => void start()} disabled={submitting || !model || !serial} data-testid="button-create-session">
              {submitting ? 'Creating session…' : 'Create working session'} <ArrowRight className="ml-2 inline" size={15} />
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel-dark grid-paper p-6">
            <div className="flex items-center gap-2 text-[#c8a96b]">
              <LockKeyhole size={15} />
              <span className="eyebrow !text-[#c8a96b]">OIML R-76 Campaign</span>
            </div>
            <h2 className="mt-5 max-w-sm text-xl font-semibold leading-tight text-[#f4f7f3]">R-76 evaluation</h2>
            <p className="mt-3 text-sm leading-6 text-[#a5c0b8]">
              17 test types · Validation · Report
            </p>
            <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-xs text-[#c8dbd2]">
              <div className="flex items-center gap-3"><Check size={14} className="text-[#c8a96b]" /> Full 17 test modules & R-76 Sheet 17 checklist</div>
              <div className="flex items-center gap-3"><Check size={14} className="text-[#c8a96b]" /> Completeness-gated official finalization</div>
              <div className="flex items-center gap-3"><Check size={14} className="text-[#c8a96b]" /> Deterministic sequence numbering & offline sync</div>
            </div>
          </section>

          <section className="panel p-5">
            <div className="eyebrow">R-76 Test Suite / {TEST_MODULES.length} Tests</div>
            <div className="mt-4 max-h-[380px] overflow-y-auto space-y-3 pr-1 text-xs">
              {TEST_MODULES.map((m, index) => (
                <div key={m.testType} className="flex items-center justify-between border-b border-[#f0f4f2] pb-2 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[10px] text-[#7b9690]">{String(index + 1).padStart(2, '0')}</span>
                    <span className="font-medium text-[#33545a]">{m.label}</span>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${m.core ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#eef2f0] text-[#6d8984]'}`}>
                    {m.core ? 'REQUIRED' : 'OPTIONAL'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default NewEvaluation;

