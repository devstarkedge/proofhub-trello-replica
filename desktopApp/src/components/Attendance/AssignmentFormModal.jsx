import React, { useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import DepartmentContext from '../../context/DepartmentContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import { getWorkspaceMembers } from '../../services/workspaceMembersApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

/**
 * Shared "assign this shift/location to workspace|department|user" form —
 * Shift and Location assignments have the identical shape, just a
 * different set of allowed scopes and a different `targetLabel`.
 */
const AssignmentFormModal = ({ targetLabel, targetOptions, scopeOptions, submitting, onCancel, onSubmit }) => {
  const { departments = [] } = useContext(DepartmentContext) || {};
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const [members, setMembers] = useState([]);
  const [targetId, setTargetId] = useState(targetOptions[0]?.value || '');
  const [scope, setScope] = useState(scopeOptions[0]);
  const [scopeRef, setScopeRef] = useState('');

  useEffect(() => {
    if (!currentWorkspace?._id) return;
    getWorkspaceMembers(currentWorkspace._id)
      .then((rows) => setMembers(rows.map((row) => ({ _id: row.user._id, name: row.user.name, email: row.user.email }))))
      .catch(() => {});
  }, [currentWorkspace?._id]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({ targetId, scope, scopeRef: scope === 'workspace' ? null : scopeRef });
  };

  const scopeNeedsRef = scope !== 'workspace';
  const refOptions = scope === 'department' ? departments.filter((d) => d._id !== 'all') : members;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Assign {targetLabel}</h2>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>{targetLabel}</label>
          <select className={inputClass} style={inputStyle} value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
            {targetOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Assign to</label>
          <select className={inputClass} style={inputStyle} value={scope} onChange={(e) => { setScope(e.target.value); setScopeRef(''); }}>
            {scopeOptions.map((s) => (
              <option key={s} value={s}>{s === 'workspace' ? 'Everyone in this workspace' : s === 'department' ? 'A specific department' : 'A specific person'}</option>
            ))}
          </select>
        </div>

        {scopeNeedsRef && (
          <div>
            <label className={labelClass} style={labelStyle}>{scope === 'department' ? 'Department' : 'Person'}</label>
            <select className={inputClass} style={inputStyle} value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} required>
              <option value="" disabled>Select…</option>
              {refOptions.map((opt) => <option key={opt._id} value={opt._id}>{opt.name}</option>)}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting || (scopeNeedsRef && !scopeRef)}>{submitting ? 'Saving…' : 'Assign'}</Button>
        </div>
      </form>
    </div>
  );
};

export default AssignmentFormModal;
