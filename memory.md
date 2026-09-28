# memory.md — Project State & AI Session Handoff

> **Document class:** State log (authority level 2 of 5 — see [rules.md](rules.md)).
> **Read this file FIRST in every session.** It tells you where the project stands, what has been decided, and where everything lives.
> **This file is append-only in its decision log.** Never delete or rewrite existing entries — add new ones.

---

## 1. Read-Me-First Order (mandatory)

1. **This file** (`memory.md`) — current state + decisions
2. [rules.md](rules.md) — binding rules you must follow
3. [phases.md](phases.md) — find the active phase and its checklist
4. [architecture.md](architecture.md) — consult for structural specifics
5. [design.md](design.md) — consult for UI/visual specifics

Then follow the startup ritual in [rules.md §3](rules.md).

---

## 2. Project Identity

| Field | Value |
|---|---|
| Project | NAWI Compliance Suite — OIML R-76 test report generator |
| Hackathon | Smart India Hackathon 2026 |
| Problem statement | **PS 26035** — Development of a Software Program/Application for Generation of Test Reports for Non-Automatic Weighing Instruments (NAWI) as per OIML R-76 |
| Theme | Miscellaneous (Ministry of Consumer Affairs, Food & Public Distribution) |
| Repository | `https://github.com/<repo-owner>/OMIL-R76-compliance-engine` (exact URL in README.md) |
| Primary branch | `main` |
| Repo layout | Monorepo: `backend/` (FastAPI) + `frontend/` (React PWA) + `docs/` + 5 planning docs at root |

---

## 3. Current Status Snapshot

> **Update this table at the end of EVERY session.** One row per phase. Do not mark complete unless the phase's "definition of done" in phases.md is met.

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Planning & governance docs | ✅ Complete | Governance docs and README reconciliation complete (P0-4) |
| 1 | Core metrology engine + tests | ✅ Complete | 27/27 pytest green; P1-2 verification done 2026-09-15 (all four classes vs official PDF) |
| 2 | Backend API + database | ✅ Complete | 16 §6 endpoints; 49/49 backend tests; D-14 drift limit verified; live HTTP smoke test passed |
| 3 | Frontend shell (auth, dashboard, PWA base) | ✅ Complete | Vite+React+Tailwind v4; TS mirror 16/16 on shared vectors; offline outbox + sync; build clean |
| 4 | Test modules (weighing, eccentricity, repeatability, tare, creep) | ✅ Complete | Rulebook-sourced requirements (`lib/requirements.ts`), eccentricity SVG grid, creep timer, watchdog banner, finalize gating; 33/33 vitest; verified live |
| 5 | Report generation (PDF/DOCX + QR seal) | ✅ Complete | Finalize generates sealed PDF/DOCX; public verification, path-free archive, and officer re-seal are implemented and tested |
| 6 | Differentiators (serial, evidence, watchdog UI, PWA install) | ⬜ Pending gates | Camera/file evidence, drift red state, and PWA install are implemented; P6-1 hardware provenance and D-30 OCR remain pending |
| 7 | Hardening, docs, SIH deliverables | ✅ Complete | Hash-chained audit log on all writes; deploy/ compose+runbook; technical documentation; seed_finale; PPT/video scripts; README reconciled (P0-4). 73/73 backend, 47/47 frontend |

**Working on right now:** Phase 7 hardening follow-up — Alembic rollout and the real-hardware serial gate remain pending while the Phase 6 checklist is not fully complete.

**Known blockers:** none.

---

## 4. Environment & Runbook

### 4.1 Local development (planned; verify commands as code lands)

```bash
# Backend (FastAPI on :8000)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
./.venv/Scripts/python -m scripts.seed               # demo users + Class III instrument
./.venv/Scripts/python -m uvicorn src.api.main:app --port 8000 --reload

# Frontend (Vite on :5173; VITE_API_BASE defaults to http://localhost:8000)
cd frontend
npm install
npm run dev

# Tests (pytest.ini sets pythonpath=. so src.engine imports resolve)
cd backend && ./.venv/Scripts/python -m pytest      # 49 tests (engine vectors + band edges + API)
cd frontend && npx vitest run                       # 16 mirror conformance tests
```

