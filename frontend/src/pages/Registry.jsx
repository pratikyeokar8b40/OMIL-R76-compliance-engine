import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import Button from '@/components/Button';
import { calculateMinCapacity } from '@/lib/metrology';
import { api } from '@/api/client';
import { trimDecimal } from '@/lib/utils';

const getInitialForm = () => ({
  manufacturer: '',
  model: '',
  serial_number: '',
  base_unit: 'g',
  accuracy_class: 'III',
  verification_scale_interval: '1',
  display_interval: '1',
  min_capacity: calculateMinCapacity('III', '1', '1', 'g'),
  max_capacity: '',
});

const cleanNumber = (value) => String(value ?? '').replaceAll(',', '').trim();

export default function Registry() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(getInitialForm);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [justRegistered, setJustRegistered] = useState('');

  const load = () => {
    api
      .instruments(q)
      .then((res) => {
        setItems(res?.items || []);
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message || 'Could not load the instrument registry.'));
  };

  useEffect(load, [q]);

  const handleClassChange = (newClass) => {
    const nextMin = calculateMinCapacity(newClass, form.verification_scale_interval, form.display_interval, form.base_unit);
    setForm({ ...form, accuracy_class: newClass, min_capacity: nextMin });
  };

  const handleVerificationIntervalChange = (newE) => {
    const nextD = form.display_interval === form.verification_scale_interval ? newE : form.display_interval;
    const nextMin = calculateMinCapacity(form.accuracy_class, newE, nextD, form.base_unit);
    setForm({ ...form, verification_scale_interval: newE, display_interval: nextD, min_capacity: nextMin });
  };

  const handleDisplayIntervalChange = (newD) => {
    const nextMin = calculateMinCapacity(form.accuracy_class, form.verification_scale_interval, newD, form.base_unit);
    setForm({ ...form, display_interval: newD, min_capacity: nextMin });
  };

  const field = (key, label, opts = {}) => (
    <label key={key}>
      <span className="eyebrow">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        type={opts.type || 'text'}
        inputMode={opts.inputMode}
        className="mt-2 w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c69852]"
        data-testid={`input-instrument-${key.replaceAll('_', '-')}`}
      />
    </label>
  );

  const validate = () => {
    if (!form.manufacturer.trim()) return 'Manufacturer is required.';
    if (!form.model.trim()) return 'Model is required.';
    if (!form.serial_number.trim()) return 'Serial number is required.';

    const maxCap = Number(cleanNumber(form.max_capacity));
    if (!form.max_capacity || Number.isNaN(maxCap) || maxCap <= 0) {
      return 'Maximum capacity must be a positive number.';
    }

    const minCap = Number(cleanNumber(form.min_capacity));
    const floor = Number(calculateMinCapacity(form.accuracy_class, form.verification_scale_interval, form.display_interval, form.base_unit));
    if (!form.min_capacity || Number.isNaN(minCap) || minCap < floor) {
      return `Minimum capacity cannot be below the regulatory minimum of ${floor} ${form.base_unit}.`;
    }

    if (minCap > maxCap) {
      return 'Minimum capacity cannot exceed maximum capacity.';
    }

    const eVal = Number(cleanNumber(form.verification_scale_interval));
    if (!form.verification_scale_interval || Number.isNaN(eVal) || eVal <= 0) {
      return 'Verification interval (e) must be a positive number.';
    }

    const dVal = Number(cleanNumber(form.display_interval));
    if (!form.display_interval || Number.isNaN(dVal) || dVal <= 0) {
      return 'Scale interval (d) must be a positive number.';
    }

    if (dVal > eVal) {
      return `Scale display interval (d) ${dVal} cannot exceed verification interval (e) ${eVal}.`;
    }

    return '';
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setSubmitError(problem);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim(),
        min_capacity: cleanNumber(form.min_capacity),
        max_capacity: cleanNumber(form.max_capacity),
        base_unit: form.base_unit,
        accuracy_class: form.accuracy_class,
        verification_scale_interval: cleanNumber(form.verification_scale_interval),
        display_interval: cleanNumber(form.display_interval || form.verification_scale_interval),
      };
      const created = await api.createInstrument(payload);
      setJustRegistered(created?.serial_number || payload.serial_number);
      setForm(getInitialForm());
      setShow(false);
      load();
      window.setTimeout(() => setJustRegistered(''), 4000);
    } catch (err) {
      setSubmitError(err.message || 'Registration failed. Check the fields and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Instrument registry."
        detail="Validated instrument metadata is stored server-side before an evaluation can use it."
        action={
          <Button
            onClick={() => {
              setSubmitError('');
              setShow(!show);
            }}
            data-testid="button-toggle-registration-form"
          >
            <Plus size={16} /> Register instrument
          </Button>
        }
      />

      {justRegistered && (
        <div className="panel mb-6 flex items-center gap-2 border-[#9bc8bb] bg-[#eaf4ef] p-4 text-xs text-[#2e7568]">
          <CheckCircle2 size={15} />
          Instrument {justRegistered} registered and validated against Table 3.
        </div>
      )}

      {show && (
        <section className="panel mb-6 p-5 md:p-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {field('manufacturer', 'Manufacturer')}
            {field('model', 'Model')}
            {field('serial_number', 'Serial number')}
            <label>
              <span className="eyebrow">Class</span>
              <select
                value={form.accuracy_class}
                onChange={(e) => handleClassChange(e.target.value)}
                className="mt-2 w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm"
                data-testid="select-instrument-accuracy-class"
              >
                <option value="I">I (Special)</option>
                <option value="II">II (High)</option>
                <option value="III">III (Medium)</option>
                <option value="IIII">IIII (Ordinary)</option>
              </select>
            </label>
            <label>
              <span className="eyebrow">Verification interval (e)</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={form.verification_scale_interval}
                onChange={(e) => handleVerificationIntervalChange(e.target.value)}
                className="mt-2 w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c69852]"
                data-testid="input-instrument-verification-scale-interval"
              />
            </label>
            <label>
              <span className="eyebrow">Display interval (d)</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={form.display_interval}
                onChange={(e) => handleDisplayIntervalChange(e.target.value)}
                className="mt-2 w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c69852]"
                data-testid="input-instrument-display-interval"
              />
            </label>
            {field('min_capacity', 'Minimum capacity (Min)', { type: 'number', inputMode: 'decimal' })}
            {field('max_capacity', 'Maximum capacity (Max)', { type: 'number', inputMode: 'decimal' })}
            <label>
              <span className="eyebrow">Unit</span>
              <select
                value={form.base_unit}
                onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
                className="mt-2 w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm"
                data-testid="select-instrument-unit"
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </label>
          </div>

          {submitError && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-[#e7b5ae] bg-[#fff5f3] px-3 py-2.5 text-xs text-[#a6423b]">
              <AlertTriangle size={14} className="shrink-0" />
              {submitError}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setShow(false)} data-testid="button-cancel-registration">
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting} data-testid="button-submit-registration">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
              {submitting ? 'Validating…' : 'Validate & register'}
            </Button>
          </div>
        </section>
      )}

      <div className="mb-5 relative max-w-xs">
        <Search className="absolute left-3 top-3 text-[#7b9690]" size={15} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search instruments…"
          className="w-full rounded-md border border-[#c9d9d1] bg-white py-2.5 pl-9 pr-3 text-xs"
          data-testid="input-registry-search"
        />
      </div>

      {loadError && (
        <div className="panel mb-5 flex items-center gap-2 border-[#e7b5ae] bg-[#fff5f3] p-4 text-xs text-[#a6423b]">
          <AlertTriangle size={14} className="shrink-0" />
          {loadError}
        </div>
      )}

      <section className="panel overflow-hidden">
        <div className="mobile-scroll">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] text-[10px] uppercase tracking-[.12em] text-[#7b9690]">
                <th className="px-5 py-4">Instrument</th>
                <th className="px-5 py-4">Serial</th>
                <th className="px-5 py-4">Capacity</th>
                <th className="px-5 py-4">Class</th>
                <th className="px-5 py-4">n Max</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="table-row border-b border-[#e5ece8]">
                  <td className="px-5 py-4 font-semibold text-[#33545a]">{i.manufacturer} {i.model}</td>
                  <td className="px-5 py-4 font-mono">{i.serial_number}</td>
                  <td className="px-5 py-4">
                    {trimDecimal(i.min_capacity)}–{trimDecimal(i.max_capacity)} {i.base_unit}
                  </td>
                  <td className="px-5 py-4">Class {i.accuracy_class}</td>
                  <td className="px-5 py-4 font-mono">{trimDecimal(i.n_max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && !loadError && (
          <div className="p-10 text-center text-xs text-[#66837d]">No registered instruments.</div>
        )}
      </section>
    </div>
  );
}

