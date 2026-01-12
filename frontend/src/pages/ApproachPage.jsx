import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CheckCircle2, ArrowLeft, Download, ExternalLink, Mail, Phone } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { usePMSheet } from '../context/PMSheetContext';
import {
  PMTable,
  PMFilters,
  PMTableSkeleton,
  TimeCell,
  PaymentCell,
  StatusBadge,
  BillingTypeBadge,
  CoordinatorDisplay
} from '../components/PMSheet';

/**
 * Approach Page - Completed work & payment review
 * Shows only completed projects with final payment review
 */
const ApproachPageContent = () => {
  const navigate = useNavigate();
  const {
    approachData,
    loading,
    error,
    filters,
    fetchApproachData,
    updateProjectStatus
  } = usePMSheet();

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      await fetchApproachData({ ...filters, status: 'completed' });
    } catch (err) {
      console.error('Failed to load approach data:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleStatusChange = useCallback(async (projectId, newStatus) => {
    try {
      await updateProjectStatus(projectId, newStatus);
      await loadData(); // Refresh data after status change
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }, [updateProjectStatus]);

  // Export to CSV
  const handleExport = () => {
    if (!approachData?.projects) return;

    const headers = [
      'Project Name', 'Source', 'Category', 'Billing Type', 'Rate/Price',
      'Client Name', 'Client Email', 'Total Billed Time', 'Total Payment', 'Status'
    ];
    
    const rows = approachData.projects.map(project => [
      project.projectName,
      project.projectSource || '-',
      project.projectCategory || '-',
      project.billingType === 'hr' ? 'Hourly' : 'Fixed',
      project.billingType === 'hr' ? `$${project.hourlyRate || 0}/hr` : `$${project.fixedPrice || 0}`,
      project.clientDetails?.clientName || '-',
      project.clientDetails?.clientEmail || '-',
      project.totalBilledTime?.display || '0h 0m',
      `$${project.totalPayment?.toFixed(2) || '0.00'}`,
      project.status
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approach-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Project table columns
  const projectColumns = [
    {
      id: 'project',
      header: 'Project',
      accessor: 'projectName',
      width: '220px',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{row.projectName}</p>
          <div className="flex items-center gap-2 mt-1">
            {row.projectSource && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                {row.projectSource}
              </span>
            )}
            {row.projectSource === 'Upwork' && row.upworkId && (
              <span 
                className="text-xs text-blue-500 cursor-help"
                title={`Upwork ID: ${row.upworkId}`}
              >
                <ExternalLink className="w-3 h-3 inline" />
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'category',
      header: 'Category',
      accessor: 'projectCategory',
      render: (row) => row.projectCategory ? (
        <span className="text-sm text-gray-600 dark:text-gray-400">{row.projectCategory}</span>
      ) : <span className="text-gray-400">-</span>
    },
    {
      id: 'billing',
      header: 'Billing',
      accessor: 'billingType',
      render: (row) => (
        <BillingTypeBadge type={row.billingType} rate={row.hourlyRate} />
      )
    },
    {
      id: 'client',
      header: 'Client',
      render: (row) => row.clientDetails?.clientName ? (
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
            {row.clientDetails.clientName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {row.clientDetails.clientEmail && (
              <a 
                href={`mailto:${row.clientDetails.clientEmail}`}
                className="text-blue-500 hover:text-blue-600"
                title={row.clientDetails.clientEmail}
              >
                <Mail className="w-3 h-3" />
              </a>
            )}
            {row.clientDetails.clientWhatsappNumber && (
              <a 
                href={`https://wa.me/${row.clientDetails.clientWhatsappNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-500 hover:text-green-600"
                title={row.clientDetails.clientWhatsappNumber}
              >
                <Phone className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ) : <span className="text-gray-400">-</span>
    },
    {
      id: 'coordinators',
      header: 'Coordinators',
      render: (row) => (
        <CoordinatorDisplay 
          coordinators={row.coordinators} 
          maxVisible={2}
          size="sm"
        />
      )
    },
    {
      id: 'billedTime',
      header: 'Total Billed',
      accessor: (row) => row.totalBilledTime?.totalMinutes || 0,
      sortType: 'number',
      render: (row) => <TimeCell time={row.totalBilledTime} variant="success" />
    },
    {
      id: 'payment',
      header: 'Payment',
      accessor: 'totalPayment',
      sortType: 'number',
      align: 'right',
      render: (row) => <PaymentCell amount={row.totalPayment} variant="large" />
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      render: (row) => (
        <StatusBadge 
          status={row.status} 
          editable 
          onChange={(newStatus) => handleStatusChange(row.projectId, newStatus)}
        />
      )
    },
    {
      id: 'lastActivity',
      header: 'Last Activity',
      render: (row) => row.lastActivity ? (
        <div className="text-xs">
          <p className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]" title={row.lastActivity.title}>
            {row.lastActivity.title}
          </p>
          <p className="text-gray-400">
            {new Date(row.lastActivity.date).toLocaleDateString()}
          </p>
        </div>
      ) : <span className="text-gray-400 text-xs">No activity</span>
    }
  ];

  const isLoading = loading.approach;
  const projects = approachData?.projects || [];
  const summary = approachData?.summary || {};

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
              <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Approach Page
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Completed work & payment review
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
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

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Completed Projects</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {summary.totalProjects || 0}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Billed Time</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {summary.totalBilledTime?.display || '0h 0m'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Payment</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                ${summary.totalPayment?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>

          {/* Filters - Status defaults to completed */}
          <PMFilters 
            onApplyFilters={loadData}
            showStatusFilter={false}
            className="mb-6"
          />

          {/* Projects Table */}
          {isLoading && !approachData ? (
            <PMTableSkeleton rows={8} columns={9} />
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
          ) : projects.length > 0 ? (
            <PMTable
              columns={projectColumns}
              data={projects}
              loading={false}
              emptyMessage="No completed projects found"
              searchable
              exportable
              onExport={handleExport}
              maxHeight="calc(100vh - 400px)"
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Completed Projects
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No completed projects found for the selected filters. Mark a project as completed to see it here.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ApproachPageContent;
