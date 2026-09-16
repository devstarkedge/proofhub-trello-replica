import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
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

/** Every dashboard viewer's own personal balance/requests, shown below their team or workspace section. */
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

/**
 * Department-scoped — every count/list here comes from
 * GET /dashboard/manager, which derives the department list server-side
 * from Department.managers (never a client-supplied id), so this section
 * can never show another department's data no matter who renders it.
 */
const DepartmentSection = () => {
  const [data, setData] = useState(null);
  useEffect(() => { leaveApi.getManagerDashboard().then(({ data }) => setData(data)).catch(() => {}); }, []);
  if (!data) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Team Size" value={data.summary.teamSize} />
        <StatTile label="Pending" value={data.summary.pendingCount} color="var(--color-warning-text)" />
        <StatTile label="Approved" value={data.summary.approvedCount} color="var(--color-success-text)" />
        <StatTile label="Rejected" value={data.summary.rejectedCount} color="var(--color-error-text)" />
        <StatTile label="Cancelled" value={data.summary.cancelledCount} />
        <StatTile label="On Leave Today" value={data.summary.onLeaveTodayCount} color="var(--color-info-text)" />
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
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Team Upcoming Approved Leave</h3>
        <LeaveRequestList
          requests={data.upcomingApprovedLeave}
          showRequester
          emptyTitle="No upcoming approved leave"
          emptyDescription="Approved leave for your team will appear here as dates approach."
        />
      </div>
    </div>
  );
};

/** Workspace-wide — served only to callers the backend has already verified hold leave:view_workspace (Admin always, HR by default, or a custom role with an explicit grant). */
const WorkspaceSection = () => {
  const [data, setData] = useState(null);
  useEffect(() => { leaveApi.getAdminDashboard().then(({ data }) => setData(data)).catch(() => {}); }, []);
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

/**
 * Access to this page is decided entirely by the server — never by
 * branching on the client's `user.role` string, since a custom role's real
 * entitlement (department-manager membership, or an explicit
 * leave:view_workspace grant) can only be resolved there. A plain Employee
 * (or any role with neither) is redirected to My Leave rather than shown an
 * empty dashboard shell; no dashboard API is ever called before this check
 * resolves.
 */
const LeaveDashboardPage = () => {
  const [scope, setScope] = useState(undefined); // undefined = loading, null = errored

  useEffect(() => {
    leaveApi.getDashboardScope().then(({ data }) => setScope(data)).catch(() => setScope(null));
  }, []);

  if (scope === undefined) return null;
  if (!scope || scope.scope === 'none') return <Navigate to="/leave/my" replace />;

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="Leave Dashboard"
        description="A clear view of balances, requests, approvals, and who is away today."
        icon={CalendarDays}
      />

      {scope.scope === 'workspace' && <WorkspaceSection />}
      {scope.scope === 'department' && <DepartmentSection />}
      <EmployeeSection />
    </div>
  );
};

export default LeaveDashboardPage;
