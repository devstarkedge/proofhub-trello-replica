import React, { useState, useEffect, useContext, memo, lazy, Suspense, useMemo } from 'react';
import Header from '../components/Header';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import StatsGrid from '../components/StatsGrid';
import AdditionalMetrics from '../components/AdditionalMetrics';
import OverdueTasksList from '../components/OverdueTasksList';
import Loading from '../components/Loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const ChartsSection = lazy(() => import('../components/ChartsSection'));
const TimeAnalyticsChart = lazy(() => import('../components/TimeAnalyticsChart'));
const DepartmentProjectsChart = lazy(() => import('../components/DepartmentProjectsChart'));

const useAnalytics = (initialDepartmentId) => {
  const { departments } = useContext(TeamContext);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState(initialDepartmentId);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        const departmentId = selectedDepartment || initialDepartmentId;

        if (departmentId) {
          const response = await Database.getDepartmentAnalytics(departmentId);
          setAnalyticsData(response.data);
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [selectedDepartment, initialDepartmentId]);

  return {
    analyticsData,
    loading,
    selectedDepartment,
    setSelectedDepartment,
    departments,
  };
};


const Analytics = memo(() => {
  const { currentDepartment } = useContext(TeamContext);
  const {
    analyticsData,
    loading,
    selectedDepartment,
    setSelectedDepartment,
    departments,
  } = useAnalytics(currentDepartment?._id || '');

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

    return {
      priorityData: [
        { name: 'Low', value: analyticsData.priorityBreakdown.low, color: priorityColors.low },
        { name: 'Medium', value: analyticsData.priorityBreakdown.medium, color: priorityColors.medium },
        { name: 'High', value: analyticsData.priorityBreakdown.high, color: priorityColors.high },
        { name: 'Critical', value: analyticsData.priorityBreakdown.critical, color: priorityColors.critical }
      ],
      statusData: [
        { name: 'To Do', value: analyticsData.todoTasks, color: statusColors.todo },
        { name: 'In Progress', value: analyticsData.inProgressTasks, color: statusColors['in-progress'] },
        { name: 'Review', value: analyticsData.reviewTasks, color: statusColors.review },
        { name: 'Done', value: analyticsData.completedTasks, color: statusColors.done }
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

            {/* Department Selector */}
            {departments && departments.length > 1 && (
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept._id} value={dept._id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