### 4.2 Tooling & versions (agreed targets)

| Tool | Target |
|---|---|
| Python | 3.11+ |
| Node | 20 LTS |
| PostgreSQL | 15+ (dev may use SQLite via SQLAlchemy until Phase 2 wires Postgres) |
| Package mgr (FE) | npm |
| Test runner (BE) | pytest |
| Lint/format | ruff (BE), eslint (FE) |

### 4.3 Reference materials (download once, keep in `docs/`)

| Document | Use |
|---|---|
| OIML R 76-1 (Edition 2006) | Metrological & technical requirements — source of ALL math (Tables 3, 6; §A.4.4.3). **Present at workspace root: `required rulebook/r076-1-e06.pdf`** (copy into `docs/` at P0-3; extractable with pypdf — Table 6 = PDF page 30, Table 3 = page 27) |
| OIML R 76-2 (Edition 2007) | Pattern Evaluation Report format — the PDF layout to replicate |
| Legal Metrology (Approval of Models) Rules, 2011 | Indian administrative wrapper (labels, lab credentials) |
| SIH 2026 PS 26035 brief | Scope + judging expectations |

---

## 5. Decision Log (append-only)

> Format: `YYYY-MM-DD | ID | Decision | Rationale`. Never edit old entries; append corrections as new entries. Dates reflect when the decision was made in planning (project pre-dates doc creation; early entries dated at doc inception).

