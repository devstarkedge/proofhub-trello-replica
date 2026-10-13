import React, { useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import DepartmentContext from '../../context/DepartmentContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import useRoleStore from '../../store/roleStore';
import { getWorkspaceMembers } from '../../services/workspaceMembersApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const WORK_MODES = ['OFFICE', 'WFH', 'HYBRID', 'FIELD'];

/**
 * Create a Work Mode Override for a Role, Department, or User. REPLACE
 * semantics only (spec §7) — the allowed set here becomes the employee's
 * complete effective set, never unioned with a less-specific level.
 */
const WorkModeOverrideFormModal = ({ mode = 'create', initialOverride, submitting, onCancel, onSubmit }) => {
  const { departments = [] } = useContext(DepartmentContext) || {};
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const { roles, loadRoles, getRolesForDropdown } = useRoleStore();
  const [members, setMembers] = useState([]);

  const [scopeType, setScopeType] = useState(initialOverride?.scopeType || 'DEPARTMENT');
  const [scopeId, setScopeId] = useState(initialOverride?.scopeId || '');
  const [allowedModes, setAllowedModes] = useState(initialOverride?.allowedModes || ['OFFICE']);
  const [defaultMode, setDefaultMode] = useState(initialOverride?.defaultMode || 'OFFICE');
  const [priority, setPriority] = useState(initialOverride?.priority ?? 0);
  const [effectiveFrom, setEffectiveFrom] = useState(() => initialOverride?.effectiveFrom?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [effectiveUntil, setEffectiveUntil] = useState(() => initialOverride?.effectiveUntil?.slice(0, 10) || '');

  useEffect(() => {
    if (!roles?.length) loadRoles().catch(() => {});
  }, [roles, loadRoles]);

  useEffect(() => {
    if (!currentWorkspace?._id) return;
    getWorkspaceMembers(currentWorkspace._id)
      .then((rows) => setMembers(rows.map((row) => ({ _id: row.user._id, name: row.user.name }))))
      .catch(() => {});
  }, [currentWorkspace?._id]);

  const toggleMode = (mode) => {
    setAllowedModes((prev) => {
      const next = prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode];
      if (next.length && !next.includes(defaultMode)) setDefaultMode(next[0]);
      return next;
    });
  };

  const roleOptions = (getRolesForDropdown ? getRolesForDropdown(currentWorkspace?.type) : roles || []).filter((r) => r.slug !== 'admin');
  const departmentOptions = departments.filter((d) => d._id !== 'all');
  const scopeOptions = scopeType === 'ROLE' ? roleOptions : scopeType === 'DEPARTMENT' ? departmentOptions : members;

  const handleScopeTypeChange = (value) => {
    setScopeType(value);
    setScopeId('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      scopeType, scopeId, allowedModes, defaultMode, priority: Number(priority),
      effectiveFrom, effectiveUntil: effectiveUntil || null
    });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{mode === 'create' ? 'Add Work Mode Override' : 'Edit Work Mode Override'}</h2>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Scope</label>
          <select className={inputClass} style={inputStyle} value={scopeType} onChange={(e) => handleScopeTypeChange(e.target.value)} disabled={mode === 'edit'}>
            <option value="USER">Specific User</option>
            <option value="DEPARTMENT">Specific Department</option>
            <option value="ROLE">Specific Role</option>
          </select>
          {mode === 'edit' && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Scope can't be changed — deactivate this override and create a new one instead.</p>}
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>{scopeType === 'ROLE' ? 'Role' : scopeType === 'DEPARTMENT' ? 'Department' : 'Person'}</label>
          <select className={inputClass} style={inputStyle} value={scopeId} onChange={(e) => setScopeId(e.target.value)} disabled={mode === 'edit'} required>
            <option value="" disabled>Select…</option>
            {scopeOptions.map((opt) => <option key={opt._id} value={opt._id}>{opt.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Allowed work modes</label>
          <div className="flex flex-wrap gap-3">
            {WORK_MODES.map((workModeOption) => (
              <label key={workModeOption} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={allowedModes.includes(workModeOption)} onChange={() => toggleMode(workModeOption)} className="h-4 w-4 rounded" />
                {workModeOption}
              </label>
            ))}
          </div>
        </div>

        {allowedModes.length > 1 && (
          <div>
            <label className={labelClass} style={labelStyle}>Default mode (used when the employee doesn't choose)</label>
            <select className={inputClass} style={inputStyle} value={defaultMode} onChange={(e) => setDefaultMode(e.target.value)}>
              {allowedModes.map((workModeOption) => <option key={workModeOption} value={workModeOption}>{workModeOption}</option>)}
            </select>
          </div>
        )}

        {scopeType === 'DEPARTMENT' && (
          <div>
            <label className={labelClass} style={labelStyle}>Priority (tie-break if a person belongs to multiple overridden departments — higher wins)</label>
            <input type="number" className={inputClass} style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass} style={labelStyle}>Effective from</label><input type="date" className={inputClass} style={inputStyle} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required /></div>
          <div><label className={labelClass} style={labelStyle}>Effective until (optional)</label><input type="date" className={inputClass} style={inputStyle} value={effectiveUntil} min={effectiveFrom} onChange={(e) => setEffectiveUntil(e.target.value)} /></div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting || !scopeId || !allowedModes.length}>{submitting ? 'Saving…' : mode === 'create' ? 'Add Override' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
};

export default WorkModeOverrideFormModal;
