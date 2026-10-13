import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useRoleStore from '../store/roleStore';

/**
 * Guards /join-requests. Permission-only — admin passes because
 * Role.getDefaultPermissions('admin').canApproveJoinRequests is already
 * true, not via a separate isAdmin bypass. No hardcoded role check here,
 * matching the Invite Member system's "never hardcode roles" requirement.
 *
 * Reads useRoleStore directly rather than usePermissions() — that hook's
 * `permissions` field defaults to `{}` even before the fetch resolves, which
 * would make a "still loading" state indistinguishable from "genuinely has
 * no permissions," bouncing a legitimate approver to `/` for a flash before
 * their real permissions arrive. myRole/myPermissions here are null until
 * the fetch actually completes.
 */
const JoinRequestsRouteGuard = ({ children }) => {
  const location = useLocation();
  const myRole = useRoleStore((state) => state.myRole);
  const myPermissions = useRoleStore((state) => state.myPermissions);

  if (!myPermissions && myRole !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking access...
        </div>
      </div>
    );
  }

  const allowed = myRole === 'admin' || myPermissions?.canApproveJoinRequests === true;
  if (!allowed) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
};

export default JoinRequestsRouteGuard;
