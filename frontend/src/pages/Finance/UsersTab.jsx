import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search as SearchIcon,
  Users,
  Building2,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  Download,
  Filter,
  FolderKanban,
  Calendar
} from 'lucide-react';
import api from '../../services/api';
import SummaryCards from '../../components/Finance/SummaryCards';
import DateFilters from '../../components/Finance/DateFilters';
import DepartmentFilter from '../../components/Finance/DepartmentFilter';
import GlobalSearch from '../../components/Finance/GlobalSearch';
import ExportButton from '../../components/Finance/ExportButton';
import DataIntegrityWarnings from '../../components/Finance/DataIntegrityWarnings';
import ColumnTooltip, { COLUMN_EXPLANATIONS } from '../../components/Finance/ColumnTooltip';
import EmptyState from '../../components/Finance/EmptyState';
import { WeekWiseHeaders, WeekWiseCells, formatWeekValue } from '../../components/Finance/WeekWiseColumns';

/**
 * UsersTab - User-centric Finance View (Enhanced)
 * Features:
 * - Department-wise grouping (mandatory)
 * - Date filters (Today, Week, Month, Custom)
 * - Department filter dropdown
 * - All mandatory columns: User Name, Project, Logged Time, Billed Time, Payment
 * - Expandable user rows with project breakdown
 * - Week-wise reporting mode toggle
 */
const UsersTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [expandedUsers, setExpandedUsers] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'totalPayment', direction: 'desc' });
  const [filters, setFilters] = useState({
    startDate: null,
    endDate: null,
    departmentId: null,
    userId: null
  });

  // Week-wise reporting mode state
  const [weekWiseMode, setWeekWiseMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyDataLoading, setWeeklyDataLoading] = useState(false);


  // Initialize filters from URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userIdParam = params.get('userId');
    const departmentIdParam = params.get('departmentId');
    
    if (userIdParam || departmentIdParam) {
      setFilters(prev => ({
        ...prev,
        userId: userIdParam || null,
        departmentId: departmentIdParam || null
      }));
    }
  }, [location.search]);

  // Fetch user finance data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.departmentId) params.append('departmentId', filters.departmentId);
      if (filters.userId) params.append('userId', filters.userId);
      
      const response = await api.get(`/api/finance/users?${params.toString()}`);
      
      if (response.data.success) {
        setData(response.data.data || []);
        
        // Auto-expand departments initially
        const uniqueDepts = new Set();
        (response.data.data || []).forEach(user => {
          user.projects?.forEach(p => uniqueDepts.add(p.department));
        });
        const expanded = {};
        uniqueDepts.forEach(dept => { expanded[dept] = true; });
        setExpandedDepartments(expanded);
      }
    } catch (err) {
      console.error('Error fetching user finance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  // Fetch week-wise data when mode is enabled
  useEffect(() => {
    const fetchWeeklyData = async () => {
      if (!weekWiseMode) {
        setWeeklyData(null);
        return;
      }
      
      try {
        setWeeklyDataLoading(true);
        const params = new URLSearchParams({
          year: selectedYear.toString(),
          viewType: 'users'
        });
        if (filters.departmentId) {
          params.append('departmentId', filters.departmentId);
        }
        
        const response = await api.get(`/api/finance/weekly-report/year?${params.toString()}`);
        if (response.data.success) {
          setWeeklyData(response.data.data);
        }
      } catch (err) {
        console.error('Error fetching weekly data:', err);
      } finally {
        setWeeklyDataLoading(false);
      }
    };
    
    fetchWeeklyData();
  }, [weekWiseMode, selectedYear, filters.departmentId]);

  // Handle card click for filtering
  const handleCardClick = (action, value) => {
    if (action === 'user' && value) {
      setFilters(prev => ({ ...prev, userId: value }));
    } else if (action === 'project' && value) {
      navigate(`/finance/projects?projectId=${value}`);
    }
  };

  // Toggle department expansion
  const toggleDepartment = (dept) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [dept]: !prev[dept]
    }));
  };

  // Toggle user expansion
  const toggleUser = (userId) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  // Sort handler
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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

  // Build weekly payments lookup from weeklyData (grouped by userId and userId_projectId)
  const weeklyPaymentsMap = useMemo(() => {
    if (!weeklyData || !weeklyData.months) return {};
    
    const map = {};
    
    // Use current month's week breakdown data
    const currentMonth = new Date().getMonth();
    const monthData = weeklyData.months?.find(m => m.month === currentMonth) || weeklyData.months?.[0];
    
    if (monthData?.items) {
      monthData.items.forEach(item => {
        if (item.userId) {
          // Store user-level weekly payments
          map[item.userId] = item.weeks || [0, 0, 0, 0, 0];
          
          // Store project-level weekly payments within this user
          if (item.projects && Array.isArray(item.projects)) {
            item.projects.forEach(proj => {
              if (proj.projectId) {
                // Key format: userId_projectId
                map[`${item.userId}_${proj.projectId}`] = proj.weeks || [0, 0, 0, 0, 0];
              }
            });
          }
        }
      });
    }
    
    return map;
  }, [weeklyData]);

  // Group data by department
  const groupedByDepartment = useMemo(() => {
    const grouped = {};
    
    data.forEach(user => {
      // Filter by search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesUser = user.userName?.toLowerCase().includes(query);
        const matchesProject = user.projects?.some(p => p.projectName?.toLowerCase().includes(query));
        if (!matchesUser && !matchesProject) return;
      }

      user.projects?.forEach(project => {
        const dept = project.department || 'Unassigned';
        if (!grouped[dept]) {
          grouped[dept] = {
            users: {},
            totalPayment: 0,
            totalBilledMinutes: 0,
            totalLoggedMinutes: 0
          };
        }
        
        // Add user to department
        if (!grouped[dept].users[user.userId]) {
          grouped[dept].users[user.userId] = {
            ...user,
            projectsInDept: [],
            deptBilledMinutes: 0,
            deptLoggedMinutes: 0,
            deptPayment: 0,
            // Initialize department-specific weekly payments (will be summed from projects)
            weeklyPayments: [0, 0, 0, 0, 0]
          };
        }
        
        // Add project with its weekly payments from lookup (userId_projectId key)
        const projectWeeklyKey = `${user.userId}_${project.projectId}`;
        const projectWeeklyPayments = weeklyPaymentsMap[projectWeeklyKey] || [0, 0, 0, 0, 0];
        const projectWithWeekly = {
          ...project,
          weeklyPayments: projectWeeklyPayments
        };
        grouped[dept].users[user.userId].projectsInDept.push(projectWithWeekly);
        
        // Sum up project weekly payments to user's department-specific weekly totals
        for (let i = 0; i < 5; i++) {
          grouped[dept].users[user.userId].weeklyPayments[i] += (projectWeeklyPayments[i] || 0);
        }
        
        grouped[dept].users[user.userId].deptBilledMinutes += project.billedMinutes || 0;
        grouped[dept].users[user.userId].deptLoggedMinutes += project.loggedMinutes || 0;
        grouped[dept].users[user.userId].deptPayment += project.payment || 0;
        
        grouped[dept].totalPayment += project.payment || 0;
        grouped[dept].totalBilledMinutes += project.billedMinutes || 0;
        grouped[dept].totalLoggedMinutes += project.loggedMinutes || 0;
      });
    });
    
    // Convert users object to sorted array
    Object.keys(grouped).forEach(dept => {
      grouped[dept].usersArray = Object.values(grouped[dept].users).sort((a, b) => {
        if (sortConfig.direction === 'asc') {
          return (a.deptPayment || 0) - (b.deptPayment || 0);
        }
        return (b.deptPayment || 0) - (a.deptPayment || 0);
      });
    });
    
    return grouped;
  }, [data, searchQuery, sortConfig, weeklyPaymentsMap]);

  // Calculate department totals
  const departmentTotals = useMemo(() => {
    let total = 0;
    Object.values(groupedByDepartment).forEach(dept => {
      total += dept.totalPayment;
    });
    return total;
  }, [groupedByDepartment]);

  // Export columns configuration
  const exportColumns = [
    { key: 'userName', label: 'User Name' },
    { key: 'department', label: 'Department' },
    { key: 'projectName', label: 'Project' },
    { key: 'loggedTime', label: 'Logged Time' },
    { key: 'billedTime', label: 'Billed Time' },
    { key: 'payment', label: 'Payment' }
  ];

  // Flatten data for export
  const flattenedDataForExport = useMemo(() => {
    const flattened = [];
    data.forEach(user => {
      user.projects?.forEach(project => {
        flattened.push({
          userName: user.userName,
          department: project.department || 'Unassigned',
          projectName: project.projectName,
          loggedTime: {
            hours: Math.floor((project.loggedMinutes || 0) / 60),
            minutes: (project.loggedMinutes || 0) % 60
          },
          billedTime: {
            hours: Math.floor((project.billedMinutes || 0) / 60),
            minutes: (project.billedMinutes || 0) % 60
          },
          payment: project.payment || 0
        });
      });
    });
    return flattened;
  }, [data]);

  // Skeleton row
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div 
            className="h-4 rounded"
            style={{ 
              backgroundColor: 'var(--color-bg-muted)',
              width: `${60 + Math.random() * 40}%`
            }}
          />
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      {/* Summary Cards */}
      <SummaryCards filters={filters} onCardClick={handleCardClick} />

      {/* Data Integrity Warnings */}
      <DataIntegrityWarnings data={data} type="users" />

      {/* Filters Bar */}
      <div 
        className="p-4 rounded-xl mb-6 border"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* Global Search with Autocomplete */}
          <div className="flex-1 min-w-64">
            <GlobalSearch 
              data={data}
              type="users"
              placeholder="Search users, departments..."
              onFilter={(suggestion) => {
                if (!suggestion) {
                  setSearchQuery('');
                  setFilters(prev => ({ ...prev, userId: null, departmentId: null }));
                } else if (suggestion.type === 'user') {
                  setFilters(prev => ({ ...prev, userId: suggestion.value }));
                } else if (suggestion.type === 'department') {
                  setFilters(prev => ({ ...prev, departmentId: suggestion.value }));
                }
              }}
            />
          </div>

          {/* Department Filter */}
          <DepartmentFilter 
            selectedDepartmentId={filters.departmentId}
            onChange={(deptId) => setFilters(prev => ({ ...prev, departmentId: deptId }))}
          />

          {/* Export Button */}
          <ExportButton 
            data={flattenedDataForExport}
            columns={exportColumns}
            filename="users-finance-report"
            title="Users Finance Report"
            filters={filters}
          />

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:border-emerald-500"
            style={{ 
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Date Filters Row */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <DateFilters 
            filters={filters} 
            setFilters={setFilters}
            onClear={() => {}}
            showSavedPresets={true}
            showWeekWiseToggle={true}
            weekWiseMode={weekWiseMode}
            onWeekWiseModeChange={setWeekWiseMode}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        </div>
      </div>


      {/* Error State */}
      {error && (
        <div 
          className="p-4 rounded-xl border text-center mb-6"
          style={{ 
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: '#ef4444'
          }}
        >
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          <p className="text-sm">Failed to load data: {error}</p>
          <button 
            onClick={fetchData}
            className="mt-2 text-xs flex items-center gap-1 mx-auto hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}


      {/* Week-Wise Mode Header */}
      {weekWiseMode && (
        <div 
          className="flex items-center justify-between p-3 rounded-lg mb-4"
          style={{ backgroundColor: 'var(--color-bg-muted)' }}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: '#10b981' }} />
            <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Week-Wise Report - {selectedYear}
            </span>
          </div>
          {weeklyData && (
            <span className="text-lg font-bold" style={{ color: '#10b981' }}>
              {formatCurrency(weeklyData.yearTotal || 0)}
            </span>
          )}
        </div>
      )}

      {/* Department-wise Data Tables */}
      {(loading || weeklyDataLoading) ? (
        <div 
          className="rounded-xl border overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold">User Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Projects</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Logged Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Billed Time</th>
                {weekWiseMode && (
                  <>
                    <th className="px-4 py-3 text-center text-xs font-semibold">Week 1</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">Week 2</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">Week 3</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">Week 4</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">Week 5</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold">Payment</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
          ) : Object.keys(groupedByDepartment).length === 0 ? (
            <div 
              className="rounded-xl border"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              <EmptyState 
                type={searchQuery ? 'noSearchResults' : 'noUsers'}
                description={searchQuery 
                  ? 'Try adjusting your search or filters to find users' 
                  : 'User finance data will appear once team members start logging time on billable projects'
                }
              />
            </div>
          ) : (
            <div className="space-y-6">

          {Object.entries(groupedByDepartment).map(([department, deptData]) => (
            <div 
              key={department}
              className="rounded-xl border overflow-hidden"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              {/* Department Header */}
              <button
                onClick={() => toggleDepartment(department)}
                className="w-full flex items-center justify-between px-4 py-3 transition-colors duration-150"
                style={{ backgroundColor: 'var(--color-bg-muted)' }}
              >
                <div className="flex items-center gap-3">
                  <Building2 
                    className="w-5 h-5"
                    style={{ color: '#10b981' }}
                  />
                  <span 
                    className="font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {department}
                  </span>
                  <span 
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ 
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981'
                    }}
                  >
                    {deptData.usersArray.length} user{deptData.usersArray.length !== 1 ? 's' : ''}
                  </span>
                  <span 
                    className="text-sm font-semibold ml-4"
                    style={{ color: '#10b981' }}
                  >
                    {formatCurrency(deptData.totalPayment)}
                  </span>
                </div>
                {expandedDepartments[department] ? (
                  <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                ) : (
                  <ChevronRight className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                )}
              </button>

              {/* Users Table */}
              {expandedDepartments[department] && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                        <th 
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider sticky left-0"
                          style={{ 
                            color: 'var(--color-text-secondary)',
                            backgroundColor: 'var(--color-bg-primary)'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            User Name
                          </div>
                        </th>
                        <th 
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <div className="flex items-center gap-1">
                            <FolderKanban className="w-4 h-4" />
                            Projects
                          </div>
                        </th>
                        <th 
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('totalLoggedTime')}
                        >
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Logged Time
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th 
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('totalBilledTime')}
                        >
                          <ColumnTooltip explanation={COLUMN_EXPLANATIONS.billedTime}>
                            <div className="flex items-center gap-1">
                              Billed Time
                              <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </ColumnTooltip>
                        </th>
                        {/* Week-wise columns - dynamically inserted */}
                        {weekWiseMode && (
                          <WeekWiseHeaders year={selectedYear} showMonthColumn={false} />
                        )}
                        <th 
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('totalPayment')}
                        >
                          <ColumnTooltip explanation={COLUMN_EXPLANATIONS.payment.hourly}>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              Payment
                              <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </ColumnTooltip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptData.usersArray.map((user) => (
                        <React.Fragment key={user.userId}>
                          {/* User Row */}
                          <tr 
                            className="transition-colors duration-150 cursor-pointer"
                            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                            onClick={() => toggleUser(user.userId)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <td 
                              className="px-4 py-3 font-medium sticky left-0"
                              style={{ 
                                color: 'var(--color-text-primary)',
                                backgroundColor: 'var(--color-bg-secondary)'
                              }}
                            >
                              <div className="flex items-center gap-2">
                                {expandedUsers[user.userId] ? (
                                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                                ) : (
                                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                                )}
                                {user.userName}
                              </div>
                            </td>
                            <td 
                              className="px-4 py-3 text-sm"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              <span 
                                className="px-2 py-1 rounded-full text-xs"
                                style={{ 
                                  backgroundColor: 'var(--color-bg-muted)',
                                  color: 'var(--color-text-secondary)'
                                }}
                              >
                                {user.projectsInDept?.length || 0} project{(user.projectsInDept?.length || 0) !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td 
                              className="px-4 py-3 text-sm"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {formatTime({ totalMinutes: user.deptLoggedMinutes })}
                            </td>
                            <td 
                              className="px-4 py-3 text-sm"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {formatTime({ totalMinutes: user.deptBilledMinutes })}
                            </td>
                            {/* Week-wise cells - dynamically inserted */}
                            {weekWiseMode && (
                              <WeekWiseCells 
                                weeklyPayments={user.weeklyPayments || [0, 0, 0, 0, 0]}
                                formatCurrency={formatCurrency}
                                showMonthColumn={false}
                              />
                            )}
                            <td 
                              className="px-4 py-3 text-sm font-semibold"
                              style={{ color: '#10b981' }}
                            >
                              {formatCurrency(user.deptPayment)}
                            </td>
                          </tr>
                          
                          {/* Expanded Project Details */}
                          {expandedUsers[user.userId] && user.projectsInDept?.map((project, idx) => (
                            <tr 
                              key={`${user.userId}-${project.projectId}-${idx}`}
                              className="text-sm"
                              style={{ 
                                backgroundColor: 'var(--color-bg-primary)',
                                borderTop: '1px solid var(--color-border-subtle)'
                              }}
                            >
                              <td 
                                className="px-4 py-2 pl-12 sticky left-0"
                                style={{ 
                                  color: 'var(--color-text-muted)',
                                  backgroundColor: 'var(--color-bg-primary)'
                                }}
                              >
                                <span className="text-xs">↳</span>
                              </td>
                              <td 
                                className="px-4 py-2"
                                style={{ color: 'var(--color-text-secondary)' }}
                              >
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="px-2 py-0.5 rounded text-xs"
                                    style={{ 
                                      backgroundColor: project.billingCycle === 'hr' 
                                        ? 'rgba(139, 92, 246, 0.12)' 
                                        : 'rgba(59, 130, 246, 0.12)',
                                      color: project.billingCycle === 'hr' 
                                        ? '#8b5cf6' 
                                        : '#3b82f6'
                                    }}
                                  >
                                    {project.billingCycle === 'hr' ? 'Hourly' : 'Fixed'}
                                  </span>
                                  {project.projectName}
                                  {project.billingCycle === 'hr' && project.hourlyPrice && (
                                    <span 
                                      className="text-xs"
                                      style={{ color: 'var(--color-text-muted)' }}
                                    >
                                      (${project.hourlyPrice}/hr)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td 
                                className="px-4 py-2"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                {formatTime(project.loggedTime)}
                              </td>
                              <td 
                                className="px-4 py-2"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                {formatTime(project.billedTime)}
                              </td>
                              {/* Week-wise cells for expanded project */}
                              {weekWiseMode && (
                                <WeekWiseCells 
                                  weeklyPayments={project.weeklyPayments || [0, 0, 0, 0, 0]}
                                  formatCurrency={formatCurrency}
                                  showMonthColumn={false}
                                  cellStyle={{ color: 'var(--color-text-muted)' }}
                                />
                              )}
                              <td 
                                className="px-4 py-2"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                {formatCurrency(project.payment)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Grand Total */}
          <div 
            className="p-4 rounded-xl border flex items-center justify-between"
            style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderColor: 'rgba(16, 185, 129, 0.3)'
            }}
          >
            <span 
              className="font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Total Across All Departments
            </span>
            <span 
              className="text-lg font-bold"
              style={{ color: '#10b981' }}
            >
              {formatCurrency(departmentTotals)}
            </span>
          </div>
        </div>
          )}

      {/* Year Total for Week-Wise Mode */}
      {weekWiseMode && weeklyData && (
        <div 
          className="p-4 rounded-xl border flex items-center justify-between mt-4"
          style={{ 
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderColor: 'rgba(16, 185, 129, 0.3)'
          }}
        >
          <span 
            className="font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Year Total ({selectedYear})
          </span>
          <span 
            className="text-lg font-bold"
            style={{ color: '#10b981' }}
          >
            {formatCurrency(weeklyData.yearTotal || 0)}
          </span>
        </div>
      )}
    </div>
  );
};

export default UsersTab;

