import React, { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { ArrowLeft, Loader, Send, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { inviteMemberBulkSimple } from '../../../services/memberInvitationApi';

const STATUS_BADGE = {
  valid: 'bg-emerald-100 text-emerald-700',
  invalid: 'bg-red-100 text-red-700',
  duplicate: 'bg-amber-100 text-amber-700',
};
const STATUS_LABEL = { valid: 'Valid', invalid: 'Invalid', duplicate: 'Duplicate' };

/**
 * Step 2: show validate/dedupe results from BulkInviteEmailInput, pick the
 * role + department common to the whole batch, and submit through the
 * SAME centralized invite-member service every other entry point uses
 * (method: 'bulk_simple') — only valid, non-duplicate rows are sent.
 */
const BulkInvitePreview = ({ rows, workspaceId, departmentOptions, roleOptions, defaultDepartmentId, onBack, onSubmitted }) => {
  const [role, setRole] = useState(roleOptions?.find((r) => r.slug === 'employee')?.slug || roleOptions?.[0]?.slug || '');
  const [department, setDepartment] = useState(defaultDepartmentId || '');
  const [submitting, setSubmitting] = useState(false);

  const counts = useMemo(() => ({
    valid: rows.filter((r) => r.status === 'valid').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
  }), [rows]);

  const validEmails = useMemo(() => rows.filter((r) => r.status === 'valid').map((r) => r.email), [rows]);

  const handleSubmit = async () => {
    if (validEmails.length === 0) {
      toast.warning('No valid email addresses to send');
      return;
    }
    setSubmitting(true);
    try {
      const result = await inviteMemberBulkSimple(workspaceId, {
        emails: validEmails,
        role: role || undefined,
        department: department || undefined,
      });
      onSubmitted(result);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send bulk invitations');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={13} /> {counts.valid} valid</span>
        {counts.duplicate > 0 && (
          <span className="flex items-center gap-1 text-amber-600"><Copy size={13} /> {counts.duplicate} duplicate</span>
        )}
        {counts.invalid > 0 && (
          <span className="flex items-center gap-1 text-red-600"><XCircle size={13} /> {counts.invalid} invalid</span>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto rounded-xl border divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
        {rows.map((row, idx) => (
          <div key={`${row.raw}-${idx}`} className="flex items-center justify-between px-3 py-2 text-xs gap-2">
            <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{row.email}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${STATUS_BADGE[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Role for everyone</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none capitalize"
            style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
          >
            {(roleOptions || []).map((r) => (
              <option key={r._id} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Department (optional)</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
          >
            <option value="">No department</option>
            {(departmentOptions || []).map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-2.5 text-sm font-semibold rounded-xl border disabled:opacity-60"
          style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || validEmails.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
        >
          {submitting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          {submitting ? 'Sending...' : `Send ${validEmails.length} Invitation${validEmails.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
};

export default BulkInvitePreview;