| Date | ID | Decision | Rationale |
|---|---|---|---|
| 2026-09-14 | D-01 | Team works on PS 26035 for SIH 2026 | Low-competition, deterministic-domain fit; existing Legal Metrology domain experience |
| 2026-09-14 | D-02 | Monorepo: `backend/` + `frontend/` + `docs/` + root planning docs | Single clone, atomic cross-cutting changes during 36-h finale |
| 2026-09-14 | D-03 | Backend: FastAPI (Python) | Decimal-precise metrology math; Pydantic boundary validation; speed |
| 2026-09-14 | D-04 | Database: PostgreSQL (SQLAlchemy + Alembic) | Rigid legal schema, ACID integrity for audit trails |
| 2026-09-14 | D-05 | PDF: ReportLab (pixel-perfect path) + Docxtpl (editable DOCX path) | HTML-to-PDF pagination is unreliable for official legal layout |
| 2026-09-14 | D-06 | Frontend: React PWA, offline-first with IndexedDB | Labs have unreliable connectivity; multi-hour sessions must survive dropouts |
| 2026-09-14 | D-07 | Data ingestion: Web Serial API primary; OCR fallback | Eliminates transcription errors at source |
| 2026-09-14 | D-08 | Crypto QR seal: SHA-256 of PDF + verify URL | Tamper-evident, instantly auditable reports |
| 2026-09-14 | D-09 | Accuracy classes supported: I, II, III, IIII with MPE step tables | Full R 76-1 coverage; Class III is the demo default |
| 2026-09-14 | D-10 | Observations are append-only; corrections are new rows | Legal audit trail; no silent history edits |
| 2026-09-14 | D-11 | Verdicts computed ONLY by backend engine and stored at insert time | Single source of truth; prevents render-time tampering |
| 2026-09-14 | D-12 | Frontend TS engine is a provisional mirror, synced via `golden_vectors.json` | Offline UX without forking the math; server always wins on conflict |
| 2026-09-14 | D-13 | Five governance docs live at repo root (this file, rules, architecture, phases, design) | Any agent opening the repo sees them immediately |
| 2026-09-14 | D-14 | Drift watchdog default limit ±5 °C session delta | Provisional — MUST be confirmed against R 76-1 in Phase 1 before engine freeze |
| 2026-09-15 | D-15 | Adopted the Ponytail decision-ladder ruleset; encoded in `knowledge.md` | Minimum-code discipline that never sacrifices validation, security, error handling, or accessibility |
| 2026-09-15 | D-16 | Engine split: `contracts.py` (dataclasses), `class_rules.py` (Table 3), `error_calc.py` (E/Ec), `rounding.py` (precision policy), `mpe_rules.py` (bands + evaluate), `models.py` (Pydantic ingress) | Single-responsibility pure domain; frameworks only at the ingress edge (INV-1/INV-2) |
| 2026-09-15 | D-17 | `STRICT_VERIFIED_ONLY` gate: Classes I/II/IIII refuse evaluation until P1-2 sign-off | Unverified regulatory constants must never emit legal verdicts (INV-5) |
| 2026-09-15 | D-18 | Precision policy: internal arithmetic exact (28-digit Decimal context); reported values quantized to 6 decimal places, ROUND_HALF_UP, strictly downstream of verdicts | Presentation rounding can never flip a Pass/Fail |
| 2026-09-15 | D-19 | Engine implements INITIAL-VERIFICATION MPEs (Table 6). In-service MPEs (2×, §3.5.2) are out of scope for v1; if ever needed they must be an explicit evaluation-mode parameter, never a constant change | Pattern evaluation scope per PS 26035; silent doubling would corrupt verdicts |
| 2026-09-15 | D-20 | P1-2 VERIFICATION RECORD: all four class columns of Table 6 verified against the extracted official PDF (`required rulebook/r076-1-e06.pdf`, Table 6 on PDF page 30). Draft Class I bands corrected (0.5/1.0/1.5e at 50k/200k, unbounded 1.5e) and Class IIII corrected (0.5/1.0/1.5e at 50/200/1000 — draft rows were the §3.5.2 in-service values). `VERIFIED_CLASSES` now includes all four; strict gate retained as defense-in-depth | Wrong draft constants would have legally approved/failed real instruments |
| 2026-09-15 | D-21 | D-14 RESOLVED: drift-watchdog limit = §3.9.2.3 (zero indication ≤ 1e per 1 °C class I; 1e per 5 °C classes II/III/IIII); default static limits −10…+40 °C (§3.9.2.1). Implemented in `instrument_service.drift_watchdog` + `GET /sessions/{id}/drift` | Extracted verbatim from the official PDF; replaces the parked guess |
| 2026-09-15 | D-22 | Password hashing uses `bcrypt` directly (not passlib) — passlib is unmaintained and breaks with modern bcrypt | Ponytail rung 4: one installed dep, no dead abstraction |
| 2026-09-15 | D-23 | TS mirror reporting policy: quantity fields (`error_prior`, `corrected_error`, `mpe_limit`) use Python `str(Decimal)` minimal notation; `*_in_e` fields fixed 6 dp; message mirrors the Python floor-band wording — both engines share `golden_vectors.json` as single source of truth | Identical serialization prevents drift false-alarms in conformance tests |
| 2026-09-15 | D-24 | Phase 4 module requirements live in `frontend/src/lib/requirements.ts` with per-constant clause citations (§A.4.4.1 loads incl. 500e/2000e changeovers; eccentricity ⅓ Max + 4 quarter segments §3.6.2.1/A.4.7.1; repeatability 2×10 §A.4.10; tare ≥5 steps §A.4.6.1; creep 0/5/15/30 min + 0.5e/0.2e early-stop §A.4.11.1; zero-check 10e §A.4.2.3.2). Creep state machine is pure (`lib/creep.ts`) and unit-tested | All constants extracted verbatim from the official PDF (pages 87–92, 30); no invented numbers |
| 2026-09-15 | D-25 | Batch-sync malformed-decimal fix: `decimal.InvalidOperation` escaped the per-row SAVEPOINT and 500'd the whole batch; `_dec()` helper now converts it to a per-row rejection with reason. Regression test added (50/50 backend tests) | Found by live e2e smoke with `indication: 'bad-number'` |
| 2026-09-15 | D-26 | CORS default widened to loopback origins on ports 5173/4173 (localhost/127.0.0.1/[::1]); configurable via `CORS_ALLOW_ORIGINS`. Login error message now distinguishes server responses from unreachable-server failures | Users opening the app from [::1]:5173 got a false "are you offline?" |
| 2026-09-16 | D-27 | Template spike (P5-1) resolved: **rebuild programmatically**, not DOCX sourcing — python-docx for the editable twin, ReportLab platypus for the authoritative PDF. Both render the same immutable `ReportData` snapshot, so the formats cannot drift. python-docx chosen over Docxtpl (design doc name) because it was already the docx library candidate and avoids a template-asset pipeline for one document | Template drift risk; Docxtpl adds a build asset for marginal gain |
| 2026-09-16 | D-28 | Reports carry a **two-layer seal**: `Report.sha256` = SHA-256 of the delivered PDF bytes (byte-level tamper evidence, `reverify_bytes`); the QR embeds a *content digest* = SHA-256 over canonical JSON of `ReportData` + template version (meaning-level: survives re-render/reprint). Officer sign-off **re-renders + re-seals** so the printed signature is part of the sealed content | Single hash breaks when the file is re-rendered; QR must verify meaning not bytes |
| 2026-09-16 | D-29 | Phase 5 renderers are Latin-1-safe: standard PDF fonts cannot encode Δ/✓/✗/em-dash — ΔL header uses the Symbol-font trick, verdicts are bold words over fills (grayscale-safe per design.md §9). Never put raw Unicode beyond Latin-1 into reportlab `drawString` | PDF rendering crashes with UnicodeEncodeError on standard fonts |
| 2026-09-16 | D-30 | P6-2 OCR scope: automated 7-segment display OCR DEFERRED — tesseract.js is ~4 MB WASM with poor 7-segment accuracy outside controlled lighting; a wrong auto-read indication in legal metrology is worse than none (§7 rule 2 spirit). Camera value = tamper-evident evidence via the P2-7 attachment endpoint; trusted reading paths are the serial link (P6-1) or keyed entry. Revisit only with a lab-validated model | Wrong automated reads would poison legal records |
| 2026-09-16 | D-31 | Serial stabilization LATCHES once stable — identical frames keep the capture window open; only a load change beyond tolerance restarts collection. Without the latch the Capture button flickered disabled between identical 600 ms frames (found live in preview) | Capture window closed before the tester could click |
| 2026-09-16 | D-32 | Audit rows COMMIT independently (`record()` commits its own transaction) — services commit their writes before the router audits, and `get_db` closes without committing, so a flush-only audit row dies with the request session (found by test: empty trail despite successful create) | Audit trail silently empty in production |
| 2026-09-16 | D-33 | Audit hash payload normalizes timestamps to UTC-naive ISO text (`_at_text`): SQLite strips tzinfo on round-trip (aware at write, naive at read), so hashing `isoformat()` directly broke chain verification across sessions | Chain reported tampered on intact data |
| 2026-09-17 | D-34 | Table 3 RE-EXTRACTED verbatim from `docs/r076-1-e06.pdf` p. 27 (both extraction modes, double-transcribed): rows are keyed by class AND e-range — III coarse (5 g ≤ e) n ≥ **500** (was 100), IIII n ≥ **100** (was 10 — draft drift), II split 0.001–0.05 g / 0.1 g+ rows, e-gaps rejected; Min floors are factor × **d** per §3.4.3. `base_unit` ('kg'|'g') added to ScaleParameters (Python + TS mirror) for gram conversion; TS mirror synced — all shared vectors VAL-01…VAL-13 pass in both engines | Parking-lot model was a lossy draft; the official row structure differs materially |
| 2026-09-17 | D-35 | First-attempt login failure root cause: backend bound `::` (IPv6-only on Windows v4l2 adjacency) while the browser's `localhost` resolution alternated 127.0.0.1/::1 — cross-origin calls to `:8000` died on v4 picks. Fix: Vite dev/preview **proxy** `/api` + `/health` → `http://[::1]:8000` with `host: true` (dual-stack), client BASE now same-origin (`VITE_API_BASE` still honored for proxy-less deploys) | Removes CORS + the address-family lottery entirely; app survives backend-address changes |
| 2026-09-24 | D-36 | Influence-factor verdict semantics: temperature_no_load zero rows use a FIXED 1e limit (3.9.2.3) — NOT the 0.5e class band (keyed on test_type, so a genuine weighing row at Min=0 keeps the band); damp_heat/voltage_variations stay on the standard band (B.2/A.5.4 "within MPE"); discrimination is a RESPONSE test (I2-I1 >= d after 1.4 d, d >= 5 mg gram-denominated via _TO_GRAMS — the mg/g slip was caught by tests). Shared golden vectors DISC-01/02 + TNL-01/02 pass in both engines; report order = R 76-2 summary numbering | The class band would misjudge zero drift; discrimination is not an error test |
| 2026-09-24 | D-37 | All 17 R 76-2 tests instrumented (P4c). Fixed-limit semantics: equilibrium/EMC = 1e, tilting NO-LOAD = 2e (loaded rows keep the class band), warm-up/span-stability/endurance stay on the class band (A.5.2/B.4/3.9.4.3 say within the mpe FOR THE APPLIED LOAD). Test 17 is a checklist subsystem, NOT observations: engine catalog (condensed sheet-17 rows), append-only checklist_items with latest-wins supersession, seed idempotent, RBAC (officer read-only) + audited. Report carries sheet 17 in both renderers. Live-verified: 17 tabs, checklist interaction 0->1 passed over real HTTP | Prohibitions/markings have no numeric reading; forcing them into the observation grid would be a domain lie |

