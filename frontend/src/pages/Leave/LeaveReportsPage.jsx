import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import * as leaveApi from '../../services/leaveApi';

const COLORS = { APPROVED: '#10b981', REJECTED: '#ef4444', PENDING_APPROVAL: '#f59e0b', CANCELLED_BY_REQUESTER: '#94a3b8' };

const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

const LeaveReportsPage = () => {
  const [trends, setTrends] = useState([]);
  const [turnaround, setTurnaround] = useState(null);

  useEffect(() => {
    const startDate = monthsAgo(6);
    const endDate = new Date().toISOString().slice(0, 10);
    leaveApi.getMonthlyTrends({ startDate, endDate }).then(({ data }) => {
      const byMonth = {};
      data.forEach((row) => {
        byMonth[row.month] = byMonth[row.month] || { month: row.month };
        byMonth[row.month][row.status] = row.count;
      });
      setTrends(Object.values(byMonth));
    }).catch(() => {});
    leaveApi.getApprovalTurnaround({ startDate, endDate }).then(({ data }) => setTurnaround(data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-7">
      <LeavePageHeader
        title="Leave Reports"
        description="Monitor approval efficiency, pending work, and leave trends across the workspace."
        icon={BarChart3}
      />

      {turnaround && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-5 shadow-sm" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{turnaround.averageTurnaroundHours}h</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Avg. Approval Turnaround</div>
          </div>
          <div className="rounded-xl border p-5 shadow-sm" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{turnaround.decidedCount}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Decisions (last 6 months)</div>
          </div>
          <div className="rounded-xl border p-5 shadow-sm" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-warning-text)' }}>{turnaround.pendingBacklog}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Current Pending Backlog</div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
        <div className="mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Monthly Trends</h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Leave request outcomes over the last six months.</p>
        </div>
        {trends.length ? (
          <div className="h-72 w-full sm:h-80 lg:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {Object.entries(COLORS).map(([status, color]) => (
                  <Bar key={status} dataKey={status} stackId="a" fill={color} name={status.replace(/_/g, ' ')} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <LeaveEmptyState
            icon={TrendingUp}
            title="No trend data yet"
            description="Monthly leave trends will appear after the workspace has recorded leave decisions."
          />
        )}
      </div>
    </div>
  );
};

export default LeaveReportsPage;
