# NAWI Frontend UI Update

## Changes
- Reworked `/login` to match the supplied NAWI reference layout: split screen, white/light-blue treatment, orange accent rules, navy typography, feature row, functional sign-in/local-mode controls, and weighing-instrument artwork.
- Added `src/assets/login-scale.png` as the light technical weighing-instrument background artwork used by the login screen.
- Simplified dashboard and connected-module copy so operational screens use short, factual language instead of marketing/AI-style descriptions.
- Removed/reworded stale or overly promotional phrases around authoritative records, backend-engine wording, sealed records, and implementation details.
- Updated the stale About-page module wording to refer to the current R-76 test workflow rather than a six-module workflow.
- Kept backend/API/evaluation behavior unchanged.

## Validation
- All source JS/JSX files parse successfully.
- CSS syntax parses successfully.
- A production Vite build could not be completed in this environment because the supplied `node_modules` contains platform-specific native packages from another OS. Run `npm install` (or `npm ci`) on the target development machine, then `npm run build`.
