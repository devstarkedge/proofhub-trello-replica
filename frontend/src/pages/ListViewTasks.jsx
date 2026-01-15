import React, { useState, useEffect, useContext, useMemo, lazy, Suspense, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Filter, Calendar, User, Tag, ChevronsUpDown, ArrowUpDown, ClipboardList, FolderKanban,
  Users, AlertCircle, CheckCircle2, Clock, TrendingUp, Search, Download, RefreshCw, X,
  Sparkles, Zap, Target, Activity, History, Lightbulb, Command, FileText, Globe
} from 'lucide-react';
import * as XLSX from 'xlsx';
import DepartmentContext from '../context/DepartmentContext';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { ListViewSkeleton } from '../components/LoadingSkeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { AdvancedSearch, debounce, highlightText } from '../utils/advancedSearch';
import AvatarGroup from '../components/AvatarGroup';

const CardDetailModal = lazy(() => import('../components/CardDetailModal'));

/**
 * ListViewTasks - Tasks section for the List View page
 * Renders the task list with filters, stats, and table
 * Accessible via /list-view route (default child)
 */
const ListViewTasks = () => {
  const { currentDepartment, departments, setCurrentDepartment } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [viewMode, setViewMode] = useState('comfortable');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHighlights, setSearchHighlights] = useState(new Map());
  const [searchMode, setSearchMode] = useState('standard');
  const [searchScope, setSearchScope] = useState('all');
  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const helpPanelRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [historyUpdate, setHistoryUpdate] = useState(0);

  useEffect(() => {
    if (currentDepartment) {
      setPage(1);
    }
  }, [currentDepartment]);

  useEffect(() => {
    if (currentDepartment) {
      loadCards();
    } else {
      setCards([]);
      setLoading(false);
    }
  }, [currentDepartment]);

  useEffect(() => {
    if (!loading && cards && currentDepartment && currentDepartment._id !== 'all') {
      const uniqueProjects = Array.from(
        new Set(
          cards
            .filter(c => {
              const cardDeptId = c.board?.department?._id || c.board?.department;
              return cardDeptId && cardDeptId.toString() === currentDepartment._id.toString();
            })
            .map(c => c.board?._id)
            .filter(Boolean)
        )
      );
      uniqueProjects.slice(0, 5).forEach(projectId => {
        const key = ['workflow', currentDepartment._id, projectId];
        queryClient.prefetchQuery({
          queryKey: key,
          queryFn: () => Database.getWorkflowData(currentDepartment._id, projectId)
        }).catch(() => {});
      });
    }
  }, [loading, cards, currentDepartment, queryClient]);

  useEffect(() => {
    if (!currentDepartment && departments.length > 0) {
      const allDeptsOption = departments.find(d => d._id === 'all');
      if (allDeptsOption) {
        setCurrentDepartment(allDeptsOption);
      }
    }
  }, [departments, currentDepartment, setCurrentDepartment]);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (helpPanelRef.current && !helpPanelRef.current.contains(event.target)) {
        setShowSearchHelp(false);
      }
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    if (showSearchHelp || showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchHelp, showSuggestions]);

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

  const handleProjectClick = useCallback(async (projectId, boardDepartmentId) => {
    if (!projectId) return;
    const deptId = boardDepartmentId || currentDepartment?._id;
    const key = ['workflow-complete', projectId];
    try {
      if (!projectCache.current.has(projectId)) {
        const res = await queryClient.prefetchQuery({
          queryKey: key,
          queryFn: () => Database.getWorkflowComplete(projectId)
        });
        if (res && res.data) projectCache.current.set(projectId, res.data);
      }
    } catch (err) {
      console.warn('Prefetch workflow failed', err);
    } finally {
      navigate(`/workflow/${deptId}/${projectId}`);
    }
  }, [currentDepartment, queryClient, navigate]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const openCardModal = async (card) => {
    if (!card) return;
    setModalLoading(true);
    try {
      const cached = taskCache.current.get(card._id);
      if (cached && card.updatedAt && cached.updatedAt === card.updatedAt) {
        setModalCard(cached);
      } else {
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

  const baseCards = useMemo(() => {
    if (!user || !cards) return cards;
    if (user.role === 'admin' || user.role === 'manager') {
      return cards;
    }
    return cards.filter(card => {
      if (!card.assignees || card.assignees.length === 0) return false;
      return card.assignees.some(assignee => 
        assignee._id === user._id || assignee.email === user.email
      );
    });
  }, [cards, user]);

  const updateSearchSuggestions = useCallback(
    debounce((query) => {
      if (query.length >= 2) {
        const suggestions = advancedSearch.current.getSuggestions(query, baseCards);
        setSearchSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } else {
        setShowSuggestions(false);
      }
    }, 300),
    [baseCards]
  );

  const filteredAndSortedCards = useMemo(() => {
    let filtered = baseCards;
    if (filters.status !== 'all') {
      filtered = filtered.filter(card => card.list?.title?.toLowerCase().replace(' ', '-') === filters.status);
    }
    if (filters.priority !== 'all') {
      filtered = filtered.filter(card => card.priority?.toLowerCase() === filters.priority);
    }
    if (filters.search) {
      const searchResult = advancedSearch.current.search(filtered, filters.search, {
        fuzzy: searchMode === 'fuzzy',
        highlight: true,
        scope: searchScope
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
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(card => {
        if (!card.dueDate) return false;
        const cardDate = new Date(card.dueDate);
        const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
        const toDate = filters.dateTo ? new Date(filters.dateTo) : null;
        if (fromDate && toDate) return cardDate >= fromDate && cardDate <= toDate;
        else if (fromDate) return cardDate >= fromDate;
        else if (toDate) return cardDate <= toDate;
        return true;
      });
    }
    const sorted = [...filtered].sort((a, b) => {
      let aValue, bValue;
      if (sorting.key === 'board.name') { aValue = a.board?.name; bValue = b.board?.name; }
      else if (sorting.key === 'assignees[0].name') { aValue = a.assignees?.[0]?.name; bValue = b.assignees?.[0]?.name; }
      else if (sorting.key === 'list.title') { aValue = a.list?.title; bValue = b.list?.title; }
      else { aValue = a[sorting.key]; bValue = b[sorting.key]; }
      if (aValue === bValue) return 0;
      let result = 0;
      if (aValue === null || aValue === undefined) result = 1;
      else if (bValue === null || bValue === undefined) result = -1;
      else if (sorting.key === 'dueDate') result = new Date(aValue) - new Date(bValue);
      else result = aValue.toString().localeCompare(bValue.toString());
      return sorting.order === 'asc' ? result : -result;
    });
    return sorted;
  }, [baseCards, filters, sorting, searchMode]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = useMemo(() => Math.ceil(filteredAndSortedCards.length / pageSize), [filteredAndSortedCards, pageSize]);
  const paginatedCards = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedCards.slice(start, start + pageSize);
  }, [filteredAndSortedCards, page, pageSize]);

  const handleSort = (key) => {
    if (sorting.key === key) setSorting({ ...sorting, order: sorting.order === 'asc' ? 'desc' : 'asc' });
    else setSorting({ key, order: 'asc' });
  };

  const clearFilters = () => {
    setFilters({ status: 'all', priority: 'all', search: '', dateFrom: '', dateTo: '' });
    setSearchSuggestions([]);
    setShowSuggestions(false);
    setSearchHighlights(new Map());
  };

  const handleSearchChange = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    updateSearchSuggestions(value);
  };

  const handleSuggestionSelect = (suggestion) => {
    setFilters(prev => ({ ...prev, search: suggestion }));
    advancedSearch.current.addToHistory(suggestion);
    setShowSuggestions(false);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (filters.search && filters.search.trim()) {
        advancedSearch.current.addToHistory(filters.search.trim());
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowSearchHelp(false);
    }
  };

  const toggleSearchMode = () => {
    setSearchMode(prev => {
      if (prev === 'standard') return 'fuzzy';
      if (prev === 'fuzzy') return 'advanced';
      return 'standard';
    });
  };

  const getFilterPresets = () => ({
    'My Tasks': { priority: 'all', status: 'all', search: user ? `assignees:"${user.name}"` : '', dateFrom: '', dateTo: '' },
    'High Priority': { priority: 'high', status: 'all', search: '', dateFrom: '', dateTo: '' },
    'Overdue Tasks': { priority: 'all', status: 'all', search: '', dateFrom: '', dateTo: new Date().toISOString().split('T')[0] },
    'This Week': { priority: 'all', status: 'all', search: '', dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], dateTo: new Date().toISOString().split('T')[0] },
    'In Progress': { priority: 'all', status: 'in-progress', search: '', dateFrom: '', dateTo: '' }
  });

  const applyFilterPreset = (presetName) => {
    const presets = getFilterPresets();
    const preset = presets[presetName];
    if (preset) { setFilters(preset); setSearchMode('fuzzy'); }
  };

  const hasActiveFilters = filters.status !== 'all' || filters.priority !== 'all' || filters.search !== '' || filters.dateFrom !== '' || filters.dateTo !== '';

  const stats = useMemo(() => {
    const total = baseCards.length;
    const completed = baseCards.filter(c => c.list?.title?.toLowerCase() === 'done').length;
    const inProgress = baseCards.filter(c => c.list?.title?.toLowerCase() === 'in progress').length;
    const highPriority = baseCards.filter(c => c.priority?.toLowerCase() === 'high').length;
    const overdue = baseCards.filter(c => {
      if (!c.dueDate) return false;
      const today = new Date();
      const due = new Date(c.dueDate);
      return due < today && c.list?.title?.toLowerCase() !== 'done';
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, highPriority, overdue, completionRate };
  }, [baseCards]);

  const getPriorityPill = useCallback((priority) => {
    if (!priority) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 transition-all duration-200 hover:scale-105 w-fit">
          <Tag className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-semibold text-gray-600">No Priority</span>
        </div>
      );
    }
    const config = {
      'High': { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      'Medium': { icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
      'Low': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    };
    const { icon: Icon, color, bg, border } = config[priority] || { icon: Tag, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${bg} ${border} border transition-all duration-200 hover:scale-105 w-fit`}>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className={`text-xs font-semibold ${color}`}>{priority}</span>
      </div>
    );
  }, []);

  const getStatusBadge = useCallback((status) => {
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
  }, []);

  const getDueDateColor = useCallback((dueDate, status) => {
    if (!dueDate) return 'text-gray-400';
    if (status && status.toLowerCase() === 'done') return 'text-gray-600';
    
    const today = new Date();
    const due = new Date(dueDate);
    due.setHours(23, 59, 59, 999); // Compare with end of due date
    const todayEnd = new Date();
    todayEnd.setHours(0, 0, 0, 0); // Compare with start of today for overdue calculation
    
    // If due date is strictly before today (yesterday or earlier), it's overdue
    if (due < todayEnd) return 'text-red-600 font-semibold';
    
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'text-orange-600 font-semibold';
    if (diffDays <= 3) return 'text-amber-600 font-semibold';
    return 'text-gray-600';
  }, []);

  const formatDueDate = useCallback((dueDate, status) => {
    if (!dueDate) return 'No due date';
    
    const date = new Date(dueDate);
    
    if (status && status.toLowerCase() === 'done') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(dueDate);
    checkDate.setHours(0, 0, 0, 0);
    
    const diffTime = checkDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const calculateTotalLoggedTime = useCallback((loggedTime) => {
    if (!loggedTime || loggedTime.length === 0) return '0h 0m';
    const totalMinutes = loggedTime.reduce((acc, entry) => acc + (entry.hours * 60) + entry.minutes, 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }, []);

  const handleExport = useCallback(() => {
    if (filteredAndSortedCards.length === 0) { alert('No tasks to export'); return; }
    const exportData = filteredAndSortedCards.map(card => ({
      'Task': card.title || '',
      'Project': card.board?.name || 'N/A',
      'Assignee': card.assignees && card.assignees.length > 0 ? card.assignees.map(a => a.name).join(', ') : 'Unassigned',
      'Priority': card.priority || '',
      'Status': card.list?.title || 'N/A',
      'Due Date': card.dueDate ? new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date',
      'Total Logged Time': calculateTotalLoggedTime(card.loggedTime)
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.sheet_add_aoa(worksheet, [['Task Management Export']], { origin: 'A1' });
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = range.e.r; R >= 0; --R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R + 1, c: C });
        const addr_old = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[addr_old]) worksheet[addr] = worksheet[addr_old];
        delete worksheet[addr_old];
      }
    }
    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r + 1, c: range.e.c } });
    worksheet['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
    worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');
    const fileName = `tasks_export_${currentDepartment?.name || 'all'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [filteredAndSortedCards, currentDepartment, calculateTotalLoggedTime]);

  const rowPaddingClass = viewMode === 'compact' ? 'py-2' : viewMode === 'comfortable' ? 'py-4' : 'py-6';

  if (loading) return <ListViewSkeleton />;

  return (
    <>
      <div className="space-y-6">
        {/* Stats Cards */}
        {currentDepartment && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard title="Total Tasks" value={stats.total} icon={ClipboardList} color="blue" delay="0ms" />
            <StatCard title="In Progress" value={stats.inProgress} icon={Activity} color="cyan" delay="50ms" />
            <StatCard title="Completed" value={stats.completed} icon={CheckCircle2} color="emerald" subtitle={`${stats.completionRate}% complete`} delay="100ms" />
            <StatCard title="High Priority" value={stats.highPriority} icon={AlertCircle} color="red" delay="150ms" />
            <StatCard title="Overdue" value={stats.overdue} icon={Clock} color="orange" delay="200ms" pulse={stats.overdue > 0} />
          </div>
        )}

        {/* Filters Bar */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-5 hover:shadow-2xl transition-all duration-300 relative z-[100]">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1 min-w-[280px] max-w-lg group z-[9999]">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                <input
                  type="text"
                  placeholder={searchMode === 'fuzzy' ? `Fuzzy search ${searchScope === 'all' ? 'tasks' : searchScope}...` : searchMode === 'advanced' ? "Advanced search..." : "Search tasks..."}
                  value={filters.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => filters.search && setShowSuggestions(true)}
                  className="w-full pl-11 pr-20 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white/50 hover:bg-white hover:border-gray-300"
                />
                <div className="absolute right-2 top-1/2 transform scale-110 bg-gray-200 rounded-lg -translate-y-1/2 flex items-center gap-1">
                  <button onClick={toggleSearchMode} className="p-1.5 rounded-lg transition-all duration-200 text-gray-400 hover:text-blue-500 hover:bg-blue-50" title={`Search mode: ${searchMode}`}>
                    {searchMode === 'fuzzy' ? <Sparkles className="w-3.5 h-3.5" /> : searchMode === 'advanced' ? <Command className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                  {filters.search && (
                    <button onClick={() => handleSearchChange('')} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Dropdowns */}
              <FilterDropdown label="Status" icon={Target} options={[{ value: 'all', label: 'All' }, { value: 'to-do', label: 'To-Do' }, { value: 'in-progress', label: 'In Progress' }, { value: 'review', label: 'Review' }, { value: 'done', label: 'Done' }]} value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })} />
              <FilterDropdown label="Priority" icon={Zap} options={[{ value: 'all', label: 'All' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} value={filters.priority} onValueChange={(value) => setFilters({ ...filters, priority: value })} />

              {/* Date Filters */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="pl-10 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <span className="text-gray-500 text-sm">to</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="pl-10 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>

              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="flex items-center gap-2 border-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl">
                  <X size={14} /> Clear Filters
                </Button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 border-2 hover:bg-blue-50 rounded-xl">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="flex items-center gap-2 border-2 hover:bg-emerald-50 rounded-xl">
                <Download size={14} /> Export
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden z-[10]">
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
                  <SortableHeader title="Logged Time" sortKey="loggedTime" sorting={sorting} onSort={handleSort} icon={Clock} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCards.length > 0 ? (
                  paginatedCards.map((card, index) => (
                    <TableRow key={card._id} className={`hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-300 group animate-slide-in border-b border-gray-100 ${rowPaddingClass}`} style={{ animationDelay: `${index * 30}ms` }}>
                      <TableCell className="font-semibold text-gray-900 group-hover:text-blue-600">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-10 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                          <button onClick={(e) => { e.stopPropagation(); openCardModal(card); }} className="text-left font-semibold hover:text-blue-600 transition-colors cursor-pointer" dangerouslySetInnerHTML={{ __html: searchHighlights.has(card._id) ? highlightText(card.title || '', searchHighlights.get(card._id)) : card.title }} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-700">
                          <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-blue-100"><FolderKanban className="w-4 h-4 text-gray-500 group-hover:text-blue-600" /></div>
                          <button onClick={(e) => { e.stopPropagation(); if (card.board?._id) handleProjectClick(card.board._id, card.board.department); }} className="font-medium hover:text-blue-700 cursor-pointer">{card.board?.name || 'N/A'}</button>
                        </div>
                      </TableCell>
                      <TableCell><AvatarGroup assignees={card.assignees || []} /></TableCell>
                      <TableCell>{getPriorityPill(card.priority)}</TableCell>
                      <TableCell>{getStatusBadge(card.list?.title || 'N/A')}</TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${getDueDateColor(card.dueDate, card.list?.title)}`}>
                          <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-blue-100"><Calendar className="w-4 h-4" /></div>
                          <span className="font-medium">{formatDueDate(card.dueDate, card.list?.title)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-700">
                          <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-blue-100"><Clock className="w-4 h-4 text-gray-500 group-hover:text-blue-600" /></div>
                          <span className="font-medium">{calculateTotalLoggedTime(card.loggedTime)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-20">
                      <div className="flex flex-col items-center gap-4">
                        <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-8 rounded-3xl shadow-inner"><Filter size={56} className="text-gray-400" /></div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-2">No tasks found</h3>
                          <p className="text-sm text-gray-500">{hasActiveFilters ? 'Try adjusting your filters' : currentDepartment ? 'No tasks available' : 'Select a department'}</p>
                        </div>
                        {hasActiveFilters && <Button variant="outline" onClick={clearFilters} className="flex items-center gap-2 mt-2 border-2 rounded-xl"><X size={16} /> Clear Filters</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && filteredAndSortedCards.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <Badge variant="secondary" className="text-sm py-2 px-4 bg-white/80 border-2">
              Showing <span className="font-bold text-blue-600 mx-1">{paginatedCards.length}</span> of <span className="font-bold mx-1">{filteredAndSortedCards.length}</span> tasks
            </Badge>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm">Page {page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              <select className="ml-4 px-2 py-1 border rounded text-sm" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 20, 50].map(size => <option key={size} value={size}>{size} / page</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Card Detail Modal */}
      {modalOpen && (
        <Suspense fallback={<div />}>
          <CardDetailModal
            card={modalCard}
            onClose={() => setModalOpen(false)}
            onUpdate={async (updates) => {
              try {
                const resp = await Database.updateCard(modalCard._id, updates);
                const updatedCard = resp.data || resp;
                taskCache.current.set(modalCard._id, updatedCard);
                setCards(prev => prev.map(c => c._id === modalCard._id ? updatedCard : c));
                setModalCard(updatedCard);
              } catch (err) { console.error('Error updating card', err); }
            }}
            onDelete={async () => {
              try {
                setCards(prev => prev.filter(c => c._id !== modalCard._id));
                taskCache.current.delete(modalCard._id);
                setModalOpen(false);
              } catch (err) { console.error('Error deleting card', err); }
            }}
          />
        </Suspense>
      )}

      <style jsx="true">{`
        @keyframes slide-in { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out forwards; opacity: 0; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 0.5s ease-out; }
      `}</style>
    </>
  );
};

// Memoized helper components
const StatCard = memo(({ title, value, icon: Icon, color, subtitle, delay, pulse }) => {
  const colorClasses = {
    blue: { bg: 'from-blue-500 to-cyan-500', text: 'text-blue-600', iconBg: 'bg-blue-100', border: 'border-blue-200', shadow: 'hover:shadow-blue-200' },
    cyan: { bg: 'from-cyan-500 to-blue-500', text: 'text-cyan-600', iconBg: 'bg-cyan-100', border: 'border-cyan-200', shadow: 'hover:shadow-cyan-200' },
    emerald: { bg: 'from-emerald-500 to-green-500', text: 'text-emerald-600', iconBg: 'bg-emerald-100', border: 'border-emerald-200', shadow: 'hover:shadow-emerald-200' },
    red: { bg: 'from-red-500 to-rose-500', text: 'text-red-600', iconBg: 'bg-red-100', border: 'border-red-200', shadow: 'hover:shadow-red-200' },
    orange: { bg: 'from-orange-500 to-amber-500', text: 'text-orange-600', iconBg: 'bg-orange-100', border: 'border-orange-200', shadow: 'hover:shadow-orange-200' }
  };
  const colors = colorClasses[color] || colorClasses.blue;
  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all duration-300 border-2 ${colors.border} ${colors.shadow} hover:scale-105 hover:-translate-y-1 animate-fade-in group ${pulse ? 'animate-pulse-glow' : ''}`} style={{ animationDelay: delay }}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">{title}</p>
          <p className={`text-4xl font-bold ${colors.text} transition-all duration-300 group-hover:scale-110 inline-block`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1 font-medium">{subtitle}</p>}
        </div>
        <div className={`${colors.iconBg} p-4 rounded-xl shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-110 relative overflow-hidden`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${colors.bg} opacity-0 group-hover:opacity-20 transition-opacity duration-300`}></div>
          <Icon className={`w-7 h-7 ${colors.text} relative z-10`} />
        </div>
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';

const FilterDropdown = memo(({ label, icon: Icon, options, value, onValueChange }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="flex items-center gap-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 border-2 rounded-xl hover:border-blue-300 group">
        {Icon && <Icon size={16} className="text-gray-500 group-hover:text-blue-600 transition-colors" />}
        <span className="text-gray-700 font-medium">{label}:</span>
        <span className="font-bold capitalize bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{options.find(o => o.value === value)?.label || 'All'}</span>
        <ChevronsUpDown size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-xl border-2 rounded-xl shadow-xl">
      {options.map((option, index) => (
        <React.Fragment key={option.value}>
          <DropdownMenuItem onSelect={() => onValueChange(option.value)} className={`${value === option.value ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 font-bold' : 'hover:bg-gray-50'} cursor-pointer transition-all duration-200 rounded-lg mx-1 my-0.5`}>
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
));
FilterDropdown.displayName = 'FilterDropdown';

const SortableHeader = memo(({ title, sortKey, sorting, onSort, icon: Icon }) => (
  <TableHead className="cursor-pointer select-none hover:bg-gradient-to-r hover:from-blue-100/50 hover:to-indigo-100/50 transition-all duration-200 group" onClick={() => onSort(sortKey)}>
    <div className="flex items-center gap-2 font-bold text-gray-700 group-hover:text-blue-700 transition-colors">
      {Icon && <Icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />}
      {title}
      {sorting.key === sortKey ? (
        <div className="p-1 bg-blue-100 rounded-lg"><ArrowUpDown size={14} className={`transition-all duration-300 text-blue-600 ${sorting.order === 'desc' ? 'rotate-180' : ''}`} /></div>
      ) : (
        <ChevronsUpDown size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
      )}
    </div>
  </TableHead>
));
SortableHeader.displayName = 'SortableHeader';

export default memo(ListViewTasks);
