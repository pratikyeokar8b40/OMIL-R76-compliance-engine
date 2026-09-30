// Normalize GET /sessions/{id}/drift (snake_case) for the UI.
// Returns null when the backend has no verdict yet (end temperature missing).
export function normalizeDrift(raw) {
  if (!raw) return null;
  return {
    level: raw.level,
    deltaC: raw.delta_c ?? null,
    allowedDrift: raw.allowed_drift_in_unit ?? null,
    allowedDriftInE: raw.allowed_drift_in_e ?? null,
    staticRangeC: raw.static_range_c ?? null,
  };
}
