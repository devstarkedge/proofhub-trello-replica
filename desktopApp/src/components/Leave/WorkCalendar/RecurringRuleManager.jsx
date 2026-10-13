import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../ui/button';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OCCURRENCES = [
  { value: 'FIRST', label: '1st' }, { value: 'SECOND', label: '2nd' }, { value: 'THIRD', label: '3rd' },
  { value: 'FOURTH', label: '4th' }, { value: 'FIFTH', label: '5th' }, { value: 'LAST', label: 'Last' }
];

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

function ruleKey(rule) { return `${rule.dayOfWeek}:${rule.occurrence}`; }

/**
 * Generic nth-weekday overrides — "2nd Saturday = Working", "4th Saturday
 * = Off" — for any weekday, not hardcoded to Saturday. A weekday can't
 * have both an active FIFTH and LAST rule (they can name the same real
 * date in a 5-occurrence month); pre-checked here for a responsive error,
 * re-validated authoritatively by the backend on save regardless.
 */
const RecurringRuleManager = ({ rules, onChange }) => {
  const [draft, setDraft] = useState({ dayOfWeek: 6, occurrence: 'SECOND', action: 'WORKING', label: '' });
  const [error, setError] = useState('');

  const addRule = () => {
    setError('');
    if (rules.some((r) => ruleKey(r) === ruleKey(draft))) {
      setError('This recurring rule already exists — remove the duplicate before adding a new one.');
      return;
    }
    const hasFifth = rules.some((r) => r.dayOfWeek === draft.dayOfWeek && r.occurrence === 'FIFTH');
    const hasLast = rules.some((r) => r.dayOfWeek === draft.dayOfWeek && r.occurrence === 'LAST');
    if ((draft.occurrence === 'FIFTH' && hasLast) || (draft.occurrence === 'LAST' && hasFifth)) {
      setError('A weekday can\'t have both a "5th" and a "Last" rule — they can refer to the same date and conflict.');
      return;
    }
    onChange([...rules, { ...draft }]);
    setDraft({ ...draft, label: '' });
  };

  const removeRule = (rule) => onChange(rules.filter((r) => ruleKey(r) !== ruleKey(rule)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Occurrence
          <select className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.occurrence} onChange={(e) => setDraft({ ...draft, occurrence: e.target.value })}>
            {OCCURRENCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Weekday
          <select className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.dayOfWeek} onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}>
            {DAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Day type
          <select className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            <option value="WORKING">Working</option>
            <option value="OFF">Off</option>
          </select>
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Label (optional)
          <input className={`${inputClass} mt-1.5`} style={inputStyle} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Alternate Saturday" />
        </label>
        <Button type="button" onClick={addRule} className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Add Rule</Button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {rules.length ? (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={ruleKey(rule)}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}
            >
              <span style={{ color: 'var(--color-text-primary)' }}>
                <strong>{OCCURRENCES.find((o) => o.value === rule.occurrence)?.label} {DAY_NAMES[rule.dayOfWeek]}</strong> = {rule.action === 'WORKING' ? 'Working' : 'Off'}
                {rule.label ? ` · ${rule.label}` : ''}
              </span>
              <button type="button" onClick={() => removeRule(rule)} aria-label="Remove rule" className="hover:opacity-70">
                <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No recurring rules configured — every day follows the base weekly pattern above.</p>
      )}
    </div>
  );
};

export default RecurringRuleManager;
