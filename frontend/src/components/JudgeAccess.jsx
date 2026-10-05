// TEMPORARY judge access for the SIH evaluation.
//
// Renders nothing unless the backend has DEMO_ROLE_LOGIN on (GET /auth/demo),
// so no password ever ships in this public bundle. Signed out, it shows a role
// picker over the site; signed in through it, a slim bar to switch roles or
// leave. The public QR verification page is never covered.
//
// To remove after judging: turn DEMO_ROLE_LOGIN off on the server, or delete
// this file and its line in App.jsx (backend: routers/demo_access.py).
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, ClipboardCheck, Loader2, LogOut, ShieldCheck, Stamp, UserCheck } from 'lucide-react';
import { api, clearTokens, setTokens } from '@/api/client';

const ROLES = {
  lab_technician: {
    label: 'Lab technician',
    icon: ClipboardCheck,
    home: '/dashboard',
    detail: 'Run an R-76 evaluation: enter readings, see PASS or FAIL as you type, then finalize a sealed report.',
  },
  approving_officer: {
    label: 'Approving officer',
    icon: Stamp,
    home: '/reports',
    detail: 'Open a sealed report, check its QR seal and approve it with your signature.',
  },
  admin: {
    label: 'Administrator',
    icon: ShieldCheck,
    home: '/dashboard',
    detail: 'Review the instrument registry and the tamper-evident audit log.',
  },
};

// Set when a session was opened through this picker (cleared by clearTokens).
const JUDGE_FLAG = 'nawi-judge-mode';
const DISMISSED = 'nawi-judge-picker-dismissed';

// One status request per page load, shared by every render.
let statusRequest = null;
function loadStatus() {
  if (!statusRequest) statusRequest = api.demoAccess().catch(() => ({ enabled: false, roles: [] }));
  return statusRequest;
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // private mode: the picker simply reappears on the next page load
  }
}

export default function JudgeAccess() {
  const [location] = useLocation();
  const [roles, setRoles] = useState([]);
  const [dismissed, setDismissed] = useState(() => readSession(DISMISSED) === '1');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadStatus().then((status) => {
      if (live && status?.enabled) setRoles((status.roles || []).filter((role) => ROLES[role]));
    });
    return () => {
      live = false;
    };
  }, []);

  if (!roles.length) return null;

  const signedIn = localStorage.getItem('nawi-authenticated') === '1';
  const judgeRole = signedIn ? localStorage.getItem(JUDGE_FLAG) : null;

  const enter = async (role) => {
    setBusy(role);
    setError('');
    try {
      setTokens(await api.demoLogin(role));
      localStorage.setItem(JUDGE_FLAG, role);
      // Full load: every page re-reads the signed-in user and its role.
      window.location.assign(ROLES[role].home);
    } catch (err) {
      setError(err.message || 'Could not open that role. Please try again.');
      setBusy(null);
    }
  };

  const exit = () => {
    clearTokens();
    writeSession(DISMISSED, null);
    window.location.assign('/');
  };

  if (judgeRole && ROLES[judgeRole]) {
    return <JudgeBar current={judgeRole} roles={roles} busy={busy} error={error} onSwitch={enter} onExit={exit} />;
  }
  // A real account, or the public QR check: no judge UI.
  if (signedIn || location.startsWith('/verify/')) return null;
  if (dismissed) {
    return (
      <ReopenButton
        onClick={() => {
          writeSession(DISMISSED, null);
          setDismissed(false);
        }}
      />
    );
  }
  return (
    <RolePicker
      roles={roles}
      busy={busy}
      error={error}
      onPick={enter}
      onDismiss={() => {
        writeSession(DISMISSED, '1');
        setDismissed(true);
      }}
    />
  );
}

