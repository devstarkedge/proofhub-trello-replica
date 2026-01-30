import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Users, ArrowLeft, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { usePMSheet } from '../context/PMSheetContext';
import {
  PMTable,
  PMFilters,
  PMGroupedTableSkeleton,
  UserCell,
  TimeCell,
  PaymentCell,
  CoordinatorDisplay,
  BillingTypeBadge
} from '../components/PMSheet';

/**
 * Project Coordinator Report Page
 * User-centric, coordinator-filtered view with week-wise grouping
 */
const ProjectCoordinatorReportContent = () => {
  const navigate = useNavigate();
  const {
    coordinatorData,
    loading,
    error,
    filters,
    fetchCoordinatorReport
  } = usePMSheet();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      await fetchCoordinatorReport();
    } catch (err) {
      console.error('Failed to load coordinator report:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Expand all users by default when data loads
  useEffect(() => {
    if (coordinatorData && coordinatorData.length > 0) {
      setExpandedUsers(new Set(coordinatorData.map(u => u.userId)));
    }
  }, [coordinatorData]);

  const toggleUserExpansion = (userId) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ['User', 'Week', 'Month', 'Project', 'Billing Type', 'Billed Time', 'Payment'];
    const rows = [];

    coordinatorData?.forEach(user => {
      user.weeks?.forEach(week => {
        week.projects?.forEach(project => {
          rows.push([
            user.userName,
            week.week,
            week.month,
            project.projectName,
            project.billingType === 'hr' ? 'Hourly' : 'Fixed',
            project.billedTime?.display || '0h 0m',
            `$${project.payment?.toFixed(2) || '0.00'}`
          ]);
        });
      });
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coordinator-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Project columns for week table
  const projectColumns = [
    {
      id: 'project',
      header: 'Project',
      accessor: 'projectName',
      width: '250px',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{row.projectName}</p>
        </div>
      )
    },
    {
      id: 'billingType',
      header: 'Billing',
      accessor: 'billingType',
      render: (row) => <BillingTypeBadge type={row.billingType} rate={row.hourlyRate} />
    },
    {
      id: 'coordinators',
      header: 'Coordinators',
      render: (row) => <CoordinatorDisplay coordinators={row.coordinators} maxVisible={2} />
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

  const isLoading = loading.coordinator;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/pm-sheet')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Project Coordinator Report
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  User-centric view with project and coordinator details
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Filters */}
          <PMFilters 
            onApplyFilters={loadData}
            showStatusFilter={false}
            className="mb-6"
          />

          {isLoading && !coordinatorData ? (
            <PMGroupedTableSkeleton groups={3} rowsPerGroup={4} columns={5} />
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
          ) : coordinatorData && coordinatorData.length > 0 ? (
            <div className="space-y-4">
              {coordinatorData.map((user) => (
                <div 
                  key={user.userId}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* User Header */}
                  <button
                    onClick={() => toggleUserExpansion(user.userId)}
                    className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-700 hover:from-purple-100 hover:to-pink-100 dark:hover:from-gray-700 dark:hover:to-gray-600 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <UserCell user={user} showEmail />
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Total Billed</p>
                        <p className="text-lg font-bold text-emerald-600">
                          {user.totalBilledTime?.display || '0h 0m'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Total Payment</p>
                        <p className="text-lg font-bold text-amber-600">
                          ${user.totalPayment?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                      {expandedUsers.has(user.userId) ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content - Week Groups */}
                  {expandedUsers.has(user.userId) && (
                    <div className="border-t border-gray-200 dark:border-gray-700">
                      {user.weeks && user.weeks.length > 0 ? (
                        user.weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                            {/* Week Header */}
                            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-sm font-medium">
                                  {week.week}
                                </span>
                                <span className="text-sm text-gray-500">{week.month}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-500">
                                  Billed: <span className="font-medium text-emerald-600">{week.totalBilledTime?.display || '0h 0m'}</span>
                                </span>
                                <span className="text-gray-500">
                                  Payment: <span className="font-medium text-amber-600">${week.totalPayment?.toFixed(2) || '0.00'}</span>
                                </span>
                              </div>
                            </div>

                            {/* Projects Table */}
                            <div className="px-4 py-2">
                              <PMTable
                                columns={projectColumns}
                                data={week.projects || []}
                                loading={false}
                                emptyMessage="No projects for this week"
                                stickyHeader={false}
                                searchable={false}
                                className="border-0 shadow-none"
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-gray-500">
                          No week data available for this user
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Users className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Data Available
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No coordinator report data found for the selected filters.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProjectCoordinatorReportContent;
