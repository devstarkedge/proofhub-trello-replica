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

  return LeaveEmployeeProfile.findOneAndUpdate(
    { workspaceId, user: userId },
    { $set: update, $setOnInsert: { workspaceId, user: userId } },
    { upsert: true, new: true, runValidators: true }
  );
}
