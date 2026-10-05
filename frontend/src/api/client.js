import { clearWorkingSession } from '@/lib/offlineStore';

// Backend API client — aligned with OIML R-76 FastAPI backend contracts.
// All metrology values travel as decimal STRINGS, never binary floats.
const BASE = import.meta.env.VITE_API_URL || '/api/v1';
const ACCESS_KEY = 'nawi-access-token';
const REFRESH_KEY = 'nawi-refresh-token';
const jsonHeaders = { 'Content-Type': 'application/json' };

function formatErrorMessage(status, data) {
  if (!data) return `Request failed (${status})`;
  if (typeof data === 'string') return data;
  if (data.detail) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      // Pydantic 422 validation errors array
      return data.detail
        .map((e) => {
          const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== 'body').join('.') : '';
          return `${loc ? `${loc}: ` : ''}${e.msg || 'Invalid value'}`;
        })
        .join(', ');
    }
    return JSON.stringify(data.detail);
  }
  if (data.message) return data.message;
  if (data.error) return data.error;
  return `Request failed (${status})`;
}

/**
 * Network-level failure (fetch itself threw): backend unreachable, wrong
 * host/port, connection refused, DNS failure, or a blocked CORS request.
 * Distinct from HTTP errors (4xx/5xx), which carry server-provided detail.
 */
function networkError(context) {
  const err = new Error('Unable to connect to the backend. Check that the API server is running.');
  err.network = true;
  if (context) err.context = context;
  return err;
}

// One refresh at a time: parallel 401s share the same refresh call.
let refreshInFlight = null;

function refreshTokens() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return false;
      try {
        const rr = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!rr.ok) return false;
        setTokens(await rr.json());
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// The stored login is no longer valid: clear it and go to the sign-in page.
// Public pages (landing, report verification) never redirect.
function handleExpiredLogin() {
  const path = window.location.pathname;
  const isPublic = path === '/' || path.startsWith('/verify/') || path === '/login';
  const wasSignedIn = localStorage.getItem('nawi-authenticated') === '1';
  if (!wasSignedIn || isPublic) return;
  clearTokens();
  window.location.assign('/login');
}

