import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search as SearchIcon,
  FolderKanban,
  Building2,
  Clock,
  DollarSign,
  Calendar,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  Phone,
  Mail,
  Activity,
  Info,
  Briefcase
} from 'lucide-react';
import api from '../../services/api';
import SummaryCards from '../../components/Finance/SummaryCards';
import DateFilters from '../../components/Finance/DateFilters';
import DepartmentFilter from '../../components/Finance/DepartmentFilter';
import CoordinatorAvatars from '../../components/Finance/CoordinatorAvatars';
import GlobalSearch from '../../components/Finance/GlobalSearch';
import ExportButton from '../../components/Finance/ExportButton';
import DataIntegrityWarnings from '../../components/Finance/DataIntegrityWarnings';
import ColumnTooltip, { COLUMN_EXPLANATIONS } from '../../components/Finance/ColumnTooltip';
import { PaymentBreakdownCell } from '../../components/Finance/PaymentBreakdown';
import EmptyState from '../../components/Finance/EmptyState';

/**
 * ProjectsTab - Project-centric Finance View (Enhanced)
 * Features:
 * - Department-wise grouping
 * - All mandatory columns with coordinator avatars
 * - Client info expandable
 * - Date filters
 * - Status editing (inline)
 */
const ProjectsTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [expandedClients, setExpandedClients] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'payment', direction: 'desc' });
  const [filters, setFilters] = useState({
    startDate: null,
    endDate: null,
    departmentId: null,
    projectId: null
  });

  // Initialize filters from URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectIdParam = params.get('projectId');
    const departmentIdParam = params.get('departmentId');
    
    if (projectIdParam || departmentIdParam) {
      setFilters(prev => ({
        ...prev,
        projectId: projectIdParam || null,
        departmentId: departmentIdParam || null
      }));
    }
  }, [location.search]);

  // Fetch project finance data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.departmentId) params.append('departmentId', filters.departmentId);
      if (filters.projectId) params.append('projectId', filters.projectId);
      
      const response = await api.get(`/api/finance/projects?${params.toString()}`);
      
      if (response.data.success) {
        setData(response.data.data || []);
        
        // Auto-expand all departments initially
        const expanded = {};
        Object.keys(response.data.groupedByDepartment || {}).forEach(dept => {
          expanded[dept] = true;
        });
        setExpandedDepartments(expanded);
      }
    } catch (err) {
      console.error('Error fetching project finance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  // Handle card click for filtering
  const handleCardClick = (action, value) => {
    if (action === 'project' && value) {
      setFilters(prev => ({ ...prev, projectId: value }));
    } else if (action === 'user' && value) {
      navigate(`/finance/users?userId=${value}`);
    }
  };

  // Toggle department expansion
  const toggleDepartment = (dept) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [dept]: !prev[dept]
    }));
  };

  // Toggle client info
  const toggleClient = (projectId) => {
    setExpandedClients(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
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

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format relative time
  const formatRelativeTime = (date) => {
    if (!date) return 'No activity';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  };

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...data];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(project => 
        project.projectName?.toLowerCase().includes(query) ||
        project.clientInfo?.clientName?.toLowerCase().includes(query) ||
        project.upworkId?.toLowerCase().includes(query) ||
        project.department?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'billedTime' || sortConfig.key === 'loggedTime') {
        aVal = a[sortConfig.key]?.totalMinutes || 0;
        bVal = b[sortConfig.key]?.totalMinutes || 0;
      }
      
      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return result;
  }, [data, searchQuery, sortConfig]);

  // Group processed data by department
  const groupedProcessedData = useMemo(() => {
    const grouped = {};
    processedData.forEach(project => {
      const dept = project.department || 'Unassigned';
      if (!grouped[dept]) {
        grouped[dept] = {
          projects: [],
          totalPayment: 0,
          totalBilledMinutes: 0
        };
      }
      grouped[dept].projects.push(project);
      grouped[dept].totalPayment += project.payment || 0;
      grouped[dept].totalBilledMinutes += project.billedTime?.totalMinutes || 0;
    });
    return grouped;
  }, [processedData]);

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    let payment = 0;
    let billedMinutes = 0;
    Object.values(groupedProcessedData).forEach(dept => {
      payment += dept.totalPayment;
      billedMinutes += dept.totalBilledMinutes;
    });
    return { payment, billedMinutes };
  }, [groupedProcessedData]);

  // Export columns configuration
  const exportColumns = [
    { key: 'projectName', label: 'Project Name' },
    { key: 'department', label: 'Department' },
    { key: 'clientName', label: 'Client Name' },
    { key: 'billingType', label: 'Billing Type' },
    { key: 'hourlyRate', label: 'Hourly Rate' },
    { key: 'loggedTime', label: 'Logged Time' },
    { key: 'billedTime', label: 'Billed Time' },
    { key: 'payment', label: 'Payment' },
    { key: 'status', label: 'Status' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'End Date' }
  ];

  // Flatten data for export
  const exportDataFlattened = useMemo(() => {
    return processedData.map(project => ({
      projectName: project.projectName || project.boardName || '',
      department: project.department || 'Unassigned',
      clientName: project.clientInfo?.clientName || '',
      billingType: project.billingType === 'hr' ? 'Hourly' : project.billingType === 'fixed' ? 'Fixed' : '-',
      hourlyRate: project.hourlyPrice ? `$${project.hourlyPrice}/hr` : '-',
      loggedTime: project.loggedTime || { hours: 0, minutes: 0 },
      billedTime: project.billedTime || { hours: 0, minutes: 0 },
      payment: project.payment || 0,
      status: project.status || '-',
      startDate: project.startDate ? new Date(project.startDate).toLocaleDateString() : '-',
      endDate: project.endDate ? new Date(project.endDate).toLocaleDateString() : '-'
    }));
  }, [processedData]);

  // Get status badge color
  const getStatusColor = (status) => {
    const colors = {
      'planning': { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1' },
      'in-progress': { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981' },
      'completed': { bg: 'rgba(34, 197, 94, 0.12)', text: '#22c55e' },
      'on-hold': { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b' },
      'cancelled': { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' }
    };
    return colors[status] || { bg: 'var(--color-bg-muted)', text: 'var(--color-text-muted)' };
  };

  // Skeleton row
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div 
            className="h-4 rounded"
            style={{ 
              backgroundColor: 'var(--color-bg-muted)',
              width: `${50 + Math.random() * 50}%`
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
      <DataIntegrityWarnings data={data} type="projects" />

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
              type="projects"
              placeholder="Search projects, clients, Upwork ID..."
              onFilter={(suggestion) => {
                if (!suggestion) {
                  setSearchQuery('');
                  setFilters(prev => ({ ...prev, projectId: null, departmentId: null }));
                } else if (suggestion.type === 'project') {
                  setFilters(prev => ({ ...prev, projectId: suggestion.value }));
                } else if (suggestion.type === 'client') {
                  setSearchQuery(suggestion.label);
                } else if (suggestion.type === 'department') {
                  setFilters(prev => ({ ...prev, departmentId: suggestion.value }));
                } else if (suggestion.type === 'upwork') {
                  setSearchQuery(suggestion.label);
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
            data={exportDataFlattened}
            columns={exportColumns}
            filename="projects-finance-report"
            title="Projects Finance Report"
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

      {/* Data by Department */}
      {loading ? (
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
                <th className="px-3 py-3 text-left text-xs font-semibold">Project</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Dates</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Coordinators</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Source</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Billing</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Logged</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Billed</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Payment</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Status</th>
                <th className="px-3 py-3 text-left text-xs font-semibold">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : Object.keys(groupedProcessedData).length === 0 ? (
        <div 
          className="rounded-xl border"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <EmptyState 
            type={searchQuery ? 'noSearchResults' : 'noProjects'}
            description={searchQuery 
              ? 'Try adjusting your search or filters to find projects' 
              : 'Projects with billing information will appear here once created'
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedProcessedData).map(([department, deptData]) => (
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
                    {deptData.projects.length} project{deptData.projects.length !== 1 ? 's' : ''}
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

              {/* Projects Table */}
              {expandedDepartments[department] && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 min-w-48"
                          style={{ 
                            color: 'var(--color-text-secondary)',
                            backgroundColor: 'var(--color-bg-primary)'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <FolderKanban className="w-4 h-4" />
                            Project
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-28"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Dates
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-28"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            Coordinators
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-24"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          Source
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-24"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          Billing
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70 min-w-20"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('loggedTime')}
                        >
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Logged
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70 min-w-20"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('billedTime')}
                        >
                          <ColumnTooltip explanation={COLUMN_EXPLANATIONS.billedTime}>
                            <div className="flex items-center gap-1">
                              Billed
                              <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </ColumnTooltip>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:opacity-70 min-w-24"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => handleSort('payment')}
                        >
                          <ColumnTooltip explanation={COLUMN_EXPLANATIONS.payment.hourly}>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              Payment
                              <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </ColumnTooltip>
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-24"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          Status
                        </th>
                        <th 
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider min-w-28"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <div className="flex items-center gap-1">
                            <Activity className="w-4 h-4" />
                            Last Activity
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptData.projects.map((project) => {
                        const statusColor = getStatusColor(project.status);
                        
                        return (
                          <React.Fragment key={project.projectId}>
                            <tr 
                              className="transition-colors duration-150"
                              style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              {/* Project Name */}
                              <td 
                                className="px-3 py-3 sticky left-0"
                                style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                              >
                                <div>
                                  <p 
                                    className="font-medium text-sm"
                                    style={{ color: 'var(--color-text-primary)' }}
                                  >
                                    {project.projectName}
                                  </p>
                                  {project.projectCategory && (
                                    <span 
                                      className="text-xs"
                                      style={{ color: 'var(--color-text-muted)' }}
                                    >
                                      {project.projectCategory}
                                    </span>
                                  )}
                                  {/* Client Info Toggle */}
                                  {project.clientInfo?.clientName && (
                                    <button
                                      onClick={() => toggleClient(project.projectId)}
                                      className="flex items-center gap-1 mt-1 text-xs hover:underline"
                                      style={{ color: '#06b6d4' }}
                                    >
                                      <Info className="w-3 h-3" />
                                      {project.clientInfo.clientName}
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Dates */}
                              <td className="px-3 py-3">
                                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                  <p>{formatDate(project.startDate)}</p>
                                  <p style={{ color: 'var(--color-text-muted)' }}>
                                    → {formatDate(project.endDate)}
                                  </p>
                                </div>
                              </td>

                              {/* Coordinators */}
                              <td className="px-3 py-3">
                                <CoordinatorAvatars 
                                  coordinators={project.coordinators} 
                                  maxVisible={2}
                                />
                              </td>

                              {/* Source */}
                              <td className="px-3 py-3">
                                {project.projectSource ? (
                                  <div>
                                    <span 
                                      className="text-xs px-1.5 py-0.5 rounded"
                                      style={{ 
                                        backgroundColor: project.projectSource === 'Upwork' 
                                          ? 'rgba(34, 197, 94, 0.12)' 
                                          : 'rgba(6, 182, 212, 0.12)',
                                        color: project.projectSource === 'Upwork' 
                                          ? '#22c55e' 
                                          : '#06b6d4'
                                      }}
                                    >
                                      {project.projectSource}
                                    </span>
                                    {project.upworkId && (
                                      <p 
                                        className="text-xs mt-1 truncate max-w-20"
                                        style={{ color: 'var(--color-text-muted)' }}
                                        title={project.upworkId}
                                      >
                                        {project.upworkId}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>
                                )}
                              </td>

                              {/* Billing Type */}
                              <td className="px-3 py-3">
                                <div>
                                  <span 
                                    className="px-2 py-1 rounded text-xs font-medium"
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
                                  <p 
                                    className="text-xs mt-1"
                                    style={{ color: 'var(--color-text-muted)' }}
                                  >
                                    {project.billingCycle === 'hr' 
                                      ? `$${project.hourlyPrice || 0}/hr` 
                                      : formatCurrency(project.fixedPrice)}
                                  </p>
                                </div>
                              </td>

                              {/* Logged Time */}
                              <td 
                                className="px-3 py-3 text-sm"
                                style={{ color: 'var(--color-text-secondary)' }}
                              >
                                {formatTime(project.loggedTime)}
                              </td>

                              {/* Billed Time */}
                              <td 
                                className="px-3 py-3 text-sm"
                                style={{ color: 'var(--color-text-secondary)' }}
                              >
                                {formatTime(project.billedTime)}
                              </td>

                              {/* Payment */}
                              <td 
                                className="px-3 py-3 text-sm font-semibold"
                                style={{ color: '#10b981' }}
                              >
                                {formatCurrency(project.payment)}
                              </td>

                              {/* Status */}
                              <td className="px-3 py-3">
                                <span 
                                  className="px-2 py-1 rounded text-xs font-medium capitalize"
                                  style={{ 
                                    backgroundColor: statusColor.bg,
                                    color: statusColor.text
                                  }}
                                >
                                  {project.status?.replace('-', ' ') || 'Unknown'}
                                </span>
                              </td>

                              {/* Last Activity */}
                              <td 
                                className="px-3 py-3 text-xs"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                {project.lastActivity ? (
                                  <div>
                                    <p className="truncate max-w-24" title={project.lastActivity.title}>
                                      {project.lastActivity.title}
                                    </p>
                                    <p>{formatRelativeTime(project.lastActivity.date)}</p>
                                  </div>
                                ) : (
                                  'No activity'
                                )}
                              </td>
                            </tr>

                            {/* Expanded Client Info Row */}
                            {expandedClients[project.projectId] && project.clientInfo && (
                              <tr style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                                <td colSpan={10} className="px-6 py-3">
                                  <div className="flex items-center gap-6 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Briefcase className="w-4 h-4" style={{ color: '#10b981' }} />
                                      <span style={{ color: 'var(--color-text-secondary)' }}>
                                        <strong>Client:</strong> {project.clientInfo.clientName}
                                      </span>
                                    </div>
                                    {project.clientInfo.clientEmail && (
                                      <div className="flex items-center gap-2">
                                        <Mail className="w-4 h-4" style={{ color: '#06b6d4' }} />
                                        <a 
                                          href={`mailto:${project.clientInfo.clientEmail}`}
                                          className="hover:underline"
                                          style={{ color: '#06b6d4' }}
                                        >
                                          {project.clientInfo.clientEmail}
                                        </a>
                                      </div>
                                    )}
                                    {project.clientInfo.clientPhone && (
                                      <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                          {project.clientInfo.clientPhone}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
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
            <div className="flex items-center gap-6">
              <span 
                className="font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Total Across All Projects
              </span>
              <span 
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {formatTime({ totalMinutes: grandTotals.billedMinutes })} billed
              </span>
            </div>
            <span 
              className="text-lg font-bold"
              style={{ color: '#10b981' }}
            >
              {formatCurrency(grandTotals.payment)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsTab;
