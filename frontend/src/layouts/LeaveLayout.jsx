import { useContext, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import LeaveContentContainer from '../components/Leave/LeaveContentContainer';
import { isMyLeaveBlockedForRole, canAccessLeaveDashboard, getDefaultLeaveRouteForRole } from '../utils/leaveAccess';
import WorkspaceContext from '../context/WorkspaceContext';
import useLeaveStore from '../store/leaveStore';
import { LEAVE_SCOPE_REFRESH_EVENTS, subscribeLeaveRefresh } from '../utils/leaveRequestSync';
import { useQueryClient } from '@tanstack/react-query';
import { registerResettable } from '../store/resetRegistry';

const MAIN_LEAVE_ROUTES = ['/leave', '/leave/my', '/leave/calendar', '/leave/reports'];

const LeaveLayout = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const location = useLocation();
  const queryClient = useQueryClient();
  const role = (user?.role || '').toLowerCase();
  const isSettings = location.pathname.startsWith('/leave/settings');
  const isCalendar = location.pathname === '/leave/calendar';

  useEffect(() => {
    if (MAIN_LEAVE_ROUTES.includes(location.pathname)) {
      sessionStorage.setItem('flowtask.leave.lastRoute', location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    const queryKey = ['leave'];
    const reset = (pause = false) => {
      queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
      if (pause) useLeaveStore.getState().invalidateAccess();
      else useLeaveStore.getState().reset();
    };
    const unregister = registerResettable(reset);
    const unsubscribe = subscribeLeaveRefresh({ workspaceId: currentWorkspace?._id,
      onInvalidate: (event) => {
        // Never keep a previously authorized department visible during revalidation.
        if ([...LEAVE_SCOPE_REFRESH_EVENTS, 'socket-connected', 'socket-disconnected', 'focus'].includes(event.type)) reset(true);
      },
      refresh: () => {
        useLeaveStore.setState({ readsPaused: false });
        queryClient.invalidateQueries({ queryKey });
      }
    });
    return () => { unsubscribe(); unregister(); queryClient.cancelQueries({ queryKey }); queryClient.removeQueries({ queryKey }); useLeaveStore.setState({ readsPaused: false }); };
  }, [currentWorkspace?._id, user?._id, user?.id, queryClient]);

  const canAccessDashboard = canAccessLeaveDashboard();

  const tabs = [
    { label: 'Dashboard', to: '/leave', end: true, visible: canAccessDashboard },
    { label: 'My Leave', to: '/leave/my', visible: !isMyLeaveBlockedForRole(role) },
    { label: 'Calendar', to: '/leave/calendar', visible: true },
    { label: 'Reports', to: '/leave/reports', visible: ['hr', 'admin'].includes(role) },
    { label: 'Settings', to: '/leave/settings', visible: ['hr', 'admin'].includes(role), settings: true }
  ].filter((tab) => tab.visible);

  return (
    <div className={`w-full ${isCalendar ? 'h-full flex flex-col overflow-hidden' : 'min-h-full'}`} style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {!isSettings && (
        <div
          className="sticky top-0 z-30 border-b flex-none"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-base) 96%, transparent)', borderColor: 'var(--color-border-subtle)' }}
        >
          <LeaveContentContainer className="!py-0">
            <div className="flex min-h-14 lg:min-h-16 flex-col gap-2 py-2.5 lg:py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <NavLink to={getDefaultLeaveRouteForRole(role)} className="flex flex-none items-center gap-2.5 rounded-lg py-1">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary-600)' }}
                >
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-base font-bold leading-5" style={{ color: 'var(--color-text-primary)' }}>Leave</span>
                  <span className="hidden text-xs lg:block" style={{ color: 'var(--color-text-muted)' }}>Time off and attendance</span>
                </span>
              </NavLink>

              <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:pb-0" aria-label="Leave navigation">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.end}
                    state={tab.settings ? { fromLeave: location.pathname } : undefined}
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

      {isSettings ? (
        <Outlet />
      ) : (
        <LeaveContentContainer className={isCalendar ? 'flex-1 flex flex-col min-h-0 !py-2 sm:!py-2.5 lg:!py-3' : ''}>
          <Outlet />
        </LeaveContentContainer>
      )}
    </div>
  );
};

export default LeaveLayout;
