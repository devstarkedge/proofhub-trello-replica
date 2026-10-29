import { getActiveWorkspaceId, run } from '../../modules/workspaces/workspaceContext.js';

// Covers the canonical member-access writer as well as direct department,
// role and override writes. Durable source records + periodic reconciliation
// repair crashes between a nontransactional save and this invalidation.
export default function reportingDirectoryInvalidation(schema, { workspaceField = 'workspaceId', userIdentity = false, fields = [] } = {}) {
  schema.pre('save', function () { this.$locals.reportingDirectoryChanged = this.isNew || fields.some(field => this.isModified(field)); });
  async function changed(result) {
    try {
      if (this.$locals && !this.$locals.reportingDirectoryChanged) return;
      const update = this.getUpdate?.();
      if (update) {
        const keys = Object.entries(update).flatMap(([key, value]) => key.startsWith('$') ? Object.keys(value || {}) : [key]);
        if (!keys.some(key => fields.some(field => key === field || key.startsWith(`${field}.`)))) return;
      }
      const document = result?.workspaceId || result?.workspace ? result : this;
      const filter = this.getFilter?.() || {};
      const workspaceId = document?.[workspaceField] || filter[workspaceField] || getActiveWorkspaceId();
      const session = this.getOptions?.().session || this.$session?.() || null;
      const { requestReportingReconciliation } = await import('./attendanceReporting.service.js');
      const targets = new Set(workspaceId ? [String(workspaceId)] : []);
      if (userIdentity) {
        const userId = document?._id || filter._id;
        if (userId) {
          const { default: Membership } = await import('../../models/WorkspaceMembership.js');
          for (const member of await Membership.find({ user: userId }).select('workspace').session(session).lean()) targets.add(String(member.workspace));
        }
      }
      for (const target of targets) await run({ workspaceId: target }, () => requestReportingReconciliation(target, session));
    } catch (error) {
      // A secondary delivery wakeup cannot invalidate an already saved user
      // mutation. The worker compares the actual source records every cycle.
      console.warn('[Reporting] directory reconciliation will retry:', error.code || error.name);
    }
  }
  schema.post('save', changed);
  schema.post(['findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'], changed);
}
