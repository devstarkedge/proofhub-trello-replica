import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CheckCircle2, PauseCircle, Archive, Users, UserCheck, Mail,
  UserCog, TrendingUp, HardDrive, RefreshCw, AlertCircle
} from 'lucide-react';
import PlatformKpiCard from '../../components/SuperAdmin/PlatformKpiCard';
import { useSuperAdminOverview } from '../../hooks/useSuperAdminQueries';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const SuperAdminOverviewPage = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useSuperAdminOverview();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Platform Overview</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Real-time metrics across every workspace on FlowTask</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 rounded-lg border" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error?.response?.data?.message || 'Failed to load platform overview.'}</span>
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Workspaces</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <PlatformKpiCard label="Total Workspaces" value={data?.workspaces?.total} icon={Building2} color="#7c3aed" loading={isLoading} />
          <PlatformKpiCard label="Active" value={data?.workspaces?.active} icon={CheckCircle2} color="#10b981" loading={isLoading} />
          <PlatformKpiCard label="Suspended" value={data?.workspaces?.suspended} icon={PauseCircle} color="#f59e0b" loading={isLoading} />
          <PlatformKpiCard label="Archived" value={data?.workspaces?.archived} icon={Archive} color="#6b7280" loading={isLoading} />
          <PlatformKpiCard label="New (30d)" value={data?.newWorkspacesLast30Days} icon={TrendingUp} color="#ec4899" loading={isLoading} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Members</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PlatformKpiCard label="Total Members" value={data?.members?.total} icon={Users} color="#0ea5e9" loading={isLoading} />
          <PlatformKpiCard label="Active Members" value={data?.members?.active} icon={UserCheck} color="#10b981" loading={isLoading} />
          <PlatformKpiCard label="Pending Invitations" value={data?.members?.pendingInvitations} icon={Mail} color="#f59e0b" loading={isLoading} />
          <PlatformKpiCard label="Total Platform Users" value={data?.users?.totalPlatformUsers} icon={UserCog} color="#7c3aed" loading={isLoading} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Usage</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PlatformKpiCard
            label="Platform Storage"
            value={formatBytes(data?.storage?.totalBytesLowerBound)}
            subtext="Lower bound — Attachment records only"
            icon={HardDrive}
            color="#0ea5e9"
            loading={isLoading}
          />
          <PlatformKpiCard label="API Usage" value={data?.apiUsage ?? null} subtext="No API usage tracking exists yet" icon={TrendingUp} color="#6b7280" loading={isLoading} />
        </div>
      </section>

      {!isLoading && data?.planDistribution?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Plan Distribution</h3>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {data.planDistribution.map((p) => (
              <div
                key={p.planId || p.planSlug || 'unknown'}
                className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{p.planName || 'Unassigned'}</span>
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.count} workspace{p.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-sm">
        <Link to="/super-admin/workspaces" className="font-medium" style={{ color: '#dc2626' }}>
          Manage all workspaces →
        </Link>
      </div>
    </div>
  );
};

export default SuperAdminOverviewPage;
