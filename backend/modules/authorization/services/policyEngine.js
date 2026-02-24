class PolicyEngine {
  /**
   * Evaluates if the current user context satisfies the resource requirements
   */
  static evaluate(capabilities, requestedResource, requestedAction, context = {}) {
    // 1. Find relevant permissions for this resource + action
    const relevantPerms = capabilities.filter(c => 
      c.resource === requestedResource && c.action === requestedAction
    );

    if (relevantPerms.length === 0) return { allowed: false, reason: 'NO_PERMISSION' };

    // 2. Check scopes
    const hasAllScope = relevantPerms.some(p => p.scope === 'all');
    if (hasAllScope) return { allowed: true, fields: this._mergeAllowedFields(relevantPerms), scope: 'all' };

    const hasWorkspaceScope = relevantPerms.some(p => p.scope === 'workspace');
    if (hasWorkspaceScope && context.workspaceId === context.userWorkspaceId) {
      return { allowed: true, fields: this._mergeAllowedFields(relevantPerms), scope: 'workspace' };
    }

    const hasTeamScope = relevantPerms.some(p => p.scope === 'team');
    // Assuming context provides resourceTeamId and userTeamId
    if (hasTeamScope && context.resourceTeamId && context.userTeamId === context.resourceTeamId) {
       return { allowed: true, fields: this._mergeAllowedFields(relevantPerms), scope: 'team' };
    }

    const hasOwnScope = relevantPerms.some(p => p.scope === 'own');
    if (hasOwnScope && context.resourceOwnerId && context.userId === context.resourceOwnerId) {
       return { allowed: true, fields: this._mergeAllowedFields(relevantPerms), scope: 'own' };
    }

    // 3. PBAC Dynamic Policy Evaluation (If policies exist in capabilities)
    // Could integrate json-logic-js here for advanced evaluation
    /*
    if (capabilities.policies) {
        for (const policy of capabilities.policies) {
            if (policy.effect === 'ALLOW') {
                const match = jsonLogic.apply(policy.condition, context);
                if (match) return { allowed: true, fields: '*', scope: 'policy' };
            }
        }
    }
    */

    return { allowed: false, reason: 'SCOPE_RESTRICTION' };
  }

  static _mergeAllowedFields(perms) {
    // Logic to union allowedFields and subtract restrictedFields
    let allowed = new Set();
    let restricted = new Set();
    
    perms.forEach(p => {
      p.allowedFields?.forEach(f => allowed.add(f));
      p.restrictedFields?.forEach(f => restricted.add(f));
    });

    if (allowed.size === 0) return '*'; // Wildcard logic if empty means all fields
    restricted.forEach(f => allowed.delete(f));
    return Array.from(allowed);
  }
}

export default PolicyEngine;
