import LeaveApprovalWorkflow from './leaveApprovalWorkflow.model.js';

/**
 * One active workflow config per workspace, lazily created with schema
 * defaults on first use — needs zero migration/setup step to exist. Kept
 * in its own file (not leaveApproval.service.js) so both the approval
 * engine and the reminder scheduler can import it without a circular
 * dependency between those two modules.
 */
export async function getOrCreateActiveWorkflow(workspaceId) {
  let workflow = await LeaveApprovalWorkflow.findOne({ workspaceId, isActive: true });
  if (!workflow) {
    workflow = await LeaveApprovalWorkflow.create({ workspaceId, name: 'Default Workflow', isActive: true });
  }
  return workflow;
}
