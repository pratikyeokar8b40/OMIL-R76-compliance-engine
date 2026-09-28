# OMIL-R76-compliance-engine
# ⚖️ NAWI Compliance Suite
### Automated Test Report Generator for Non-Automatic Weighing Instruments (OIML R-76)

**Smart India Hackathon 2026 — Problem Statement PS 26035**

> A deterministic web application that turns weighing-instrument test readings into sealed, verifiable OIML R-76-2 pattern evaluation reports — eliminating manual calculation errors and formatting inconsistencies in legal metrology test labs.

---

## 📌 Problem Statement

**PS 26035** calls for software that generates standardized test reports for Non-Automatic Weighing Instruments (NAWI) in compliance with OIML R-76 (Non-automatic weighing instruments — Metrological and technical requirements). Legal metrology labs currently rely on manual spreadsheets and Word templates to compute Verification Scale Intervals, Maximum Permissible Errors, and pass/fail determinations — a process that is slow, error-prone, and inconsistent across labs and inspectors.

## 💡 Our Solution

A browser-based Metrology Compliance Engine that:
1. **Validates** the instrument against R 76-1 Table 3 before any test starts (class, e, n = Max/e, Min, 1/2/5 × 10ᵏ intervals).
2. **Guides** the technician through the 17 R 76-2 tests and the sheet-17 checklist, with live error previews.
3. **Computes** E, Ec, MPE and PASS/FAIL on the server with exact decimal arithmetic, plus the criteria that span several readings (repeatability spread, creep drift).
4. **Monitors** ambient temperature change over the campaign and voids results when conditions were not steady.
5. **Generates** a sealed PDF (and editable DOCX) whose QR code opens a public verification page — anyone can check a copy of the PDF against the original.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **Metrology engine** | Deterministic E = I + ½e − ΔL − L, Ec = E − E0, Table 6 MPE bands for Classes I–IIII, initial-verification and in-service (2×) regimes; pure-Python `decimal`, no floats |
| **Completeness gate** | A report can only be finalized when every required test has its minimum readings (5 weighing loads, 4 eccentricity positions, 10 repeatability, 5 tare, creep at 0/5/15/30 min, zero check), the checklist is resolved and start/end temperatures are recorded — enforced by the server |
| **Cross-reading criteria** | Repeatability: max(E) − min(E) ≤ MPE (R 76-1 3.6.1). Creep: ≤ 0.5e over 30 min and ≤ 0.2e between 15 and 30 min (3.9.4.1) |
| **Environmental watchdog** | Start/end temperature change: amber above 2 °C, results void above 5 °C or outside −10…40 °C |
| **Scale connection** | Web Serial API (Chrome/Edge, 9600 baud) fills the indication from the scale's output; manual entry always available |
| **Sealed reports** | ReportLab PDF + python-docx twin from one snapshot; SHA-256 of the PDF file plus a content digest embedded in the QR code |
| **Public verification** | `/verify/<report id>`: result, instrument, signer, seal status, and an in-browser SHA-256 check of any PDF copy — no login needed |
| **Roles & audit** | Technician / approving officer / admin, JWT auth with login rate limiting, hash-chained audit log with an integrity check in the admin console |
| **Connection-drop tolerance** | If the server is unreachable mid-session, readings are kept in the browser (IndexedDB) and synced automatically |

---

## 🏗️ Tech Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS v4 (JavaScript/JSX), TanStack Query, wouter, IndexedDB outbox
- **Backend:** Python FastAPI + SQLAlchemy 2 — SQLite for development, PostgreSQL in the Docker deployment (Alembic migrations)
- **Engine:** pure-Python `decimal` module (`backend/src/engine/`), golden-vector test file
- **Reports:** ReportLab (authoritative PDF) + python-docx (editable twin) + qrcode
- **Security:** JWT (bcrypt), role-based access, append-only observations, hash-chained audit log

## 🧮 Metrology Engine — Core Logic