---
| 2026-09-28 | D-38 | Pre-demo audit fixes (branch `demo-fixes`). QR payload now encodes the REPORT id (allocated before rendering); `/public/verify/{id}` also accepts a session id for already-printed reports and returns instrument identity + result reasons. Default verify URL port 5174; `run.bat` sets it to the LAN IP | Printed QR codes resolved to "report not found"; a phone cannot open `localhost` |
| 2026-09-28 | D-39 | Finalize gate enforced SERVER-side with minimum readings (`test_plan_service.MIN_READINGS`: weighing 5, eccentricity 4 positions, repeatability 10, tare 5, creep positions 1-4, zero check 1), at least one observation, and start/end temperatures; downgrading a core test requires a rationale | All tests could be set optional and a zero-reading session sealed as PASS; one reading per test also finalized |
| 2026-09-28 | D-40 | Cross-reading criteria in `engine/session_checks.py`: repeatability max(E)-min(E) <= MPE per load (R 76-1 3.6.1); creep <= 0.5e over 30 min and <= 0.2e 15->30 min (3.9.4.1, else FAIL: 4 h test not recorded). One `services/evaluation_summary.py` feeds report cover, archive, public verify and `GET /sessions/{id}/summary` (UI verdict screen) | Per-row checks passed readings whose spread exceeded the MPE; UI computed its own "authoritative" verdict |
| 2026-09-28 | D-41 | Drift watchdog thresholds: amber > 2 degC, red > 5 degC start->end (configurable `drift_warn_delta_c` / `drift_red_delta_c`), replacing the unsourced 15/30 degC. Confirm against R 76-1 Annex A test conditions | A 14 degC swing was reported "ok" |
| 2026-09-28 | D-42 | Metrology columns NUMERIC(28,10) (migration b7d2e4f1a9c3, which also merges the two Alembic heads). API output keeps >= 6 dp without exponent (`rounding.format_stored`); report prints enough places for 0.5e | Class I (e = 1 mg in kg) stored E = 0.0000005 as 0.000000; `alembic upgrade head` failed on two heads |
| 2026-09-28 | D-43 | Concurrency: finalize is an atomic compare-and-set and report generation is idempotent (one report per session); audit writes take the chain lock AFTER checking out a DB connection (earlier ordering deadlocked with the pool); SQLite WAL + 30 s busy timeout | 5 double-clicks created 4 reports; concurrent writers forked the audit hash chain |
| 2026-09-28 | D-44 | Hardening: sealed sessions reject environment PATCH (and officers never PATCH); NaN/Inf/out-of-range inputs 422 not 500; batch sync validates ints/positions/supersedes and rejects floats per row; interval 1/2/5 x 10^k rule; case-insensitive serials; env physical bounds; login rate limit (10 fails/5 min per IP+email); dev JWT secret generated into git-ignored `backend/.jwt_secret` (production refuses the default); sign-off officer-only; attachments magic-byte checked, open sessions only, listed per session | Found by black-box API tests |
| 2026-09-28 | D-45 | Frontend `NAWI Frontend 7/src/lib/` committed (root `.gitignore` `lib/` rule anchored to `/lib/`); ΔL/E0 from the reading module now reach the API (snake_case keys were dropped); 4xx readings are rejected with the server message instead of being queued as "server unreachable"; health check via `/api/v1/health`; expired login redirects to sign-in; creep checkpoints gated by the timer (dev-build skip only) | Repo frontend could not build; typed dL was silently sent as 0 |

