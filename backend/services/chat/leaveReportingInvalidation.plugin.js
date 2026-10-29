// Transactional wake-up only: HTTP delivery always remains background work.
export default function leaveReportingInvalidation(schema, { day = false } = {}) {
  schema.post('save', async function (doc) {
    const { default: Delivery } = await import('./LeaveReportingDelivery.js');
    await Delivery.updateMany({ workspaceId: doc.workspaceId, request: day ? doc.request : doc._id },
      { $set: { needsReconcile: true, availableAt: new Date(0) } }, { session: doc.$session() });
  });
}
