import React from 'react';
import WorkspacesTable from '../../components/SuperAdmin/WorkspacesTable';

const SuperAdminWorkspacesPage = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Workspaces</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Search, filter, and manage every workspace on the platform</p>
      </div>
      <WorkspacesTable />
    </div>
  );
};

export default SuperAdminWorkspacesPage;
