import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAccessControl from '../hooks/useAccessControl';

/**
 * Guards /access-control. Admin always passes; anyone else needs the
 * delegated access_control.manage permission (role-level or personal
 * override) — resolved by the same engine every other permission check in
 * the app goes through, not a bespoke role-string comparison.
 */
const AccessControlRouteGuard = ({ children }) => {
  const location = useLocation();
  const { isAdmin, canManageAccessControl, myPermissions } = useAccessControl();

  // Gate on data having arrived at all, not the store's transient `loading`
  // flag — on first mount `loading` is still false for one render before the
  // fetch kicks off, which would otherwise redirect away before we know.
  if (!myPermissions) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking access...
        </div>
      </div>
    );
  }

  if (!isAdmin && !canManageAccessControl) {
    return <Navigate to="/" replace state={{ from: location, accessControlDenied: true }} />;
  }

  return children;
};

export default AccessControlRouteGuard;
