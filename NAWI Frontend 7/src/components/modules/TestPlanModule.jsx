import React, { useState } from 'react';
import { Check, CheckCircle2, Clock, HelpCircle, Loader2, ShieldCheck, XCircle, AlertCircle } from 'lucide-react';
import { TEST_MODULES, moduleStatus } from '@/lib/requirements';
import Button from '@/components/Button';

export function TestPlanModule({
  testPlanItems = [],
  observations = [],
  onUpdateStatus,
  updating = false,
  completionInfo = null,
  canEdit = true,
}) {
  const [selectedType, setSelectedType] = useState(null);
  const [statusVal, setStatusVal] = useState('required');
  const [rationale, setRationale] = useState('');
  const [validationError, setValidationError] = useState('');

  const planMap = new Map((testPlanItems || []).map((p) => [p.test_type, p]));
  const obsTypes = new Set((observations || []).map((o) => o.test_type));

  const handleEdit = (module) => {
    const existing = planMap.get(module.testType);
    setSelectedType(module.testType);
    setStatusVal(existing?.status || 'required');
    setRationale(existing?.rationale || '');
    setValidationError('');
  };

  const handleSave = async () => {
    if (!selectedType) return;
    const selectedModule = TEST_MODULES.find((m) => m.testType === selectedType);
    if (statusVal === 'not_applicable' && !rationale.trim()) {
      setValidationError('A rationale is required when a test is marked not applicable.');
      return;
    }
    if (selectedModule?.core && statusVal !== 'required' && !rationale.trim()) {
      setValidationError('This is a core R-76 test; give a rationale to make it optional or not applicable.');
      return;
    }
    await onUpdateStatus(selectedType, statusVal, rationale.trim() || null);
    setSelectedType(null);
  };

  const requiredCount = testPlanItems.filter((p) => p.status === 'required').length;
  const completedRequiredCount = testPlanItems.filter((p) => {
    const module = TEST_MODULES.find((m) => m.testType === p.test_type);
    return p.status === 'required' && module && moduleStatus(module, observations, p).complete;
  }).length;

  return (
    <div className="animate-rise space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#17333c]">R-76 Evaluation Plan &amp; Scope</h3>
          <p className="mt-1 text-xs text-[#58746f]">
            Finalization uses the selected test plan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#edf4ef] px-3.5 py-2 text-xs font-bold text-[#2e7568]">
            Required: {completedRequiredCount} / {requiredCount} Complete
          </div>
          {completionInfo?.ready && (
            <span className="flex items-center gap-1 rounded-full bg-[#dceee8] px-3 py-1 text-xs font-bold text-[#2e7568]">
              <CheckCircle2 size={14} /> Plan Ready
            </span>
          )}
        </div>
      </div>

      {selectedType && (
        <div className="rounded-lg border border-[#c69852] bg-[#fbf8f0] p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-[#17333c]">
              Configure Test Applicability: <span className="font-mono text-[#c69852]">{TEST_MODULES.find((m) => m.testType === selectedType)?.label}</span>
            </div>
            <button
              onClick={() => setSelectedType(null)}
              className="text-xs text-[#7b9690] hover:text-[#17333c]"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow block mb-2">Applicability Status</label>
              <div className="flex gap-2">
                {[
                  { id: 'required', label: 'Required' },
                  { id: 'optional', label: 'Optional' },
                  { id: 'not_applicable', label: 'N/A' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatusVal(s.id)}
                    className={`rounded-md px-3 py-2 text-xs font-bold transition ${
                      statusVal === s.id
                        ? 'bg-[#17333c] text-white shadow-sm'
                        : 'bg-white border border-[#c9d9d1] text-[#33545a] hover:bg-[#f4f7f3]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-2">Rationale / Justification (Required for N/A)</label>
              <input
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="e.g. Battery operated only; AC disturbance test N/A"
                className="w-full rounded-md border border-[#c9d9d1] bg-white px-3 py-2 text-xs outline-none focus:border-[#c69852]"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="quiet" onClick={() => setSelectedType(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updating}>
              {updating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save Plan Item
            </Button>
          </div>
          {validationError && <div className="mt-3 text-xs text-[#a6423b]">{validationError}</div>}
        </div>
      )}

      <div className="rounded-lg border border-[#d7e0db] bg-white overflow-hidden shadow-sm">
        <div className="mobile-scroll">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] bg-[#fbfdfb] text-[10px] uppercase tracking-wider text-[#7b9690]">
                <th className="px-4 py-3.5">#</th>
                <th className="px-4 py-3.5">Test Module</th>
                <th className="px-4 py-3.5">Clause Reference</th>
                <th className="px-4 py-3.5">Applicability</th>
                <th className="px-4 py-3.5">Execution State</th>
                <th className="px-4 py-3.5">Rationale</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5ece8]">
              {TEST_MODULES.map((m, index) => {
                const planItem = planMap.get(m.testType);
                const currentStatus = planItem?.status || (m.core ? 'required' : 'optional');
                const hasObs = obsTypes.has(m.testType);

                let badgeColor = 'bg-[#edf4ef] text-[#2e7568]';
                if (currentStatus === 'not_applicable') badgeColor = 'bg-[#f4f7f3] text-[#7b9690]';
                else if (currentStatus === 'optional') badgeColor = 'bg-[#fbf4e4] text-[#92713a]';

                let stateText = 'NOT STARTED';
                let stateColor = 'text-[#7b9690]';
                if (currentStatus === 'not_applicable') {
                  stateText = 'EXCLUDED';
                  stateColor = 'text-[#7b9690]';
                } else if (hasObs) {
                  stateText = 'COMPLETED';
                  stateColor = 'text-[#2e7568] font-bold';
                }

                return (
                  <tr key={m.testType} className="table-row hover:bg-[#fafcfa]">
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[#7b9690]">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[#17333c]">
                      {m.label}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[#66837d]">
                      {m.clause}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${badgeColor}`}>
                        {currentStatus === 'not_applicable' ? 'N/A' : currentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px]">
                      <span className={stateColor}>{stateText}</span>
                    </td>
                    <td className="px-4 py-3.5 text-[#66837d] max-w-[200px] truncate">
                      {planItem?.rationale || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleEdit(m)}
                        disabled={!canEdit || !planItem}
                        className="button-quiet rounded px-2.5 py-1 text-[11px] font-semibold text-[#2e7568] hover:underline"
                        data-testid={`button-edit-plan-${m.testType}`}
                      >
                        {canEdit ? 'Edit' : 'Read only'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TestPlanModule;
