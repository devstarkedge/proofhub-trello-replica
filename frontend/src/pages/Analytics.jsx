import React, { useState, useEffect, useContext, memo, lazy, Suspense, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import DepartmentContext from '../context/DepartmentContext';
import Database from '../services/database';
import StatsGrid from '../components/StatsGrid';
import AdditionalMetrics from '../components/AdditionalMetrics';
import OverdueTasksList from '../components/OverdueTasksList';
import Loading from '../components/Loading';
import socketService from '../services/socket';

const ChartsSection = lazy(() => import('../components/ChartsSection'));
const TimeAnalyticsChart = lazy(() => import('../components/TimeAnalyticsChart'));
const DepartmentProjectsChart = lazy(() => import('../components/DepartmentProjectsChart'));

const useAnalytics = () => {
  const { currentDepartment } = useContext(DepartmentContext);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const departmentId = currentDepartment?._id;

      if (departmentId) {
        const response = await Database.getDepartmentAnalytics(departmentId);
        setAnalyticsData(response.data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDepartment]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Listen for real-time updates
  useEffect(() => {
    const handleCardUpdate = (event) => {
      console.log('Analytics: Card updated, refreshing data');
      loadAnalytics();
    };

    const handleCardCreated = (event) => {
      console.log('Analytics: Card created, refreshing data');
      loadAnalytics();
    };

    const handleCardDeleted = (event) => {
      console.log('Analytics: Card deleted, refreshing data');
      loadAnalytics();
    };

    const handleCardMoved = (event) => {
      console.log('Analytics: Card moved, refreshing data');
      loadAnalytics();
    };

    // Add event listeners
    window.addEventListener('socket-card-updated', handleCardUpdate);
    window.addEventListener('socket-card-created', handleCardCreated);
    window.addEventListener('socket-card-deleted', handleCardDeleted);
    window.addEventListener('socket-card-moved', handleCardMoved);

    // Cleanup
    return () => {
      window.removeEventListener('socket-card-updated', handleCardUpdate);
      window.removeEventListener('socket-card-created', handleCardCreated);
      window.removeEventListener('socket-card-deleted', handleCardDeleted);
      window.removeEventListener('socket-card-moved', handleCardMoved);
    };
  }, [loadAnalytics]);

  return {
    analyticsData,
    loading,
    refreshAnalytics: loadAnalytics,
  };
};


const Analytics = memo(() => {
  const { currentDepartment } = useContext(DepartmentContext);
  const {
    analyticsData,
    loading,
  } = useAnalytics();

  const priorityColors = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#7C3AED'
  };

  const statusColors = {
    todo: '#6B7280',
    'in-progress': '#3B82F6',
    review: '#F59E0B',
    done: '#10B981'
  };
  // Memoized chart data
  const chartData = useMemo(() => {
    if (!analyticsData) {
      return { priorityData: [], statusData: [] };
    }

    const priorityBreakdown = analyticsData.priorityBreakdown || {};
    
    return {
      priorityData: [
        { name: 'Low', value: priorityBreakdown.low || 0, color: priorityColors.low },
        { name: 'Medium', value: priorityBreakdown.medium || 0, color: priorityColors.medium },
        { name: 'High', value: priorityBreakdown.high || 0, color: priorityColors.high },
        { name: 'Critical', value: priorityBreakdown.critical || 0, color: priorityColors.critical }
      ],
      statusData: [
        { name: 'To Do', value: analyticsData.todoTasks || 0, color: statusColors.todo },
        { name: 'In Progress', value: analyticsData.inProgressTasks || 0, color: statusColors['in-progress'] },
        { name: 'Review', value: analyticsData.reviewTasks || 0, color: statusColors.review },
        { name: 'Done', value: analyticsData.completedTasks || 0, color: statusColors.done }
      ]
    };
  }, [analyticsData]);


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="text-center py-10">
          <p className="text-gray-600">No analytics data available. Please select a team or department.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
              <p className="text-gray-600">
                Insights for {analyticsData?.departmentName} • {currentDepartment?.name}
              </p>
            </div>


          </div>
        </div>

        <StatsGrid analyticsData={analyticsData} />

        <Suspense fallback={<Loading />}>
          <ChartsSection priorityData={chartData.priorityData} statusData={chartData.statusData} />
        </Suspense>

        {/* Time Analytics */}
        {analyticsData?.timeAnalytics && (
          <Suspense fallback={<Loading />}>
            <TimeAnalyticsChart timeAnalytics={analyticsData.timeAnalytics} />
          </Suspense>
        )}

        {/* Department Projects Chart */}
        {analyticsData?.projectBreakdown && (
          <Suspense fallback={<Loading />}>
            <DepartmentProjectsChart projectBreakdown={analyticsData.projectBreakdown} />
          </Suspense>
        )}

        <AdditionalMetrics analyticsData={analyticsData} />

        <OverdueTasksList overdueTasksList={analyticsData?.overdueTasksList} />
      </div>
    </div>
  );
});

export default Analytics;
