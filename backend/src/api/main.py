"""FastAPI application entrypoint (P2).

Layer contract (architecture.md §3): routers → services → engine.
No route contains math; verdicts come exclusively from the pure engine
evaluated at insert inside the service layer.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import settings

from .routers import attachments, auth, instruments, reports, sessions, checklist, test_plan, ruleset

app = FastAPI(
    title="OIML R-76 Compliance Engine API",
    version="0.2.0",
    description="Test-report platform for Non-Automatic Weighing Instruments "
    "(PS 26035). Verdicts are computed by the pure metrology engine at "
    "observation insert; the UI never re-derives them.",
)

# Dev-friendly CORS: any loopback origin (localhost / 127.0.0.1 / [::1],
# any port) so opening the PWA on a different dev origin still works.
# Production must pin this to the real PWA origin via CORS_ALLOW_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(auth.users_router, prefix="/api/v1")
app.include_router(instruments.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(attachments.router, prefix="/api/v1")
app.include_router(checklist.router, prefix="/api/v1")
app.include_router(test_plan.router, prefix="/api/v1")
app.include_router(ruleset.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(reports.public_router, prefix="/api/v1")


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Liveness probe (deployment target §12)."""
    return {"status": "ok"}