async function request(path, options = {}, retry = true) {
  const method = options.method || 'GET';
  const headers = { ...(options.body instanceof FormData ? {} : jsonHeaders), ...(options.headers || {}) };
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    // Genuine network/CORS/DNS failure — never a server-side rejection.
    throw networkError(`${method} ${path}`);
  }
  const isAuthCall = path.startsWith('/auth/');
  if (res.status === 401 && retry && !isAuthCall) {
    if (await refreshTokens()) return request(path, options, false);
    handleExpiredLogin();
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const d = await res.json();
      msg = formatErrorMessage(res.status, d);
    } catch {
      // no JSON body on error
    }
    // A failed sign-in keeps the server's reason ("invalid credentials").
    if (res.status === 401 && !isAuthCall) msg = 'Session expired. Please sign in again.';
    else if (res.status >= 500) msg = `Server error: ${msg}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export function setTokens(d) {
  if (d.access_token) localStorage.setItem(ACCESS_KEY, d.access_token);
  if (d.refresh_token) localStorage.setItem(REFRESH_KEY, d.refresh_token);
  localStorage.setItem('nawi-authenticated', '1');
  const user = d.user || { role: d.role, full_name: d.full_name };
  localStorage.setItem('nawi-user', JSON.stringify(user));
}

export function clearTokens() {
  // 'nawi-judge-mode': TEMPORARY judge access (components/JudgeAccess.jsx).
  [ACCESS_KEY, REFRESH_KEY, 'nawi-authenticated', 'nawi-user', 'nawi-session', 'nawi-local-mode', 'nawi-judge-mode'].forEach((k) => localStorage.removeItem(k));
  // The next person signing in on this browser must not land in this
  // user's working session.
  void clearWorkingSession().catch(() => {});
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  refresh: (refreshToken) => request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),
  me: () => request('/users/me'),
  // TEMPORARY judge access (SIH evaluation): password-less demo roles,
  // available only while the backend has DEMO_ROLE_LOGIN on.
  demoAccess: () => request('/auth/demo'),
  demoLogin: (role) => request('/auth/demo/login', { method: 'POST', body: JSON.stringify({ role }) }),
  ruleset: () => request('/ruleset'),

  // Instruments — returns { total, skip, limit, items }
  instruments: async (q = '', skip = 0, limit = 50) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (skip > 0) params.set('skip', String(skip));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await request(`/instruments${qs ? `?${qs}` : ''}`);
    return {
      total: res?.total ?? (Array.isArray(res) ? res.length : 0),
      skip: res?.skip ?? 0,
      limit: res?.limit ?? 50,
      items: Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [],
    };
  },
  instrument: (id) => request(`/instruments/${id}`),
  createInstrument: (x) => request('/instruments', { method: 'POST', body: JSON.stringify(x) }),

  // Sessions — returns { total, skip, limit, items }
  sessions: async (skip = 0, limit = 50) => {
    const params = new URLSearchParams();
    if (skip > 0) params.set('skip', String(skip));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await request(`/sessions${qs ? `?${qs}` : ''}`);
    return {
      total: res?.total ?? (Array.isArray(res) ? res.length : 0),
      skip: res?.skip ?? 0,
      limit: res?.limit ?? 50,
      items: Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [],
    };
  },
  session: (id) => request(`/sessions/${id}`),
  createSession: (x) => request('/sessions', { method: 'POST', body: JSON.stringify(x) }),
  patchSession: (id, x) => request(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(x) }),
  drift: (id) => request(`/sessions/${id}/drift`),

  // Observations — sequence_no is mandatory
  observations: (id) => request(`/sessions/${id}/observations`),
  addObservation: (id, x) => request(`/sessions/${id}/observations`, { method: 'POST', body: JSON.stringify(x) }),
  syncBatch: (id, items) =>
    request(`/sessions/${id}/observations:batch`, { method: 'POST', body: JSON.stringify({ items }) }),

  // Test Plan / Applicability
  testPlan: (sessionId) => request(`/sessions/${sessionId}/test-plan`),
  updateTestPlan: (sessionId, body) =>
    request(`/sessions/${sessionId}/test-plan`, { method: 'PUT', body: JSON.stringify(body) }),

  // Checklist (Sheet 17)
  checklist: (sessionId) => request(`/sessions/${sessionId}/checklist`),
  seedChecklist: (sessionId) => request(`/sessions/${sessionId}/checklist/seed`, { method: 'POST' }),
  updateChecklistItem: (sessionId, body) =>
    request(`/sessions/${sessionId}/checklist/items`, { method: 'PUT', body: JSON.stringify(body) }),

  // Finalization + the server's authoritative verdict for a session
  finalize: (id) => request(`/sessions/${id}/finalize`, { method: 'POST' }),
  summary: (id) => request(`/sessions/${id}/summary`),

  // Reports
  reports: async () => {
    const res = await request('/reports');
    return Array.isArray(res) ? res : (res?.items || []);
  },
  report: (id) => request(`/reports/${id}`),
  downloadUrl: (id) => `${BASE}/reports/${encodeURIComponent(id)}/download`,
  downloadDocxUrl: (id) => `${BASE}/reports/${encodeURIComponent(id)}/docx`,
  verify: (id) => request(`/public/verify/${encodeURIComponent(id)}`),

  // Sign-off (Officer approval)
  sign: (sessionId, reportId) => {
    const qs = reportId ? `?report_id=${encodeURIComponent(reportId)}` : '';
    return request(`/reports/sessions/${sessionId}/sign${qs}`, { method: 'POST' });
  },

  // Attachments
  attachments: (sessionId) => request(`/sessions/${sessionId}/attachments`),
  upload: async (sessionId, file) => {
    const f = new FormData();
    f.append('file', file);
    return request(`/sessions/${sessionId}/attachments`, { method: 'POST', body: f });
  },

  // Governance / audit (Admin only)
  audit: (limit = 100) => request(`/users/audit?limit=${limit}`),
  auditVerify: () => request('/users/audit/verify'),
};

export async function downloadFile(id, kind = 'pdf') {
  const url = kind === 'docx' ? api.downloadDocxUrl(id) : api.downloadUrl(id);
  const authed = () => {
    const token = localStorage.getItem(ACCESS_KEY);
    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  let r = await authed();
  if (r.status === 401 && (await refreshTokens())) r = await authed();
  if (!r.ok) {
    let msg = `Unable to download report (${kind})`;
    try {
      const d = await r.json();
      msg = d.detail || msg;
    } catch {
      // not json
    }
    throw new Error(msg);
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `pattern-evaluation-report-${id}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
}

export const downloadReport = (id) => downloadFile(id, 'pdf');

// True only when the NAWI backend itself answers (checked through the same
// /api proxy as every other call, and by content — a dev server's HTML page
// or another app on the port must not count as "connected").
export async function health() {
  try {
    const r = await fetch(`${BASE}/health`, { cache: 'no-store' });
    if (!r.ok) return false;
    const body = await r.json();
    return body?.status === 'ok' && body?.service === 'nawi-backend';
  } catch {
    return false;
  }
}

