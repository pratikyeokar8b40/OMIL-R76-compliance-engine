import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Check, CloudOff, FileText, Save } from 'lucide-react';
import IdentificationModule from '@/components/modules/IdentificationModule';
import EnvironmentModule from '@/components/modules/EnvironmentModule';
import TestPlanModule from '@/components/modules/TestPlanModule';
import ChecklistModule from '@/components/modules/ChecklistModule';
import ReadingModule from '@/components/modules/ReadingModule';
import EccentricityModule from '@/components/modules/EccentricityModule';
import CreepModule from '@/components/modules/CreepModule';
import DiscriminationModule from '@/components/modules/DiscriminationModule';
import TemperatureNoLoadModule from '@/components/modules/TemperatureNoLoadModule';
import R76ProcedureModule from '@/components/modules/R76ProcedureModule';
import VerdictModule from '@/components/modules/VerdictModule';
import Button from '@/components/Button';
import { evaluateObservation } from '@/lib/metrology';
import { loadWorkingSession, saveWorkingSession, queueOutbox, getSessionMapping } from '@/lib/offlineStore';
import { TEST_MODULES, moduleStatus, computeTestPlanCompletion, effectivePlanStatus } from '@/lib/requirements';
import { normalizeDrift } from '@/lib/drift';
import { trimDecimal } from '@/lib/utils';
import { api } from '@/api/client';

const WORKFLOW_SCREENS = [
  { kind: 'identification', label: 'Identification' },
  { kind: 'environment', label: 'Environment' },
  { kind: 'test_plan', label: 'Test Plan' },
  { kind: 'checklist', label: 'R-76 Checklist' },
  { kind: 'verdict', label: 'Verdict & Finalize' },
];

const isLocalId = (id) => !id || String(id).startsWith('local-');
const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const FINAL_STATES = ['completed', 'approved'];

