import { useContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Dialog, Tooltip } from 'radix-ui';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import useRealtimeSync from '../hooks/useRealtimeSync';
import AuthContext from '../context/AuthContext';
import { runAttendanceLocationBootstrapOnce } from '../utils/attendanceLocationBootstrap';
import SessionSynchronization from '../components/Attendance/SessionSynchronization';
import useSidebarLayout from '../hooks/useSidebarLayout';
import './sidebar.css';

const MainLayout = () => {
  useRealtimeSync();
  const { loading, user } = useContext(AuthContext);
  const { isMobile, collapsed, toggleCollapsed } = useSidebarLayout(user?._id || user?.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setDrawerOpen(false); }, [location.key, isMobile]);

  // MainLayout only ever mounts once PrivateRoute has confirmed both login
  // and active-workspace resolution, and remounts fresh on logout->login —
  // exactly the "once per login session" boundary this bootstrap needs.
  useEffect(() => { runAttendanceLocationBootstrapOnce(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Dialog.Root open={isMobile && drawerOpen} onOpenChange={setDrawerOpen}>
      <Tooltip.Provider delayDuration={200}>
        <div className="app-layout flex h-dvh overflow-hidden bg-gray-50 dark:bg-gray-900"
          style={{ '--sidebar-width': collapsed ? '72px' : '256px' }}>
          <SessionSynchronization />
          <Sidebar
            isMobile={isMobile}
            collapsed={!isMobile && collapsed}
            onToggleCollapse={toggleCollapsed}
            onClose={() => setDrawerOpen(false)}
          />

          <div className="app-content min-w-0 flex-1 flex flex-col h-full overflow-hidden md:ml-[var(--sidebar-width)]">
            <Header />

            <main id="main-scroll-container" className="min-h-0 flex-1 overflow-auto relative">
              <Outlet />
            </main>
          </div>
        </div>
      </Tooltip.Provider>
    </Dialog.Root>
  );
};

export default MainLayout;
