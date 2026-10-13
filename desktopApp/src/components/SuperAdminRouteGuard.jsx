import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthContext from '../context/AuthContext';

/**
 * Gate for every /super-admin/* route. Simpler than FinanceRouteGuard/
 * AccessControlRouteGuard: isSuperAdmin is a platform-level flag on the User
 * document itself (not workspace-scoped), so it arrives already resolved on
 * useAuth().user the moment auth restores — no separate permission fetch.
 *
 * Deliberately does not touch WorkspaceContext at all — Super Admin routes
 * must never depend on (or change) the caller's active workspace.
 */
const SuperAdminRouteGuard = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking access...
        </div>
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace state={{ from: location, superAdminDenied: true }} />;
  }

  return children;
};

export default SuperAdminRouteGuard;
