export const SUPPORT_LEVELS = ['DEPARTMENT_MANAGER', 'HR'];

// Approval requires two different people: an administrator and either a
// department manager or HR. Missing approvers never reduce the quorum.
export function approvalOutcome(stages) {
  if (stages.some((stage) => stage.status === 'REJECTED')) return 'REJECTED';
  const admins = stages.filter((stage) => stage.level === 'ADMIN' && stage.status === 'APPROVED');
  const support = stages.filter((stage) => SUPPORT_LEVELS.includes(stage.level) && stage.status === 'APPROVED');
  if (admins.some((admin) => support.some((stage) =>
    admin.decidedBy && stage.decidedBy && String(admin.decidedBy._id || admin.decidedBy) !== String(stage.decidedBy._id || stage.decidedBy)
  ))) return 'APPROVED';
  return stages.some((stage) => stage.status === 'APPROVED') ? 'PARTIALLY_APPROVED' : 'PENDING_APPROVAL';
}

export function stageIsReady(stage, stages) {
  // Manager and HR are alternatives in the same logical stage, including
  // requests created before this rule was introduced.
  return stage.mode !== 'SEQUENTIAL' || stage.level !== 'ADMIN' ||
    stages.some((other) => SUPPORT_LEVELS.includes(other.level) && other.status === 'APPROVED');
}
