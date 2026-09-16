import React, { useEffect, useState, useCallback } from 'react';
import { CalendarCheck2, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import LeaveBalanceSummaryCard from '../../components/Leave/LeaveBalanceSummaryCard';
import LeaveRequestForm from '../../components/Leave/LeaveRequestForm';
import LeaveRequestList from '../../components/Leave/LeaveRequestList';
import LeaveApprovalTimeline from '../../components/Leave/LeaveApprovalTimeline';
import LeaveStatusBadge from '../../components/Leave/LeaveStatusBadge';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import useLeaveStore from '../../store/leaveStore';
import * as leaveApi from '../../services/leaveApi';
import { toast } from 'react-toastify';

const MyLeavePage = () => {
  const { balances, myRequests, fetchMyBalance, fetchMyRequests, cancelPendingRequest, handleRequestUpdated, handleBalanceUpdated } = useLeaveStore();
  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detail, setDetail] = useState(null);

  const refresh = useCallback(() => {
    fetchMyBalance().catch(() => {});
    fetchMyRequests().catch(() => {});
  }, [fetchMyBalance, fetchMyRequests]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onRequestUpdated = (event) => handleRequestUpdated(event.detail);
    const onBalanceUpdated = (event) => handleBalanceUpdated(event.detail);
    window.addEventListener('socket-leave-request-created', onRequestUpdated);
    window.addEventListener('socket-leave-request-updated', onRequestUpdated);
    window.addEventListener('socket-leave-balance-updated', onBalanceUpdated);
    return () => {
      window.removeEventListener('socket-leave-request-created', onRequestUpdated);
      window.removeEventListener('socket-leave-request-updated', onRequestUpdated);
      window.removeEventListener('socket-leave-balance-updated', onBalanceUpdated);
    };
  }, [handleRequestUpdated, handleBalanceUpdated]);

  useEffect(() => {
    if (!selectedRequest) { setDetail(null); return; }
    leaveApi.getRequestDetail(selectedRequest._id).then(({ data }) => setDetail(data)).catch(() => setDetail(null));
  }, [selectedRequest]);

  const handleCancel = async (request) => {
    try {
      await cancelPendingRequest(request._id);
      toast.success('Leave request cancelled');
      refresh();
    } catch {
      // axios interceptor already toasts the error
    }
  };

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="My Leave"
        description="Review your balances and manage your time-off requests."
        icon={CalendarCheck2}
        action={<Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Request Leave
        </Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {balances.map((balance) => (
          <LeaveBalanceSummaryCard key={balance.leaveType.id} balance={balance} />
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>My Requests</h2>
        <LeaveRequestList
          requests={myRequests}
          onCancel={handleCancel}
          onSelect={setSelectedRequest}
          emptyTitle="No leave requests yet"
          emptyDescription="When you request leave, its approval progress and status will appear here."
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Request Leave</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} /></button>
            </div>
            <LeaveRequestForm
              onCancel={() => setShowForm(false)}
              onSubmitted={() => { setShowForm(false); toast.success('Leave request submitted'); refresh(); }}
            />
          </div>
        </div>
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={() => setSelectedRequest(null)}>
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'var(--color-bg-base)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{selectedRequest.leaveType?.name}</h3>
                <LeaveStatusBadge status={selectedRequest.status} className="mt-1" />
              </div>
              <button onClick={() => setSelectedRequest(null)}><X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} /></button>
            </div>
            {detail ? <LeaveApprovalTimeline approvals={detail.approvals} /> : <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyLeavePage;
