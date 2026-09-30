import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
  MinusCircle,
  FileSpreadsheet,
} from 'lucide-react';
import Button from '@/components/Button';

export function ChecklistModule({
  checklist = { items: [], progress: {} },
  onUpdateItem,
  onSeed,
  onBulkPass,
  bulkUpdating = false,
  seeding = false,
  updatingItem = null,
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [activeRemarkItem, setActiveRemarkItem] = useState(null);
  const [remarkText, setRemarkText] = useState('');

  const items = checklist.items || [];
  // Counted from the items themselves: the API's progress has no N/A count,
  // which made the progress bar render NaN%.
  const progress = {
    total: items.length,
    passed: items.filter((i) => i.outcome === 'PASSED').length,
    failed: items.filter((i) => i.outcome === 'FAILED').length,
    na: items.filter((i) => i.outcome === 'NA').length,
    unchecked: items.filter((i) => i.outcome === 'UNCHECKED').length,
    open: items.filter((i) => i.outcome === 'UNCHECKED').length,
  };

  const filteredItems = items.filter((item) => {
    const matchSearch =
      !search ||
      item.clause?.toLowerCase().includes(search.toLowerCase()) ||
      item.requirement?.toLowerCase().includes(search.toLowerCase()) ||
      item.item_key?.toLowerCase().includes(search.toLowerCase());

    if (!matchSearch) return false;
    if (filter === 'open') return item.outcome === 'UNCHECKED';
    if (filter === 'passed') return item.outcome === 'PASSED';
    if (filter === 'failed') return item.outcome === 'FAILED';
    if (filter === 'na') return item.outcome === 'NA';
    return true;
  });

  const handleOutcomeChange = async (item, outcome) => {
    await onUpdateItem({
      clause: item.clause,
      item_key: item.item_key,
      outcome,
      remarks: item.remarks,
    });
  };

  const handleSaveRemark = async (item) => {
    await onUpdateItem({
      clause: item.clause,
      item_key: item.item_key,
      outcome: item.outcome,
      remarks: remarkText.trim() || null,
    });
    setActiveRemarkItem(null);
    setRemarkText('');
  };

  if (items.length === 0) {
    return (
      <div className="animate-rise rounded-lg border border-dashed border-[#bdd1c8] bg-[#f8fbf8] p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#dceee8] text-[#2e7568]">
          <FileSpreadsheet size={24} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-[#17333c]">R-76 Checklist Not Seeded</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#66837d]">
          The OIML R-76 Sheet 17 compliance checklist covers physical markings, device prohibitions, and descriptive clauses.
        </p>
        <Button onClick={onSeed} disabled={seeding} className="mt-6" data-testid="button-seed-checklist">
          {seeding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Seed Official Sheet 17 Checklist
        </Button>
      </div>
    );
  }

  const percentComplete =
    progress.total > 0
      ? Math.round(((progress.passed + progress.failed + progress.na) / progress.total) * 100)
      : 0;

  return (
    <div className="animate-rise space-y-6">
      {/* Header & Progress Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#17333c]">OIML R 76-2 Sheet 17 Compliance Checklist</h3>
          <p className="mt-1 text-xs text-[#58746f]">
            Complete all visual, structural, and device prohibition requirements before finalization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="rounded-md bg-[#edf4ef] px-2.5 py-1 font-bold text-[#2e7568]">
            {progress.passed} Passed
          </span>
          <span className="rounded-md bg-[#fdeceb] px-2.5 py-1 font-bold text-[#b24b43]">
            {progress.failed} Failed
          </span>
          <span className="rounded-md bg-[#f4f7f3] px-2.5 py-1 font-bold text-[#66837d]">
            {progress.na} N/A
          </span>
          <span className="rounded-md bg-[#fbf4e4] px-2.5 py-1 font-bold text-[#92713a]">
            {progress.open ?? progress.unchecked} Open
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-[11px] font-semibold text-[#66837d] mb-1.5">
          <span>Checklist Progress</span>
          <span className="font-mono">{progress.total - (progress.open ?? progress.unchecked)} / {progress.total} items resolved ({percentComplete}%)</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5ece8]">
          <div
            className={`h-full transition-all duration-300 ${
              progress.failed > 0 ? 'bg-[#b24b43]' : (progress.open ?? progress.unchecked) === 0 ? 'bg-[#2e7568]' : 'bg-[#c69852]'
            }`}
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-2.5 text-[#7b9690]" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clause or requirement…"
            className="w-full rounded-md border border-[#c9d9d1] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#c69852]"
            data-testid="input-checklist-search"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {onBulkPass && progress.open > 0 && (
            <button
              type="button"
              onClick={onBulkPass}
              disabled={bulkUpdating}
              className="rounded-md bg-[#2e7568] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              data-testid="button-checklist-pass-open"
              title="Record PASSED for every item that is still open"
            >
              {bulkUpdating ? 'Recording…' : `Pass all open (${progress.open})`}
            </button>
          )}
          {[
            { id: 'all', label: `All (${items.length})` },
            { id: 'open', label: `Open (${progress.open ?? progress.unchecked})` },
            { id: 'passed', label: `Passed (${progress.passed})` },
            { id: 'failed', label: `Failed (${progress.failed})` },
            { id: 'na', label: `N/A (${progress.na})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id
                  ? 'bg-[#17333c] text-white shadow-sm'
                  : 'bg-white border border-[#c9d9d1] text-[#66837d] hover:bg-[#f4f7f3]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-lg border border-[#d7e0db] bg-white overflow-hidden shadow-sm">
        <div className="mobile-scroll">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] bg-[#fbfdfb] text-[10px] uppercase tracking-wider text-[#7b9690]">
                <th className="px-4 py-3.5 w-20">Clause</th>
                <th className="px-4 py-3.5">Requirement / Procedure</th>
                <th className="px-4 py-3.5 w-64 text-center">Decision / Outcome</th>
                <th className="px-4 py-3.5 w-44">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5ece8]">
              {filteredItems.map((item) => {
                const isUpdating = updatingItem === `${item.clause}:${item.item_key}`;
                const isRemarking = activeRemarkItem === `${item.clause}:${item.item_key}`;

                return (
                  <tr
                    key={`${item.clause}-${item.item_key}`}
                    className={`table-row transition ${
                      item.outcome === 'FAILED'
                        ? 'bg-[#fff5f3]'
                        : item.outcome === 'UNCHECKED'
                        ? 'bg-[#fffcf7]'
                        : 'hover:bg-[#fafcfa]'
                    }`}
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-[#17333c] align-top">
                      {item.clause}
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="font-medium text-[#17333c] leading-relaxed">
                        {item.requirement}
                      </div>
                      {item.test_procedure && item.test_procedure !== 'visual' && (
                        <div className="mt-1 font-mono text-[10px] text-[#7b9690]">
                          Procedure: {item.test_procedure}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-top text-center">
                      <div className="inline-flex rounded-md border border-[#c9d9d1] bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          disabled={isUpdating || bulkUpdating}
                          onClick={() => handleOutcomeChange(item, 'PASSED')}
                          className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                            item.outcome === 'PASSED'
                              ? 'bg-[#2e7568] text-white'
                              : 'text-[#66837d] hover:bg-[#edf4ef] hover:text-[#2e7568]'
                          }`}
                          data-testid={`btn-pass-${item.clause}-${item.item_key}`}
                        >
                          PASS
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating || bulkUpdating}
                          onClick={() => handleOutcomeChange(item, 'FAILED')}
                          className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                            item.outcome === 'FAILED'
                              ? 'bg-[#b24b43] text-white'
                              : 'text-[#66837d] hover:bg-[#fdeceb] hover:text-[#b24b43]'
                          }`}
                          data-testid={`btn-fail-${item.clause}-${item.item_key}`}
                        >
                          FAIL
                        </button>
                        {!item.mandatory && (
                        <button
                          type="button"
                          disabled={isUpdating || bulkUpdating}
                          onClick={() => handleOutcomeChange(item, 'NA')}
                          className={`rounded px-2 py-1 text-[11px] font-bold transition ${
                            item.outcome === 'NA'
                              ? 'bg-[#66837d] text-white'
                              : 'text-[#66837d] hover:bg-[#f4f7f3]'
                          }`}
                          data-testid={`btn-na-${item.clause}-${item.item_key}`}
                        >
                          N/A
                        </button>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-top text-xs">
                      {isRemarking ? (
                        <div className="space-y-2">
                          <textarea
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            placeholder="Add observation remarks…"
                            rows={2}
                            className="w-full rounded border border-[#c9d9d1] p-1.5 text-xs outline-none focus:border-[#c69852]"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActiveRemarkItem(null)}
                              className="text-[10px] text-[#7b9690] hover:text-[#17333c]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveRemark(item)}
                              className="rounded bg-[#17333c] px-2 py-0.5 text-[10px] font-bold text-white"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setActiveRemarkItem(`${item.clause}:${item.item_key}`);
                            setRemarkText(item.remarks || '');
                          }}
                          className="cursor-pointer text-[#66837d] hover:text-[#17333c] hover:underline"
                        >
                          {item.remarks ? (
                            <span className="italic">“{item.remarks}”</span>
                          ) : (
                            <span className="text-[11px] text-[#9ab0a9]">+ Add remark</span>
                          )}
                        </div>
                      )}
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

export default ChecklistModule;
