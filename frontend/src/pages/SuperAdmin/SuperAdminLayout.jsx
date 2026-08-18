import React, { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, Building2, ScrollText, LogOut } from 'lucide-react';
import socketService from '../../services/socket';
import AuthContext from '../../context/AuthContext';
import LogoutConfirmModal from '../../components/SuperAdmin/LogoutConfirmModal';

/**
 * Platform-level shell for /super-admin/*. Deliberately NOT rendered inside
 * MainLayout — no workspace sidebar/switcher chrome, since this is a
 * platform context, not a workspace context (see SuperAdminRouteGuard and
 * App.jsx's route tree, where this is a sibling of the MainLayout block,
 * not nested inside it).
 */
const TABS = [
  { path: '/super-admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/super-admin/workspaces', label: 'Workspaces', icon: Building2 },
  { path: '/super-admin/audit-log', label: 'Audit Log', icon: ScrollText }
];

const SuperAdminLayout = () => {
  const location = useLocation();
  const { logoutUser } = useContext(AuthContext);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // "Core events" real-time scope: join once for the whole Super Admin
  // area (not per-page) so workspace-status and audit-log events stay live
  // while navigating between Overview/Workspaces/detail/Audit Log.
  useEffect(() => {
    socketService.joinSuperAdmin();
    return () => socketService.leaveSuperAdmin();
  }, []);

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    // logoutUser() (AuthContext) clears the token/user state, disconnects
    // the socket, and resets every registered workspace-scoped store — the
    // same full teardown a normal logout does.
    logoutUser();
    // A hard navigation, not React Router's navigate(). Both this and
    // logoutUser()'s setUser(null) are state changes fired from the same
    // click handler; React batches them into one render pass, and
    // SuperAdminRouteGuard — still mounted, since it's a consumer of the
    // same auth state — re-evaluates with user:null before the router
    // finishes committing a client-side route change to /login, so its own
    // `<Navigate to="/" replace>` wins the race (confirmed empirically: the
    // SPA-navigate version landed on "/", not "/login", even with the
    // clear-state deferred a full tick). A full page load sidesteps the
    // race entirely — the app remounts fresh at /login with no stale
    // SuperAdminRouteGuard in the tree to race against.
    window.location.assign('/login');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <header className="border-b" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(220, 38, 38, 0.12)' }}>
                <ShieldCheck className="w-6 h-6" style={{ color: '#dc2626' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Super Admin</h1>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Platform-level workspace management</p>
              </div>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <LogOut className="w-4 h-4" />
              Go to Login Page
            </button>
          </div>

          <nav className="flex items-center gap-1 mt-4">
            {TABS.map(({ path, label, icon: Icon, end }) => {
              const isActive = end ? location.pathname === path : location.pathname.startsWith(path);
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--color-bg-primary)' : 'transparent',
                    color: isActive ? '#dc2626' : 'var(--color-text-secondary)',
                    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? '#dc2626' : 'var(--color-text-muted)' }} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <LogoutConfirmModal
        isOpen={showLogoutConfirm}
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
};

export default SuperAdminLayout;
