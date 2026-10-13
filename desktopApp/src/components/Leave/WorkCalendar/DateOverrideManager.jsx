import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../ui/button';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

/** One-off corrections for a single date — independent of the named Holiday list on its own tab. */
const DateOverrideManager = ({ overrides, onChange }) => {
  const [draft, setDraft] = useState({ date: '', type: 'WORKING_OVERRIDE', reason: '' });
  const [error, setError] = useState('');

  const addOverride = () => {
    setError('');
    if (!draft.date) { setError('A date is required.'); return; }
    if (!draft.reason.trim()) { setError('A short reason is required.'); return; }
    if (overrides.some((o) => o.date === draft.date)) {
      setError('This date already has an override configured — remove the existing one first.');
      return;
    }
    onChange([...overrides, { ...draft, reason: draft.reason.trim() }]);
    setDraft({ date: '', type: 'WORKING_OVERRIDE', reason: '' });
  };

  const removeOverride = (date) => onChange(overrides.filter((o) => o.date !== date));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_180px_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Date
          <input type="date" className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Type
          <select className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            <option value="WORKING_OVERRIDE">Special Working Day</option>
            <option value="OFF_OVERRIDE">Special Off Day</option>
          </select>
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Reason
          <input className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="e.g. Compensatory working day" />
        </label>
        <Button type="button" onClick={addOverride} className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Add Override</Button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {overrides.length ? (
        <div className="space-y-1.5">
          {overrides.map((override) => (
            <div
              key={override.date}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}
            >
              <span style={{ color: 'var(--color-text-primary)' }}>
                <strong>{override.date}</strong> — {override.type === 'WORKING_OVERRIDE' ? 'Special Working Day' : 'Special Off Day'} · {override.reason}
              </span>
              <button type="button" onClick={() => removeOverride(override.date)} aria-label="Remove override" className="hover:opacity-70">
                <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No date overrides configured.</p>
      )}
    </div>
  );
};

export default DateOverrideManager;
