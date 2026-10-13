import React, { useState } from 'react';
import { Loader, Plus } from 'lucide-react';
import useDepartmentStore from '../../store/departmentStore';

/**
 * Inline "create a department" mini-form — reuses the existing
 * departmentStore.createDepartment (POST /api/departments, unchanged),
 * shared by WorkspaceSetupBanner's urgent zero-department case and
 * WorkspaceOnboardingChecklist's department checklist item.
 */
const QuickCreateDepartmentForm = ({ onCreated }) => {
  const createDepartment = useDepartmentStore((s) => s.createDepartment);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await createDepartment(trimmed, '', []);
      setName('');
      onCreated?.(created);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create department');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          placeholder="Department name"
          maxLength={50}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
          style={{
            backgroundColor: 'var(--color-bg-subtle, var(--color-card-bg))',
            borderColor: error ? '#ef4444' : 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </button>
      </form>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
};

export default QuickCreateDepartmentForm;
