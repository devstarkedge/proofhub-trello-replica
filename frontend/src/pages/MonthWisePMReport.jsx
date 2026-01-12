import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Calendar, ArrowLeft, Download } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { usePMSheet } from '../context/PMSheetContext';
import {
  PMTable,
  PMFilters,
  PMGroupedTableSkeleton,
  UserCell,
  TimeCell,
  PaymentCell
} from '../components/PMSheet';

/**
 * Month Wise PM Report Page
 * Full month summary per user, department-wise sections
 */
const MonthWisePMReportContent = () => {
  const navigate = useNavigate();
  const {
    monthWiseData,
    loading,
    error,
    filters,
    fetchMonthWiseReport
  } = usePMSheet();

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      await fetchMonthWiseReport();
    } catch (err) {
      console.error('Failed to load month-wise report:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Export to CSV
  const handleExport = (data) => {
    const headers = ['Department', 'User', 'Month', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Total Billed', 'Total Payment'];
    const rows = [];

    monthWiseData?.forEach(dept => {
      dept.users?.forEach(user => {
        const weekData = {};
        user.weekWise?.forEach(w => {
          weekData[w.week] = w.billedTime?.display || '0h 0m';
        });

        rows.push([
          dept.departmentName,
          user.userName,
          user.monthLabel,
          weekData['1st Week'] || '0h 0m',
          weekData['2nd Week'] || '0h 0m',
          weekData['3rd Week'] || '0h 0m',
          weekData['4th Week'] || '0h 0m',
          user.totalBilledTime?.display || '0h 0m',
          `$${user.payment?.toFixed(2) || '0.00'}`
        ]);
      });
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `month-wise-pm-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // User columns for the table
  const userColumns = [
    {
      id: 'user',
      header: 'User',
      accessor: 'userName',
      width: '200px',
      render: (row) => <UserCell user={row} showEmail />
    },
    {
      id: 'month',
      header: 'Month',
      accessor: 'monthLabel',
      render: (row) => (
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-medium">
          {row.monthLabel}
        </span>
      )
    },
    {
      id: 'week1',
      header: '1st Week',
      accessor: (row) => row.weekWise?.find(w => w.week === '1st Week')?.billedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => {
        const week = row.weekWise?.find(w => w.week === '1st Week');
        return <TimeCell time={week?.billedTime} variant="muted" />;
      }
    },
    {
      id: 'week2',
      header: '2nd Week',
      accessor: (row) => row.weekWise?.find(w => w.week === '2nd Week')?.billedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => {
        const week = row.weekWise?.find(w => w.week === '2nd Week');
        return <TimeCell time={week?.billedTime} variant="muted" />;
      }
    },
    {
      id: 'week3',
      header: '3rd Week',
      accessor: (row) => row.weekWise?.find(w => w.week === '3rd Week')?.billedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => {
        const week = row.weekWise?.find(w => w.week === '3rd Week');
        return <TimeCell time={week?.billedTime} variant="muted" />;
      }
    },
    {
      id: 'week4',
      header: '4th Week',
      accessor: (row) => row.weekWise?.find(w => w.week === '4th Week')?.billedTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => {
        const week = row.weekWise?.find(w => w.week === '4th Week');
        return <TimeCell time={week?.billedTime} variant="muted" />;
      }
    },
    {
      id: 'totalBilled',
      header: 'Total Billed',
      accessor: (row) => row.totalBilledTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => <TimeCell time={row.totalBilledTime} variant="success" />
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

  const isLoading = loading.monthWise;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <Sidebar />
      <Header />
      
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/pm-sheet')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Month Wise PM Report
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Full month summary per user with week-wise breakdown
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
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
            showCoordinatorFilter={false}
            showStatusFilter={false}
            className="mb-6"
          />

          {isLoading && !monthWiseData ? (
            <PMGroupedTableSkeleton groups={3} rowsPerGroup={5} columns={8} />
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
          ) : monthWiseData && monthWiseData.length > 0 ? (
            <div className="space-y-6">
              {monthWiseData.map((dept) => (
                <div 
                  key={dept.departmentId}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Department Header */}
                  <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {dept.departmentName}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {dept.users?.length || 0} users with time entries
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-gray-500">Total Entries</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {dept.users?.length || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Users Table */}
                  <PMTable
                    columns={userColumns}
                    data={dept.users || []}
                    loading={false}
                    emptyMessage="No user data for this department"
                    searchable
                    className="border-0 shadow-none rounded-none"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Calendar className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Data Available
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No month-wise data found for the selected filters.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MonthWisePMReportContent;
