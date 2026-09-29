# NAWI Frontend Update

This build aligns the frontend workflow with the updated SIH 26035 backend.

## Implemented
- Paginated instrument/session response normalization.
- Observation sequence_no generation and persistence.
- Correct session-create vs session-patch environment capture.
- Evaluation mode selection.
- Minimum-capacity regulatory floor handling already present and retained.
- Test-plan item updates use the backend item-level PUT contract.
- Checklist updates refresh authoritative checklist state.
- Offline test-plan and checklist outbox support.
- Server-session hydration after IndexedDB restore.
- All 17 R-76 test workflow screens are represented in the active evaluation.
- Dedicated procedure UI for the previously generic tests: damp heat, voltage variations, sensitivity, equilibrium, tilting, warm-up, span stability, endurance, and EMC disturbances.
- Discrimination second-indication capture retained.
- Finalization navigates to a dedicated report view.
- Report view joins report/session/instrument/observations/checklist data and exposes backend PDF/DOCX downloads and verification.
- Admin audit uses the backend field names.

## Validation
- All JS/JSX source files parse successfully with Babel.
- `npm run build` could not be completed in the supplied archive because its bundled Rollup native optional dependency (`@rollup/rollup-linux-x64-gnu`) is missing. Run `npm install` in a network-enabled environment, then `npm run build`.
