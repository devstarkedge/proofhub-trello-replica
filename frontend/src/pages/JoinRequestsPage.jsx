import React, { useContext, useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { ClipboardCheck, Check, X, Loader, ChevronDown, Clock } from 'lucide-react';
import WorkspaceContext from '../context/WorkspaceContext';
import useDepartmentStore from '../store/departmentStore';
import useRoleStore from '../store/roleStore';
import Avatar from '../components/Avatar';
import { approveJoinRequest, rejectJoinRequest } from '../services/memberInvitationApi';
import useJoinRequestsLive from '../hooks/useJoinRequestsLive';

const formatDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The Approval Dashboard for the centralized Invite Member system's Method B
 * ("Send Registration Invitation") — reviews WorkspaceJoinRequests created
 * when a requiresApproval invitation is accepted. See
 * backend/modules/workspaces/joinRequestService.js.
 */
const JoinRequestsPage = () => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const departmentStore = useDepartmentStore();
  const { roles, loadRoles } = useRoleStore();
  const activeRoles = useMemo(() => (roles || []).filter((r) => r.isActive !== false), [roles]);

  // Shared with the Sidebar badge — one fetch, one set of JOIN_REQUEST_*
  // socket handlers, so the list here and the count there never disagree.
  const { requests, loading, removeRequest } = useJoinRequestsLive();
  const [expandedId, setExpandedId] = useState(null);
  const [overrideDept, setOverrideDept] = useState('');
  const [overrideRole, setOverrideRole] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    departmentStore.loadDepartments();
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?._id]);

  const toggleExpand = (req) => {
    if (expandedId === req._id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(req._id);
    setOverrideDept(req.requestedDepartment?.[0]?._id || '');
    setOverrideRole(req.requestedRoleId?.slug || '');
  };

  const handleApprove = async (req) => {
    setBusyId(req._id);
    try {
      await approveJoinRequest(currentWorkspace._id, req._id, {
        department: overrideDept || undefined,
        role: overrideRole || undefined,
      });
      toast.success(`${req.user.name} has been approved`);
      setExpandedId(null);
      removeRequest(req._id);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to approve this request');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req) => {
    setBusyId(req._id);
    try {
      await rejectJoinRequest(currentWorkspace._id, req._id, rejectReason);
      toast.success(`${req.user.name}'s request was declined`);
      setRejectingId(null);
      setRejectReason('');
      removeRequest(req._id);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reject this request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <ClipboardCheck size={20} className="text-cyan-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Join Requests</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            People who registered via an invitation and are waiting for your review.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader size={24} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <ClipboardCheck size={32} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending join requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req._id}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-card-bg)' }}
            >
              <div className="flex items-center gap-3 p-4">
                <Avatar src={req.user?.avatar} name={req.user?.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{req.user?.name}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{req.user?.email}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {req.requestedDepartment?.[0]?.name && <span>{req.requestedDepartment[0].name}</span>}
                    {req.requestedRoleId?.name && <span className="capitalize">{req.requestedRoleId.name}</span>}
                    <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(req.createdAt)}</span>
                  </div>
                  {req.message && (
                    <p className="text-xs italic mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>&quot;{req.message}&quot;</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleExpand(req)}
                    disabled={busyId === req._id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check size={13} /> Approve <ChevronDown size={12} className={expandedId === req._id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectingId(rejectingId === req._id ? null : req._id); setRejectReason(''); }}
                    disabled={busyId === req._id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border disabled:opacity-60"
                    style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={13} /> Reject
                  </button>
                </div>
              </div>

              {expandedId === req._id && (
                <div className="px-4 pb-4 pt-1 border-t space-y-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Confirm or adjust department/role before approving:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={overrideDept}
                      onChange={(e) => setOverrideDept(e.target.value)}
                      className="px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="">No department</option>
                      {(departmentStore.departments || []).map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                    <select
                      value={overrideRole}
                      onChange={(e) => setOverrideRole(e.target.value)}
                      className="px-3 py-2 rounded-lg border text-sm outline-none capitalize"
                      style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
                    >
                      {activeRoles.map((r) => (
                        <option key={r._id} value={r.slug}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApprove(req)}
                    disabled={busyId === req._id}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
                  >
                    {busyId === req._id ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                    Approve Member
                  </button>
                </div>
              )}

              {rejectingId === req._id && (
                <div className="px-4 pb-4 pt-1 border-t space-y-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Reason (optional)"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                    style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleReject(req)}
                    disabled={busyId === req._id}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border disabled:opacity-60"
                    style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                  >
                    {busyId === req._id ? <Loader size={14} className="animate-spin" /> : <X size={14} />}
                    Confirm Rejection
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JoinRequestsPage;
