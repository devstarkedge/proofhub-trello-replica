import mongoose from 'mongoose';

const tenantCollections = new Set(['boards', 'cards', 'lists', 'labels', 'comments', 'attachments', 'recurringtasks', 'departments']);
const workspaceObjectId = value => {
  if (!mongoose.isValidObjectId(value)) throw new Error('Aggregation requires a valid workspace');
  return new mongoose.Types.ObjectId(String(value));
};

// User.department is a legacy identity mirror. Resolve the active tenant's
// membership before joining department names, including for shared users.
export function workspaceMembershipDepartmentStages(workspaceId) {
  const workspace = workspaceObjectId(workspaceId);
  return [
    { $lookup: { from: 'workspacememberships', let: { memberUser: '$_id' }, pipeline: [
      { $match: { workspace, status: 'active', $expr: { $eq: ['$user', '$$memberUser'] } } },
      { $project: { department: { $ifNull: ['$departments', '$department'] } } }, { $limit: 1 }
    ], as: 'workspaceMembership' } },
    { $set: { department: { $ifNull: [{ $arrayElemAt: ['$workspaceMembership.department', 0] }, []] } } },
    { $unset: 'workspaceMembership' }
  ];
}

// Model middleware scopes the aggregate root; MongoDB does not apply it to
// raw lookup collections. Add the same tenant predicate inside each join.
export function scopeWorkspaceLookups(pipeline, workspaceId) {
  const workspace = workspaceObjectId(workspaceId);
  function scope(stages) {
    return stages.map(stage => {
      if (!stage.$lookup) return stage;
      const lookup = stage.$lookup;
      const nested = scope(lookup.pipeline || []);
      if (tenantCollections.has(lookup.from)) nested.unshift({ $match: { workspaceId: workspace } });
      return { ...stage, $lookup: { ...lookup, ...(nested.length ? { pipeline: nested } : {}) } };
    });
  }
  return scope(pipeline);
}
