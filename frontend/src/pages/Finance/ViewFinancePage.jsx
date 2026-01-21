import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Users,
  FolderKanban,
  Building2,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Edit3,
  Search as SearchIcon,
  Calendar
} from 'lucide-react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import DateFilters from '../../components/Finance/DateFilters';
import DepartmentFilter from '../../components/Finance/DepartmentFilter';
import { WeekWiseHeaders, WeekWiseCells, formatWeekValue } from '../../components/Finance/WeekWiseColumns';

/**
 * ViewFinancePage - Renders a custom finance page with its configured columns
 * Supports both users and projects view types
 * Includes week-wise reporting mode toggle
 */
const ViewFinancePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [filters, setFilters] = useState({
    startDate: null,
    endDate: null,
    departmentId: null
  });

  // Week-wise reporting mode state
  const [weekWiseMode, setWeekWiseMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyDataLoading, setWeeklyDataLoading] = useState(false);


  // Fetch page configuration
  const fetchPage = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/finance/pages/${id}`);
      if (response.data.success) {
        setPage(response.data.data);
        // Apply default filters from page config
        if (response.data.data.defaultFilters) {
          const df = response.data.data.defaultFilters;
          if (df.departmentId) {
            setFilters(prev => ({ ...prev, departmentId: df.departmentId }));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching page:', err);
      setError('Failed to load page');
      toast.error('Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data based on page type
  const fetchData = async () => {
    if (!page) return;
    
    try {
      setDataLoading(true);
      
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.departmentId) params.append('departmentId', filters.departmentId);
      
      const endpoint = page.pageType === 'users' ? '/api/finance/users' : '/api/finance/projects';
      const response = await api.get(`${endpoint}?${params.toString()}`);
      
      if (response.data.success) {
        setData(response.data.data || []);
        
        // Auto-expand departments
        const depts = new Set();
        if (page.pageType === 'users') {
          response.data.data?.forEach(user => {
            user.projects?.forEach(p => depts.add(p.department));
          });
        } else {
          response.data.data?.forEach(project => {
            depts.add(project.department || 'Unassigned');
          });
        }
        const expanded = {};
        depts.forEach(d => { expanded[d] = true; });
        setExpandedDepartments(expanded);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load data');
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchPage();
  }, [id]);

  useEffect(() => {
    if (page) {
      fetchData();
    }
  }, [page, filters]);

  // Fetch week-wise data when mode is enabled
  useEffect(() => {
    const fetchWeeklyData = async () => {
      if (!weekWiseMode || !page) {
        setWeeklyData(null);
        return;
      }
      
      try {
        setWeeklyDataLoading(true);
        const params = new URLSearchParams({
          year: selectedYear.toString(),
          viewType: page.pageType
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
  }, [weekWiseMode, selectedYear, filters.departmentId, page]);

  // Format helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatTime = (time) => {
    if (!time) return '0h 0m';
    const hours = time.hours || Math.floor((time.totalMinutes || 0) / 60);
    const minutes = time.minutes || (time.totalMinutes || 0) % 60;
    return `${hours}h ${minutes}m`;
  };

  // Toggle department expansion
  const toggleDepartment = (dept) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [dept]: !prev[dept]
    }));
  };

  // Filter data by search
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const query = searchQuery.toLowerCase();
    
    if (page?.pageType === 'users') {
      return data.filter(user => 
        user.userName?.toLowerCase().includes(query) ||
        user.projects?.some(p => p.projectName?.toLowerCase().includes(query))
      );
    } else {
      return data.filter(project => 
        project.projectName?.toLowerCase().includes(query) ||
        project.department?.toLowerCase().includes(query)
      );
    }
  }, [data, searchQuery, page]);

  // Build weekly payments lookup from weeklyData
  const weeklyPaymentsMap = useMemo(() => {
    if (!weeklyData || !weeklyData.months) return {};
    
    const map = {};
    
    // Use current month's week breakdown data
    const currentMonth = new Date().getMonth();
    const monthData = weeklyData.months?.find(m => m.month === currentMonth) || weeklyData.months?.[0];
    
    if (monthData?.items) {
      monthData.items.forEach(item => {
        const key = item.userId || item.projectId;
        if (key) {
          map[key] = item.weeks || [0, 0, 0, 0, 0];
        }
      });
    }
    
    return map;
  }, [weeklyData]);

  // Group data by department
  const groupedData = useMemo(() => {
    const grouped = {};
    
    if (page?.pageType === 'users') {
      filteredData.forEach(user => {
        user.projects?.forEach(project => {
          const dept = project.department || 'Unassigned';
          if (!grouped[dept]) {
            grouped[dept] = { items: [], totalPayment: 0, usersMap: {} };
          }
          
          // Initialize user entry in this department if not exists
          if (!grouped[dept].usersMap[user.userId]) {
            grouped[dept].usersMap[user.userId] = {
              ...user,
              department: dept,
              // Initialize aggregated fields
              projects: [], // Will contain projects only for this department
              projectName: [], // Collect names
              payment: 0,
              taskCount: 0,
              loggedTime: { totalMinutes: 0 },
              billedTime: { totalMinutes: 0 },
              // Reset lastActivity to compare and find latest
              lastActivity: null,
              // Add weekly payments from lookup
              weeklyPayments: weeklyPaymentsMap[user.userId] || [0, 0, 0, 0, 0]
            };
          }
          
          const u = grouped[dept].usersMap[user.userId];
          
          // Aggregate data
          u.projects.push(project);
          u.projectName.push(project.projectName || 'Unnamed Project');
          u.payment += project.payment || 0;
          u.taskCount += project.taskCount || 0;
          
          // Time aggregation
          const pLogged = project.loggedTime?.totalMinutes || project.loggedMinutes || 0;
          const pBilled = project.billedTime?.totalMinutes || project.billedMinutes || 0;
          u.loggedTime.totalMinutes += pLogged;
          u.billedTime.totalMinutes += pBilled;
          
          // Update Last Activity (keep latest)
          if (project.lastActivity?.date) {
            const currentLast = u.lastActivity?.date ? new Date(u.lastActivity.date).getTime() : 0;
            const newLast = new Date(project.lastActivity.date).getTime();
            if (newLast > currentLast) {
              u.lastActivity = project.lastActivity;
            }
          } else if (!u.lastActivity && project.lastActivity) {
             u.lastActivity = project.lastActivity;
          }
          
          grouped[dept].totalPayment += project.payment || 0;
        });
      });

      // Convert maps to items array
      Object.keys(grouped).forEach(dept => {
        const users = Object.values(grouped[dept].usersMap);
        users.forEach(u => {
           // Format project names
           if (Array.isArray(u.projectName)) {
             u.projectName = [...new Set(u.projectName)].join(', ');
           }
           
           // Determine billing cycle from projects
           if (u.projects && u.projects.length > 0) {
             const cycles = new Set(u.projects.map(p => p.billingCycle).filter(Boolean));
             if (cycles.size === 1) {
               u.billingCycle = [...cycles][0];
             } else if (cycles.size > 1) {
               u.billingCycle = 'mixed';
             }
           }
        });
        grouped[dept].items = users;
        delete grouped[dept].usersMap;
      });

    } else {
      filteredData.forEach(project => {
        const dept = project.department || 'Unassigned';
        if (!grouped[dept]) {
          grouped[dept] = { items: [], totalPayment: 0 };
        }
        // Add weeklyPayments to each project
        const projectWithWeekly = {
          ...project,
          weeklyPayments: weeklyPaymentsMap[project.projectId] || [0, 0, 0, 0, 0]
        };
        grouped[dept].items.push(projectWithWeekly);
        grouped[dept].totalPayment += project.payment || 0;
      });
    }
    
    return grouped;
  }, [filteredData, page, weeklyPaymentsMap]);

  // Get visible columns
  const visibleColumns = useMemo(() => {
    return (page?.columns || [])
      .filter(col => col.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [page]);

  // Render cell value based on column key
  const renderCell = (item, columnKey) => {
    // Helper to safely get value that might be an object with name property
    const getDisplayValue = (value) => {
      if (!value) return '-';
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) {
        // Handle array of users/objects
        return value.map(v => v?.name || v?.userName || v).filter(Boolean).join(', ') || '-';
      }
      if (typeof value === 'object') {
        // Handle user objects or other objects with name property
        return value.name || value.userName || value.title || value.label || JSON.stringify(value);
      }
      return String(value);
    };

    switch (columnKey) {
      case 'userName':
        return <span className="font-medium">{item.userName || item.project?.userName || 'Unknown'}</span>;
      case 'projectName':
        return <span className="font-medium">{item.projectName || item.project?.projectName || 'Unknown'}</span>;
      case 'department':
        return item.department || item.project?.department || 'Unassigned';
      case 'projects':
        return `${item.projects?.length || 0} projects`;
      case 'loggedTime':
        return formatTime(item.loggedTime || item.totalLoggedTime || item.project?.loggedTime);
      case 'billedTime':
        return formatTime(item.billedTime || item.totalBilledTime || item.project?.billedTime);
      case 'payment':
        return <span className="font-semibold" style={{ color: '#10b981' }}>{formatCurrency(item.payment || item.totalPayment || item.project?.payment)}</span>;
      case 'status':
        return (
          <span 
            className="px-2 py-1 rounded text-xs font-medium capitalize"
            style={{ 
              backgroundColor: item.status === 'completed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              color: item.status === 'completed' ? '#10b981' : '#3b82f6'
            }}
          >
            {item.status?.replace('-', ' ') || 'Unknown'}
          </span>
        );
      case 'billingType':
        return (
          <span 
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ 
              backgroundColor: item.billingCycle === 'hr' ? 'rgba(139, 92, 246, 0.12)' : 
                              item.billingCycle === 'mixed' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              color: item.billingCycle === 'hr' ? '#8b5cf6' : 
                     item.billingCycle === 'mixed' ? '#f59e0b' : '#3b82f6'
            }}
          >
            {item.billingCycle === 'hr' ? 'Hourly' : 
             item.billingCycle === 'mixed' ? 'Mixed' : 'Fixed'}
          </span>
        );
      case 'hourlyRate':
        return item.hourlyPrice ? `$${item.hourlyPrice}/hr` : '-';
      case 'startDate':
        return item.startDate ? new Date(item.startDate).toLocaleDateString() : '-';
      case 'endDate':
        return item.endDate ? new Date(item.endDate).toLocaleDateString() : '-';
      case 'clientName':
        return item.clientInfo?.clientName || '-';
      case 'clientEmail':
        return item.clientInfo?.clientEmail || '-';
      case 'clientPhone':
        return item.clientInfo?.clientPhone || item.clientInfo?.clientWhatsappNumber || '-';
      case 'projectSource':
        return item.projectSource || '-';
      case 'upworkId':
        return item.upworkId || '-';
      case 'taskCount':
        return item.taskCount || 0;
      case 'lastActivity':
        return item.lastActivity?.date 
          ? new Date(item.lastActivity.date).toLocaleDateString() 
          : 'No activity';
      // Handle user reference fields
      case 'assignedTo':
      case 'coordinator':
      case 'createdBy':
      case 'updatedBy':
        const userObj = item[columnKey];
        if (!userObj) return '-';
        if (typeof userObj === 'string') return userObj;
        return userObj.name || userObj.userName || userObj.email || '-';
      // Handle team/members array
      case 'team':
      case 'members':
      case 'assignees':
        const teamArr = item[columnKey];
        if (!teamArr) return '-';
        if (!Array.isArray(teamArr)) return getDisplayValue(teamArr);
        return teamArr.map(u => u?.name || u?.userName || u).filter(Boolean).join(', ') || '-';
      default:
        // Safe fallback for any other field
        const value = item[columnKey];
        return getDisplayValue(value);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !page) {
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
          Page not found
        </h3>
        <button
          onClick={() => navigate('/finance/pages')}
          className="px-4 py-2 rounded-lg text-sm font-medium mt-4"
          style={{ backgroundColor: '#ef4444', color: 'white' }}
        >
          Back to Pages
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/finance/pages')}
            className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <ArrowLeft className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
          </button>
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-xl"
              style={{ 
                backgroundColor: page.pageType === 'users' 
                  ? 'rgba(59, 130, 246, 0.12)' 
                  : 'rgba(139, 92, 246, 0.12)'
              }}
            >
              {page.pageType === 'users' ? (
                <Users className="w-5 h-5" style={{ color: '#3b82f6' }} />
              ) : (
                <FolderKanban className="w-5 h-5" style={{ color: '#8b5cf6' }} />
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {page.name}
              </h1>
              {page.description && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {page.description}
                </p>
              )}
            </div>
          </div>
        </div>
        
        <button
          onClick={() => navigate(`/finance/pages/${id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-secondary)'
          }}
        >
          <Edit3 className="w-4 h-4" />
          Edit Page
        </button>
      </div>

      {/* Filters */}
      <div 
        className="p-4 rounded-xl mb-6 border"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <SearchIcon 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              placeholder={`Search ${page.pageType}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>

          <DepartmentFilter 
            selectedDepartmentId={filters.departmentId}
            onChange={(deptId) => setFilters(prev => ({ ...prev, departmentId: deptId }))}
          />

          <button
            onClick={fetchData}
            disabled={dataLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
            style={{ 
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <DateFilters 
            filters={filters} 
            setFilters={setFilters}
            onClear={() => {}}
            showWeekWiseToggle={true}
            weekWiseMode={weekWiseMode}
            onWeekWiseModeChange={setWeekWiseMode}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        </div>
      </div>

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

      {/* Data Table */}
      {(dataLoading || weeklyDataLoading) ? (
        <div 
          className="p-8 rounded-xl border text-center"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent mx-auto" />
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading data...</p>
        </div>
          ) : Object.keys(groupedData).length === 0 ? (
            <div 
              className="p-12 rounded-xl border text-center"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                No data found

          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Try adjusting your filters or search query
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedData).map(([department, deptData]) => (
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
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ backgroundColor: 'var(--color-bg-muted)' }}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5" style={{ color: '#10b981' }} />
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {department}
                  </span>
                  <span 
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}
                  >
                    {deptData.items.length} item{deptData.items.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-semibold ml-4" style={{ color: '#10b981' }}>
                    {formatCurrency(deptData.totalPayment)}
                  </span>
                </div>
                {expandedDepartments[department] ? (
                  <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                ) : (
                  <ChevronRight className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                )}
              </button>

              {/* Table */}
              {expandedDepartments[department] && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                        {visibleColumns.map(column => (
                          <th 
                            key={column.key}
                            className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {column.label}
                          </th>
                        ))}
                        {/* Week-wise columns - dynamically inserted */}
                        {weekWiseMode && (
                          <WeekWiseHeaders year={selectedYear} showMonthColumn={false} />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {deptData.items.map((item, idx) => (
                        <tr 
                          key={idx}
                          className="transition-colors duration-150"
                          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {visibleColumns.map(column => (
                            <td 
                              key={column.key}
                              className="px-4 py-3 text-sm"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {renderCell(item, column.key)}
                            </td>
                          ))}
                          {/* Week-wise cells - dynamically inserted */}
                          {weekWiseMode && (
                            <WeekWiseCells 
                              weeklyPayments={item.weeklyPayments || [0, 0, 0, 0, 0]}
                              formatCurrency={formatCurrency}
                              showMonthColumn={false}
                            />
                          )}
                        </tr>
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
            <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Grand Total
            </span>
            <span className="text-lg font-bold" style={{ color: '#10b981' }}>
              {formatCurrency(Object.values(groupedData).reduce((sum, d) => sum + d.totalPayment, 0))}
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

export default ViewFinancePage;

