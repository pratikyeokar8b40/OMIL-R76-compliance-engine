"""HTTP boundary (Phase 2): FastAPI routers, schemas, deps.

Routers contain zero math and zero SQL beyond delegation — every rule
lives in the service layer, every formula in the engine (rules.md INV-1).

The app is ``src.api.main:app``. It is deliberately not re-exported here:
Vercel loads main.py by file path, and a package-level ``from .main import
app`` re-entered the half-loaded module (circular import at startup).
"""
