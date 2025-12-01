import React, { useState, useEffect, useContext, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Filter,
  Calendar,
  User,
  Tag,
  ChevronsUpDown,
  ArrowUpDown,
  ClipboardList,
  FolderKanban,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Download,
  RefreshCw,
  X,
  Eye,
  Edit3,
  MoreVertical,
  Sparkles,
  Zap,
  Target,
  Activity,
  History,
  Lightbulb,
  Command
} from 'lucide-react';
import * as XLSX from 'xlsx';
import DepartmentContext from '../context/DepartmentContext';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { AdvancedSearch, debounce, highlightText } from '../utils/advancedSearch';

const CardDetailModal = lazy(() => import('../components/CardDetailModal'));

const ListView = () => {
  const { currentDepartment, departments, setCurrentDepartment } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Simple in-memory caches for fast reuse and freshness checks
  const projectCache = useRef(new Map());
  const taskCache = useRef(new Map());
  const advancedSearch = useRef(new AdvancedSearch());
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  const [sorting, setSorting] = useState({ key: 'dueDate', order: 'asc' });
  const [viewMode, setViewMode] = useState('comfortable'); // compact, comfortable, spacious

  // Advanced search state
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHighlights, setSearchHighlights] = useState(new Map());
  const [searchMode, setSearchMode] = useState('standard'); // standard, fuzzy, advanced
  const [showSearchHelp, setShowSearchHelp] = useState(false);

  useEffect(() => {
    if (currentDepartment) {
      loadCards();
    } else {
      setCards([]);
      setLoading(false);
    }
  }, [currentDepartment]);

  // Optional: prefetch workflow data for unique projects when cards load
  useEffect(() => {
    if (!loading && cards && currentDepartment) {
      const uniqueProjects = Array.from(new Set(cards.map(c => c.board?._id).filter(Boolean)));
      // Prefetch up to first 5 projects to avoid spamming network
      uniqueProjects.slice(0, 5).forEach(projectId => {
        const key = ['workflow', currentDepartment._id, projectId];
        queryClient.prefetchQuery(key, () => Database.getWorkflowData(currentDepartment._id, projectId)).catch(() => {});
      });
    }
  }, [loading, cards, currentDepartment, queryClient]);

  // Set default department to "All Departments" if not set
  useEffect(() => {
    if (!currentDepartment && departments.length > 0) {
      const allDeptsOption = departments.find(d => d._id === 'all');
      if (allDeptsOption) {
        setCurrentDepartment(allDeptsOption);
      }
    }
  }, [departments, currentDepartment, setCurrentDepartment]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === '/' && e.ctrlKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]');
        if (searchInput) searchInput.focus();
      } else if (e.key === '?' && e.ctrlKey) {
        e.preventDefault();
        setShowSearchHelp(prev => !prev);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setShowSearchHelp(false);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const loadCards = async () => {
    try {
      setLoading(true);
      const response = await Database.getCardsByDepartment(currentDepartment._id);
      setCards(response.data || []);
    } catch (error) {
      console.error('Error loading cards:', error);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCards();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Navigate to project's workflow page, prefetching workflow data first
  const handleProjectClick = async (projectId) => {
    if (!currentDepartment || !projectId) return;
    const deptId = currentDepartment._id;
    const key = ['workflow', deptId, projectId];
    try {
      // If cached in our small cache, skip prefetch
      if (!projectCache.current.has(projectId)) {
        const res = await queryClient.prefetchQuery(key, () => Database.getWorkflowData(deptId, projectId));
        if (res && res.data) projectCache.current.set(projectId, res.data);
      }
    } catch (err) {
      // ignore prefetch errors; navigation can still proceed and WorkFlow will load
      console.warn('Prefetch workflow failed', err);
    } finally {
      navigate(`/workflow/${deptId}/${projectId}`);
    }
  };

  // Modal handling for card details
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const openCardModal = async (card) => {
    if (!card) return;
    setModalLoading(true);
    try {
      const cached = taskCache.current.get(card._id);
      // If cached and timestamps match, reuse; otherwise fetch fresh
      if (cached && card.updatedAt && cached.updatedAt === card.updatedAt) {
        setModalCard(cached);
      } else {
        // Fetch single card details (single API call)
        const resp = await Database.getCard(card._id);
        const fresh = resp.data || resp;
        taskCache.current.set(card._id, fresh);
        setModalCard(fresh);
      }
      setModalOpen(true);
    } catch (err) {
      console.error('Failed to load card details', err);
    } finally {
      setModalLoading(false);
    }
  };

  // Debounced search suggestions update
  const updateSearchSuggestions = useCallback(
    debounce((query) => {
      if (query.length >= 2) {
        const suggestions = advancedSearch.current.getSuggestions(query, cards);
        setSearchSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } else {
        setShowSuggestions(false);
      }
    }, 300),
    [cards]
  );

  const filteredAndSortedCards = useMemo(() => {
    let filtered = cards;

    // Apply status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(card => card.list?.title?.toLowerCase().replace(' ', '-') === filters.status);
    }

    // Apply priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(card => card.priority?.toLowerCase() === filters.priority);
    }

    // Apply advanced search
    if (filters.search) {
      const searchResult = advancedSearch.current.search(filtered, filters.search, {
        fuzzy: searchMode === 'fuzzy',
        highlight: true
      });

      if (searchResult.results) {
        filtered = searchResult.results;
        setSearchHighlights(searchResult.highlights || new Map());
      } else {
        filtered = searchResult;
      }
    } else {
      setSearchHighlights(new Map());
    }

    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(card => {
        if (!card.dueDate) return false;
        const cardDate = new Date(card.dueDate);
        const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
        const toDate = filters.dateTo ? new Date(filters.dateTo) : null;

        if (fromDate && toDate) {
          return cardDate >= fromDate && cardDate <= toDate;
        } else if (fromDate) {
          return cardDate >= fromDate;
        } else if (toDate) {
          return cardDate <= toDate;
        }
        return true;
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue;

      if (sorting.key === 'board.name') {
        aValue = a.board?.name;
        bValue = b.board?.name;
      } else if (sorting.key === 'assignees[0].name') {
        aValue = a.assignees?.[0]?.name;
        bValue = b.assignees?.[0]?.name;
      } else if (sorting.key === 'list.title') {
        aValue = a.list?.title;
        bValue = b.list?.title;
      } else {
        aValue = a[sorting.key];
        bValue = b[sorting.key];
      }

      if (aValue === bValue) return 0;

      let result = 0;
      if (aValue === null || aValue === undefined) result = 1;
      else if (bValue === null || bValue === undefined) result = -1;
      else if (sorting.key === 'dueDate') {
        result = new Date(aValue) - new Date(bValue);
      } else {
        result = aValue.toString().localeCompare(bValue.toString());
      }

      return sorting.order === 'asc' ? result : -result;
    });

    return sorted;
  }, [cards, filters, sorting, searchMode]);

  const handleSort = (key) => {
    if (sorting.key === key) {
      setSorting({ ...sorting, order: sorting.order === 'asc' ? 'desc' : 'asc' });
    } else {
      setSorting({ key, order: 'asc' });
    }
  };

  const clearFilters = () => {
    setFilters({
      status: 'all',
      priority: 'all',
      search: '',
      dateFrom: '',
      dateTo: ''
    });
    setSearchSuggestions([]);
    setShowSuggestions(false);
    setSearchHighlights(new Map());
  };

  // Handle search input changes with debouncing
  const handleSearchChange = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    if (value.trim()) {
      setSearchMode('standard'); // Manual search uses standard mode
    }
    updateSearchSuggestions(value);
  };

  // Handle search suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    setFilters(prev => ({ ...prev, search: suggestion }));
    setShowSuggestions(false);
  };

  // Handle keyboard shortcuts
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowSearchHelp(false);
    } else if (e.key === '/' && e.ctrlKey) {
      e.preventDefault();
      document.querySelector('input[placeholder*="Search"]').focus();
    } else if (e.key === '?' && e.ctrlKey) {
      e.preventDefault();
      setShowSearchHelp(!showSearchHelp);
    }
  };

  // Toggle search mode
  const toggleSearchMode = () => {
    setSearchMode(prev => {
      if (prev === 'standard') return 'fuzzy';
      if (prev === 'fuzzy') return 'advanced';
      return 'standard';
    });
  };

  // Advanced filter presets
  const getFilterPresets = () => ({
    'My Tasks': {
      priority: 'all',
      status: 'all',
      search: user ? `assignees:"${user.name}"` : '',
      dateFrom: '',
      dateTo: ''
    },
    'High Priority': {
      priority: 'high',
      status: 'all',
      search: '',
      dateFrom: '',
      dateTo: ''
    },
    'Overdue Tasks': {
      priority: 'all',
      status: 'all',
      search: '',
      dateFrom: '',
      dateTo: new Date().toISOString().split('T')[0]
    },
    'This Week': {
      priority: 'all',
      status: 'all',
      search: '',
      dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0]
    },
    'In Progress': {
      priority: 'all',
      status: 'in-progress',
      search: '',
      dateFrom: '',
      dateTo: ''
    }
  });

  const applyFilterPreset = (presetName) => {
    const presets = getFilterPresets();
    const preset = presets[presetName];
    if (preset) {
      setFilters(preset);
      setSearchMode('fuzzy'); // Use fuzzy search mode for presets to handle name variations
    }
  };

  const hasActiveFilters = filters.status !== 'all' || filters.priority !== 'all' || filters.search !== '' || filters.dateFrom !== '' || filters.dateTo !== '';

  const getStats = () => {
    const total = cards.length;
    const completed = cards.filter(c => c.list?.title?.toLowerCase() === 'done').length;
    const inProgress = cards.filter(c => c.list?.title?.toLowerCase() === 'in progress').length;
    const highPriority = cards.filter(c => c.priority === 'High').length;
    const overdue = cards.filter(c => {
      if (!c.dueDate) return false;
      const today = new Date();
      const due = new Date(c.dueDate);
      return due < today && c.list?.title?.toLowerCase() !== 'done';
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, highPriority, overdue, completionRate };
  };

  const stats = getStats();

  const getPriorityPill = (priority) => {
    if (!priority) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 transition-all duration-200 hover:scale-105 w-fit">
          <Tag className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-semibold text-gray-600">No Priority</span>
        </div>
      );
    }

    const config = {
      'High': { variant: 'destructive', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      'Medium': { variant: 'secondary', icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
      'Low': { variant: 'outline', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    };
    const { icon: Icon, color, bg, border } = config[priority] || { icon: Tag, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };

    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${bg} ${border} border transition-all duration-200 hover:scale-105 w-fit`}>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className={`text-xs font-semibold ${color}`}>{priority}</span>
      </div>
    );
  };

  const getStatusBadge = (status) => {
    const config = {
      'To-Do': { color: 'bg-slate-50 text-slate-700 border-slate-300', icon: ClipboardList, glow: 'hover:shadow-slate-200' },
      'In Progress': { color: 'bg-blue-50 text-blue-700 border-blue-300', icon: Activity, glow: 'hover:shadow-blue-200' },
      'Review': { color: 'bg-purple-50 text-purple-700 border-purple-300', icon: Users, glow: 'hover:shadow-purple-200' },
      'Done': { color: 'bg-emerald-50 text-emerald-700 border-emerald-300', icon: CheckCircle2, glow: 'hover:shadow-emerald-200' }
    };
    const { color, icon: Icon, glow } = config[status] || { color: 'bg-gray-50 text-gray-700 border-gray-300', icon: Tag, glow: '' };
    
    return (
      <div className={`${color} border flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 hover:scale-105 ${glow} hover:shadow-md w-fit`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold">{status}</span>
      </div>
    );
  };

  const getDueDateColor = (dueDate) => {
    if (!dueDate) return 'text-gray-400';
    const today = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'text-red-600 font-semibold';
    if (diffDays === 0) return 'text-orange-600 font-semibold';
    if (diffDays <= 3) return 'text-amber-600 font-semibold';
    return 'text-gray-600';
  };

  const formatDueDate = (dueDate) => {
    if (!dueDate) return 'No due date';
    const date = new Date(dueDate);
    const today = new Date();
    const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calculateTotalLoggedTime = (loggedTime) => {
    if (!loggedTime || loggedTime.length === 0) return '0h 0m';

    const totalMinutes = loggedTime.reduce((acc, entry) => {
      return acc + (entry.hours * 60) + entry.minutes;
    }, 0);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  };

  const handleExport = () => {
    if (filteredAndSortedCards.length === 0) {
      alert('No tasks to export');
      return;
    }

    const exportData = filteredAndSortedCards.map(card => ({
      'Task': card.title || '',
      'Project': card.board?.name || 'N/A',
      'Assignee': card.assignees && card.assignees.length > 0
        ? card.assignees.map(a => a.name).join(', ')
        : 'Unassigned',
      'Priority': card.priority || '',
      'Status': card.list?.title || 'N/A',
      'Due Date': card.dueDate
        ? new Date(card.dueDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : 'No due date',
      'Total Logged Time': calculateTotalLoggedTime(card.loggedTime)
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Add title row
    XLSX.utils.sheet_add_aoa(worksheet, [['Task Management Export']], { origin: 'A1' });

    // Move data down by one row
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = range.e.r; R >= 0; --R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R + 1, c: C });
        const addr_old = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[addr_old]) worksheet[addr] = worksheet[addr_old];
        delete worksheet[addr_old];
      }
    }

    // Update range
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: range.e.r + 1, c: range.e.c }
    });

    // Set column widths
    worksheet['!cols'] = [
      { wch: 40 }, // Task
      { wch: 25 }, // Project
      { wch: 30 }, // Assignee
      { wch: 12 }, // Priority
      { wch: 15 }, // Status
      { wch: 15 }, // Due Date
      { wch: 18 }  // Total Logged Time
    ];

    // Style the title
    const titleCell = worksheet['A1'];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: 'center' },
        fill: { fgColor: { rgb: 'FFE6F3FF' } }
      };
    }

    // Style headers
    const headers = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2'];
    headers.forEach(addr => {
      if (worksheet[addr]) {
        worksheet[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFFFF' } },
          fill: { fgColor: { rgb: 'FF4F81BD' } },
          alignment: { horizontal: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: 'FF000000' } },
            bottom: { style: 'thin', color: { rgb: 'FF000000' } },
            left: { style: 'thin', color: { rgb: 'FF000000' } },
            right: { style: 'thin', color: { rgb: 'FF000000' } }
          }
        };
      }
    });

    // Style data cells
    const dataRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = 2; R <= dataRange.e.r; ++R) {
      for (let C = 0; C <= dataRange.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[addr]) {
          worksheet[addr].s = {
            border: {
              top: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              right: { style: 'thin', color: { rgb: 'FFD3D3D3' } }
            },
            alignment: C === 0 ? { horizontal: 'left' } : { horizontal: 'center' }
          };
        }
      }
    }

    // Merge title cells
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');

    const fileName = `tasks_export_${currentDepartment?.name || 'all'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const renderSkeleton = () => (
    [...Array(8)].map((_, i) => (
      <TableRow key={i} className="animate-pulse">
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-3/4"></div></TableCell>
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/2"></div></TableCell>
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/2"></div></TableCell>
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/4"></div></TableCell>
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/3"></div></TableCell>
        <TableCell><div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-1/2"></div></TableCell>
      </TableRow>
    ))
  );

  const rowPaddingClass = viewMode === 'compact' ? 'py-2' : viewMode === 'comfortable' ? 'py-4' : 'py-6';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Header />
      
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-float-delayed"></div>
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl animate-float-slow"></div>
      </div>

      <main className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 p-4 rounded-2xl shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105 relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <ClipboardList className="w-8 h-8 text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                  Task List View
                </h1>
                <p className="text-gray-600 mt-1.5">
                  {currentDepartment ? (
                    <span className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-gray-700">{currentDepartment.name}</span>
                      <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700 border-blue-200">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    </span>
                  ) : (
                    'Select a department to view tasks'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Enhanced Stats Cards */}
          {currentDepartment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatCard
                title="Total Tasks"
                value={stats.total}
                icon={ClipboardList}
                color="blue"
                delay="0ms"
              />
              <StatCard
                title="In Progress"
                value={stats.inProgress}
                icon={Activity}
                color="cyan"
                delay="50ms"
              />
              <StatCard
                title="Completed"
                value={stats.completed}
                icon={CheckCircle2}
                color="emerald"
                subtitle={`${stats.completionRate}% complete`}
                delay="100ms"
              />
              <StatCard
                title="High Priority"
                value={stats.highPriority}
                icon={AlertCircle}
                color="red"
                delay="150ms"
              />
              <StatCard
                title="Overdue"
                value={stats.overdue}
                icon={Clock}
                color="orange"
                delay="200ms"
                pulse={stats.overdue > 0}
              />
            </div>
          )}

          {/* Enhanced Filters Bar */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-5 hover:shadow-2xl transition-all duration-300 relative z-[100]">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Advanced Search */}
                <div className="relative flex-1 min-w-[280px] max-w-lg group z-[9999]">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    placeholder={
                      searchMode === 'fuzzy' ? "Fuzzy search tasks..." :
                      searchMode === 'advanced' ? "Advanced search (title:keyword, assignee:name)..." :
                      "Search tasks, projects, assignees..."
                    }
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => filters.search && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="w-full pl-11 pr-20 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white/50 hover:bg-white hover:border-gray-300"
                  />

                  {/* Search Controls */}
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {/* Search Mode Toggle */}
                    <button
                      onClick={toggleSearchMode}
                      className={`p-1.5 rounded-lg transition-all duration-200 ${
                        searchMode === 'standard' ? 'text-gray-400 hover:text-blue-500 hover:bg-blue-50' :
                        searchMode === 'fuzzy' ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' :
                        'text-purple-500 hover:text-purple-600 hover:bg-purple-50'
                      }`}
                      title={`Search mode: ${searchMode} (click to change)`}
                    >
                      {searchMode === 'fuzzy' ? <Sparkles className="w-3.5 h-3.5" /> :
                       searchMode === 'advanced' ? <Command className="w-3.5 h-3.5" /> :
                       <Search className="w-3.5 h-3.5" />}
                    </button>

                    {/* Help Button */}
                    <button
                      onClick={() => setShowSearchHelp(!showSearchHelp)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all duration-200"
                      title="Search help (Ctrl+?)"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                    </button>

                    {/* Search History */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                          title="Search history"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64 bg-white/95 backdrop-blur-xl border-2 rounded-xl shadow-xl">
                        <div className="px-3 py-2 border-b border-gray-200">
                          <h4 className="font-semibold text-gray-900 text-sm">Recent Searches</h4>
                        </div>
                        {advancedSearch.current.getPopularSearches().length > 0 ? (
                          advancedSearch.current.getPopularSearches().map((query, index) => (
                            <DropdownMenuItem
                              key={index}
                              onSelect={() => handleSuggestionSelect(query)}
                              className="cursor-pointer hover:bg-blue-50 transition-colors"
                            >
                              <div className="flex items-center gap-2 w-full">
                                <History className="w-3 h-3 text-gray-400" />
                                <span className="text-sm text-gray-700 truncate">{query}</span>
                              </div>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-sm text-gray-500">
                            No recent searches
                          </div>
                        )}
                        {advancedSearch.current.getPopularSearches().length > 0 && (
                          <DropdownMenuSeparator />
                        )}
                        <DropdownMenuItem
                          onSelect={() => advancedSearch.current.clearHistory()}
                          className="cursor-pointer hover:bg-red-50 text-red-600 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <X className="w-3 h-3" />
                            <span className="text-sm">Clear History</span>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Clear Button */}
                    {filters.search && (
                      <button
                        onClick={() => handleSearchChange('')}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Search Suggestions */}
                  {showSuggestions && searchSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-xl z-[9999] max-h-48 overflow-y-auto">
                      {searchSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionSelect(suggestion)}
                          className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <div className="flex items-center gap-2">
                            <Search className="w-3 h-3 text-gray-400" />
                            <span className="text-sm text-gray-700">{suggestion}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Search Help Panel */}
                  {showSearchHelp && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-xl z-[9999] p-4 max-w-md">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-500" />
                        Advanced Search Help
                      </h4>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div><strong>Field search:</strong> title:keyword, assignees:name, label:tag</div>
                        <div><strong>Exact phrases:</strong> "exact phrase"</div>
                        <div><strong>Operators:</strong> keyword AND other, keyword OR other, keyword NOT other</div>
                        <div><strong>Fuzzy mode:</strong> Finds similar matches</div>
                        <div><strong>Shortcuts:</strong> Ctrl+/ (focus), Ctrl+? (help), Esc (close)</div>
                      </div>
                      <button
                        onClick={() => setShowSearchHelp(false)}
                        className="mt-3 text-xs text-blue-600 hover:text-blue-700"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter Dropdowns */}
                <FilterDropdown
                  label="Status"
                  icon={Target}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'to-do', label: 'To-Do' },
                    { value: 'in-progress', label: 'In Progress' },
                    { value: 'review', label: 'Review' },
                    { value: 'done', label: 'Done' },
                  ]}
                  value={filters.status}
                  onValueChange={(value) => setFilters({ ...filters, status: value })}
                />
                <FilterDropdown
                  label="Priority"
                  icon={Zap}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={filters.priority}
                  onValueChange={(value) => setFilters({ ...filters, priority: value })}
                />

                {/* Filter Presets */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all duration-200 border-2 rounded-xl hover:border-purple-300 group">
                      <Sparkles size={16} className="text-gray-500 group-hover:text-purple-600 transition-colors" />
                      <span className="text-gray-700 font-medium">Presets</span>
                      <ChevronsUpDown size={16} className="text-gray-400 group-hover:text-purple-500 transition-colors" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-xl border-2 rounded-xl shadow-xl">
                    {Object.keys(getFilterPresets()).map((presetName, index) => (
                      <React.Fragment key={presetName}>
                        <DropdownMenuItem
                          onSelect={() => applyFilterPreset(presetName)}
                          className="cursor-pointer hover:bg-purple-50 transition-colors rounded-lg mx-1 my-0.5"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <span>{presetName}</span>
                          </div>
                        </DropdownMenuItem>
                        {index === 0 && <DropdownMenuSeparator className="my-1" />}
                      </React.Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Date Range Filters */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      placeholder="From date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                      className="pl-10 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white/50 hover:bg-white hover:border-gray-300 text-sm"
                    />
                  </div>
                  <span className="text-gray-500 text-sm">to</span>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      placeholder="To date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                      className="pl-10 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white/50 hover:bg-white hover:border-gray-300 text-sm"
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="flex items-center gap-2 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-all duration-200 rounded-xl"
                  >
                    <X size={14} />
                    Clear Filters
                  </Button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-2 border-2 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 rounded-xl"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="flex items-center gap-2 border-2 hover:bg-emerald-50 hover:border-emerald-300 transition-all duration-200 rounded-xl"
                >
                  <Download size={14} />
                  Export
                </Button>
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-gray-700">Active filters:</span>
                  {filters.status !== 'all' && (
                    <Badge variant="secondary" className="capitalize bg-blue-100 text-blue-700 border-blue-200">
                      Status: {filters.status.replace('-', ' ')}
                    </Badge>
                  )}
                  {filters.priority !== 'all' && (
                    <Badge variant="secondary" className="capitalize bg-purple-100 text-purple-700 border-purple-200">
                      Priority: {filters.priority}
                    </Badge>
                  )}
                  {filters.search && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                      Search: "{filters.search}"
                    </Badge>
                  )}
                  {filters.dateFrom && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                      From: {new Date(filters.dateFrom).toLocaleDateString()}
                    </Badge>
                  )}
                  {filters.dateTo && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                      To: {new Date(filters.dateTo).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden hover:shadow-3xl transition-all duration-300 z-[10]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50 border-b-2 border-blue-200/50">
                <TableRow>
                  <SortableHeader title="Task" sortKey="title" sorting={sorting} onSort={handleSort} icon={Tag} />
                  <SortableHeader title="Project" sortKey="board.name" sorting={sorting} onSort={handleSort} icon={FolderKanban} />
                  <SortableHeader title="Assignee" sortKey="assignees[0].name" sorting={sorting} onSort={handleSort} icon={User} />
                  <SortableHeader title="Priority" sortKey="priority" sorting={sorting} onSort={handleSort} icon={Zap} />
                  <SortableHeader title="Status" sortKey="list.title" sorting={sorting} onSort={handleSort} icon={Target} />
                  <SortableHeader title="Due Date" sortKey="dueDate" sorting={sorting} onSort={handleSort} icon={Calendar} />
                  <SortableHeader title="Total Logged Time" sortKey="loggedTime" sorting={sorting} onSort={handleSort} icon={Clock} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  renderSkeleton()
                ) : filteredAndSortedCards.length > 0 ? (
                  filteredAndSortedCards.map((card, index) => (
                    <TableRow 
                      key={card._id} 
                      className={`hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-300 cursor-pointer group animate-slide-in border-b border-gray-100 ${rowPaddingClass}`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-10 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg shadow-blue-500/50"></div>
                          <div className="flex-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openCardModal(card); }}
                              className="text-left font-semibold hover:text-blue-600 transition-colors"
                              aria-label={`Open details for ${card.title}`}
                              dangerouslySetInnerHTML={{
                                __html: searchHighlights.has(card._id)
                                  ? highlightText(card.title || '', searchHighlights.get(card._id))
                                  : card.title
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-700 group-hover:text-gray-900 transition-colors">
                          <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                            <FolderKanban className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
                          </div>
                          {card.board && card.board._id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleProjectClick(card.board._id); }}
                              className="font-medium text-left hover:text-blue-700 transition-colors"
                              aria-label={`Open project ${card.board?.name}`}
                            >
                              {card.board?.name || 'N/A'}
                            </button>
                          ) : (
                            <span className="font-medium">{card.board?.name || 'N/A'}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {card.assignees && card.assignees.length > 0 ? (
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110">
                              {card.assignees[0].name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-gray-700 font-medium group-hover:text-gray-900 transition-colors">{card.assignees[0].name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic flex items-center gap-2">
                            <div className="p-1.5 bg-gray-100 rounded-lg">
                              <User className="w-4 h-4" />
                            </div>
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getPriorityPill(card.priority)}</TableCell>
                      <TableCell>{getStatusBadge(card.list?.title || 'N/A')}</TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${getDueDateColor(card.dueDate)}`}>
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">{formatDueDate(card.dueDate)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-700 group-hover:text-gray-900 transition-colors">
                          <Clock className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
                          <span className="font-medium">{calculateTotalLoggedTime(card.loggedTime)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-20">
                      <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-8 rounded-3xl shadow-inner">
                          <Filter size={56} className="text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-2">No tasks found</h3>
                          <p className="text-sm text-gray-500 max-w-md">
                            {hasActiveFilters 
                              ? 'Try adjusting your filters to see more results' 
                              : currentDepartment 
                                ? 'No tasks available for this department yet'
                                : 'Select a department to view tasks'
                            }
                          </p>
                        </div>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            onClick={clearFilters}
                            className="flex items-center gap-2 mt-2 border-2 hover:bg-blue-50 hover:border-blue-300 rounded-xl"
                          >
                            <X size={16} />
                            Clear All Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Results Count */}
        {!loading && filteredAndSortedCards.length > 0 && (
          <div className="mt-6 text-center">
            <Badge variant="secondary" className="text-sm py-2 px-4 bg-white/80 backdrop-blur-sm border-2 border-gray-200 hover:border-blue-300 transition-all">
              Showing <span className="font-bold text-blue-600 mx-1">{filteredAndSortedCards.length}</span> of{' '}
              <span className="font-bold text-gray-900 mx-1">{cards.length}</span> tasks
            </Badge>
          </div>
        )}
      </main>

      {/* Card Detail Modal (lazy loaded) */}
      {modalOpen && (
        <Suspense fallback={<div />}> 
          <CardDetailModal
            card={modalCard}
            onClose={() => setModalOpen(false)}
            onUpdate={async (updates) => {
              try {
                // Update in-memory cache
                const existing = taskCache.current.get(modalCard._id) || modalCard;
                const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
                taskCache.current.set(modalCard._id, merged);
                // Update list state
                setCards(prev => prev.map(c => c._id === modalCard._id ? { ...c, ...updates } : c));
                setModalCard(merged);
              } catch (err) {
                console.error('Error applying update to modal card', err);
              }
            }}
            onDelete={async () => {
              try {
                // Remove from UI and cache
                setCards(prev => prev.filter(c => c._id !== modalCard._id));
                taskCache.current.delete(modalCard._id);
                setModalOpen(false);
              } catch (err) {
                console.error('Error removing card locally', err);
              }
            }}
          />
        </Suspense>
      )}

      <style jsx="true">{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-20px) translateX(10px);
          }
        }

        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(20px) translateX(-10px);
          }
        }

        @keyframes float-slow {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-15px) translateX(15px);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
          opacity: 0;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float-delayed 10s ease-in-out infinite;
        }

        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, subtitle, delay, pulse }) => {
  const colorClasses = {
    blue: {
      bg: 'from-blue-500 to-cyan-500',
      text: 'text-blue-600',
      iconBg: 'bg-blue-100',
      border: 'border-blue-200',
      shadow: 'hover:shadow-blue-200'
    },
    cyan: {
      bg: 'from-cyan-500 to-blue-500',
      text: 'text-cyan-600',
      iconBg: 'bg-cyan-100',
      border: 'border-cyan-200',
      shadow: 'hover:shadow-cyan-200'
    },
    emerald: {
      bg: 'from-emerald-500 to-green-500',
      text: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
      border: 'border-emerald-200',
      shadow: 'hover:shadow-emerald-200'
    },
    red: {
      bg: 'from-red-500 to-rose-500',
      text: 'text-red-600',
      iconBg: 'bg-red-100',
      border: 'border-red-200',
      shadow: 'hover:shadow-red-200'
    },
    orange: {
      bg: 'from-orange-500 to-amber-500',
      text: 'text-orange-600',
      iconBg: 'bg-orange-100',
      border: 'border-orange-200',
      shadow: 'hover:shadow-orange-200'
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div 
      className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all duration-300 border-2 ${colors.border} ${colors.shadow} hover:scale-105 hover:-translate-y-1 animate-fade-in group ${pulse ? 'animate-pulse-glow' : ''}`}
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">{title}</p>
          <p className={`text-4xl font-bold ${colors.text} transition-all duration-300 group-hover:scale-110 inline-block`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1 font-medium">{subtitle}</p>
          )}
        </div>
        <div className={`${colors.iconBg} p-4 rounded-xl shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-110 relative overflow-hidden`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${colors.bg} opacity-0 group-hover:opacity-20 transition-opacity duration-300`}></div>
          <Icon className={`w-7 h-7 ${colors.text} relative z-10`} />
        </div>
      </div>
    </div>
  );
};

const FilterDropdown = ({ label, icon: Icon, options, value, onValueChange }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="flex items-center gap-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 border-2 rounded-xl hover:border-blue-300 group">
        {Icon && <Icon size={16} className="text-gray-500 group-hover:text-blue-600 transition-colors" />}
        <span className="text-gray-700 font-medium">{label}:</span>
        <span className="font-bold capitalize bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          {value === 'all' ? options[0].label : options.find(o => o.value === value)?.label}
        </span>
        <ChevronsUpDown size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-xl border-2 rounded-xl shadow-xl">
      {options.map((option, index) => (
        <React.Fragment key={option.value}>
          <DropdownMenuItem 
            onSelect={() => onValueChange(option.value)}
            className={`${value === option.value ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 font-bold' : 'hover:bg-gray-50'} cursor-pointer transition-all duration-200 rounded-lg mx-1 my-0.5`}
          >
            <div className="flex items-center gap-2 w-full">
              {value === option.value && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
              <span className={value === option.value ? '' : 'ml-6'}>{option.label}</span>
            </div>
          </DropdownMenuItem>
          {index === 0 && <DropdownMenuSeparator className="my-1" />}
        </React.Fragment>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const SortableHeader = ({ title, sortKey, sorting, onSort, icon: Icon }) => (
  <TableHead 
    className="cursor-pointer select-none hover:bg-gradient-to-r hover:from-blue-100/50 hover:to-indigo-100/50 transition-all duration-200 group"
    onClick={() => onSort(sortKey)}
  >
    <div className="flex items-center gap-2 font-bold text-gray-700 group-hover:text-blue-700 transition-colors">
      {Icon && <Icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />}
      {title}
      {sorting.key === sortKey ? (
        <div className="p-1 bg-blue-100 rounded-lg">
          <ArrowUpDown 
            size={14} 
            className={`transition-all duration-300 text-blue-600 ${sorting.order === 'desc' ? 'rotate-180' : ''}`} 
          />
        </div>
      ) : (
        <ChevronsUpDown size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
      )}
    </div>
  </TableHead>
);

export default ListView;