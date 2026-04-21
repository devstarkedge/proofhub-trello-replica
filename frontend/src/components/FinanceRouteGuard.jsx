import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import { getUserPagePermissions } from '../services/userPermissionsApi';

const FinanceRouteGuard = ({ children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const userId = user?._id || user?.id;
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const [loading, setLoading] = useState(!isAdmin);
  const [hasAccess, setHasAccess] = useState(isAdmin);

  const loadAccess = useCallback(async () => {
    if (!userId) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    if (isAdmin) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getUserPagePermissions(userId);
      setHasAccess(Boolean(data?.permissions?.hasAccess));
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const handlePermissionUpdate = (event) => {
      const { userId: updatedUserId, permissions } = event.detail || {};
      if (!userId || updatedUserId?.toString() !== userId.toString()) return;
      setHasAccess(isAdmin || Boolean(permissions?.hasAccess));
    };

    window.addEventListener('finance-permissions-updated', handlePermissionUpdate);
    window.addEventListener('socket-finance-permissions-updated', handlePermissionUpdate);

    return () => {
      window.removeEventListener('finance-permissions-updated', handlePermissionUpdate);
      window.removeEventListener('socket-finance-permissions-updated', handlePermissionUpdate);
    };
  }, [isAdmin, userId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking finance access...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/" replace state={{ from: location, financeDenied: true }} />;
  }

  return children;
};

export default FinanceRouteGuard;
