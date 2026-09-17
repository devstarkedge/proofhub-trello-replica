const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const EXPIRY_LABELS = {
  NEVER: 'Never expires',
  FIXED_MONTHS_AFTER_CREDIT: 'Fixed months after credit',
  CALENDAR_YEAR_END: 'End of calendar year'
};

function formatExpiry(mode, months) {
  if (mode === 'FIXED_MONTHS_AFTER_CREDIT') return `${EXPIRY_LABELS[mode]} (${months || '?'} mo)`;
  return EXPIRY_LABELS[mode] || mode;
}

function formatCarryForward(allowed, maxAmount) {
  if (!allowed) return 'Not allowed';
  return maxAmount ? `Up to ${maxAmount} days` : 'Unlimited';
}

/**
 * Old vs. new, field by field — used to show the confirmation diff before
 * an edit is saved, and to decide whether there's anything to save at all
 * (an edit with zero differences never calls the API). `oldVersion` is the
 * currently-governing published version's leaveTypeRules (already loaded
 * before the user started editing); `newRules` is PolicyFormModal's own
 * per-type rule state (see its `rulesForDiff` submit field), not yet the
 * wire payload.
 */
export function buildPolicyDiff({ oldPolicy, oldVersion, newValues }) {
  const rows = [];

  if ((oldPolicy?.name || '') !== newValues.name) {
    rows.push({ label: 'Policy name', oldValue: oldPolicy?.name || '—', newValue: newValues.name });
  }
  if ((oldPolicy?.description || '') !== (newValues.description || '')) {
    rows.push({ label: 'Description', oldValue: oldPolicy?.description || '—', newValue: newValues.description || '—' });
  }

  // Local getters, never UTC — see LeaveSettingsPage.jsx's formatMonthYear
  // for why: this instant is midnight in the WORKSPACE's timezone, and
  // getUTCMonth() reads it one month early for any positive-offset
  // workspace, which is exactly what made a genuinely-changed effective
  // date look unchanged in this very diff.
  const oldEffective = oldVersion?.effectiveFrom ? new Date(oldVersion.effectiveFrom) : null;
  const oldMonthLabel = oldEffective ? `${MONTH_NAMES[oldEffective.getMonth()]} ${oldEffective.getFullYear()}` : '—';
  const newMonthLabel = `${MONTH_NAMES[newValues.effectiveMonth - 1]} ${newValues.effectiveYear}`;
  if (oldMonthLabel !== newMonthLabel) {
    rows.push({ label: 'Effective from', oldValue: oldMonthLabel, newValue: newMonthLabel });
  }

  const oldRulesByType = new Map(
    (oldVersion?.leaveTypeRules || []).map((r) => [String(r.leaveType?._id || r.leaveType), r])
  );

  for (const rule of newValues.rulesForDiff || []) {
    const old = oldRulesByType.get(String(rule.leaveTypeId));
    const oldAllocation = old?.monthlyCreditAmount ?? null;
    const newAllocation = Number(rule.monthlyCreditAmount) || 0;
    if (oldAllocation !== newAllocation) {
      rows.push({
        label: `${rule.leaveTypeName} — monthly allocation`,
        oldValue: oldAllocation === null ? '—' : `${oldAllocation} days`, newValue: `${newAllocation} days`
      });
    }

    const oldExpiry = old ? formatExpiry(old.expiryRule?.mode || 'NEVER', old.expiryRule?.months) : '—';
    const newExpiry = formatExpiry(rule.expiryMode, rule.expiryMonths);
    if (oldExpiry !== newExpiry) rows.push({ label: `${rule.leaveTypeName} — expiry`, oldValue: oldExpiry, newValue: newExpiry });

    const oldCarry = old ? formatCarryForward(old.carryForward?.allowed !== false, old.carryForward?.maxAmount) : '—';
    const newCarry = formatCarryForward(rule.carryForwardAllowed, rule.carryForwardMaxAmount || null);
    if (oldCarry !== newCarry) rows.push({ label: `${rule.leaveTypeName} — carry-forward`, oldValue: oldCarry, newValue: newCarry });

    if (rule.category === 'SHORT_LEAVE') {
      const oldMax = old?.maxDurationMinutesPerInstance ?? null;
      const newMax = Number(rule.maxDurationMinutesPerInstance) || null;
      if (oldMax !== newMax) {
        rows.push({
          label: `${rule.leaveTypeName} — max duration`,
          oldValue: oldMax ? `${oldMax} min` : '—', newValue: newMax ? `${newMax} min` : '—'
        });
      }
    } else {
      const oldHalf = old ? old.halfDayEnabled !== false : true;
      const newHalf = rule.halfDayEnabled;
      if (oldHalf !== newHalf) {
        rows.push({ label: `${rule.leaveTypeName} — half-day requests`, oldValue: oldHalf ? 'Allowed' : 'Not allowed', newValue: newHalf ? 'Allowed' : 'Not allowed' });
      }
    }
  }

  return rows;
}
