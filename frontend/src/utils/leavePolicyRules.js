/** Shared per-leave-type allocation rule state — used by both the default-policy and override-policy forms so they never drift apart. */
export function defaultRuleFor(leaveType) {
  return {
    leaveTypeId: leaveType._id,
    leaveTypeName: leaveType.name,
    category: leaveType.category,
    monthlyCreditAmount: 1,
    expiryMode: 'NEVER',
    expiryMonths: 3,
    carryForwardAllowed: true,
    carryForwardMaxAmount: '',
    halfDayEnabled: leaveType.supportsHalfDay !== false,
    maxDurationMinutesPerInstance: leaveType.category === 'SHORT_LEAVE' ? 120 : ''
  };
}

/** Rebuilds this form's per-type rule state from an existing published version's leaveTypeRules — used to pre-fill Edit. */
export function ruleFromVersion(leaveType, existingRules) {
  const existing = (existingRules || []).find((r) => String(r.leaveType?._id || r.leaveType) === String(leaveType._id));
  if (!existing) return defaultRuleFor(leaveType);
  return {
    leaveTypeId: leaveType._id,
    leaveTypeName: leaveType.name,
    category: leaveType.category,
    monthlyCreditAmount: existing.monthlyCreditAmount ?? 1,
    expiryMode: existing.expiryRule?.mode || 'NEVER',
    expiryMonths: existing.expiryRule?.months || 3,
    carryForwardAllowed: existing.carryForward?.allowed !== false,
    carryForwardMaxAmount: existing.carryForward?.maxAmount ?? '',
    halfDayEnabled: existing.halfDayEnabled !== false,
    maxDurationMinutesPerInstance: existing.maxDurationMinutesPerInstance ?? (leaveType.category === 'SHORT_LEAVE' ? 120 : '')
  };
}

export function buildLeaveTypeRulesPayload(rules) {
  return rules.map((rule) => ({
    leaveType: rule.leaveTypeId,
    monthlyCreditAmount: Number(rule.monthlyCreditAmount) || 0,
    expiryRule: {
      mode: rule.expiryMode,
      months: rule.expiryMode === 'FIXED_MONTHS_AFTER_CREDIT' ? Number(rule.expiryMonths) || 1 : null
    },
    carryForward: {
      allowed: rule.carryForwardAllowed,
      maxAmount: rule.carryForwardAllowed && rule.carryForwardMaxAmount !== '' ? Number(rule.carryForwardMaxAmount) : null
    },
    ...(rule.category !== 'SHORT_LEAVE' ? { halfDayEnabled: rule.halfDayEnabled } : {}),
    ...(rule.category === 'SHORT_LEAVE' ? { maxDurationMinutesPerInstance: Number(rule.maxDurationMinutesPerInstance) || null } : {})
  }));
}
