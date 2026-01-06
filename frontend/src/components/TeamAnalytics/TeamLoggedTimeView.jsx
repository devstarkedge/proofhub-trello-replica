import React, { useState, useEffect, useContext, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Clock, Calendar, TrendingUp, TrendingDown, AlertTriangle,
  ChevronLeft, ChevronRight, Download, RefreshCw, Filter, Search,
  BarChart3, PieChart, Activity, Target, Award, AlertCircle,
  Zap, Brain, Lightbulb,
  FileSpreadsheet, FileText, Share2, Settings, Info, CheckCircle2,
  XCircle, MinusCircle, Building2, UserCheck, UserX, Timer, Flame
} from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../../services/database';
import AuthContext from '../../context/AuthContext';
import DepartmentContext from '../../context/DepartmentContext';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import TeamAnalyticsCharts from './TeamAnalyticsCharts';
import SmartInsightsPanel from './SmartInsightsPanel';
import TeamHeatmap from './TeamHeatmap';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Date presets
const DATE_PRESETS = [
  { label: 'Today', getValue: () => {
    const today = new Date();
    return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
  }},
  { label: 'Last 7 Days', getValue: () => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }},
  { label: 'This Week', getValue: () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - dayOfWeek);
    return { start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
  }},
  { label: 'This Month', getValue: () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
  }},
  { label: 'Last 30 Days', getValue: () => {
    const end = new Date();
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }}
];

// Productivity status colors and styles
const getStatusStyle = (status) => {
  const styles = {
    green: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', gradient: 'from-emerald-500 to-green-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', gradient: 'from-emerald-400 to-teal-500' },
    yellow: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', gradient: 'from-amber-400 to-yellow-500' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', gradient: 'from-orange-400 to-red-400' },
    red: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', gradient: 'from-red-500 to-rose-500' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300', gradient: 'from-gray-400 to-gray-500' }
  };
  return styles[status?.color] || styles.gray;
};

