"""FastAPI application entrypoint (P2).

Layer contract (architecture.md §3): routers → services → engine.
No route contains math; verdicts come exclusively from the pure engine
evaluated at insert inside the service layer.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.core.config import settings

from .routers import attachments, auth, instruments, reports, sessions, checklist, test_plan, ruleset
from .routers import demo_access  # TEMPORARY judge access (SIH); see that module to remove

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


@app.exception_handler(RequestValidationError)
async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 with a JSON-safe body. The default handler turns Decimal inputs
    into floats, and a NaN/Infinity float makes the response itself fail
    (a 500 for what is a client error)."""
    detail = jsonable_encoder(exc.errors(), custom_encoder={Decimal: str, Exception: str})
    return JSONResponse(status_code=422, content={"detail": detail})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(auth.users_router, prefix="/api/v1")
app.include_router(demo_access.router, prefix="/api/v1")
app.include_router(instruments.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(attachments.router, prefix="/api/v1")
app.include_router(checklist.router, prefix="/api/v1")
app.include_router(test_plan.router, prefix="/api/v1")
app.include_router(ruleset.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(reports.public_router, prefix="/api/v1")


@app.get("/health", tags=["meta"])
@app.get("/api/v1/health", tags=["meta"], include_in_schema=False)
def health() -> dict[str, str]:
    """Liveness probe (deployment target §12). Also served under /api/v1 so
    the browser reaches it through the same proxy as every other call (the
    dev server answered bare /health with its own HTML page, so the UI
    always showed "Connected")."""
    return {"status": "ok", "service": "nawi-backend"}
