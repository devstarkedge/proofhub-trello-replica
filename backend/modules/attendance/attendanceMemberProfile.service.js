import AttendanceMemberProfile from './attendanceMemberProfile.model.js';

const DEFAULT_PROFILE = Object.freeze({
  attendanceRequiredOverride: null,
  assignedShift: null,
  allowAnyWorkspaceLocation: false
});

/** Lazily created — a user with no row is simply no-eligibility-override/no-assigned-shift. */
export async function getEffectiveAttendanceProfile({ workspaceId, userId }) {
  const profile = await AttendanceMemberProfile.findOne({ workspaceId, user: userId, isActive: true }).lean();
  return profile || { ...DEFAULT_PROFILE };
}

export async function upsertAttendanceProfile({
  workspaceId, userId, attendanceRequiredOverride, assignedShift,
  allowAnyWorkspaceLocation, effectiveFrom, effectiveUntil, notes, updatedBy
}) {
  const update = {};
  if (attendanceRequiredOverride !== undefined) update.attendanceRequiredOverride = attendanceRequiredOverride;
  if (assignedShift !== undefined) update.assignedShift = assignedShift;
  if (allowAnyWorkspaceLocation !== undefined) update.allowAnyWorkspaceLocation = allowAnyWorkspaceLocation;
  if (effectiveFrom !== undefined) update.effectiveFrom = effectiveFrom;
  if (effectiveUntil !== undefined) update.effectiveUntil = effectiveUntil;
  if (notes !== undefined) update.notes = notes;
  update.updatedBy = updatedBy;
  update.isActive = true;

  // Deliberately no `workspaceId` in the filter here — workspaceScopePlugin's
  // findOneAndUpdate hook (it fires on that too, matching /^find/) always
  // ANDs one in from the active context regardless of what's already in the
  // filter, so also putting it here would make MongoDB's upsert
  // insert-document inference see workspaceId matched twice and reject the
  // whole operation. $setOnInsert still needs it explicitly — the plugin's
  // own pre('validate') auto-stamp hook never fires for a raw
  // findOneAndUpdate (no Document instance is constructed for it).
  return AttendanceMemberProfile.findOneAndUpdate(
    { user: userId },
    { $set: update, $setOnInsert: { workspaceId, user: userId } },
    { upsert: true, new: true, runValidators: true }
  );
}