## 6. Where Things Are (living map)

> Append entries as code lands. One line per notable module. Agents: read this before searching the codebase; update it when you add or move files.

| Path | What it is | Status |
|---|---|---|
| `README.md` | Public summary, stack, runbook, and capability scope | ✅ current (P0-4) |
| `architecture.md` | Canonical system/backend architecture | ✅ current |
| `memory.md` | This file — state + decisions | ✅ current |
| `design.md` | UI/UX spec + design tokens + PDF aesthetics | ✅ current |
| `phases.md` | Roadmap, checklists, 36-h finale plan | ✅ current |
| `rules.md` | Binding rules for any AI agent | ✅ current |
| `knowledge.md` | Ponytail decision-ladder annex (D-15) | ✅ current |
| `backend/src/engine/` | OIML math engine: contracts, class_rules, error_calc, rounding, mpe_rules, models | ✅ Phase 1 core |
| `backend/tests/` | pytest suite (49 green) + `golden_vectors.json` (BE+FE shared) + `test_api.py` + `test_band_tables.py` | ✅ green |
| `backend/pytest.ini` / `requirements.txt` | Test config + pinned deps; local venv at `backend/.venv` | ✅ working |
| `backend/src/core/` | config.py (env settings) + security.py (bcrypt, JWT) | ✅ Phase 2 |
| `backend/src/db/` | models.py (5 tables, Numeric(18,6)) + database.py (engine/session) | ✅ Phase 2 |
| `backend/src/services/` | user_service, instrument_service (Table 3 gate + drift watchdog), session_service (evaluate-at-insert, batch sync, latest-wins) | ✅ Phase 2 |
| `backend/src/api/` | main.py + routers (auth, users, instruments, sessions, attachments, reports) + schemas + deps (RBAC) | ✅ Phase 2 |
| `backend/scripts/seed.py` | Demo users (demo-password-2026) + Class III instrument | ✅ working |
| `frontend/src/engine/mpe.ts` | TS engine mirror (decimal.js); 16/16 on shared golden vectors | ✅ Phase 3 |
| `frontend/src/db/offline.ts` | Dexie IndexedDB store (sessions, observations, outbox) | ✅ Phase 3 |
| `frontend/src/lib/sync.ts` | Outbox sync engine (server-wins, per-batch accepted/rejected) | ✅ Phase 3 |
| `frontend/src/stores/` | auth (zustand+persist) + connectivity (health-check pill) | ✅ Phase 3 |
| `frontend/src/pages/` | Login, Dashboard, NewEvaluation (wizard), SessionWorkspace (module tabs + gating + grid + timer + banner) | ✅ Phase 3+4 |
| `frontend/src/components/` | VerdictBadge, ConnectivityPill, LiveValidationRow, EccentricityGrid, CreepTimerPanel, WatchdogBanner | ✅ Phase 3+4 |
| `frontend/public/sw.js` | App-shell service worker with network-first navigation, generated asset precache, and cache-first static assets | ✅ Phase 6 |
| `frontend/public/manifest.webmanifest` | PWA install metadata and icon declarations | ✅ Phase 6 |
| `frontend/src/hooks/usePwaInstall.ts` | One-time service-worker registration and install prompt lifecycle | ✅ Phase 6 |
| `frontend/src/hooks/useScaleConnection.ts` | Web Serial/simulator connection, frame ingestion, and stable-reading capture policy | ⚠️ Phase 6 hardware gate pending |
| `frontend/src/components/EvidenceCapture.tsx` | Camera/file evidence capture and attachment upload; OCR deferred under D-30 | ✅ Phase 6 |
| `frontend/src/lib/requirements.ts` | Rulebook-sourced test-module requirements + completion predicates (D-24) | ✅ Phase 4 |
| `frontend/src/lib/creep.ts` | Pure creep-timer state machine (capture points, early-termination rule) | ✅ Phase 4 |
| `frontend/tests/phase4.test.ts` | 17 vitest cases: requirements, moduleStatus, creep machine | ✅ green |
| `backend/src/report/` | Phase 5 report package: aggregate (immutable ReportData) → pdf (ReportLab) / docx (python-docx) / seal (SHA-256 + QR) / service (orchestration, two-layer seal, re-seal on sign) (D-27/D-28) | ✅ Phase 5 |
| `backend/src/api/routers/reports.py` | Report endpoints + `public_router` (verify): list/get/download/docx, sign+re-seal, unauthenticated verify | ✅ Phase 5 |
| `backend/tests/test_reports.py` | 12 report tests: seal integrity, PDF/DOCX content (pypdf/python-docx extraction), tamper detection, RBAC | ✅ green (62/62) |
| `backend/scripts/smoke_phase5.py` | 23-step live report-lifecycle smoke (also a finale demo asset) | ✅ 23/23 |
| `frontend/src/pages/Reports.tsx` · `Verify.tsx` | S6 archive (search, blob downloads, badges) + S8 public verify (authentic/tampered) | ✅ Phase 5 |
| `backend/src/engine/session_checks.py` | Repeatability spread + creep drift criteria (D-40) | ✅ |
| `backend/src/services/evaluation_summary.py` | Single overall verdict + reasons for report/archive/verify/UI (D-40) | ✅ |
| `backend/tests/test_hardening.py` · `tests/_helpers.py` | Regression tests for the 2026-09-28 audit; helper that brings a session to the finalize gate | ✅ 141/141 |
| `NAWI Frontend 7/src/lib/` | requirements (mirrors MIN_READINGS), metrology preview, offlineStore (IndexedDB) + sync, roles, drift, utils (D-45) | ✅ |
| `docs/` | Official rulebook PDFs + `comparison-vs-r76-2.md` (P5-7); PPT pending | ⬜ growing |

