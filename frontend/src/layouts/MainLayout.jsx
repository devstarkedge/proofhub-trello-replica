import React, { useContext, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AuthContext from '../context/AuthContext';
import useScrollMemory from '../hooks/useScrollMemory';

const MainLayout = () => {
  const { loading } = useContext(AuthContext);
  const location = useLocation();
  const mainRef = useRef(null);
  const prevPathRef = useRef(location.pathname);
  const { save } = useScrollMemory();

  useEffect(() => {
    const prevPath = prevPathRef.current;
    // When leaving the Home route, persist the scrollTop of the main content
    if (prevPath === '/' && location.pathname !== '/') {
      const el = mainRef.current || document.querySelector('[data-main-scroll]');
      if (el && typeof save === 'function') {
        try { save(el); } catch (e) { /* noop */ }
      }
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, save]);

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
      <div className="flex-1 flex flex-col h-full overflow-hidden lg:ml-64 transition-all duration-300">
        {/* Sticky Header */}
        <Header />

        {/* Page Content - Scrollable */}
        <main ref={mainRef} data-main-scroll className="flex-1 overflow-auto relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
