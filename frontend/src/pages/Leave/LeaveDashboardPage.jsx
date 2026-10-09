import React, { useContext, useEffect, useState } from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import LeaveDashboardRecords from '../../components/Leave/LeaveDashboardRecords';
import { CalendarDays } from 'lucide-react';
import AuthContext from '../../context/AuthContext';
import LeaveBalanceSummaryCard from '../../components/Leave/LeaveBalanceSummaryCard';
import LeaveRequestList from '../../components/Leave/LeaveRequestList';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import * as leaveApi from '../../services/leaveApi';
import { isMyLeaveBlockedForRole } from '../../utils/leaveAccess';

/** Every dashboard viewer's own personal balance/requests, shown below their team or workspace section. */
const EmployeeSection = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => leaveApi.getEmployeeDashboard().then(({ data }) => { if (active) { setData(data); setError(''); } }).catch(() => { if (active) setError('Unable to refresh personal leave data.'); });
    const events = ['socket-leave-balance-updated', 'socket-leave-calendar-updated', 'socket-leave-request-updated', 'socket-leave-request-created'];
    load(); events.forEach((event) => window.addEventListener(event, load));
    return () => { active = false; events.forEach((event) => window.removeEventListener(event, load)); };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading personal leave…</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.balances.map((balance) => <LeaveBalanceSummaryCard key={balance.leaveType.id} balance={balance} />)}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>My Upcoming Approved Leave</h3>
        <LeaveRequestList
          requests={data.upcomingApprovedLeaves}
          emptyTitle="No upcoming approved leave"
          emptyDescription="Approved requests will appear here as their dates approach."
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>My Pending Requests</h3>
        <LeaveRequestList
          requests={data.pendingRequests}
          emptyTitle="No pending requests"
          emptyDescription="New requests awaiting approval will appear here."
        />
      </div>
    </div>
  );
};

const ApprovalSection = ({ workspaceScope }) => {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => leaveApi.getApprovalQueue().then(({ data }) => { if (active) setRequests([...new Map(data.filter((a) => a.request && ['SUBMITTED', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED'].includes(a.request.status)).map((a) => [a.request._id, a.request])).values()]); }).catch(() => {});
    load();
    window.addEventListener('socket-leave-calendar-updated', load);
    window.addEventListener('socket-leave-approval-updated', load);
    return () => { active = false; window.removeEventListener('socket-leave-calendar-updated', load); window.removeEventListener('socket-leave-approval-updated', load); };
  }, []);
  return <section className="space-y-3"><h3 className="text-sm font-semibold">{workspaceScope ? 'Pending Approvals (HR / Admin)' : 'Pending Approvals'}</h3><LeaveRequestList requests={requests} showRequester emptyTitle="No actionable pending approvals" /><a href="/leave/approvals" className="text-sm underline">Open approvals</a></section>;
};

/** Visibility is resolved server-side for the active workspace. */
const DashboardContent = () => {
  const { user } = useContext(AuthContext);
  const [scope, setScope] = useState(undefined); // undefined = loading, null = errored

  useEffect(() => {
    leaveApi.getDashboardScope().then(({ data }) => setScope(data)).catch(() => setScope(null));
  }, []);

  if (scope === undefined) return <p>Loading dashboard…</p>;
  if (!scope) return <p role="alert">Unable to load dashboard permissions. Refresh to retry.</p>;

  // Admin administers this module rather than participating in it
  // personally — no personal balance/requests section, matching every
  // other "My Leave" call site being rejected for this role server-side
  // (leaveAuthorization.service.js#isMyLeaveSelfServiceBlocked). Every
  // other dashboard viewer (Manager/HR/custom role) keeps their own
  // personal slice below their team/workspace view, unchanged.
  const showPersonalSection = !isMyLeaveBlockedForRole(user?.role);

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="Leave Dashboard"
        description="A clear view of balances, requests, approvals, and who is away today."
        icon={CalendarDays}
      />

      <LeaveDashboardRecords />
      {scope.scope !== 'none' && <ApprovalSection workspaceScope={scope.scope === 'workspace'} />}
      {showPersonalSection && <EmployeeSection />}
    </div>
  );
};

const LeaveDashboardPage = () => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  return <DashboardContent key={currentWorkspace?._id} />;
};
export default LeaveDashboardPage;
