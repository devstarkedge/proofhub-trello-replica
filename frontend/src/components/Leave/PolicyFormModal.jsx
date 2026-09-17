import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import LeaveTypeAllocationCards from './LeaveTypeAllocationCards';
import { ruleFromVersion, buildLeaveTypeRulesPayload } from '../../utils/leavePolicyRules';
import * as leaveApi from '../../services/leaveApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Full policy configuration form — name/description, a policy start
 * month+year (sent as plain integers, never a Date object, so the backend
 * can resolve the intended calendar date entirely in the workspace's own
 * timezone), and one allocation card per workspace LeaveType (Full Day
 * Leave / Short Leave by default, but driven by whatever types actually
 * exist — nothing here is hardcoded to those two names). Used for both
 * Create and Edit; `initialPolicy`/`initialVersion` pre-fill Edit mode.
 */
const PolicyFormModal = ({ mode = 'create', initialPolicy, initialVersion, onCancel, onSubmit, submitting }) => {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [name, setName] = useState(initialPolicy?.name || '');
  const [description, setDescription] = useState(initialPolicy?.description || '');
  // Edit mode must pre-fill from the policy's own current/pending
  // effective date, not always default to today — otherwise reopening
  // Edit silently resets the start month/year to "now" instead of showing
  // what's actually saved. Local getters (no forced UTC) for the same
  // reason as formatMonthYear: this instant is midnight in the
  // WORKSPACE's timezone.
  const initialEffective = initialVersion?.effectiveFrom ? new Date(initialVersion.effectiveFrom) : new Date();
  const [effectiveYear, setEffectiveYear] = useState(initialEffective.getFullYear());
  const [effectiveMonth, setEffectiveMonth] = useState(initialEffective.getMonth() + 1);
  const [rules, setRules] = useState([]);

  useEffect(() => {
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
  }, []);

  useEffect(() => {
    if (!leaveTypes.length) return;
    const existingRules = initialVersion?.leaveTypeRules || [];
    setRules(leaveTypes.map((type) => ruleFromVersion(type, existingRules)));
  }, [leaveTypes, initialVersion]);

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    return [base - 1, base, base + 1, base + 2, base + 3];
  }, []);

  const updateRule = (leaveTypeId, patch) => {
    setRules((prev) => prev.map((rule) => (rule.leaveTypeId === leaveTypeId ? { ...rule, ...patch } : rule)));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name,
      description,
      effectiveYear: Number(effectiveYear),
      effectiveMonth: Number(effectiveMonth),
      leaveTypeRules: buildLeaveTypeRulesPayload(rules),
      rulesForDiff: rules
    });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 space-y-5"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {mode === 'create' ? 'Create Leave Policy' : `Edit "${initialPolicy?.name}"`}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            This becomes the one policy governing every leave calculation for the whole workspace once active.
            {mode === 'edit' && ' Saving creates a new version — past accruals and approved requests keep reading the content that was in effect when they happened.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Policy name
            <input required className={`${inputClass} mt-1.5`} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Start month
              <select className={`${inputClass} mt-1.5`} style={inputStyle} value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Start year
              <select className={`${inputClass} mt-1.5`} style={inputStyle} value={effectiveYear} onChange={(e) => setEffectiveYear(e.target.value)}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
        </div>
        <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Description (optional)
          <textarea rows={2} className={`${inputClass} mt-1.5`} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          If the start date is in the future, this policy is <strong>scheduled</strong> and activates automatically at that month's start, in the workspace's own timezone — it can't be activated early.
        </p>

        <LeaveTypeAllocationCards rules={rules} updateRule={updateRule} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting || !rules.length}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Create Policy' : 'Review Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PolicyFormModal;
