import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import LeaveTypeAllocationCards from './LeaveTypeAllocationCards';
import { MONTHS } from './PolicyFormModal';
import { ruleFromVersion, buildLeaveTypeRulesPayload } from '../../utils/leavePolicyRules';
import * as leaveApi from '../../services/leaveApi';
import Database from '../../services/database';
import useRoleStore from '../../store/roleStore';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

const SCOPE_OPTIONS = [
  { value: 'department', label: 'Department' },
  { value: 'role', label: 'Role' },
  { value: 'employee', label: 'Specific Employee' }
];

/**
 * Create/edit an override policy targeted at one department, role, or
 * employee — it takes precedence over the workspace default policy for
 * whoever it targets (resolvePolicyContext already ranks assignments by
 * specificity), and never competes for the single-active-default slot.
 * `mode: 'edit'` locks the scope/target (only the allocation content and
 * effective date can change — re-targeting means creating a new override).
 */
const OverridePolicyFormModal = ({ mode = 'create', initialPolicy, initialAssignment, onCancel, onSubmit, submitting }) => {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const { roles, loadRoles } = useRoleStore();

  const [name, setName] = useState(initialPolicy?.name || '');
  const [description, setDescription] = useState(initialPolicy?.description || '');
  const [scope, setScope] = useState(initialAssignment?.scope || 'department');
  const [scopeRef, setScopeRef] = useState(initialAssignment?.scopeRef || '');
  const now = new Date();
  const [effectiveYear, setEffectiveYear] = useState(now.getFullYear());
  const [effectiveMonth, setEffectiveMonth] = useState(now.getMonth() + 1);
  const [rules, setRules] = useState([]);

  useEffect(() => {
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
    Database.getDepartments().then((res) => setDepartments(res?.data || [])).catch(() => setDepartments([]));
    Database.getUsers().then((res) => setUsers(res?.data || res?.users || [])).catch(() => setUsers([]));
    loadRoles().catch(() => {});
  }, [loadRoles]);

  useEffect(() => {
    if (!leaveTypes.length) return;
    const existingRules = initialPolicy?.currentVersion?.leaveTypeRules || [];
    setRules(leaveTypes.map((type) => ruleFromVersion(type, existingRules)));
  }, [leaveTypes, initialPolicy]);

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    return [base - 1, base, base + 1, base + 2, base + 3];
  }, []);

  const targetOptions = scope === 'department' ? departments : scope === 'role' ? roles : users;

  const updateRule = (leaveTypeId, patch) => {
    setRules((prev) => prev.map((rule) => (rule.leaveTypeId === leaveTypeId ? { ...rule, ...patch } : rule)));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name,
      description,
      scope,
      scopeRef,
      effectiveYear: Number(effectiveYear),
      effectiveMonth: Number(effectiveMonth),
      leaveTypeRules: buildLeaveTypeRulesPayload(rules)
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
            {mode === 'create' ? 'Create Policy Override' : `Edit "${initialPolicy?.name}"`}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            This policy applies only to the department, role, or employee selected below — everyone else keeps following the workspace default policy.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Policy name
            <input required className={`${inputClass} mt-1.5`} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Description (optional)
            <input className={`${inputClass} mt-1.5`} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Applies to
            <select
              className={`${inputClass} mt-1.5`} style={inputStyle} value={scope} disabled={mode === 'edit'}
              onChange={(e) => { setScope(e.target.value); setScopeRef(''); }}
            >
              {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {scope === 'department' ? 'Department' : scope === 'role' ? 'Role' : 'Employee'}
            <select
              required className={`${inputClass} mt-1.5`} style={inputStyle} value={scopeRef} disabled={mode === 'edit'}
              onChange={(e) => setScopeRef(e.target.value)}
            >
              <option value="">Select…</option>
              {targetOptions.map((option) => (
                <option key={option._id} value={option._id}>
                  {scope === 'employee' ? `${option.name} (${option.email})` : option.name}
                </option>
              ))}
            </select>
          </label>
        </div>

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

        <LeaveTypeAllocationCards rules={rules} updateRule={updateRule} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting || !rules.length || !scopeRef}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Create Override' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OverridePolicyFormModal;