// Progress Ring Component
const ProgressRing = memo(({ progress, size = 60, strokeWidth = 6, color = 'blue' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  
  const colorClasses = {
    green: 'text-emerald-500',
    emerald: 'text-emerald-400',
    yellow: 'text-amber-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    blue: 'text-blue-500',
    gray: 'text-gray-400'
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-gray-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${colorClasses[color] || colorClasses.blue} transition-all duration-500`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-700">{Math.round(progress)}%</span>
      </div>
    </div>
  );
});

// User Row Component
const UserRow = memo(({ member, dateRange, isCompact, onUserClick }) => {
  const statusStyle = getStatusStyle(member.summary.productivityStatus);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ${isCompact ? 'p-3' : 'p-4'}`}
    >
      {/* User Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative">
          {member.user.avatar ? (
            <img 
              src={member.user.avatar} 
              alt={member.user.name}
              className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full object-cover border-2 border-white shadow-md`}
            />
          ) : (
            <div className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-md`}>
              {member.user.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${statusStyle.bg} border-2 border-white flex items-center justify-center text-xs`}>
            {member.summary.productivityStatus?.emoji || '❓'}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold text-gray-900 truncate`}>
              {member.user.name}
            </h3>
            <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs px-2 py-0.5`}>
              {member.summary.productivityStatus?.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {Array.isArray(member.user.department) 
                ? member.user.department.map(d => d.name).join(', ')
                : member.user.department?.name || 'N/A'
              }
            </span>
            <span className="capitalize">{member.user.role}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`${isCompact ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>
              {member.summary.formattedTotal}
            </div>
            <div className="text-xs text-gray-500">
              Avg: {member.summary.avgDailyFormatted}/day
            </div>
          </div>
          <ProgressRing 
            progress={member.summary.productivityScore} 
            size={isCompact ? 48 : 56}
            color={member.summary.productivityStatus?.color}
          />
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="relative">
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {member.dailyTimeline.map((day, index) => {
            const intensity = day.totalMinutes > 0 ? Math.min(day.totalMinutes / 480, 1) : 0;
            const bgColor = day.hasData 
              ? intensity >= 0.8 ? 'bg-emerald-500' 
                : intensity >= 0.5 ? 'bg-emerald-400'
                : intensity >= 0.25 ? 'bg-amber-400'
                : 'bg-red-400'
              : 'bg-gray-100';
            
            return (
              <TooltipProvider key={day.date}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={`flex-shrink-0 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg ${bgColor} cursor-pointer transition-all hover:scale-110 hover:shadow-md flex items-center justify-center`}
                    >
                      {day.hasData && (
                        <span className={`text-xs font-medium ${intensity >= 0.5 ? 'text-white' : 'text-gray-700'}`}>
                          {day.hours}h
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-gray-900 text-white p-3 rounded-lg shadow-xl">
                    <div className="text-center">
                      <div className="font-semibold mb-1">
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      {day.hasData ? (
                        <>
                          <div className="text-lg font-bold text-emerald-400">{day.hours}h {day.minutes}m</div>
                          <div className="text-xs text-gray-400">{day.taskCount} task{day.taskCount !== 1 ? 's' : ''}</div>
                        </>
                      ) : (
                        <div className="text-gray-400">No time logged</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>{member.summary.daysWithLogs}/{member.summary.totalDays} days logged</span>
        </div>
        <div className="flex items-center gap-1">
          <Target className="w-3.5 h-3.5" />
          <span>{member.summary.productivityScore}% productivity</span>
        </div>
      </div>
    </motion.div>
  );
});

// Empty State Component
const EmptyState = memo(({ message, submessage }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-16 px-8"
  >
    <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-8 rounded-3xl shadow-inner mb-6">
      <Users className="w-16 h-16 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">{message}</h3>
    <p className="text-sm text-gray-500 text-center max-w-md">{submessage}</p>
  </motion.div>
));

// Main Component
const TeamLoggedTimeView = memo(({ onClose }) => {
  const { user } = useContext(AuthContext);
  const { currentDepartment, departments } = useContext(DepartmentContext);
  
  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  
  // Filter state - department is controlled by header context only
  const [dateRange, setDateRange] = useState(() => DATE_PRESETS[1].getValue());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPreset, setFilterPreset] = useState('all');
  const [sortBy, setSortBy] = useState('productivity');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // View state
  const [viewMode, setViewMode] = useState('table'); // table, heatmap, chart
  const [showInsights, setShowInsights] = useState(true);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        departmentId: currentDepartment?._id || 'all',
        startDate: dateRange.start,
        endDate: dateRange.end
      };

      const [teamResponse, insightsResponse] = await Promise.all([
        Database.getTeamLoggedTime(params),
        (user?.role === 'admin' || user?.role === 'manager') 
          ? Database.getTeamInsights(params) 
          : Promise.resolve(null)
      ]);

      setTeamData(teamResponse.data);
      if (insightsResponse) {
        setInsights(insightsResponse.data);
      }
    } catch (err) {
      console.error('Error fetching team data:', err);
      setError(err.message || 'Failed to load team data');
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, [currentDepartment, dateRange, user?.role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setTimeout(() => setRefreshing(false), 500);
    toast.success('Data refreshed successfully');
  };

  // Filter and sort team members
  const filteredMembers = useMemo(() => {
    if (!teamData?.teamData) return [];

    let members = [...teamData.teamData];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      members = members.filter(m => 
        m.user.name?.toLowerCase().includes(query) ||
        m.user.email?.toLowerCase().includes(query)
      );
    }

    // Preset filters
    if (filterPreset === 'top-performers') {
      members = members.filter(m => m.summary.productivityScore >= 80);
    } else if (filterPreset === 'needs-attention') {
      members = members.filter(m => m.summary.productivityScore < 50 && m.summary.productivityScore > 0);
    } else if (filterPreset === 'no-activity') {
      members = members.filter(m => m.summary.totalMinutes === 0);
    } else if (filterPreset === 'overworked') {
      members = members.filter(m => m.summary.productivityScore > 120);
    } else if (filterPreset === 'underworked') {
      members = members.filter(m => m.summary.avgDailyMinutes < 240 && m.summary.avgDailyMinutes > 0);
    }

    // Sort
    members.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case 'productivity':
          aVal = a.summary.productivityScore;
          bVal = b.summary.productivityScore;
          break;
        case 'totalTime':
          aVal = a.summary.totalMinutes;
          bVal = b.summary.totalMinutes;
          break;
        case 'avgDaily':
          aVal = a.summary.avgDailyMinutes;
          bVal = b.summary.avgDailyMinutes;
          break;
        case 'name':
          aVal = a.user.name;
          bVal = b.user.name;
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        default:
          aVal = a.summary.productivityScore;
          bVal = b.summary.productivityScore;
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return members;
  }, [teamData, searchQuery, filterPreset, sortBy, sortOrder]);

  // Export functions
  const handleExportXLSX = useCallback(() => {
    if (!filteredMembers.length) {
      toast.warning('No data to export');
      return;
    }

    const exportData = filteredMembers.map(m => ({
      'Name': m.user.name,
      'Email': m.user.email,
      'Department': Array.isArray(m.user.department) 
        ? m.user.department.map(d => d.name).join(', ')
        : m.user.department?.name || 'N/A',
      'Role': m.user.role,
      'Total Time': m.summary.formattedTotal,
      'Total Minutes': m.summary.totalMinutes,
      'Days Logged': m.summary.daysWithLogs,
      'Total Days': m.summary.totalDays,
      'Avg Daily': m.summary.avgDailyFormatted,
      'Productivity Score': `${m.summary.productivityScore}%`,
      'Status': m.summary.productivityStatus?.label
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Team Logged Time');

    // Add header styling
    worksheet['!cols'] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }
    ];

    const fileName = `team_logged_time_${dateRange.start}_to_${dateRange.end}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Excel report exported successfully');
  }, [filteredMembers, dateRange]);

  const handleExportPDF = useCallback(() => {
    if (!filteredMembers.length) {
      toast.warning('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.text('Team Logged Time Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

    // Summary stats
    if (teamData?.analytics) {
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`Total Team Hours: ${teamData.analytics.summary.totalTeamHours}h`, 14, 46);
      doc.text(`Team Members: ${teamData.analytics.summary.totalMembers}`, 100, 46);
      doc.text(`Avg Productivity: ${teamData.analytics.summary.avgProductivity}%`, 180, 46);
    }

    // Table
    const tableData = filteredMembers.map(m => [
      m.user.name,
      m.user.email,
      m.summary.formattedTotal,
      `${m.summary.daysWithLogs}/${m.summary.totalDays}`,
      m.summary.avgDailyFormatted,
      `${m.summary.productivityScore}%`,
      m.summary.productivityStatus?.label
    ]);

    doc.autoTable({
      startY: 55,
      head: [['Name', 'Email', 'Total Time', 'Days Logged', 'Avg Daily', 'Productivity', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 50 },
        6: { cellWidth: 25 }
      }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
      doc.text('FlowTask - Team Analytics', 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`team_logged_time_${dateRange.start}_to_${dateRange.end}.pdf`);
    toast.success('PDF report exported successfully');
  }, [filteredMembers, dateRange, teamData]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen">
        <div className="max-w-screen-2xl mx-auto p-6">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-200 animate-pulse" />
              <div>
                <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse mb-2" />
                <div className="h-5 w-48 bg-gray-200 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
                <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                <div className="h-8 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>

          {/* Table Skeleton */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-4 py-4 border-b border-gray-100 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(j => (
                    <div key={j} className="w-10 h-10 rounded-lg bg-gray-200" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen">
      {/* Decorative Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl animate-float-delayed" />
      </div>

      <div className="max-w-screen-2xl mx-auto p-6 relative z-10">
        {/* Compact Header with Date Range & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 bg-white/70 backdrop-blur-sm px-4 py-2.5 rounded-xl shadow-sm border border-gray-200">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">
              {new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} 
              {' - '}
              {new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <Badge className="bg-blue-100 text-blue-700 text-xs">
              {Math.ceil((new Date(dateRange.end) - new Date(dateRange.start)) / (1000 * 60 * 60 * 24)) + 1} days
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-2 hover:bg-blue-50 hover:border-blue-300"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-2 hover:bg-emerald-50 hover:border-emerald-300">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl rounded-xl p-2">
                <div className="px-2 py-1.5 mb-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Export Options</p>
                </div>
                <DropdownMenuItem 
                  onClick={handleExportXLSX}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-emerald-50 transition-colors group"
                >
                  <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Excel Spreadsheet</p>
                    <p className="text-xs text-gray-500">.xlsx format</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleExportPDF}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-red-50 transition-colors group"
                >
                  <div className="p-2 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors">
                    <FileText className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">PDF Document</p>
                    <p className="text-xs text-gray-500">.pdf format</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>



            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose} className="border-2">
                Close
              </Button>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        {teamData?.analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-blue-100 hover:shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Team Members</p>
                  <p className="text-3xl font-bold text-gray-900">{teamData.analytics.summary.totalMembers}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-emerald-100 hover:shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Hours</p>
                  <p className="text-3xl font-bold text-gray-900">{teamData.analytics.summary.totalTeamHours}h</p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <Clock className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-purple-100 hover:shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Avg Productivity</p>
                  <p className="text-3xl font-bold text-gray-900">{teamData.analytics.summary.avgProductivity}%</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-amber-100 hover:shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Top Performers</p>
                  <p className="text-3xl font-bold text-gray-900">{teamData.analytics.topPerformers?.length || 0}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-xl">
                  <Award className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-red-100 hover:shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Needs Attention</p>
                  <p className="text-3xl font-bold text-gray-900">{teamData.analytics.needsAttention?.length || 0}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Filters Bar */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-md border border-gray-200/80 p-4 mb-6 sticky top-0 z-20">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Left: Filters (Date Range, Quick Filters, Search, Sort) */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Date Presets */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border border-gray-200 bg-white hover:bg-gray-50 transition-all whitespace-nowrap h-9"
                  >
                    <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                    Date Range
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl rounded-xl">
                  <div className="p-2">
                    {DATE_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.label}
                        onClick={() => setDateRange(preset.getValue())}
                        className="hover:bg-blue-50 rounded-lg my-1 cursor-pointer"
                      >
                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                        {preset.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Quick Filters */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className={`border transition-all whitespace-nowrap h-9 ${
                      filterPreset !== 'all' 
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' 
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="w-4 h-4 mr-2 text-gray-500" />
                    Quick Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl rounded-xl">
                  <div className="p-2">
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('all')}
                      className="hover:bg-blue-50 rounded-lg my-1 cursor-pointer"
                    >
                      <Users className="w-4 h-4 mr-2 text-blue-600" /> 
                      <span>All Members</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('top-performers')}
                      className="hover:bg-emerald-50 rounded-lg my-1 cursor-pointer"
                    >
                      <Award className="w-4 h-4 mr-2 text-emerald-500" /> 
                      <span>Top Performers</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('needs-attention')}
                      className="hover:bg-red-50 rounded-lg my-1 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2 text-red-500" /> 
                      <span>Needs Attention</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('no-activity')}
                      className="hover:bg-gray-100 rounded-lg my-1 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 mr-2 text-gray-500" /> 
                      <span>No Activity</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('overworked')}
                      className="hover:bg-orange-50 rounded-lg my-1 cursor-pointer"
                    >
                      <Flame className="w-4 h-4 mr-2 text-orange-500" /> 
                      <span>Overworked</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setFilterPreset('underworked')}
                      className="hover:bg-yellow-50 rounded-lg my-1 cursor-pointer"
                    >
                      <MinusCircle className="w-4 h-4 mr-2 text-yellow-500" /> 
                      <span>Underworked (&lt;4h)</span>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Search */}
              <div className="relative min-w-0 w-48">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 h-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border border-gray-200 bg-white hover:bg-gray-50 transition-all whitespace-nowrap h-9"
                  >
                    <TrendingUp className="w-4 h-4 mr-2 text-gray-500" />
                    Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl rounded-xl">
                  <div className="p-2">
                    <div className="text-xs font-semibold text-gray-700 px-2 py-1.5">Productivity</div>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('productivity'); setSortOrder('desc'); }}
                      className="hover:bg-blue-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <TrendingUp className="w-4 h-4 mr-2 text-blue-600" />
                      High to Low
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('productivity'); setSortOrder('asc'); }}
                      className="hover:bg-blue-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <TrendingDown className="w-4 h-4 mr-2 text-blue-600" />
                      Low to High
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <div className="text-xs font-semibold text-gray-700 px-2 py-1.5">Time Logged</div>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('totalTime'); setSortOrder('desc'); }}
                      className="hover:bg-emerald-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <Clock className="w-4 h-4 mr-2 text-emerald-600" />
                      High to Low
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('totalTime'); setSortOrder('asc'); }}
                      className="hover:bg-emerald-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <Clock className="w-4 h-4 mr-2 text-emerald-600" />
                      Low to High
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <div className="text-xs font-semibold text-gray-700 px-2 py-1.5">Name</div>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('name'); setSortOrder('asc'); }}
                      className="hover:bg-purple-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <Users className="w-4 h-4 mr-2 text-purple-600" />
                      A - Z
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => { setSortBy('name'); setSortOrder('desc'); }}
                      className="hover:bg-purple-50 rounded-lg my-1 cursor-pointer text-sm"
                    >
                      <Users className="w-4 h-4 mr-2 text-purple-600" />
                      Z - A
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Custom Date Range Inputs */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-3 py-2 h-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-3 py-2 h-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Right: View Mode & Controls */}
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  title="Table View"
                >
                  <Users className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('heatmap')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'heatmap' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  title="Heatmap View"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'chart' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  title="Chart View"
                >
                  <PieChart className="w-4 h-4" />
                </button>

                {(user?.role === 'admin' || user?.role === 'manager') && (
                  <button
                    onClick={() => setShowInsights(!showInsights)}
                    className={`p-2 rounded-md transition-colors ${showInsights ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                    title="Toggle AI Insights"
                  >
                    <Brain className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Filters Display */}
        {(filterPreset !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">Active filters:</span>
            {filterPreset !== 'all' && (
              <Badge className="bg-blue-100 text-blue-700 capitalize">
                {filterPreset.replace('-', ' ')}
                <button onClick={() => setFilterPreset('all')} className="ml-1">×</button>
              </Badge>
            )}
            {searchQuery && (
              <Badge className="bg-amber-100 text-amber-700">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="ml-1">×</button>
              </Badge>
            )}
          </div>
        )}

        {/* Smart Insights Panel */}
        {showInsights && insights && (user?.role === 'admin' || user?.role === 'manager') && (
          <SmartInsightsPanel insights={insights} onClose={() => setShowInsights(false)} />
        )}

        {/* Main Content */}
        <div className="space-y-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-700 mb-2">Error Loading Data</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={handleRefresh} className="bg-red-600 hover:bg-red-700">
                Try Again
              </Button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg">
              <EmptyState 
                message={searchQuery || filterPreset !== 'all' ? "No members match your filters" : "No team data available"}
                submessage={searchQuery || filterPreset !== 'all' 
                  ? "Try adjusting your search or filter criteria" 
                  : "Select a department or date range to view team logged time"
                }
              />
            </div>
          ) : viewMode === 'table' ? (
            <AnimatePresence>
              {filteredMembers.map((member, index) => (
                <motion.div
                  key={member.user._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <UserRow 
                    member={member} 
                    dateRange={teamData?.dateRange || []}
                    isCompact={false}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : viewMode === 'heatmap' ? (
            <TeamHeatmap teamData={teamData} filteredMembers={filteredMembers} />
          ) : (
            <TeamAnalyticsCharts teamData={teamData} insights={insights} />
          )}

          {/* Results Count */}
          {filteredMembers.length > 0 && (
            <div className="text-center py-4">
              <Badge variant="secondary" className="text-sm py-2 px-4 bg-white/80 backdrop-blur-sm border-2">
                Showing <span className="font-bold text-blue-600 mx-1">{filteredMembers.length}</span> 
                {filteredMembers.length !== teamData?.teamData?.length && (
                  <> of <span className="font-bold text-gray-900 mx-1">{teamData?.teamData?.length}</span></>
                )}
                team member{filteredMembers.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <style jsx="true">{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(20px) translateX(-10px); }
        }
        .animate-float { animation: float 8s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 10s ease-in-out infinite; }
        .scrollbar-thin::-webkit-scrollbar { height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
});

TeamLoggedTimeView.displayName = 'TeamLoggedTimeView';

export default TeamLoggedTimeView;
