import LeaveEmployeeProfile from './leaveEmployeeProfile.model.js';

/** LeaveEmployeeProfile is lazily created — a user with no row is simply ACTIVE with no probation. */
export async function getEffectiveEmploymentProfile({ workspaceId, userId }) {
  const profile = await LeaveEmployeeProfile.findOne({ workspaceId, user: userId }).lean();
  return profile || { employmentStatus: 'ACTIVE', hireDate: null, probationEndsAt: null, accrualStartOverrideDate: null };
}

export async function upsertEmploymentProfile({ workspaceId, userId, employmentStatus, hireDate, probationEndsAt, accrualStartOverrideDate, notes, updatedBy }) {
  const update = {};
  if (employmentStatus !== undefined) update.employmentStatus = employmentStatus;
  if (hireDate !== undefined) update.hireDate = hireDate;
  if (probationEndsAt !== undefined) update.probationEndsAt = probationEndsAt;
  if (accrualStartOverrideDate !== undefined) update.accrualStartOverrideDate = accrualStartOverrideDate;
  if (notes !== undefined) update.notes = notes;
  update.updatedBy = updatedBy;

  // No `workspaceId` in the filter — workspaceScopePlugin ANDs one in from
  // the active context on every findOneAndUpdate regardless of what's
  // already in the filter, and having it in both places makes MongoDB's
  // upsert insert-document inference see it matched twice and reject the
  // write outright ("cannot infer query fields to set, path 'workspaceId'
  // is matched twice"). $setOnInsert still needs it explicitly since the
  // plugin's pre('validate') auto-stamp never runs for a raw findOneAndUpdate.
  return LeaveEmployeeProfile.findOneAndUpdate(
    { user: userId },
    { $set: update, $setOnInsert: { workspaceId, user: userId } },
    { upsert: true, new: true, runValidators: true }
  );
}
