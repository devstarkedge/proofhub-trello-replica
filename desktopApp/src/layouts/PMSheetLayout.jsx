import React from 'react';
import { Outlet } from 'react-router-dom';
import { PMSheetProvider } from '../context/PMSheetContext';

/**
 * PMSheetLayout - Layout wrapper for all PM Sheet pages
 * Provides shared PMSheetContext across all child routes
 * This ensures filters and state persist when navigating between PM Sheet pages
 */
const PMSheetLayout = () => {
  return (
    <PMSheetProvider>
      <Outlet />
    </PMSheetProvider>
  );
};

export default PMSheetLayout;
