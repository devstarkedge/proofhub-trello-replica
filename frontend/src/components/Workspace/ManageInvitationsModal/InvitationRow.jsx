import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Clock, Mail, RotateCw, Ban, Loader, AlertTriangle, Building2 } from 'lucide-react';
import { resendInvitation, revokeInvitation } from '../../../services/invitationManagementApi';

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-700',
  expired: 'bg-slate-100 text-slate-600',
  revoked: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL = {
  pending: 'Pending',
  expired: 'Expired',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
  accepted: 'Accepted',
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const InvitationRow = ({ invitation, workspaceId, onResendSuccess, onRevokeSuccess }) => {
  const [busy, setBusy] = useState(false);
  const actionable = invitation.status === 'pending' || invitation.status === 'expired';

  const handleResend = async () => {
    setBusy(true);
    try {
      const updated = await resendInvitation(workspaceId, invitation._id);
      toast.success(`Invitation resent to ${invitation.email}`);
      onResendSuccess(invitation._id, updated);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to resend this invitation');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await revokeInvitation(workspaceId, invitation._id);
      toast.success(`Invitation to ${invitation.email} revoked`);
      onRevokeSuccess(invitation._id);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to revoke this invitation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border"
      style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-muted)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {invitation.email}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[invitation.status] || 'bg-slate-100 text-slate-600'}`}>
            {STATUS_LABEL[invitation.status] || invitation.status}
          </span>
          {invitation.lastEmailError && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700" title={invitation.lastEmailError}>
              <AlertTriangle size={10} /> Email failed to send
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
          {invitation.roleId?.name && <span className="capitalize">{invitation.roleId.name}</span>}
          {invitation.requestedDepartment?.[0]?.name && (
            <span className="flex items-center gap-1"><Building2 size={11} /> {invitation.requestedDepartment[0].name}</span>
          )}
          <span>Invited by {invitation.invitedBy?.name || 'Unknown'}</span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {invitation.status === 'pending' || invitation.status === 'expired'
              ? `Expires ${formatDate(invitation.expiresAt)}`
              : `Sent ${formatDate(invitation.createdAt)}`}
          </span>
        </div>
      </div>

      {actionable && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleResend}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader size={13} className="animate-spin" /> : <RotateCw size={13} />}
            Resend
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border disabled:opacity-60 transition-colors"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {busy ? <Loader size={13} className="animate-spin" /> : <Ban size={13} />}
            Revoke
          </button>
        </div>
      )}
      {!actionable && (
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          <Mail size={12} />
          {invitation.status === 'accepted' ? `Accepted ${formatDate(invitation.acceptedAt)}` : STATUS_LABEL[invitation.status]}
        </div>
      )}
    </div>
  );
};

export default InvitationRow;
