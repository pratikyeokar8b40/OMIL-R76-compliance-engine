import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  FileCheck2,
  Plus,
  Thermometer,
} from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import { StatCard } from '@/components/Card';
import Button from '@/components/Button';
import { loadWorkingSession } from '@/lib/offlineStore';
import { api } from '@/api/client';
import { normalizeDrift } from '@/lib/drift';

function formatTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function Home() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState(null);
  const [serverSessions, setServerSessions] = useState([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [environment, setEnvironment] = useState(null);
  const [environmentError, setEnvironmentError] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nawi-session');
      if (raw) setSession(JSON.parse(raw));
    } catch {
      setSession(null);
    }
    loadWorkingSession((stored) => {
      if (stored?.asset && stored?.serial) {
        setSession(stored);
      }
    });

    api
      .sessions(0, 50)
      .then((res) => {
        const items = res?.items || (Array.isArray(res) ? res : []);
        setServerSessions(items);
      })
      .catch(() => {});

    api
      .reports()
      .then((r) => setReportsCount(Array.isArray(r) ? r.length : 0))
      .catch(() => {});
  }, []);

  // Live environment/drift reading for whichever session is actually active
  useEffect(() => {
    const liveSessionId = session?.id && !String(session.id).startsWith('local-') ? session.id : null;
    if (!liveSessionId) {
      setEnvironment(null);
      return;
    }
    api
      .drift(liveSessionId)
      .then((raw) => setEnvironment(normalizeDrift(raw)))
      .catch(() => setEnvironmentError(true));
  }, [session?.id]);

  const openSessionsCount = serverSessions.filter(
    (s) => s.status !== 'completed' && s.status !== 'approved'
  ).length;

  const completedCount = serverSessions.filter(
    (s) => s.status === 'completed' || s.status === 'approved'
  ).length;

  const passRateText =
    serverSessions.length > 0
      ? `${Math.round((completedCount / serverSessions.length) * 1000) / 10}%`
      : '—';

  return (
    <div>
      <SectionHeader
        eyebrow="Operations"
        title="Bench overview."
        detail="Current sessions, reports, and environment."
        action={
          <Button onClick={() => setLocation('/evaluations/new')} data-testid="button-start-evaluation">
            <Plus size={16} />
            Start evaluation
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-rise">
          <StatCard
            label="Open sessions"
            value={String(openSessionsCount).padStart(2, '0')}
            detail={
              serverSessions.length
                ? 'From server session records'
                : session
                ? 'Local draft not yet synced'
                : 'No active evaluations'
            }
            icon={Activity}
            tone="teal"
          />
        </div>
        <div className="animate-rise animate-delay-1">
          <StatCard
            label="Reports in archive"
            value={String(reportsCount).padStart(2, '0')}
            detail="Completed reports"
            icon={FileCheck2}
          />
        </div>
        <div className="animate-rise animate-delay-2">
          <StatCard
            label="Completion rate"
            value={passRateText}
            detail="Derived from server sessions"
            icon={BarChart3}
            tone="brass"
          />
        </div>
        <div className="animate-rise animate-delay-3">
          <StatCard
            label="Environment"
            value={environment ? (environment.level === 'warn' ? 'DRIFT' : 'OK') : 'No session'}
            detail={
              environment
                ? `${environment.temperature ?? '—'}°C · ${environment.humidity ?? '—'}% RH`
                : environmentError
                ? 'Drift check unavailable'
                : 'Open a session to view environment'
            }
            icon={Thermometer}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#d7e0db] px-5 py-4">
            <div>
              <div className="text-[15px] font-semibold text-[#33545a]">Work queue</div>
              <h2 className="mt-1 text-base font-semibold text-[#17333c]">Active Session</h2>
            </div>
            <Link
              href="/sessions/active"
              className="flex items-center gap-1 text-[15px] font-semibold text-[#2e7568] hover:underline"
              data-testid="link-view-session"
            >
              Open session <ArrowRight size={13} />
            </Link>
          </div>

          {session ? (
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_150px] sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="status-dot" />
                  <span className="font-mono text-[12px] uppercase tracking-[.12em] text-[#2e7568]">
                    In progress · {session.evaluation_mode === 'in_service' ? 'In-Service' : 'Initial'}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-[#17333c]">{session.asset || session.model || 'Instrument'}</h3>
                <p className="mt-1 text-[15px] text-[#66837d]">
                  Serial {session.serial || '—'} · {session.capacity || '—'} {session.unit || 'g'} max
                </p>
                <div className="mt-4 flex items-center gap-2 text-[15px] text-[#66837d]">
                  <span>Status:</span>
                  <span className="font-mono font-semibold text-[#17333c]">{session.status || 'draft'}</span>
                </div>
              </div>
              <Button
                variant="quiet"
                onClick={() => setLocation('/sessions/active')}
                data-testid="button-resume-session"
              >
                Resume session
              </Button>
            </div>
          ) : (
            <div className="grid-paper m-5 rounded-lg border border-dashed border-[#bdd1c8] px-6 py-10 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#dceee8] text-[#2e7568]">
                <ClipboardCheck size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold">No open evaluations</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#66837d]">
                Start a new evaluation to begin.
              </p>
              <Button
                size="sm"
                onClick={() => setLocation('/evaluations/new')}
                className="mt-5"
                data-testid="button-empty-start"
              >
                Create first evaluation
              </Button>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold text-[#33545a]">Bench health</div>
            <Activity size={16} className="text-[#5d7898]" />
          </div>
          {environment ? (
            <>
              <div className="mt-8 flex items-center gap-5">
                <div className="gauge-ring grid h-28 w-28 shrink-0 place-items-center">
                  <div className="text-center">
                    <div className="font-mono text-2xl text-[#102653]">
                      {environment.level === 'warn' ? 'DRIFT' : 'OK'}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-[.14em] text-[#627a98]">
                      {environment.level === 'warn' ? 'flagged' : 'stable'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xl">{environment.temperature ?? '—'}°C</div>
                  <div className="mt-1 text-xs text-[#627a98]">
                    {environment.temperatureRange || 'standard range'}
                  </div>
                  <div className="mt-4 font-mono text-xl">{environment.humidity ?? '—'}% RH</div>
                  <div className="mt-1 text-xs text-[#627a98]">
                    {environment.humidityRange || 'ambient range'}
                  </div>
                </div>
              </div>
              <div className="mt-8 border-t border-[#d7e1ec] pt-4 text-xs text-[#627a98]">
                <span className="status-dot mr-2" />
                Last checked {formatTime(environment.checkedAt)}
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-[#cbd9e8] p-6 text-center text-xs text-[#627a98]">
              {environmentError
                ? 'Could not reach the drift endpoint for this session.'
                : 'Open an active session to monitor real-time environmental drift.'}
            </div>
          )}
        </section>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#d7e0db] px-5 py-4">
          <div>
            <div className="eyebrow">Evaluations</div>
            <h2 className="mt-1 text-base font-semibold">Recent Sessions</h2>
          </div>
          <Link
            href="/reports"
            className="text-xs font-semibold text-[#2e7568] hover:underline flex items-center gap-1"
            data-testid="link-view-reports"
          >
            View reports <ArrowRight size={13} />
          </Link>
        </div>
        <div className="mobile-scroll">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] text-[10px] uppercase tracking-[.12em] text-[#7b9690]">
                <th className="px-5 py-3 font-medium">Session ID</th>
                <th className="px-5 py-3 font-medium">Mode</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {serverSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-[#7b9690]">
                    No sessions recorded on server yet.
                  </td>
                </tr>
              ) : (
                serverSessions.slice(0, 5).map((row) => (
                  <tr key={row.id} className="table-row border-b border-[#e5ece8] last:border-0">
                    <td className="px-5 py-4 font-mono font-semibold text-[#33545a]">
                      {row.id ? String(row.id).slice(0, 16) : '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-[#66837d]">
                      {row.evaluation_mode === 'in_service' ? 'In-Service' : 'Initial'}
                    </td>
                    <td className="px-5 py-4 text-[#66837d]">
                      <span className="rounded-full bg-[#dceee8] px-2.5 py-1 text-[10px] font-semibold text-[#2e7568]">
                        {row.status || 'draft'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#66837d]">{formatTime(row.created_at)}</td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                          localStorage.setItem('nawi-session', JSON.stringify(row));
                          setLocation('/sessions/active');
                        }}
                      >
                        Open <ArrowRight size={12} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Home;