---

## 7. Parking Lot (unsolved questions / TODOs)

- [x] Alembic migration chain — DONE 2026-09-17: `backend/alembic/` + `alembic.ini` (env.py wired to settings.database_url), autogenerate initial migration `0be1fd7c286d` covering all six tables; upgrade → downgrade → upgrade cycle verified on a scratch DB. Dev/demo still use create_all; production uses `alembic upgrade head`.
- [x] Class III n-floor nuance — DONE 2026-09-17 (D-34): `_TABLE_3` e-row structure replaces `_N_RANGE`; III coarse row (5 g ≤ e) requires n ≥ 500, fine row (0.1–2 g) n ≥ 100; IIII floor corrected 10 → 100 (verbatim PDF); e-gaps (2–5 g III, 0.05–0.1 g II) rejected.
- [x] §3.4.3 Min column in d — DONE 2026-09-17 (D-34): Min floors now factor × d (100d I, 20d II-fine/III, 50d II-coarse, 10d IIII), skipped when d unknown; `base_unit` added to ScaleParameters/TS mirror for the gram-denominated e-ranges.
- [x] Optional in-service MPE mode — DONE 2026-09-17: `EvaluationMode` enum (INITIAL_VERIFICATION default / IN_SERVICE = 2× per §3.5.2) on `mpe_for_load`/`evaluate`; D-19's explicit-parameter rule honored; 4 new tests.
- [ ] SIH submission logistics: 6-slide PPT (PDF export) + ≤3-min video — owners and dates TBD by team.

---

## 8. Handoff Protocol (end-of-session checklist)

Before ending ANY session, an agent MUST:

1. **Update §3 Current Status Snapshot** (phase statuses + "working on now" + blockers).
2. **Append any new decisions to §5** (never edit old rows).
3. **Update §6 Where Things Are** for files created/moved/renamed.
4. **Tick completed checklists in phases.md** and mark the corresponding task IDs.
5. **Move resolved parking-lot items** to the decision log; add new open questions.
6. **Commit or clearly report uncommitted work** — state exactly which files were touched and why (agents must not commit unless the user asks).
7. **Leave the repo green:** tests passing (once they exist), no stray debug code, no secrets in tracked files.

*Cross-references: [rules.md](rules.md) · [phases.md](phases.md) · [architecture.md](architecture.md) · [design.md](design.md)*
