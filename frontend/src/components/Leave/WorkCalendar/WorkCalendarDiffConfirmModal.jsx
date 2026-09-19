import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';

/** Shown only when there's at least one real difference — the caller skips straight past this when the diff is empty. */
const WorkCalendarDiffConfirmModal = ({ diff, onCancel, onConfirm, submitting }) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
    <div
      className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 space-y-4"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Update Workspace Work Calendar?</h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Review what will change before saving. This affects future and current working-day calculations across Leave, Reports, and Teams — historical records already stored are never rewritten.
        </p>
      </div>

      <div className="space-y-2">
        {diff.map((row, index) => (
          <div key={`${row.label}-${index}`} className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--color-border-default)' }}>
            <p className="mb-1.5 font-semibold" style={{ color: 'var(--color-text-primary)' }}>{row.label}</p>
            <div className="flex items-center gap-2">
              <span className="rounded px-2 py-1" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error-text)' }}>{row.oldValue}</span>
              <ArrowRight className="h-3.5 w-3.5 flex-none" style={{ color: 'var(--color-text-muted)' }} />
              <span className="rounded px-2 py-1" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success-text)' }}>{row.newValue}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="button" onClick={onConfirm} disabled={submitting}>{submitting ? 'Saving…' : 'Confirm & Save'}</Button>
      </div>
    </div>
  </div>
);

export default WorkCalendarDiffConfirmModal;
