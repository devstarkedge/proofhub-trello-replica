import { getEffectiveAttendanceProfile } from './attendanceMemberProfile.service.js';

/**
 * The single centralized answer to "is this person an Attendance subject
 * right now" — every check-in/check-out, dashboard denominator, missing-
 * checkout sweep, and absence calculation must call this instead of
 * re-deriving eligibility locally. This is deliberately independent of
 * `hasResourceAction(user, 'attendance', action, workspaceId)` (the
 * permission engine's "can manage Attendance" question) — a Workspace
 * Admin can answer yes to that and still get `attendanceRequired:false`
 * here, which is the whole point of keeping the two questions separate
 * (see the module plan's §D).
 *
 * Precedence (first match wins, mirrors the Leave dashboard-scope
 * resolver's own "structural, not permission-gated" style):
 *   1. Attendance module disabled for this workspace       -> not required
 *   2. Membership missing/not active                       -> not required
 *   3. Workspace Admin role (ALWAYS — this is the mandatory,
 *      non-negotiable rule the whole module is built around) -> not required
 *   4. Per-user profile override = NOT_REQUIRED             -> not required
 *   5. Policy-level role exclusion (extensible, optional)   -> not required
 *   6. Policy-level specific-user exclusion (extensible)    -> not required
 *   7. Per-user profile override = REQUIRED, or default     -> required
 *
 * `role` is read from the ACTIVE WORKSPACE membership passed in, never a
 * global `User.role` — the same user can be Admin (excluded) in one
 * workspace and an ordinary Employee (included) in another.
 */
export async function resolveAttendanceEligibility({ workspaceId, userId, membership, workspace, attendancePolicy = null }) {
  if (!workspace?.attendanceModuleEnabled) {
    return buildResult({ attendanceRequired: false, reason: 'ATTENDANCE_MODULE_DISABLED' });
  }

  if (!membership || membership.status !== 'active') {
    return buildResult({ attendanceRequired: false, reason: 'MEMBERSHIP_INACTIVE' });
  }

  const role = String(membership.role || '').toLowerCase();

  // Mandatory rule, checked before any override can re-include them:
  // Workspace Admin is never an attendance subject.
  if (role === 'admin') {
    return buildResult({ attendanceRequired: false, reason: 'ADMIN_EXCLUDED' });
  }

  const profile = await getEffectiveAttendanceProfile({ workspaceId, userId });

  if (profile.attendanceRequiredOverride === 'NOT_REQUIRED') {
    return buildResult({ attendanceRequired: false, reason: 'PROFILE_OVERRIDE_EXCLUDED', profile, applicablePolicy: attendancePolicy });
  }

  // Extensible exclusion points — only meaningful once a policy is
  // resolved and loaded by the caller; eligibility must stay answerable
  // even before any AttendancePolicy exists (e.g. right after module
  // enablement, before HR has configured one).
  if (attendancePolicy) {
    const excludedRoles = (attendancePolicy.excludedRoles || []).map((r) => String(r).toLowerCase());
    if (excludedRoles.includes(role)) {
      return buildResult({ attendanceRequired: false, reason: 'ROLE_EXCLUDED', profile, applicablePolicy: attendancePolicy });
    }
    const excludedUserIds = (attendancePolicy.excludedUserIds || []).map(String);
    if (excludedUserIds.includes(String(userId))) {
      return buildResult({ attendanceRequired: false, reason: 'USER_EXCLUDED', profile, applicablePolicy: attendancePolicy });
    }
    const employmentTypeExclusions = attendancePolicy.excludedEmploymentTypes || [];
    if (employmentTypeExclusions.length && employmentTypeExclusions.includes(profile.employmentType)) {
      return buildResult({ attendanceRequired: false, reason: 'EMPLOYMENT_TYPE_EXCLUDED', profile, applicablePolicy: attendancePolicy });
    }
  }

  const reason = profile.attendanceRequiredOverride === 'REQUIRED' ? 'PROFILE_OVERRIDE_REQUIRED' : 'ELIGIBLE';
  return buildResult({ attendanceRequired: true, reason, profile, applicablePolicy: attendancePolicy });
}

function buildResult({ attendanceRequired, reason, profile = null, applicablePolicy = null }) {
  return { attendanceRequired, reason, profile, applicablePolicy };
}
