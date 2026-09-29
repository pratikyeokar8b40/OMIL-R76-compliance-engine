export function normalizeDrift(data) {
  if (!data) return null;
  return {
    ...data,
    delta_c: data.delta_c == null ? null : String(data.delta_c),
    allowed_drift_in_e: data.allowed_drift_in_e == null ? null : String(data.allowed_drift_in_e),
    allowed_drift_in_unit: data.allowed_drift_in_unit == null ? null : String(data.allowed_drift_in_unit),
    level: data.level || 'ok',
  };
}
