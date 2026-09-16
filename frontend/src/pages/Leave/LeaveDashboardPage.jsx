import React, { useContext, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import AuthContext from '../../context/AuthContext';
import LeaveBalanceSummaryCard from '../../components/Leave/LeaveBalanceSummaryCard';
import LeaveRequestList from '../../components/Leave/LeaveRequestList';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import * as leaveApi from '../../services/leaveApi';

const StatTile = ({ label, value, color }) => (
  <div className="rounded-xl border p-4 shadow-sm sm:p-5" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className="text-2xl font-bold" style={{ color: color || 'var(--color-text-primary)' }}>{value}</div>
    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
  </div>
);

const EmployeeSection = () => {
  const [data, setData] = useState(null);
  useEffect(() => { leaveApi.getEmployeeDashboard().then(({ data }) => setData(data)).catch(() => {}); }, []);
  if (!data) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.balances.map((balance) => <LeaveBalanceSummaryCard key={balance.leaveType.id} balance={balance} />)}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Upcoming Approved Leave</h3>
        <LeaveRequestList
          requests={data.upcomingApprovedLeaves}
          emptyTitle="No upcoming approved leave"
          emptyDescription="Approved requests will appear here as their dates approach."
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Pending Requests</h3>
        <LeaveRequestList
          requests={data.pendingRequests}
          emptyTitle="No pending requests"
          emptyDescription="New requests awaiting approval will appear here."
        />
      </div>
    </div>
  );
};

const ManagerSection = () => {
  const [data, setData] = useState(null);
  useEffect(() => { leaveApi.getManagerDashboard().then(({ data }) => setData(data)).catch(() => {}); }, []);
  if (!data) return null;
  const onLeaveToday = Object.values(data.teamOnLeaveToday || {}).filter((byDate) => Object.values(byDate)[0]?.status === 'ON_LEAVE').length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Departments Managed" value={data.departmentIds.length} />
        <StatTile label="On Leave Today" value={onLeaveToday} color="var(--color-warning-text)" />
        <StatTile label="Pending Approvals" value={data.pendingApprovals.length} color="var(--color-error-text)" />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Team Pending Requests</h3>
        <LeaveRequestList
          requests={data.teamPendingRequests}
          showRequester
          emptyTitle="Your team is all caught up"
          emptyDescription="There are no team leave requests waiting for review."
        />
      </div>
    </div>
  );
};

const WorkspaceWideSection = ({ fetcher }) => {
  const [data, setData] = useState(null);
  useEffect(() => { fetcher().then(({ data }) => setData(data)).catch(() => {}); }, [fetcher]);
  if (!data) return null;
  const { summary } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Pending" value={summary.pendingCount} color="var(--color-warning-text)" />
        <StatTile label="Approved" value={summary.approvedCount} color="var(--color-success-text)" />
        <StatTile label="Rejected" value={summary.rejectedCount} color="var(--color-error-text)" />
        <StatTile label="Cancelled" value={summary.cancelledCount} />
        <StatTile label="On Leave Today" value={summary.onLeaveTodayCount} color="var(--color-info-text)" />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Pending Approvals (HR / Admin)</h3>
        <LeaveRequestList
          requests={data.pendingApprovals.map((a) => a.request)}
          showRequester
          emptyTitle="No pending approvals"
          emptyDescription="Workspace leave requests that need an HR or Admin decision will appear here."
        />
      </div>
    </div>
  );
};

const LeaveDashboardPage = () => {
  const { user } = useContext(AuthContext);
  const role = (user?.role || '').toLowerCase();

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="Leave Dashboard"
        description="A clear view of balances, requests, approvals, and who is away today."
        icon={CalendarDays}
      />

      {role === 'manager' && <ManagerSection />}
      {role === 'hr' && <WorkspaceWideSection fetcher={leaveApi.getHrDashboard} />}
      {role === 'admin' && <WorkspaceWideSection fetcher={leaveApi.getAdminDashboard} />}
      <EmployeeSection />
    </div>
  );
};

export default LeaveDashboardPage;
