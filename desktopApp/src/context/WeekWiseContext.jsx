import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * WeekWiseContext - Context for managing week-wise reporting mode state
 * Used across UsersTab, ProjectsTab, and ViewFinancePage
 * Excluded from FinanceDashboard
 */

const WeekWiseContext = createContext(null);

export const WeekWiseProvider = ({ children }) => {
  const [weekWiseMode, setWeekWiseMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [weekWiseData, setWeekWiseData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Toggle week-wise mode
  const toggleWeekWiseMode = useCallback((enabled) => {
    setWeekWiseMode(enabled);
    if (!enabled) {
      // Clear cached data when disabling
      setWeekWiseData(null);
    }
  }, []);

  // Update selected year
  const updateYear = useCallback((year) => {
    setSelectedYear(year);
    // Clear cached data when year changes
    setWeekWiseData(null);
  }, []);

  // Cache fetched data
  const cacheData = useCallback((data) => {
    setWeekWiseData(data);
  }, []);

  const value = {
    weekWiseMode,
    selectedYear,
    weekWiseData,
    loading,
    setLoading,
    toggleWeekWiseMode,
    updateYear,
    cacheData,
  };

  return (
    <WeekWiseContext.Provider value={value}>
      {children}
    </WeekWiseContext.Provider>
  );
};

export const useWeekWise = () => {
  const context = useContext(WeekWiseContext);
  if (!context) {
    throw new Error('useWeekWise must be used within a WeekWiseProvider');
  }
  return context;
};

export default WeekWiseContext;
