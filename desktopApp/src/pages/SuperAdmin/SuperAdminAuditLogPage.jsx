import React from 'react';
import { ShieldCheck, History } from 'lucide-react';
import SuperAdminAuditLogViewer from '../../components/SuperAdmin/SuperAdminAuditLogViewer';

const SuperAdminAuditLogPage = () => {
  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-6">
      {/* ── Compact Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              Super Admin Audit Log
            </h1>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                color: '#059669',
                borderColor: 'rgba(16, 185, 129, 0.20)'
              }}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Verified Security Trail</span>
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Immutable activity log of platform-level workspace operations, subscription changes, and administrative grants.
          </p>
        </div>
      </div>

      {/* ── Audit Log Viewer ── */}
      <SuperAdminAuditLogViewer />
    </div>
  );
};

export default SuperAdminAuditLogPage;