```
Input:  Accuracy Class (I / II / III / IIII), Max, Min, e, d
        per reading: L (applied load), I (indication), ΔL (changeover extra load), E0 (zero error)

1. Validate the instrument against R 76-1 Table 3 (n = Max/e class ranges, Min ≥ k·d)
2. Error prior to rounding:  E  = I + ½·e − ΔL − L          (§A.4.4.3)
3. Corrected error:          Ec = E − E0
4. MPE from the Table 6 band for the class at m = L/e (inclusive upper edge)
5. Verdict: PASS iff |Ec| ≤ MPE  — computed and stored by the server at insert
6. Session criteria: repeatability spread, creep drift, checklist, ambient conditions
```

Full methodology: [`docs/technical-documentation.md`](docs/technical-documentation.md).

---

## 🚀 Getting Started

### One click (Windows)

Double-click **`run.bat`**. It creates the Python environment and installs packages on first run, seeds the demo data, starts the backend (port 8000) and frontend (port 5174), and opens the browser. It stops with a clear message if port 8000 or 5174 is already taken.

Sign in as `tech@lab.gov.in`, `officer@lab.gov.in` or `admin@lab.gov.in` — password `demo-password-2026`.

### Manual

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
python -m scripts.seed_finale        # demo users, 3 instruments, a signed report, an open session
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
python -m pytest                     # 141 tests
```

**Frontend** (Node 20+):

```bash
cd "NAWI Frontend 7"
npm install
npm run dev                          # http://localhost:5174, proxies /api to 127.0.0.1:8000
```

If port 8000 is used by something else, run the backend on another port and point the frontend at it:
`NAWI_API_TARGET=http://127.0.0.1:8010 npm run dev`.

**QR codes on a phone:** set `REPORT_VERIFY_BASE_URL=http://<laptop-LAN-IP>:5174/verify` before starting the backend (`run.bat` does this automatically), keep the phone on the same Wi-Fi, and allow Node.js through the Windows Firewall.

**Docker (production-style):** see [`deploy/README.md`](deploy/README.md) — Postgres + backend + nginx-served frontend.

---

## 📂 Project Structure

```
OMIL-R76-compliance-engine/
├── backend/
│   ├── src/
│   │   ├── engine/            # R-76 math: Table 3/6 rules, error formulas, session criteria (pure, Decimal-only)
│   │   ├── services/          # sessions, test plan gate, evaluation summary, instruments, audit
│   │   ├── api/               # FastAPI routers, schemas, role checks, audit glue
│   │   ├── report/            # snapshot → PDF + DOCX, seal (SHA-256 + QR)
│   │   └── db/                # SQLAlchemy models (append-only observations, audit log)
│   ├── alembic/               # migrations (Docker/PostgreSQL path)
│   ├── tests/                 # 141 pytest tests incl. golden vectors
│   └── scripts/               # seed, seed_finale (demo dataset), smoke scripts
├── NAWI Frontend 7/           # React frontend
│   └── src/
│       ├── pages/             # Dashboard, New evaluation, Active session, Reports, Verify, Admin
│       ├── components/modules # one screen per R-76 test + checklist + verdict
│       ├── lib/               # test requirements, preview math, offline store + sync, roles
│       └── api/client.js      # API client (token refresh, downloads, health)
├── deploy/                    # docker-compose, Dockerfiles, nginx, runbook
├── docs/                      # technical documentation, R 76-2 comparison, PPT/video scripts
└── run.bat                    # one-click local start
```

---

## 🎯 What Makes This Different

- **Deterministic, not discretionary** — formulas and limits are codified from R 76-1 and enforced by the server, including the rules that compare readings with each other.
- **Complete by construction** — an evaluation cannot be sealed until every required test has enough readings.
- **Verifiable by anyone** — scan the QR code, or drop a PDF copy on the verification page to confirm it matches the sealed original byte for byte.
- **Built for real lab conditions** — unsteady temperatures void results, readings survive connection drops, and the scale can feed indications directly over serial.

## 👥 Team

| Name | Role |
|---|---|
| [Name] | [Role] |
| [Name] | [Role] |
| [Name] | [Role] |

## 📄 License

[Choose a license, e.g. MIT]

## 🔗 Links

- **Demo Video:** [link]
- **Live Demo / Deployed App:** [link]
- **Problem Statement Reference:** PS 26035 — Smart India Hackathon 2026
