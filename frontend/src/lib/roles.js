export const TECHNICIAN_ROLES = ['lab_technician', 'admin'];
export const REGISTRY_ROLES = ['lab_technician', 'admin'];
export const AUDIT_ROLES = ['admin'];
export const OFFICER_ROLES = ['approving_officer', 'admin'];

export function hasRole(user, roles) {
  return Boolean(user?.role && roles.includes(user.role));
}
