/**
 * Admin is a deliberate exception to Leave's "everyone gets self-service"
 * rule — Employee/Manager/HR/custom roles keep full "My Leave" access
 * unconditionally, but an Admin administers the module (Dashboard/
 * Approvals/Calendar/Reports/Settings) rather than participating in it
 * personally. This mirrors the backend's own single source of truth
 * (leaveAuthorization.service.js#isMyLeaveSelfServiceBlocked) so the two
 * layers can never drift — used to hide the "My Leave" nav tab and to
 * redirect away from its page/route, while the backend independently
 * enforces the same restriction on every API call regardless of what the
 * UI shows.
 */
export function isMyLeaveBlockedForRole(role) {
  return String(role || '').toLowerCase() === 'admin';
}

/**
 * Every workspace member has a personal dashboard. Broader data visibility
 * is resolved by the backend, independently of navigation visibility.
 */
export function canAccessLeaveDashboard() {
  return true;
}

/**
 * Resolves the default leave landing route for a given user role.
 * For Employee role users, opening Leave defaults to "My Leave" (/leave/my).
 * For administrative or managerial roles (Admin, HR, Manager, etc.), defaults to Dashboard (/leave).
 */
export function getDefaultLeaveRouteForRole(role) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'employee' ? '/leave/my' : '/leave';
}

