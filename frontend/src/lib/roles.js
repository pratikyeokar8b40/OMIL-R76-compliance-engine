// Route/UI role groups. The server enforces the same rules (architecture.md §11);
// these only decide what the UI offers.
export const TECHNICIAN_ROLES = ['lab_technician', 'admin'];
// Report sign-off is for approving officers only (admins manage users/audit).
export const OFFICER_ROLES = ['approving_officer'];
export const REGISTRY_ROLES = ['lab_technician', 'approving_officer', 'admin'];
export const AUDIT_ROLES = ['admin'];

export function hasRole(user, roles) {
  return Boolean(user?.role) && roles.includes(user.role);
}