function RolePicker({ roles, busy, error, onPick, onDismiss }) {
  const dialogRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Modal behaviour: lock page scroll, focus the first role, keep Tab inside,
  // Escape closes. Runs once so focus does not jump on re-render.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] touch-manipulation overflow-y-auto overscroll-contain bg-[#0b2d45]/60 p-4 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0 sm:p-6">
      <div className="flex min-h-full items-center justify-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="judge-access-title"
          aria-describedby="judge-access-description"
          className="w-full max-w-[620px] rounded-[18px] border border-[var(--nawi-line)] bg-white p-6 text-left shadow-[0_24px_70px_rgba(11,45,69,0.28)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 sm:p-8"
          data-testid="judge-access-dialog"
        >
          <p className="text-sm font-bold text-[var(--nawi-teal)]">Judge access</p>
          <h2
            id="judge-access-title"
            className="mt-2 text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--nawi-ink)] sm:text-[30px]"
          >
            Choose a role to explore <span translate="no">NAWI</span>
          </h2>
          <p id="judge-access-description" className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--nawi-ink-soft)]">
            No password needed during evaluation. Each role opens the live workspace with that role's permissions.
          </p>

          <div className="mt-6 grid gap-3">
            {roles.map((role) => {
              const { label, detail, icon: Icon } = ROLES[role];
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => onPick(role)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-4 rounded-xl border border-[var(--nawi-line)] bg-white p-4 text-left transition-colors duration-150 hover:border-[var(--nawi-teal)] hover:bg-[var(--nawi-teal-soft)] focus-visible:border-[var(--nawi-teal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nawi-teal)]/40 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                  data-testid={`button-judge-role-${role}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--nawi-teal-soft)] text-[var(--nawi-teal)]">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-[var(--nawi-ink)]">{label}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-[var(--nawi-ink-soft)]">{detail}</span>
                  </span>
                  {busy === role ? (
                    <Loader2 size={18} className="shrink-0 animate-spin text-[var(--nawi-teal)]" aria-label="Opening…" />
                  ) : (
                    <ArrowRight size={18} className="shrink-0 text-[var(--nawi-ink-soft)]" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-[#e7b5ae] bg-[#fff5f3] px-3 py-2 text-sm text-[#a6423b]">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--nawi-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-snug text-[var(--nawi-ink-soft)] sm:max-w-[40ch]">
              Demo accounts are shared by all evaluators, so records you create are visible to others.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="button-quiet shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nawi-teal)]/40"
              data-testid="button-judge-dismiss"
            >
              Browse the site first
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReopenButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[60] inline-flex items-center gap-2 rounded-full bg-[var(--nawi-ink)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(11,45,69,0.3)] transition-colors hover:bg-[#16476b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nawi-brass)] focus-visible:ring-offset-2"
      data-testid="button-judge-reopen"
    >
      <UserCheck size={17} aria-hidden="true" />
      Judge access
    </button>
  );
}

function JudgeBar({ current, roles, busy, error, onSwitch, onExit }) {
  return (
    <div role="region" aria-label="Judge mode" className="relative z-[40] border-b border-white/15 bg-[var(--nawi-ink)] text-[#eaf2f8]" data-testid="judge-mode-bar">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-[13px] sm:px-6">
        <span className="inline-flex items-center gap-2 font-semibold text-white">
          <UserCheck size={15} aria-hidden="true" />
          Judge mode
        </span>
        <span className="text-[#b9cde0]">
          Signed in as <strong className="font-semibold text-white">{ROLES[current].label}</strong>
          <span className="hidden sm:inline"> (shared demo account)</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto" role="group" aria-label="Switch role">
          <span className="hidden text-[#b9cde0] md:inline">Switch to</span>
          {roles
            .filter((role) => role !== current)
            .map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onSwitch(role)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nawi-brass)] disabled:cursor-wait disabled:opacity-60"
                data-testid={`button-judge-switch-${role}`}
              >
                {busy === role && <Loader2 size={13} className="animate-spin" aria-label="Opening…" />}
                {ROLES[role].label}
              </button>
            ))}
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-[#ffd2a8] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nawi-brass)]"
            data-testid="button-judge-exit"
          >
            <LogOut size={14} aria-hidden="true" />
            Exit judge mode
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-[1440px] px-4 pb-2 text-[13px] text-[#ffd2a8] sm:px-6">
          {error}
        </p>
      )}
    </div>
  );
}
