import React, { useContext, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarCheck2, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import LeaveBalanceSummaryCard from '../../components/Leave/LeaveBalanceSummaryCard';
import LeaveRequestForm from '../../components/Leave/LeaveRequestForm';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import * as leaveApi from '../../services/leaveApi';
import { isMyLeaveBlockedForRole } from '../../utils/leaveAccess';
import useLeaveQuery from '../../hooks/useLeaveQuery';
import { toast } from 'react-toastify';
import PersonalLeaveHistory from '../../components/Leave/PersonalLeaveHistory';

function PersonalLeave({ workspaceId }) {
  const balanceRead = useLeaveQuery('balance', {}, leaveApi.getMyBalance);
  const balances = balanceRead.isError ? [] : balanceRead.data || [];
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const refresh = balanceRead.refetch;
  return <div className="space-y-7">
    <LeavePageHeader title="My Leave" description="Review your balances and request time off." icon={CalendarCheck2} action={<Button onClick={() => setShowForm(true)} className="flex items-center gap-2"><Plus className="h-4 w-4" /> Request Leave</Button>} />
    {balanceRead.isPending && <p role="status">Loading balances…</p>}
    {balanceRead.isError && <p role="alert">Unable to refresh your balances. <button type="button" className="underline" onClick={() => refresh()}>Retry</button></p>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{balances.map((balance) => <LeaveBalanceSummaryCard key={balance.leaveType.id} balance={balance} />)}</div>
    <PersonalLeaveHistory workspaceId={workspaceId} onChanged={refresh} />
    {showForm && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="request-leave-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--color-bg-base)' }}><div className="mb-4 flex items-center justify-between"><h3 id="request-leave-title" className="font-bold">Request Leave</h3><button type="button" aria-label="Close leave form" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div><LeaveRequestForm onCancel={() => setShowForm(false)} onSubmitted={(result) => { setShowForm(false); toast.success('Leave request submitted'); navigate(`/leave/my?historyTab=requests&request=${result.request._id}`); }} /></div></div>}
  </div>;
}

export default function MyLeavePage() {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  if (isMyLeaveBlockedForRole(user?.role)) return <Navigate to="/leave" replace />;
  return <PersonalLeave key={`${currentWorkspace?._id}:${user?._id || user?.id}`} workspaceId={currentWorkspace?._id} />;
}
