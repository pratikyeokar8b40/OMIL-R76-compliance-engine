import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import Button from '@/components/Button';
import { TEST_MODULES, labelForTestType, moduleStatus } from '@/lib/requirements';

export function VerdictModule({
  session = {},
  observations = [],
  driftInfo = null,
  testPlanItems = [],
  checklist = { items: [], progress: {} },
  summary = null,
  onFinalize,
  finalizing = false,
  finalizeError = '',
  canFinalize = true,
  onEditEnvironment,
}) {
  const planMap = new Map(testPlanItems.map((p) => [p.test_type, p]));
  const requiredPlanItems = TEST_MODULES.filter((module) => (planMap.get(module.testType)?.status || (module.core ? 'required' : 'optional')) === 'required');
  const missingRequired = requiredPlanItems.filter((module) => !moduleStatus(module, observations, planMap.get(module.testType)).complete);
  const requiredTestsComplete = requiredPlanItems.length > 0 && missingRequired.length === 0;

  const checklistProgress = checklist.progress || {};
  const checklistOpenCount = checklistProgress.open ?? checklistProgress.unchecked ?? 0;
  const checklistTotal = checklistProgress.total ?? (checklist.items || []).length;
  const checklistComplete = checklistTotal > 0 && checklistOpenCount === 0;

  // Saved values only: a typed-but-unsaved temperature is not on the server,
  // which would then refuse to finalize.
  const saved = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  const envStartPresent = saved(session.start_temp_c);
  const envEndPresent = saved(session.end_temp_c);
  const envComplete = envStartPresent && envEndPresent;

  const failedObs = observations.filter((o) => o.verdict === 'FAIL');
  const hasFailedObs = failedObs.length > 0;
  const hasFailedChecklist = (checklistProgress.failed ?? 0) > 0;
  const hasDriftRed = driftInfo?.level === 'red';

  // Local gate state (what is still missing) — used only while the server's
  // summary is loading or unreachable.
  let localVerdict = 'INCOMPLETE';
  if (requiredTestsComplete && checklistComplete && envComplete) {
    localVerdict = hasFailedObs || hasFailedChecklist || hasDriftRed ? 'FAIL' : 'PASS';
  }

  // The verdict shown is the SERVER's (GET /sessions/{id}/summary): it adds
  // the cross-reading criteria (repeatability spread, creep drift) that a
  // per-row view cannot see. The local value is labelled as a preview.
  const authoritative = Boolean(summary);
  const overallVerdict = summary?.result || localVerdict;
  const reasons = summary?.reasons || [];
  const failedChecks = (summary?.checks || []).filter((c) => c.verdict === 'FAIL');
  let statusDetail = 'Required evaluation steps remain incomplete.';
  if (overallVerdict === 'FAIL') {
    statusDetail = reasons.length ? reasons.join(' · ') : 'One or more readings or checklist clauses failed regulatory limits.';
  } else if (overallVerdict === 'PASS') {
    statusDetail = 'All required tests, cross-reading criteria, environmental conditions and checklist items satisfy OIML R-76.';
  }

  const isFinalized = session.status === 'completed' || session.status === 'approved';

  return (
    <div className="animate-rise space-y-7">
      {/* Top Banner Verdict Display */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="flex items-center gap-3">
            <div
              className={`grid h-12 w-12 place-items-center rounded-full text-white ${
                overallVerdict === 'PASS'
                  ? 'bg-[#2e7568]'
                  : overallVerdict === 'FAIL'
                  ? 'bg-[#b24b43]'
                  : 'bg-[#66837d]'
              }`}
            >
              {overallVerdict === 'PASS' ? (
                <CheckCircle2 size={28} />
              ) : overallVerdict === 'FAIL' ? (
                <XCircle size={28} />
              ) : (
                <AlertCircle size={28} />
              )}
            </div>
            <div>
              <div className="eyebrow">{authoritative ? 'Server evaluation result' : 'Preview (server result unavailable)'}</div>
              <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#17333c]">{overallVerdict}</h3>
            </div>
          </div>

          <p className="mt-4 max-w-xl text-sm leading-6 text-[#58746f]">{statusDetail}</p>
          {failedChecks.length > 0 && (
            <ul className="mt-3 max-w-xl space-y-1 text-xs text-[#a6423b]">
              {failedChecks.map((c) => (
                <li key={c.key}>
                  <span className="font-semibold">{c.title}</span> ({c.clause}): {c.detail}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-[#edf4ef] p-4 border border-[#d7e0db]">
              <div className="text-[10px] uppercase font-bold text-[#7b9690]">Observations</div>
              <div className="mt-2 font-mono text-xl font-bold text-[#17333c]">{summary?.counts?.total ?? observations.length}</div>
              <div className="mt-1 text-[11px] text-[#2e7568]">
                {(summary?.counts?.fail ?? failedObs.length) === 0
                  ? 'All within MPE'
                  : `${summary?.counts?.fail ?? failedObs.length} exceeded MPE`}
              </div>
            </div>

            <div className="rounded-lg bg-[#edf4ef] p-4 border border-[#d7e0db]">
              <div className="text-[10px] uppercase font-bold text-[#7b9690]">Checklist Clauses</div>
              <div className="mt-2 font-mono text-xl font-bold text-[#17333c]">
                {checklistTotal - checklistOpenCount} / {checklistTotal}
              </div>
              <div className="mt-1 text-[11px] text-[#66837d]">
                {checklistOpenCount === 0 ? 'All items checked' : `${checklistOpenCount} unresolved`}
              </div>
            </div>

            <div className="rounded-lg bg-[#edf4ef] p-4 border border-[#d7e0db]">
              <div className="text-[10px] uppercase font-bold text-[#7b9690]">Ambient Drift</div>
              <div className="mt-2 font-mono text-xl font-bold text-[#17333c]">
                {driftInfo?.level === 'red' ? 'VOID' : driftInfo?.level === 'warn' ? 'FLAGGED' : 'STABLE'}
              </div>
              <div className="mt-1 text-[11px] text-[#66837d]">
                {driftInfo?.deltaC !== null && driftInfo?.deltaC !== undefined ? `ΔT = ${driftInfo.deltaC} °C` : 'End temp pending'}
              </div>
            </div>
          </div>
        </div>

        {/* Verdict Badge */}
        <div className="grid-paper grid place-items-center rounded-lg border border-[#d7e0db] p-5 text-center">
          <div className="gauge-ring grid h-40 w-40 place-items-center">
            <div>
              <div
                className={`font-mono text-3xl font-bold ${
                  overallVerdict === 'PASS'
                    ? 'text-[#2e7568]'
                    : overallVerdict === 'FAIL'
                    ? 'text-[#b24b43]'
                    : 'text-[#66837d]'
                }`}
              >
                {overallVerdict}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-[#2e7568] font-bold">
                OIML R-76
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Finalization Readiness Checklist */}
      <div className="rounded-lg border border-[#c9d9d1] bg-[#fbfdfb] p-6">
        <h4 className="font-bold text-sm text-[#17333c]">Pre-Finalization Completeness Gate</h4>
        <p className="mt-1 text-xs text-[#66837d]">
          Required checks must be complete before finalization.
        </p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-md border border-[#e5ece8] bg-white p-3.5 text-xs">
            <div className="flex items-center gap-3">
              {requiredTestsComplete ? (
                <CheckCircle2 size={16} className="text-[#2e7568]" />
              ) : (
                <AlertCircle size={16} className="text-[#c69852]" />
              )}
              <div>
                <span className="font-bold text-[#17333c]">Required Test Modules</span>
                <div className="text-[11px] text-[#66837d]">
                  {requiredTestsComplete
                    ? `All ${requiredPlanItems.length} required test modules are complete.`
                    : `${missingRequired.length} required tests incomplete: ${missingRequired.map((m) => labelForTestType(m.testType)).join(', ')}`}
                </div>
              </div>
            </div>
            <span className="font-mono font-bold text-xs">
              {requiredPlanItems.length - missingRequired.length} / {requiredPlanItems.length}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-md border border-[#e5ece8] bg-white p-3.5 text-xs">
            <div className="flex items-center gap-3">
              {checklistComplete ? (
                <CheckCircle2 size={16} className="text-[#2e7568]" />
              ) : (
                <AlertCircle size={16} className="text-[#c69852]" />
              )}
              <div>
                <span className="font-bold text-[#17333c]">R-76 Sheet 17 Compliance Checklist</span>
                <div className="text-[11px] text-[#66837d]">
                  {checklistComplete
                    ? 'All checklist items have been resolved (PASSED, FAILED, or NA).'
                    : `${checklistOpenCount} unresolved checklist items remain.`}
                </div>
              </div>
            </div>
            <span className="font-mono font-bold text-xs">
              {checklistTotal - checklistOpenCount} / {checklistTotal}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-md border border-[#e5ece8] bg-white p-3.5 text-xs">
            <div className="flex items-center gap-3">
              {envComplete ? (
                <CheckCircle2 size={16} className="text-[#2e7568]" />
              ) : (
                <AlertCircle size={16} className="text-[#c69852]" />
              )}
              <div>
                <span className="font-bold text-[#17333c]">Environmental Conditions</span>
                <div className="text-[11px] text-[#66837d]">
                  {envComplete
                    ? 'Both start and end environmental readings recorded.'
                    : !envEndPresent
                    ? 'Ending temperature reading is missing.'
                    : 'Starting temperature reading is missing.'}
                </div>
              </div>
            </div>
            {!envComplete && onEditEnvironment && !isFinalized ? (
              <Button size="sm" variant="quiet" onClick={onEditEnvironment} data-testid="button-record-end-temperature">
                Record {envStartPresent ? 'end' : 'start'} temperature
              </Button>
            ) : (
              <span className="font-mono font-bold text-xs">
                {envComplete ? 'COMPLETE' : 'INCOMPLETE'}
              </span>
            )}
          </div>
        </div>

        {finalizeError && (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-[#e7b5ae] bg-[#fff5f3] p-4 text-xs text-[#a6423b]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#b24b43]" />
            <div>
              <div className="font-bold">Unable to finalize evaluation on backend</div>
              <div className="mt-1">{finalizeError}</div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#e5ece8] pt-5">
          <div className="text-[11px] text-[#66837d]">
            {isFinalized
              ? 'This session is finalized. Reports are sealed.'
              : 'Finalization generates the PDF and DOCX reports.'}
          </div>
          <Button
            onClick={onFinalize}
            disabled={finalizing || isFinalized || !canFinalize || overallVerdict === 'INCOMPLETE' || localVerdict === 'INCOMPLETE'}
            data-testid="button-finalize-session"
          >
            {finalizing ? (
              <>
                <Loader2 size={15} className="animate-spin mr-1.5 inline" /> Finalizing &amp; Generating Report…
              </>
            ) : isFinalized ? (
              'Session Finalized'
            ) : !canFinalize ? (
              'Approving officers cannot finalize evaluations'
            ) : overallVerdict === 'INCOMPLETE' || localVerdict === 'INCOMPLETE' ? (
              'Complete required checks before finalizing'
            ) : (
              <>
                <FileCheck2 size={15} className="mr-1.5 inline" /> Finalize Evaluation &amp; View Report
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VerdictModule;

