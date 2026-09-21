import React, { useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import DepartmentContext from '../../context/DepartmentContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import useRoleStore from '../../store/roleStore';
import { getWorkspaceMembers } from '../../services/workspaceMembersApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] disabled:opacity-40';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const FIELDS = [
  { key: 'startLocalTime', label: 'Start time', type: 'time' },
  { key: 'endLocalTime', label: 'End time', type: 'time' },
  { key: 'graceMinutes', label: 'Check-in grace (minutes)', type: 'number', min: 0 },
  { key: 'earlyExitGraceMinutes', label: 'Early-exit grace (minutes)', type: 'number', min: 0 },
  { key: 'minimumFullDayMinutes', label: 'Full-day minimum (minutes)', type: 'number', min: 1 },
  { key: 'minimumHalfDayMinutes', label: 'Half-day minimum (minutes)', type: 'number', min: 1 }
];
const FIELD_DEFAULTS = { startLocalTime: '09:00', endLocalTime: '18:00', graceMinutes: 15, earlyExitGraceMinutes: 0, minimumFullDayMinutes: 480, minimumHalfDayMinutes: 240 };

function initFieldState(initialOverride) {
  const state = {};
  for (const { key } of FIELDS) {
    const value = initialOverride?.[key];
    state[key] = { enabled: value !== null && value !== undefined, value: value ?? FIELD_DEFAULTS[key] };
  }
  return state;
}

/**
 * Create an Office Hours Override for a Role, Department, or User (new
 * spec §15-23). PARTIAL override — only the fields you check here replace
 * the workspace default; everything left unchecked falls through to
 * Shift/Policy unchanged (see attendanceOfficeHoursOverride.model.js's own
 * doc comment for the exact resolution order).
 */
const OfficeHoursOverrideFormModal = ({ mode = 'create', initialOverride, submitting, onCancel, onSubmit }) => {
  const { departments = [] } = useContext(DepartmentContext) || {};
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const { roles, loadRoles, getRolesForDropdown } = useRoleStore();
  const [members, setMembers] = useState([]);

  const [scopeType, setScopeType] = useState(initialOverride?.scopeType || 'DEPARTMENT');
  const [scopeId, setScopeId] = useState(initialOverride?.scopeId || '');
  const [fields, setFields] = useState(() => initFieldState(initialOverride));
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

  const roleOptions = (getRolesForDropdown ? getRolesForDropdown(currentWorkspace?.type) : roles || []).filter((r) => r.slug !== 'admin');
  const departmentOptions = departments.filter((d) => d._id !== 'all');
  const scopeOptions = scopeType === 'ROLE' ? roleOptions : scopeType === 'DEPARTMENT' ? departmentOptions : members;

  const handleScopeTypeChange = (value) => {
    setScopeType(value);
    setScopeId('');
  };

  const toggleField = (key) => setFields((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  const setFieldValue = (key, value) => setFields((prev) => ({ ...prev, [key]: { ...prev[key], value } }));

  const anyEnabled = FIELDS.some(({ key }) => fields[key].enabled);

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = { scopeType, scopeId, priority: Number(priority), effectiveFrom, effectiveUntil: effectiveUntil || null };
    for (const { key, type } of FIELDS) {
      payload[key] = fields[key].enabled ? (type === 'number' ? Number(fields[key].value) : fields[key].value) : null;
    }
    onSubmit(payload);
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
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{mode === 'create' ? 'Add Office Hours Override' : 'Edit Office Hours Override'}</h2>
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

        <div className="space-y-2">
          <label className={labelClass} style={labelStyle}>Only checked fields override the workspace default — everything else falls through unchanged</label>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label, type, min }) => (
              <div key={key}>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={labelStyle}>
                  <input type="checkbox" checked={fields[key].enabled} onChange={() => toggleField(key)} className="h-3.5 w-3.5 rounded" />
                  {label}
                </label>
                <input
                  type={type} min={min} disabled={!fields[key].enabled} className={inputClass} style={inputStyle}
                  value={fields[key].value} onChange={(e) => setFieldValue(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

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
          <Button type="submit" disabled={submitting || !scopeId || !anyEnabled}>{submitting ? 'Saving…' : mode === 'create' ? 'Add Override' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
};

export default OfficeHoursOverrideFormModal;
