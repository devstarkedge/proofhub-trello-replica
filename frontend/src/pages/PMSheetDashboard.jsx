import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FileSpreadsheet, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { usePMSheet } from '../context/PMSheetContext';
import {
  PMTable,
  PMFilters,
  PMSummaryCards,
  PMDepartmentCard,
  PMMonthSection,
  PMWeekSection,
  PMDashboardSkeleton,
  UserCell,
  TimeCell,
  PaymentCell
} from '../components/PMSheet';

/**
 * PM Sheet Dashboard Page
 * Department -> Month -> Week -> User breakdown
 */
const PMSheetDashboardContent = () => {
  const navigate = useNavigate();
  const {
    dashboardData,
    summaryStats,
    loading,
    error,
    filters,
    fetchDashboardData,
    fetchSummaryStats,
    formatTime,
    formatCurrency
  } = usePMSheet();

  const [expandedDepts, setExpandedDepts] = useState(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount and when filters change
  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchDashboardData(),
        fetchSummaryStats()
      ]);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const toggleDeptExpansion = (deptId) => {
    setExpandedDepts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deptId)) {
        newSet.delete(deptId);
      } else {
        newSet.add(deptId);
      }
      return newSet;
    });
  };

  // Expand all departments by default when data loads
  useEffect(() => {
    if (dashboardData && dashboardData.length > 0) {
      setExpandedDepts(new Set(dashboardData.map(d => d.departmentId)));
    }
  }, [dashboardData]);

  // User table columns for week view
  const userColumns = [
    {
      id: 'user',
      header: 'User',
      accessor: 'userName',
      render: (row) => <UserCell user={row} showAvatar />
    },
    {
      id: 'projectCount',
      header: 'Projects',
      accessor: 'projectCount',
      align: 'center',
      render: (row) => (
        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
          {row.projectCount}
        </span>
      )
    },
    {
      id: 'loggedTime',
      header: 'Logged Time',
      accessor: (row) => row.loggedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => <TimeCell time={row.loggedTime} variant="muted" />
    },
    {
      id: 'billedTime',
      header: 'Billed Time',
      accessor: (row) => row.billedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => <TimeCell time={row.billedTime} variant="success" />
    },
    {
      id: 'payment',
      header: 'Payment',
      accessor: 'payment',
      sortType: 'number',
      align: 'right',
      render: (row) => <PaymentCell amount={row.payment} variant="success" />
    }
  ];

  const isLoading = loading.dashboard || loading.summary;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <Sidebar />
      <Header />
      
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  PM Sheet Dashboard
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Department → Month → Week → User breakdown
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {isLoading && !dashboardData ? (
            <PMDashboardSkeleton />
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <PMSummaryCards stats={summaryStats} loading={loading.summary} />

              {/* Filters */}
              <PMFilters 
                onApplyFilters={loadData}
                showStatusFilter={false}
              />

              {/* Quick Navigation */}
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/pm-sheet/month-wise')}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 transition-colors text-sm"
                >
                  Month Wise Report
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/pm-sheet/coordinator')}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 transition-colors text-sm"
                >
                  Coordinator Report
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/pm-sheet/approach')}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 transition-colors text-sm"
                >
                  Approach Page
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Department Data */}
              {dashboardData && dashboardData.length > 0 ? (
                <div className="space-y-4">
                  {dashboardData.map((dept) => (
                    <PMDepartmentCard
                      key={dept.departmentId}
                      department={dept}
                      expanded={expandedDepts.has(dept.departmentId)}
                      onToggle={() => toggleDeptExpansion(dept.departmentId)}
                    >
                      {dept.months && dept.months.map((month) => (
                        <PMMonthSection key={month.month} month={month}>
                          {month.weeks && month.weeks.map((week) => (
                            <PMWeekSection key={week.week} week={week}>
                              <div className="px-4 py-2">
                                <PMTable
                                  columns={userColumns}
                                  data={week.users || []}
                                  loading={false}
                                  emptyMessage="No user data for this week"
                                  stickyHeader={false}
                                  searchable={false}
                                  className="border-0 shadow-none"
                                />
                              </div>
                            </PMWeekSection>
                          ))}
                        </PMMonthSection>
                      ))}
                    </PMDepartmentCard>
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <FileSpreadsheet className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No Data Available
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    No PM sheet data found for the selected filters. Try adjusting your date range or filters.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PMSheetDashboardContent;
