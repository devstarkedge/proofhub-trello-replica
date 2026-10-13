import React, { useContext, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AuthContext from '../context/AuthContext';
import { runAttendanceLocationBootstrapOnce } from '../utils/attendanceLocationBootstrap';

const MainLayout = () => {
  const { loading } = useContext(AuthContext);

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
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - Fixed Position */}
      <Sidebar />

      {/* Main Content Area - Shifted right on desktop */}
      <div className="flex-1 flex flex-col h-full overflow-hidden lg:ml-[var(--sidebar-width)] transition-all duration-300">
        {/* Sticky Header */}
        <Header />

        {/* Page Content - Scrollable */}
        <main id="main-scroll-container" className="flex-1 overflow-auto relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
