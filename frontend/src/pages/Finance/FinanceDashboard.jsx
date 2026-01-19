import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Users, 
  FolderKanban, 
  Clock, 
  FileCheck,
  Building2,
  AlertCircle,
  RefreshCw,
  Calendar,
  ArrowRight,
  PieChart,
  BarChart3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import AuthContext from '../../context/AuthContext';

/**
 * FinanceDashboard - Single Source of Truth Dashboard
 * Default landing page for Finance module
 * Shows key metrics, charts, and quick access to detailed views
 */
const FinanceDashboard = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState(null);
  const [usersData, setUsersData] = useState([]);
  const [projectsData, setProjectsData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build date range based on selected period
      const now = new Date();
      let startDate, endDate;
      
      switch (selectedPeriod) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date();
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          endDate = new Date();
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date();
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date();
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date();
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      // Fetch all data in parallel
      const [summaryRes, usersRes, projectsRes, deptsRes] = await Promise.all([
        api.get(`/api/finance/summary?${params.toString()}`),
        api.get(`/api/finance/users?${params.toString()}`),
        api.get(`/api/finance/projects?${params.toString()}`),
        api.get('/api/finance/departments')
      ]);

      if (summaryRes.data.success) setSummary(summaryRes.data.data);
      if (usersRes.data.success) setUsersData(usersRes.data.data || []);
      if (projectsRes.data.success) setProjectsData(projectsRes.data.data || []);
      if (deptsRes.data.success) setDepartments(deptsRes.data.data || []);

    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedPeriod]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Format time
  const formatTime = (time) => {
    if (!time) return '0h 0m';
    const hours = time.hours || Math.floor((time.totalMinutes || 0) / 60);
    const minutes = time.minutes || (time.totalMinutes || 0) % 60;
    return `${hours}h ${minutes}m`;
  };

  // Department statistics
  const departmentStats = useMemo(() => {
    const stats = {};
    
    projectsData.forEach(project => {
      const dept = project.department || 'Unassigned';
      if (!stats[dept]) {
        stats[dept] = {
          name: dept,
          projectCount: 0,
          totalPayment: 0,
          totalBilledMinutes: 0
        };
      }
      stats[dept].projectCount++;
      stats[dept].totalPayment += project.payment || 0;
      stats[dept].totalBilledMinutes += project.billedTime?.totalMinutes || 0;
    });
    
    return Object.values(stats).sort((a, b) => b.totalPayment - a.totalPayment);
  }, [projectsData]);

  // Top performers
  const topUsers = useMemo(() => {
    return [...usersData]
      .sort((a, b) => (b.totalPayment || 0) - (a.totalPayment || 0))
      .slice(0, 5);
  }, [usersData]);

  // Top projects
  const topProjects = useMemo(() => {
    return [...projectsData]
      .sort((a, b) => (b.payment || 0) - (a.payment || 0))
      .slice(0, 5);
  }, [projectsData]);

  // Skeleton loader
  const SkeletonCard = () => (
    <div 
      className="p-6 rounded-xl border animate-pulse"
      style={{ 
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-24 rounded mb-3" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
          <div className="h-8 w-32 rounded mb-2" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
        </div>
        <div className="w-12 h-12 rounded-xl" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
      </div>
    </div>
  );

  // Period selector buttons
  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' }
  ];

  if (error) {
    return (
      <div 
        className="p-8 rounded-xl border text-center"
        style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.3)'
        }}
      >
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: '#ef4444' }}>
          Failed to load dashboard
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {error}
        </p>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mx-auto"
          style={{ backgroundColor: '#ef4444', color: 'white' }}
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div 
        className="flex items-center justify-between p-4 rounded-xl border"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: '#10b981' }} />
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Time Period
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {periods.map(period => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: selectedPeriod === period.id 
                  ? 'rgba(16, 185, 129, 0.15)' 
                  : 'transparent',
                color: selectedPeriod === period.id 
                  ? '#10b981' 
                  : 'var(--color-text-secondary)',
                border: selectedPeriod === period.id 
                  ? '1px solid rgba(16, 185, 129, 0.3)' 
                  : '1px solid transparent'
              }}
            >
              {period.label}
            </button>
          ))}
          
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="ml-2 p-2 rounded-lg border transition-all duration-200 hover:border-emerald-500"
            style={{ 
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue */}
          <div 
            className="p-6 rounded-xl border group hover:scale-[1.02] transition-all duration-200 cursor-pointer"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
            onClick={() => navigate('/finance/projects')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Total Revenue
                </p>
                <p className="text-2xl font-bold" style={{ color: '#10b981' }}>
                  {formatCurrency(summary?.totalRevenue)}
                </p>
                <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{projectsData.length} projects</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </div>
              <div 
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
              >
                <DollarSign className="w-6 h-6" style={{ color: '#10b981' }} />
              </div>
            </div>
          </div>

          {/* Total Billed Time */}
          <div 
            className="p-6 rounded-xl border group hover:scale-[1.02] transition-all duration-200 cursor-pointer"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
            onClick={() => navigate('/finance')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Total Billed Time
                </p>
                <p className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>
                  {formatTime(summary?.totalBilledTime)}
                </p>
                <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{usersData.length} contributors</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </div>
              <div 
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)' }}
              >
                <FileCheck className="w-6 h-6" style={{ color: '#8b5cf6' }} />
              </div>
            </div>
          </div>

          {/* Logged Time */}
          <div 
            className="p-6 rounded-xl border"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Total Logged Time
                </p>
                <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>
                  {formatTime(summary?.totalLoggedTime)}
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Across all tasks
                </p>
              </div>
              <div 
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
              >
                <Clock className="w-6 h-6" style={{ color: '#3b82f6' }} />
              </div>
            </div>
          </div>

          {/* Unbilled Time */}
          <div 
            className="p-6 rounded-xl border"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Unbilled Time
                </p>
                <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
                  {formatTime(summary?.unbilledTime)}
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Pending billing
                </p>
              </div>
              <div 
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
              >
                <AlertCircle className="w-6 h-6" style={{ color: '#f59e0b' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Users */}
        <div 
          className="rounded-xl border overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <div 
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: 'var(--color-bg-muted)' }}
          >
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: '#ec4899' }} />
              <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Top Performers
              </h3>
            </div>
            <button
              onClick={() => navigate('/finance/users')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: '#10b981' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                    <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                  </div>
                  <div className="h-4 w-20 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                </div>
              ))}
            </div>
          ) : topUsers.length > 0 ? (
            <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {topUsers.map((user, idx) => (
                <div 
                  key={user.userId}
                  className="flex items-center justify-between px-4 py-3 hover:bg-opacity-50 transition-colors"
                  style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--color-bg-primary)' }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ 
                        backgroundColor: idx === 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-bg-muted)',
                        color: idx === 0 ? '#f59e0b' : 'var(--color-text-secondary)'
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {user.userName}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {user.projects?.length || 0} projects • {formatTime(user.totalBilledTime)} billed
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold" style={{ color: '#10b981' }}>
                    {formatCurrency(user.totalPayment)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No user data available
              </p>
            </div>
          )}
        </div>

        {/* Top Projects */}
        <div 
          className="rounded-xl border overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <div 
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: 'var(--color-bg-muted)' }}
          >
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5" style={{ color: '#06b6d4' }} />
              <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Top Revenue Projects
              </h3>
            </div>
            <button
              onClick={() => navigate('/finance/projects')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: '#10b981' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                    <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                  </div>
                  <div className="h-4 w-20 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                </div>
              ))}
            </div>
          ) : topProjects.length > 0 ? (
            <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {topProjects.map((project, idx) => (
                <div 
                  key={project.projectId}
                  className="flex items-center justify-between px-4 py-3 hover:bg-opacity-50 transition-colors"
                  style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--color-bg-primary)' }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ 
                        backgroundColor: project.billingCycle === 'hr' 
                          ? 'rgba(139, 92, 246, 0.12)' 
                          : 'rgba(59, 130, 246, 0.12)'
                      }}
                    >
                      <FolderKanban 
                        className="w-4 h-4" 
                        style={{ 
                          color: project.billingCycle === 'hr' ? '#8b5cf6' : '#3b82f6' 
                        }} 
                      />
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {project.projectName}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {project.department} • {project.billingCycle === 'hr' ? 'Hourly' : 'Fixed'}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold" style={{ color: '#10b981' }}>
                    {formatCurrency(project.payment)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <FolderKanban className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No project data available
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Department Breakdown */}
      <div 
        className="rounded-xl border overflow-hidden"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div 
          className="flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: 'var(--color-bg-muted)' }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5" style={{ color: '#10b981' }} />
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Revenue by Department
            </h3>
          </div>
        </div>
        
        {loading ? (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                  <div className="h-5 w-32 rounded mb-2" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                  <div className="h-8 w-24 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                </div>
              ))}
            </div>
          </div>
        ) : departmentStats.length > 0 ? (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departmentStats.map((dept, idx) => {
                const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
                const color = colors[idx % colors.length];
                
                return (
                  <div 
                    key={dept.name}
                    className="p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border-subtle)',
                      borderLeftWidth: '4px',
                      borderLeftColor: color
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {dept.name}
                      </h4>
                      <span 
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {dept.projectCount} project{dept.projectCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xl font-bold mb-1" style={{ color }}>
                      {formatCurrency(dept.totalPayment)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatTime({ totalMinutes: dept.totalBilledMinutes })} billed
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No department data available
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div 
        className="p-4 rounded-xl border"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <h3 className="font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/finance/users')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
            style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6'
            }}
          >
            <Users className="w-4 h-4" />
            View Users Report
          </button>
          <button
            onClick={() => navigate('/finance/projects')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
            style={{ 
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#8b5cf6'
            }}
          >
            <FolderKanban className="w-4 h-4" />
            View Projects Report
          </button>
          <button
            onClick={() => navigate('/finance/weekly')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
            style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981'
            }}
          >
            <Calendar className="w-4 h-4" />
            Weekly Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboard;
