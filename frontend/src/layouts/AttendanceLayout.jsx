import React, { useContext, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Fingerprint } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import LeaveContentContainer from '../components/Leave/LeaveContentContainer';

const MAIN_ATTENDANCE_ROUTES = ['/attendance', '/attendance/my', '/attendance/approvals'];

const AttendanceLayout = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const role = (user?.role || '').toLowerCase();
  const isSettings = location.pathname.startsWith('/attendance/settings');

  useEffect(() => {
    if (MAIN_ATTENDANCE_ROUTES.includes(location.pathname)) {
      sessionStorage.setItem('flowtask.attendance.lastRoute', location.pathname);
    }
  }, [location.pathname]);

  const tabs = [
    { label: 'My Attendance', to: '/attendance/my', visible: true },
    { label: 'Approvals', to: '/attendance/approvals', visible: ['manager', 'hr', 'admin'].includes(role) },
    { label: 'Settings', to: '/attendance/settings', visible: ['hr', 'admin'].includes(role), settings: true }
  ].filter((tab) => tab.visible);

  return (
    <div className="min-h-full w-full" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {!isSettings && (
        <div
          className="sticky top-0 z-30 border-b"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-base) 96%, transparent)', borderColor: 'var(--color-border-subtle)' }}
        >
          <LeaveContentContainer className="!py-0">
            <div className="flex min-h-16 flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <NavLink to="/attendance" className="flex flex-none items-center gap-2.5 rounded-lg py-1">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary-600)' }}
                >
                  <Fingerprint className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-base font-bold leading-5" style={{ color: 'var(--color-text-primary)' }}>Attendance</span>
                  <span className="hidden text-xs lg:block" style={{ color: 'var(--color-text-muted)' }}>Check-in, check-out, and presence</span>
                </span>
              </NavLink>

              <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:pb-0" aria-label="Attendance navigation">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    state={tab.settings ? { fromAttendance: location.pathname } : undefined}
                    className="flex-none whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    style={({ isActive }) => isActive
                      ? { backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary-600)' }
                      : { color: 'var(--color-text-secondary)' }}
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </LeaveContentContainer>
        </div>
      )}

      {isSettings ? <Outlet /> : <LeaveContentContainer><Outlet /></LeaveContentContainer>}
    </div>
  );
};

export default AttendanceLayout;
