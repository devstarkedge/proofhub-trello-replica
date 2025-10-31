import React, { useState, useEffect, useContext, memo, lazy, Suspense } from 'react';
import Header from '../components/Header';
import TeamContext from '../context/TeamContext';
import api from '../services/api';
import StatsGrid from '../components/StatsGrid';
import AdditionalMetrics from '../components/AdditionalMetrics';
import OverdueTasksList from '../components/OverdueTasksList';
import Loading from '../components/Loading';

const ChartsSection = lazy(() => import('../components/ChartsSection'));

const Analytics = memo(() => {

  const { currentTeam, currentDepartment } = useContext(TeamContext);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (currentTeam) {
      loadAnalytics();
    }
  }, [currentTeam]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/analytics/team/${currentTeam._id}`);
      setAnalyticsData(response.data.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const priorityData = analyticsData ? [
    { name: 'Low', value: analyticsData.priorityBreakdown.low, color: priorityColors.low },
    { name: 'Medium', value: analyticsData.priorityBreakdown.medium, color: priorityColors.medium },
    { name: 'High', value: analyticsData.priorityBreakdown.high, color: priorityColors.high },
    { name: 'Critical', value: analyticsData.priorityBreakdown.critical, color: priorityColors.critical }
  ] : [];

  const statusData = analyticsData ? [
    { name: 'To Do', value: analyticsData.todoTasks, color: statusColors.todo },
    { name: 'In Progress', value: analyticsData.inProgressTasks, color: statusColors['in-progress'] },
    { name: 'Review', value: analyticsData.reviewTasks, color: statusColors.review },
    { name: 'Done', value: analyticsData.completedTasks, color: statusColors.done }
  ] : [];



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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
          <p className="text-gray-600">
            Insights for {currentTeam?.name} • {currentDepartment?.name}
          </p>
        </div>

        <StatsGrid analyticsData={analyticsData} />

        <Suspense fallback={<Loading />}>
          <ChartsSection priorityData={priorityData} statusData={statusData} />
        </Suspense>

        <AdditionalMetrics analyticsData={analyticsData} />

        <OverdueTasksList overdueTasksList={analyticsData?.overdueTasksList} />
      </div>
    </div>
  );
});

export default Analytics;
