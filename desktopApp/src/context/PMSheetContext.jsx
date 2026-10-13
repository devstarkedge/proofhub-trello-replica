import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as pmSheetService from '../services/pmSheetService';

const PMSheetContext = createContext(null);

export const usePMSheet = () => {
  const context = useContext(PMSheetContext);
  if (!context) {
    throw new Error('usePMSheet must be used within a PMSheetProvider');
  }
  return context;
};

export const PMSheetProvider = ({ children }) => {
  // Filter state
  const [filters, setFilters] = useState({
    startDate: pmSheetService.getDatePresets().thisMonth.startDate,
    endDate: pmSheetService.getDatePresets().thisMonth.endDate,
    userId: 'all',
    departmentId: 'all',
    projectId: null,
    billingType: null,
    projectCategory: null,
    coordinatorId: null,
    status: null
  });

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState({
    departments: [],
    users: [],
    projects: [],
    categories: [],
    sources: [],
    coordinators: [],
    billingTypes: [],
    statuses: []
  });

  // Loading states
  const [loading, setLoading] = useState({
    filters: false,
    dashboard: false,
    monthWise: false,
    coordinator: false,
    approach: false,
    summary: false
  });

  // Error state
  const [error, setError] = useState(null);

  // Data states
  const [dashboardData, setDashboardData] = useState(null);
  const [monthWiseData, setMonthWiseData] = useState(null);
  const [coordinatorData, setCoordinatorData] = useState(null);
  const [approachData, setApproachData] = useState(null);
  const [summaryStats, setSummaryStats] = useState(null);

  // Date presets
  const datePresets = pmSheetService.getDatePresets();

  // Load filter options on mount
  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Load filter options
  const loadFilterOptions = useCallback(async () => {
    setLoading(prev => ({ ...prev, filters: true }));
    setError(null);
    try {
      const response = await pmSheetService.getFilterOptions();
      if (response.success) {
        setFilterOptions(response.data);
      }
    } catch (err) {
      console.error('Failed to load filter options:', err);
      setError('Failed to load filter options');
    } finally {
      setLoading(prev => ({ ...prev, filters: false }));
    }
  }, []);

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters({
      startDate: datePresets.thisMonth.startDate,
      endDate: datePresets.thisMonth.endDate,
      userId: 'all',
      departmentId: 'all',
      projectId: null,
      billingType: null,
      projectCategory: null,
      coordinatorId: null,
      status: null
    });
  }, [datePresets]);

  // Apply date preset
  const applyDatePreset = useCallback((presetKey) => {
    const preset = datePresets[presetKey];
    if (preset) {
      setFilters(prev => ({
        ...prev,
        startDate: preset.startDate,
        endDate: preset.endDate
      }));
    }
  }, [datePresets]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async (customFilters = null) => {
    setLoading(prev => ({ ...prev, dashboard: true }));
    setError(null);
    try {
      const response = await pmSheetService.getDashboardData(customFilters || filters);
      if (response.success) {
        setDashboardData(response.data);
      }
      return response;
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data');
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, dashboard: false }));
    }
  }, [filters]);

  // Fetch month-wise report
  const fetchMonthWiseReport = useCallback(async (customFilters = null) => {
    setLoading(prev => ({ ...prev, monthWise: true }));
    setError(null);
    try {
      const response = await pmSheetService.getMonthWiseReport(customFilters || filters);
      if (response.success) {
        setMonthWiseData(response.data);
      }
      return response;
    } catch (err) {
      console.error('Failed to fetch month-wise report:', err);
      setError('Failed to load month-wise report');
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, monthWise: false }));
    }
  }, [filters]);

  // Fetch coordinator report
  const fetchCoordinatorReport = useCallback(async (customFilters = null) => {
    setLoading(prev => ({ ...prev, coordinator: true }));
    setError(null);
    try {
      const response = await pmSheetService.getCoordinatorReport(customFilters || filters);
      if (response.success) {
        setCoordinatorData(response.data);
      }
      return response;
    } catch (err) {
      console.error('Failed to fetch coordinator report:', err);
      setError('Failed to load coordinator report');
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, coordinator: false }));
    }
  }, [filters]);

  // Fetch approach data
  const fetchApproachData = useCallback(async (customFilters = null) => {
    setLoading(prev => ({ ...prev, approach: true }));
    setError(null);
    try {
      const response = await pmSheetService.getApproachData(customFilters || filters);
      if (response.success) {
        setApproachData(response.data);
      }
      return response;
    } catch (err) {
      console.error('Failed to fetch approach data:', err);
      setError('Failed to load approach data');
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, approach: false }));
    }
  }, [filters]);

  // Fetch summary stats
  const fetchSummaryStats = useCallback(async (customFilters = null) => {
    setLoading(prev => ({ ...prev, summary: true }));
    setError(null);
    try {
      const response = await pmSheetService.getSummaryStats(customFilters || filters);
      if (response.success) {
        setSummaryStats(response.data);
      }
      return response;
    } catch (err) {
      console.error('Failed to fetch summary stats:', err);
      setError('Failed to load summary stats');
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, summary: false }));
    }
  }, [filters]);

  // Update project status
  const updateProjectStatus = useCallback(async (projectId, status) => {
    try {
      const response = await pmSheetService.updateProjectStatus(projectId, status);
      return response;
    } catch (err) {
      console.error('Failed to update project status:', err);
      throw err;
    }
  }, []);

  // Refresh all data
  const refreshAllData = useCallback(async () => {
    await Promise.all([
      fetchSummaryStats(),
      loadFilterOptions()
    ]);
  }, [fetchSummaryStats, loadFilterOptions]);

  const value = {
    // State
    filters,
    filterOptions,
    loading,
    error,
    dashboardData,
    monthWiseData,
    coordinatorData,
    approachData,
    summaryStats,
    datePresets,

    // Actions
    updateFilters,
    resetFilters,
    applyDatePreset,
    loadFilterOptions,
    fetchDashboardData,
    fetchMonthWiseReport,
    fetchCoordinatorReport,
    fetchApproachData,
    fetchSummaryStats,
    updateProjectStatus,
    refreshAllData,

    // Helpers
    formatTime: pmSheetService.formatTimeDisplay,
    formatCurrency: pmSheetService.formatCurrency
  };

  return (
    <PMSheetContext.Provider value={value}>
      {children}
    </PMSheetContext.Provider>
  );
};

export default PMSheetContext;
