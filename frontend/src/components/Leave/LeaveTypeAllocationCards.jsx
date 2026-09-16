import React from 'react';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const cardStyle = { borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' };

const EXPIRY_OPTIONS = [
  { value: 'NEVER', label: 'Never expires' },
  { value: 'FIXED_MONTHS_AFTER_CREDIT', label: 'Fixed months after credit' },
  { value: 'CALENDAR_YEAR_END', label: 'End of calendar year' }
];

/** One allocation card per workspace LeaveType — shared by the default-policy and override-policy forms. */
const LeaveTypeAllocationCards = ({ rules, updateRule }) => (
  <div className="space-y-4">
    {rules.map((rule) => (
      <div key={rule.leaveTypeId} className="rounded-xl border p-4" style={cardStyle}>
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{rule.leaveTypeName}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Monthly allocation (days)
            <input
              type="number" min="0" step="0.5" required className={`${inputClass} mt-1.5`} style={inputStyle}
              value={rule.monthlyCreditAmount}
              onChange={(e) => updateRule(rule.leaveTypeId, { monthlyCreditAmount: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Expiry
            <select
              className={`${inputClass} mt-1.5`} style={inputStyle} value={rule.expiryMode}
              onChange={(e) => updateRule(rule.leaveTypeId, { expiryMode: e.target.value })}
            >
              {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {rule.expiryMode === 'FIXED_MONTHS_AFTER_CREDIT' && (
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Expires after (months)
              <input
                type="number" min="1" className={`${inputClass} mt-1.5`} style={inputStyle}
                value={rule.expiryMonths} onChange={(e) => updateRule(rule.leaveTypeId, { expiryMonths: e.target.value })}
              />
            </label>
          )}
          {rule.category === 'SHORT_LEAVE' ? (
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Max duration per request (minutes)
              <input
                type="number" min="1" className={`${inputClass} mt-1.5`} style={inputStyle}
                value={rule.maxDurationMinutesPerInstance}
                onChange={(e) => updateRule(rule.leaveTypeId, { maxDurationMinutesPerInstance: e.target.value })}
              />
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs font-medium pt-5" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox" checked={rule.halfDayEnabled}
                onChange={(e) => updateRule(rule.leaveTypeId, { halfDayEnabled: e.target.checked })}
              />
              Allow half-day requests
            </label>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox" checked={rule.carryForwardAllowed}
              onChange={(e) => updateRule(rule.leaveTypeId, { carryForwardAllowed: e.target.checked })}
            />
            Allow carry-forward
          </label>
          {rule.carryForwardAllowed && (
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Max carry-forward (days, blank = unlimited)
              <input
                type="number" min="0" step="0.5" className={`${inputClass} mt-1.5`} style={inputStyle}
                value={rule.carryForwardMaxAmount}
                onChange={(e) => updateRule(rule.leaveTypeId, { carryForwardMaxAmount: e.target.value })}
              />
            </label>
          )}
        </div>
      </div>
    ))}
    {!rules.length && (
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        No leave types configured yet — add at least one on the Leave Types tab first.
      </p>
    )}
  </div>
);

export default LeaveTypeAllocationCards;