export function ActiveSession() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nawi-session') || '{}');
    } catch {
      return {};
    }
  });

  const [screenIndex, setScreenIndex] = useState(0);
  const [reading, setReading] = useState('');
  const [appliedLoad, setAppliedLoad] = useState('');
  const [observations, setObservations] = useState([]);
  const [source, setSource] = useState('manual');
  const [saved, setSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [apiError, setApiError] = useState('');
  const [syncState, setSyncState] = useState('idle');
  const [finalized, setFinalized] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');
  const [activePosition, setActivePosition] = useState(null);
  const [creepTimer, setCreepTimer] = useState({ running: false, startedAt: null, accumulatedMs: 0 });
  const [, forceTick] = useState(0);

  // Test Plan and Checklist backend state
  const [testPlanData, setTestPlanData] = useState([]);
  const [checklistData, setChecklistData] = useState({ items: [], progress: {} });
  const [seedingChecklist, setSeedingChecklist] = useState(false);
  const [checklistUpdating, setChecklistUpdating] = useState(null);
  const [checklistBulk, setChecklistBulk] = useState(false);

  // Environment state
  const [envValues, setEnvValues] = useState({
    start_temp_c: '',
    end_temp_c: '',
    humidity_pct: '',
    pressure_hpa: '',
  });
  const [envSaving, setEnvSaving] = useState(false);
  const [envSaveState, setEnvSaveState] = useState('');
  const [driftInfo, setDriftInfo] = useState(null);
  const [driftLoading, setDriftLoading] = useState(false);
  // Server's authoritative verdict for the Verdict screen (GET /summary).
  const [summary, setSummary] = useState(null);

  const screens = useMemo(() => {
    const planMap = new Map(testPlanData.map((item) => [item.test_type, item.status]));
    const executableTests = TEST_MODULES
      .filter((module) => effectivePlanStatus(module, testPlanData.find((item) => item.test_type === module.testType)) !== 'not_applicable')
      .map((module) => ({ kind: 'test', testType: module.testType, label: module.label }));
    // Workflow order: setup screens → applicable R-76 tests/examinations → checklist → verdict.
    return [WORKFLOW_SCREENS[0], WORKFLOW_SCREENS[1], WORKFLOW_SCREENS[2], ...executableTests, WORKFLOW_SCREENS[3], WORKFLOW_SCREENS[4]];
  }, [testPlanData]);
  const current = screens[screenIndex] || screens[0];
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('nawi-user') || '{}'); } catch { return {}; }
  })();
  const canEdit = currentUser.role !== 'approving_officer';
  const isFinal = FINAL_STATES.includes(session.status);

  // Provisional preview for a reading of `testType` (server verdict is final).
  const previewFor = (testType, fields) =>
    evaluateObservation({
      verificationScaleInterval: session.verificationScaleInterval || 1,
      displayInterval: session.displayInterval || null,
      maxCapacity: session.capacity || null,
      accuracyClass: session.accuracyClass || 'III',
      evaluationMode: session.evaluation_mode,
      testType,
      ...fields,
    });

  // Keep the server's view of status and conditions: another tab, the
  // officer, or a finalize elsewhere may have changed them.
  const mergeServerSession = (serverRow) => {
    if (!serverRow) return;
    setSession((prev) => {
      if (prev.id !== serverRow.id) return prev;
      const next = {
        ...prev,
        status: serverRow.status,
        start_temp_c: serverRow.start_temp_c,
        end_temp_c: serverRow.end_temp_c,
        humidity_pct: serverRow.humidity_pct,
        pressure_hpa: serverRow.pressure_hpa,
      };
      localStorage.setItem('nawi-session', JSON.stringify(next));
      void saveWorkingSession(next);
      return next;
    });
  };

  const hydrateServerState = async (serverSession) => {
    if (!serverSession?.id || isLocalId(serverSession.id)) return;
    const [rows, drift, plan, checklist, serverRow] = await Promise.allSettled([
      api.observations(serverSession.id),
      api.drift(serverSession.id),
      api.testPlan(serverSession.id),
      api.checklist(serverSession.id),
      api.session(serverSession.id),
    ]);
    if (serverRow.status === 'fulfilled') mergeServerSession(serverRow.value);
    if (rows.status === 'fulfilled') setObservations(rows.value || []);
    if (drift.status === 'fulfilled') setDriftInfo(normalizeDrift(drift.value));
    if (plan.status === 'fulfilled') setTestPlanData(plan.value?.items || plan.value || []);
    if (checklist.status === 'fulfilled') setChecklistData(checklist.value || { items: [], progress: {} });
  };

  useEffect(() => {
    if (session.observations) setObservations(session.observations);
    if (session.creepTimer) setCreepTimer(session.creepTimer);
    if (session.envValues) setEnvValues(session.envValues);
    if (session.id && !isLocalId(session.id)) void hydrateServerState(session);
    loadWorkingSession((stored) => {
      if (stored) {
        setSession(stored);
        setObservations(stored.observations || []);
        if (stored.creepTimer) setCreepTimer(stored.creepTimer);
        if (stored.envValues) setEnvValues(stored.envValues);
        void hydrateServerState(stored);
      }
    });
  }, []);

  useEffect(() => {
    const handleSessionSynced = async (event) => {
      const { localSessionId, serverSessionId } = event.detail || {};
      if (!localSessionId || !serverSessionId || session.id !== localSessionId) return;
      const nextSession = { ...session, id: serverSessionId, pendingCreate: false, synced: true };
      localStorage.setItem('nawi-session', JSON.stringify(nextSession));
      await saveWorkingSession(nextSession);
      setSession(nextSession);
      setApiError('');
      await hydrateServerState(nextSession);
    };
    window.addEventListener('nawi:session-synced', handleSessionSynced);
    return () => window.removeEventListener('nawi:session-synced', handleSessionSynced);
  }, [session]);

  useEffect(() => {
    if (!session.id || !isLocalId(session.id)) return;
    getSessionMapping(session.id).then((serverSessionId) => {
      if (!serverSessionId) return;
      window.dispatchEvent(new CustomEvent('nawi:session-synced', {
        detail: { localSessionId: session.id, serverSessionId },
      }));
    });
  }, [session.id]);

  useEffect(() => {
    const handleSyncState = (event) => {
      const nextState = event.detail?.state;
      if (nextState) setSyncState(nextState);
      if (nextState === 'failed') setApiError(event.detail.error || 'Synchronization failed.');
    };
    window.addEventListener('nawi:sync-state', handleSyncState);
    return () => window.removeEventListener('nawi:sync-state', handleSyncState);
  }, []);

  useEffect(() => {
    if (!creepTimer.running) return;
    const timer = window.setInterval(() => forceTick((x) => x + 1), 500);
    return () => window.clearInterval(timer);
  }, [creepTimer.running]);

  const creepElapsedMs =
    creepTimer.accumulatedMs +
    (creepTimer.running && creepTimer.startedAt ? Date.now() - creepTimer.startedAt : 0);

  const persist = (patch = {}) => {
    const next = { ...session, observations, creepTimer, envValues, note, ...patch };
    localStorage.setItem('nawi-session', JSON.stringify(next));
    saveWorkingSession(next);
    setSession(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const startCreepTimer = () => {
    const next = { running: true, startedAt: Date.now(), accumulatedMs: creepTimer.accumulatedMs };
    setCreepTimer(next);
    persist({ creepTimer: next });
  };
  const stopCreepTimer = () => {
    const next = { running: false, startedAt: null, accumulatedMs: creepElapsedMs };
    setCreepTimer(next);
    persist({ creepTimer: next });
  };
  // Dev-build demo aid only (see CreepModule): jump the timer forward.
  const fastForwardCreepTimer = (targetMs) => {
    const next = { running: true, startedAt: Date.now(), accumulatedMs: Math.max(targetMs, creepElapsedMs) };
    setCreepTimer(next);
    persist({ creepTimer: next });
  };
  const resetCreepTimer = () => {
    const next = { running: false, startedAt: null, accumulatedMs: 0 };
    setCreepTimer(next);
    persist({ creepTimer: next });
  };

  const liveValidation =
    reading.trim() && !Number.isNaN(Number(reading)) && String(appliedLoad).trim()
      ? previewFor(current?.testType, { appliedLoad: String(appliedLoad), indication: String(reading) })
      : null;

  const rowsFor = (testType) => observations.filter((o) => o.test_type === testType);

  // Deterministic sequence numbering scoped to (test_type, position)
  const addReading = async (testType, position = null, extraParams = {}) => {
    // Modules pass either camelCase overrides or the API's snake_case names
    // (ReadingModule sends additional_load / zero_error); accept both so a
    // typed ΔL or E0 is never silently replaced by 0.
    if (isFinal) {
      setApiError('This evaluation is finalized; its readings are sealed in the report.');
      return false;
    }
    const applied = String(extraParams.appliedLoadOverride ?? extraParams.applied_load ?? appliedLoad ?? '');
    const ind = String(extraParams.indicationOverride ?? extraParams.indication ?? reading ?? '');
    const additional = extraParams.additionalLoad ?? extraParams.additional_load ?? '0';
    const zeroErr = extraParams.zeroError ?? extraParams.zero_error ?? '0';
    if (!ind.trim() || Number.isNaN(Number(ind))) return false;
    if (!applied.trim() || Number.isNaN(Number(applied))) {
      setApiError('Enter the applied load before capturing the reading.');
      return false;
    }

    const matching = observations.filter(
      (o) => o.test_type === testType && (o.position || null) === (position || null)
    );
    const sequenceNo =
      matching.length > 0 ? Math.max(...matching.map((o) => Number(o.sequence_no ?? -1))) + 1 : 0;

    const payload = {
      test_type: testType,
      position: position || null,
      sequence_no: sequenceNo,
      applied_load: applied,
      indication: ind,
      additional_load: String(additional || '0'),
      zero_error: String(zeroErr || '0'),
      source: extraParams.customSource ?? source ?? 'manual',
    };

    if (
      testType === 'discrimination' &&
      extraParams.secondIndication !== undefined &&
      extraParams.secondIndication !== null
    ) {
      payload.second_indication = String(extraParams.secondIndication);
    }
    if (hasValue(extraParams.chamberTemperature)) {
      // Temperature effect on no-load: the server requires the chamber temperature.
      payload.chamber_temperature_c = String(extraParams.chamberTemperature).trim();
    }

    // Offline rows show this until the server re-evaluates them on sync; it
    // is computed from the values actually submitted, not the shared inputs.
    const preview = previewFor(testType, {
      appliedLoad: payload.applied_load,
      indication: payload.indication,
      additionalLoad: payload.additional_load,
      zeroError: payload.zero_error,
      secondIndication: payload.second_indication ?? null,
    });
    const provisional = preview && !preview.invalid ? preview : null;

    let row = {
      test_type: testType,
      position: payload.position,
      sequence_no: sequenceNo,
      applied_load: payload.applied_load,
      indication: payload.indication,
      additional_load: payload.additional_load,
      zero_error: payload.zero_error,
      second_indication: payload.second_indication,
      chamber_temperature_c: payload.chamber_temperature_c,
      corrected_error: provisional?.correctedError,
      mpe_limit: provisional?.mpeLimit,
      verdict: provisional?.verdict,
      source: payload.source,
      authoritative: false,
    };

    if (session.id && !isLocalId(session.id)) {
      try {
        const res = await api.addObservation(session.id, payload);
        const ev = res?.evaluation || {};
        const obs = res?.observation || {};
        row = {
          ...row,
          id: obs.id,
          sequence_no: obs.sequence_no ?? sequenceNo,
          corrected_error: ev.corrected_error ?? row.corrected_error,
          mpe_limit: ev.mpe_limit ?? row.mpe_limit,
          verdict: ev.verdict ?? row.verdict,
          authoritative: true,
        };
        if (res?.drift) {
          setDriftInfo(normalizeDrift(res.drift));
        }
        setApiError('');
      } catch (err) {
        if (err.status && err.status < 500) {
          // The server rejected the reading (e.g. load above Max, duplicate):
          // show why and do NOT record it locally.
          setApiError(`Reading not recorded: ${err.message}`);
          return false;
        }
        try {
          await queueOutbox({ kind: 'observation', sessionId: session.id, payload });
          row = { ...row, pending: true };
          setApiError('Server unreachable — reading saved in this browser and will sync automatically.');
        } catch {
          setApiError(err.message || 'Server sync failed; reading was not saved.');
          return false;
        }
      }
    } else if (session.id) {
      await queueOutbox({ kind: 'observation', sessionId: session.id, payload });
      row = { ...row, pending: true };
    }

    const next = [...observations, row];
    setObservations(next);
    setReading('');
    persist({ observations: next });
    return true;
  };

  const saveEnvironment = async () => {
    setEnvSaving(true);
    setEnvSaveState('');
    const text = (v) => (hasValue(v) ? String(v).trim() : null);
    // The start temperature is the drift baseline: sent only when the session
    // has none yet (the server refuses to change a recorded one).
    const payload = {
      ...(hasValue(session.start_temp_c) ? {} : { start_temp_c: text(envValues.start_temp_c) }),
      end_temp_c: text(envValues.end_temp_c),
      humidity_pct: text(envValues.humidity_pct),
      pressure_hpa: text(envValues.pressure_hpa),
    };
    const recordLocally = (fields) => {
      const next = { ...session, envValues, ...fields };
      localStorage.setItem('nawi-session', JSON.stringify(next));
      void saveWorkingSession(next);
      setSession(next);
    };
    const queuedFields = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null));
    try {
      if (session.id && !isLocalId(session.id)) {
        const updated = await api.patchSession(session.id, payload);
        recordLocally({
          start_temp_c: updated.start_temp_c,
          end_temp_c: updated.end_temp_c,
          humidity_pct: updated.humidity_pct,
          pressure_hpa: updated.pressure_hpa,
        });
        setEnvSaveState('saved');
        setDriftLoading(true);
        try {
          setDriftInfo(normalizeDrift(await api.drift(session.id)));
        } catch {
          setDriftInfo(null);
        } finally {
          setDriftLoading(false);
        }
      } else if (session.id) {
        await queueOutbox({ kind: 'environment', sessionId: session.id, payload });
        recordLocally(queuedFields);
        setEnvSaveState('queued');
      }
      setApiError('');
    } catch (err) {
      if (err.status && err.status < 500) {
        // The server answered and refused (e.g. out-of-range value): show why.
        setApiError(`Environment not saved: ${err.message}`);
        setEnvSaveState('error');
        recordLocally({});
        return;
      }
      try {
        await queueOutbox({ kind: 'environment', sessionId: session.id, payload });
        recordLocally(queuedFields);
        setEnvSaveState('queued');
      } catch {
        setEnvSaveState('error');
        recordLocally({});
      }
    } finally {
      setEnvSaving(false);
    }
  };

  const handleUpdateTestPlanStatus = async (testType, status, rationale) => {
    const previous = (testPlanData || []).find((item) => item.test_type === testType);
    const nextItems = (testPlanData || []).map((item) =>
      item.test_type === testType ? { ...item, status, rationale } : item
    );
    setTestPlanData(nextItems);
    const payload = { test_type: testType, status, rationale: rationale || null };
    if (session.id && !isLocalId(session.id)) {
      try {
        const updated = await api.updateTestPlan(session.id, payload);
        setTestPlanData((items) => items.map((item) => item.test_type === testType ? { ...item, ...(updated || payload) } : item));
        setApiError('');
      } catch (err) {
        setTestPlanData((items) => items.map((item) => item.test_type === testType && previous ? { ...previous } : item));
        setApiError(err.message || 'Failed to update test plan on server.');
      }
    } else if (session.id) {
      try {
        await queueOutbox({ kind: 'test-plan', sessionId: session.id, payload });
      } catch (err) {
        setApiError(err.message || 'Unable to queue test-plan change.');
      }
    }
  };

  const handleUpdateChecklistItem = async ({ clause, item_key, outcome, remarks }) => {
    if (session.id && !isLocalId(session.id)) {
      const key = `${clause}:${item_key}`;
      if (checklistUpdating === key) return;
      setChecklistUpdating(key);
      try {
        await api.updateChecklistItem(session.id, {
          clause,
          item_key,
          outcome,
          remarks: remarks || null,
        });
        const refreshed = await api.checklist(session.id);
        setChecklistData(refreshed || { items: [], progress: {} });
        setApiError('');
      } catch (err) {
        setApiError(err.message || 'Failed to record checklist outcome.');
      } finally {
        setChecklistUpdating(null);
      }
    } else if (session.id) {
      const updatedItems = (checklistData.items || []).map((i) =>
        i.clause === clause && i.item_key === item_key ? { ...i, outcome, remarks } : i
      );
      setChecklistData({ ...checklistData, items: updatedItems });
      try {
        await queueOutbox({ kind: 'checklist', sessionId: session.id, payload: { clause, item_key, outcome, remarks: remarks || null } });
      } catch (err) {
        setApiError(err.message || 'Unable to queue checklist change.');
      }
    }
  };

  // One click for the common case: every remaining item checked and passed.
  const handleBulkPassChecklist = async () => {
    if (!session.id || isLocalId(session.id) || checklistBulk) return;
    const open = (checklistData.items || []).filter((i) => i.outcome === 'UNCHECKED');
    setChecklistBulk(true);
    try {
      for (const item of open) {
        await api.updateChecklistItem(session.id, {
          clause: item.clause,
          item_key: item.item_key,
          outcome: 'PASSED',
          remarks: item.remarks || null,
        });
      }
      setApiError('');
    } catch (err) {
      setApiError(err.message || 'Failed to record checklist outcomes.');
    } finally {
      try {
        setChecklistData(await api.checklist(session.id));
      } catch {
        // keep the last known state
      }
      setChecklistBulk(false);
    }
  };

  const handleSeedChecklist = async () => {
    if (!session.id || isLocalId(session.id)) return;
    setSeedingChecklist(true);
    try {
      await api.seedChecklist(session.id);
      const refreshed = await api.checklist(session.id);
      setChecklistData(refreshed);
    } catch (err) {
      setApiError(err.message || 'Failed to seed checklist.');
    } finally {
      setSeedingChecklist(false);
    }
  };

  const openReport = async () => {
    try {
      const report = (await api.reports()).find((r) => r.session_id === session.id);
      setLocation(report?.id ? `/reports/${report.id}` : '/reports');
    } catch {
      setLocation('/reports');
    }
  };

  const handleFinalize = async () => {
    if (!canEdit) {
      setFinalizeError('Approving officers may review reports but cannot finalize evaluations.');
      return;
    }
    if (!session.id || isLocalId(session.id)) {
      setFinalizeError('Session must be synchronized with the server to finalize.');
      return;
    }
    setFinalizing(true);
    setFinalizeError('');
    try {
      mergeServerSession(await api.finalize(session.id));
      setFinalized(true);
      // Retrieve generated report and navigate to view
      await openReport();
    } catch (err) {
      setFinalizeError(err.message || 'Finalization was rejected by the evaluation service.');
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    if (current?.kind !== 'verdict' || !session.id || isLocalId(session.id)) return;
    let cancelled = false;
    api.summary(session.id)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [current?.kind, session.id, observations.length, checklistData, driftInfo]);

  const planMap = useMemo(() => new Map(testPlanData.map((item) => [item.test_type, item])), [testPlanData]);
  const screenComplete = (screen) => {
    if (!screen) return false;
    if (screen.kind === 'identification') return Boolean(session.instrument_id || session.instrumentId || session.model);
    // Only the start temperature gates the tests: the end temperature is taken
    // when the tests are done, and the Verdict screen (and the server's
    // finalize gate) require it then. A typed-but-unsaved value does not count.
    if (screen.kind === 'environment') return hasValue(session.start_temp_c);
    if (screen.kind === 'test_plan') return testPlanData.length > 0;
    if (screen.kind === 'checklist') {
      const progress = checklistData.progress || {};
      return Number(progress.total || checklistData.items?.length || 0) > 0 && Number(progress.open || progress.unchecked || 0) === 0;
    }
    if (screen.kind === 'test') {
      const module = TEST_MODULES.find((item) => item.testType === screen.testType);
      return moduleStatus(module, observations, planMap.get(screen.testType)).complete;
    }
    return completionInfo.ready;
  };
  const completionInfo = useMemo(
    () => computeTestPlanCompletion(testPlanData, observations),
    [testPlanData, observations]
  );
  const canOpenScreen = (index) => index <= screenIndex || screens.slice(0, index).every(screenComplete);
  const goNext = () => {
    if (!screenComplete(current)) return;
    setScreenIndex(Math.min(screens.length - 1, screenIndex + 1));
  };
  const goBack = () => setScreenIndex(Math.max(0, screenIndex - 1));
  const isLastScreen = screenIndex === screens.length - 1;

  const renderScreen = () => {
    if (current.kind === 'identification') return <IdentificationModule session={session} />;

    if (current.kind === 'environment') {
      return (
        <EnvironmentModule
          values={envValues}
          setValues={setEnvValues}
          onSave={saveEnvironment}
          saving={envSaving}
          saveState={envSaveState}
          driftInfo={driftInfo}
          driftLoading={driftLoading}
          startValues={session}
          needsStartTemp={!hasValue(session.start_temp_c)}
          readOnly={isFinal || !canEdit}
        />
      );
    }

    if (current.kind === 'test_plan') {
      return (
        <TestPlanModule
          testPlanItems={testPlanData}
          observations={observations}
          onUpdateStatus={handleUpdateTestPlanStatus}
          completionInfo={completionInfo}
          canEdit={canEdit}
        />
      );
    }

    if (current.kind === 'checklist') {
      return (
        <ChecklistModule
          checklist={checklistData}
          onUpdateItem={handleUpdateChecklistItem}
          onBulkPass={canEdit ? handleBulkPassChecklist : undefined}
          bulkUpdating={checklistBulk}
          updatingItem={checklistUpdating}
          onSeed={handleSeedChecklist}
          seeding={seedingChecklist}
        />
      );
    }

    if (current.kind === 'verdict') {
      return (
        <VerdictModule
          session={session}
          observations={observations}
          driftInfo={driftInfo}
          testPlanItems={testPlanData}
          checklist={checklistData}
          summary={summary}
          onFinalize={handleFinalize}
          finalizing={finalizing}
          finalizeError={finalizeError}
          canFinalize={canEdit}
          onEditEnvironment={() => setScreenIndex(screens.findIndex((s) => s.kind === 'environment'))}
        />
      );
    }

    const module = TEST_MODULES.find((m) => m.testType === current.testType);
    const status = module ? moduleStatus(module, observations) : { have: 0, need: 1, complete: false };

    if (current.testType === 'eccentricity') {
      return (
        <EccentricityModule
          reading={reading}
          setReading={setReading}
          rows={rowsFor('eccentricity')}
          onAdd={(position) => addReading('eccentricity', position)}
          unit={session.unit || 'g'}
          liveValidation={liveValidation}
          appliedLoad={appliedLoad}
          setAppliedLoad={setAppliedLoad}
          activePosition={activePosition}
          setActivePosition={setActivePosition}
        />
      );
    }

    if (current.testType === 'creep') {
      return (
        <CreepModule
          value={reading}
          setValue={setReading}
          appliedLoad={appliedLoad}
          setAppliedLoad={setAppliedLoad}
          source={source}
          setSource={setSource}
          liveValidation={liveValidation}
          unit={session.unit || 'g'}
          rows={rowsFor('creep')}
          elapsedMs={creepElapsedMs}
          running={creepTimer.running}
          onStart={startCreepTimer}
          onStop={stopCreepTimer}
          onReset={resetCreepTimer}
          onFastForward={fastForwardCreepTimer}
          onCapture={(position) => addReading('creep', position)}
        />
      );
    }

    if (current.testType === 'discrimination') {
      return (
        <DiscriminationModule
          session={session}
          rows={rowsFor('discrimination')}
          onAdd={(params) =>
            addReading('discrimination', null, {
              appliedLoadOverride: params.applied_load,
              indicationOverride: params.indication,
              additionalLoad: params.additional_load,
              secondIndication: params.second_indication,
              zeroError: params.zero_error,
            })
          }
          preview={(fields) => previewFor('discrimination', fields)}
          unit={session.unit || 'g'}
          source={source}
          setSource={setSource}
        />
      );
    }

    if (current.testType === 'temperature_no_load') {
      return (
        <TemperatureNoLoadModule
          session={session}
          rows={rowsFor('temperature_no_load')}
          onAdd={(params) =>
            addReading('temperature_no_load', null, {
              appliedLoadOverride: '0',
              indicationOverride: params.indication,
              additionalLoad: params.additional_load,
              zeroError: params.zero_error,
              chamberTemperature: params.chamber_temperature_c,
            })
          }
          preview={(fields) => previewFor('temperature_no_load', fields)}
          unit={session.unit || 'g'}
          source={source}
          setSource={setSource}
        />
      );
    }

    if (['damp_heat', 'voltage_variations', 'sensitivity', 'equilibrium', 'tilting', 'warm_up', 'span_stability', 'endurance', 'emc_disturbances'].includes(current.testType)) {
      return (
        <R76ProcedureModule
          testType={current.testType}
          module={module}
          session={session}
          rows={rowsFor(current.testType)}
          onAdd={(params) => addReading(current.testType, params.position || null, {
            appliedLoadOverride: params.applied_load,
            indicationOverride: params.indication,
            additionalLoad: params.additional_load,
            zeroError: params.zero_error,
            customSource: params.source,
          })}
          preview={(fields) => previewFor(current.testType, fields)}
          unit={session.unit || 'g'}
          source={source}
          setSource={setSource}
        />
      );
    }

    return (
      <ReadingModule
        title={module?.label || 'Test Reading'}
        description={`${module?.hint || ''} (need ${status.need} reading${status.need === 1 ? '' : 's'} — ${status.have} captured.)`}
        value={reading}
        setValue={setReading}
        appliedLoad={appliedLoad}
        setAppliedLoad={setAppliedLoad}
        source={source}
        setSource={setSource}
        preview={(fields) => previewFor(module?.testType || current.testType, fields)}
        rows={rowsFor(module?.testType || current.testType)}
        requiredCount={module?.need || status.need || 1}
        onAdd={(extra) => addReading(module?.testType || current.testType, null, extra)}
        unit={session.unit || 'g'}
        sessionId={session.id}
      />
    );
  };

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">Active evaluation</div>
          <h1 className="page-title mt-2">{session.model || session.asset || 'Instrument'}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#66837d]">
            <span className="font-mono">SN {session.serial || '—'}</span>
            <span className="h-1 w-1 rounded-full bg-[#9ab0a9]" />
            <span>{trimDecimal(session.capacity) || '—'} {session.unit || 'g'} max</span>
            <span className="h-1 w-1 rounded-full bg-[#9ab0a9]" />
            <span className="rounded bg-[#edf4ef] px-2 py-0.5 text-[10px] font-semibold text-[#2e7568]">
              {session.evaluation_mode === 'in_service' ? 'In-Service' : 'Initial Verification'}
            </span>
            <span className="h-1 w-1 rounded-full bg-[#9ab0a9]" />
            <span className="flex items-center gap-1.5">
              <span className="status-dot" />
              {isLocalId(session.id)
                ? syncState === 'syncing'
                  ? 'Syncing'
                  : syncState === 'failed'
                  ? 'Sync failed'
                  : 'Local draft'
                : syncState === 'syncing'
                ? 'Syncing'
                : syncState === 'failed'
                ? 'Sync failed'
                : 'Server ready'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" size="sm" onClick={() => setShowNote(!showNote)} data-testid="button-session-note">
            <FileText size={14} /> Note
          </Button>
          <Button variant="quiet" size="sm" onClick={() => persist()} data-testid="button-save-session">
            <Save size={14} /> {saved ? 'Saved locally' : 'Save draft'}
          </Button>
        </div>
      </div>

      {isFinal && (
        <div className="panel mb-6 flex flex-wrap items-center justify-between gap-3 border-[#9bc8bb] bg-[#eaf4ef] p-4 text-xs text-[#2e7568]" data-testid="text-session-sealed">
          <span>
            This evaluation is {session.status === 'approved' ? 'approved' : 'finalized'}: its readings and conditions are sealed in the report.
          </span>
          <Button size="sm" variant="quiet" onClick={() => void openReport()} data-testid="button-open-sealed-report">
            <FileText size={14} /> View report
          </Button>
        </div>
      )}

      {apiError && (
        <div className="panel mb-6 border-[#e7b5ae] bg-[#fff5f3] p-4 text-xs text-[#a6423b]">{apiError}</div>
      )}

      {showNote && (
        <div className="panel mb-6 p-4 animate-rise">
          <label className="eyebrow" htmlFor="session-note">Session note</label>
          <div className="mt-3 flex gap-3">
            <input
              id="session-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for the approving officer…"
              className="min-w-0 flex-1 rounded-md border border-[#c9d9d1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c69852]"
              data-testid="input-session-note"
            />
            <Button size="sm" onClick={() => { persist(); setShowNote(false); }} data-testid="button-save-note">
              Save note
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="panel h-fit max-h-[85vh] overflow-y-auto p-4">
          <div className="eyebrow mb-5 px-2">Evaluation Workflow</div>
          <div>
            {screens.map((screen, index) => {
              const active = index === screenIndex;
              const module = screen.kind === 'test' ? TEST_MODULES.find((m) => m.testType === screen.testType) : null;
              const status = module ? moduleStatus(module, observations, planMap.get(module.testType)) : null;
              const complete = screenComplete(screen);
              const locked = !canOpenScreen(index);
              return (
                <button
                  key={screen.label}
                  onClick={() => !locked && setScreenIndex(index)}
                  disabled={locked}
                  className={`module-step flex w-full items-start gap-3 px-2 py-2.5 text-left ${complete ? 'complete' : ''} ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
                  data-testid={`button-module-${index + 1}`}
                >
                  <span
                    className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] ${
                      active
                        ? 'border-[#c69852] bg-[#17333c] text-[#f3e8d0]'
                        : complete
                        ? 'border-[#2e7568] bg-[#dceee8] text-[#2e7568]'
                        : 'border-[#c9d9d1] bg-[#f4f7f3] text-[#7b9690]'
                    }`}
                  >
                    {complete ? <Check size={14} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="pt-1">
                    <span className={`block text-xs ${active ? 'font-semibold text-[#17333c]' : 'text-[#66837d]'}`}>
                      {screen.label}
                    </span>
                    <span className="mt-1 block font-mono text-[9px] text-[#9ab0a9]">
                      {status ? `${status.have}/${status.need}` : complete ? 'COMPLETE' : locked ? 'LOCKED' : active ? 'CURRENT' : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-[#d7e0db] px-2 pt-4">
            <div className="flex items-center gap-2 text-[10px] text-[#66837d]">
              <CloudOff size={13} /> {isLocalId(session.id) ? 'Not yet synced to server' : 'Synced with server'}
            </div>
          </div>
        </aside>

        <section className="panel min-h-[560px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#d7e0db] px-5 py-4 md:px-7">
            <div>
              <div className="eyebrow">
                Screen {String(screenIndex + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
              </div>
              <h2 className="mt-1 text-xl font-semibold">{current.label}</h2>
            </div>
          </div>

          <div className="border-b border-[#d7e0db] bg-[#fbfdfb] px-5 py-3 md:px-7">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[#66837d]">
              <span>Applicable procedures</span>
              <span>{completionInfo.applicableCompleted} / {completionInfo.applicableTotal}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#d7e0db]"><div className="h-full rounded-full bg-[#2e7568] transition-all" style={{ width: `${completionInfo.applicableProgress}%` }} /></div>
          </div>

          <div className="p-5 md:p-7">{renderScreen()}</div>

          <div className="flex flex-col-reverse gap-3 border-t border-[#d7e0db] bg-[#fbfdfb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-7">
            <Button
              variant="quiet"
              size="sm"
              onClick={goBack}
              disabled={screenIndex === 0}
              data-testid="button-previous-module"
            >
              <ArrowLeft size={14} /> Previous
            </Button>
            <div className="flex items-center gap-3">
              {!isLastScreen ? (
                <Button size="sm" onClick={goNext} disabled={!screenComplete(current)} data-testid="button-next-module">
                  Continue <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleFinalize}
                  disabled={finalized || finalizing || isLocalId(session.id)}
                  data-testid="button-finalize-report"
                >
                  {finalized ? 'Finalized' : finalizing ? 'Finalizing…' : 'Finalize evaluation'} <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ActiveSession;
