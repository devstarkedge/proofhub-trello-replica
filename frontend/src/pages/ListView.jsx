import React, { useState, useEffect, useContext, useMemo } from 'react';
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
  X
} from 'lucide-react';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';

const ListView = () => {
  const { currentDepartment } = useContext(TeamContext);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    search: ''
  });
  const [sorting, setSorting] = useState({ key: 'dueDate', order: 'asc' });

  useEffect(() => {
    if (currentDepartment) {
      loadCards();
    } else {
      setCards([]);
      setLoading(false);
    }
  }, [currentDepartment]);

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

  const filteredAndSortedCards = useMemo(() => {
    let filtered = cards;

    if (filters.status !== 'all') {
      filtered = filtered.filter(card => card.list?.title?.toLowerCase().replace(' ', '-') === filters.status);
    }

    if (filters.priority !== 'all') {
      filtered = filtered.filter(card => card.priority?.toLowerCase() === filters.priority);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(card =>
        card.title?.toLowerCase().includes(searchLower) ||
        card.board?.name?.toLowerCase().includes(searchLower) ||
        card.assignees?.some(a => a.name?.toLowerCase().includes(searchLower))
      );
    }

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
  }, [cards, filters, sorting]);

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
      search: ''
    });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.priority !== 'all' || filters.search !== '';

  const getStats = () => {
    const total = cards.length;
    const completed = cards.filter(c => c.list?.title?.toLowerCase() === 'done').length;
    const inProgress = cards.filter(c => c.list?.title?.toLowerCase() === 'in progress').length;
    const highPriority = cards.filter(c => c.priority === 'High').length;
    return { total, completed, inProgress, highPriority };
  };

  const stats = getStats();

  const getPriorityPill = (priority) => {
    const config = {
      'High': { variant: 'destructive', icon: AlertCircle, color: 'text-red-600' },
      'Medium': { variant: 'secondary', icon: TrendingUp, color: 'text-yellow-600' },
      'Low': { variant: 'outline', icon: CheckCircle2, color: 'text-green-600' }
    };
    const { variant, icon: Icon, color } = config[priority] || { variant: 'outline', icon: Tag, color: 'text-gray-600' };
    
    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        <Icon className={`w-3 h-3 ${variant === 'outline' ? color : ''}`} />
        {priority}
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    const config = {
      'To-Do': { color: 'bg-slate-100 text-slate-700 border-slate-300', icon: ClipboardList },
      'In Progress': { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Clock },
      'Review': { color: 'bg-purple-100 text-purple-700 border-purple-300', icon: Users },
      'Done': { color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle2 }
    };
    const { color, icon: Icon } = config[status] || { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Tag };
    
    return (
      <Badge variant="secondary" className={`${color} border flex items-center gap-1 w-fit`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const getDueDateColor = (dueDate) => {
    if (!dueDate) return 'text-gray-400';
    const today = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'text-red-600 font-semibold';
    if (diffDays === 0) return 'text-orange-600 font-semibold';
    if (diffDays <= 3) return 'text-yellow-600 font-semibold';
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

  const renderSkeleton = () => (
    [...Array(8)].map((_, i) => (
      <TableRow key={i} className="animate-pulse">
        <TableCell><div className="h-4 bg-gray-200 rounded w-3/4"></div></TableCell>
        <TableCell><div className="h-4 bg-gray-200 rounded w-1/2"></div></TableCell>
        <TableCell><div className="h-4 bg-gray-200 rounded w-1/2"></div></TableCell>
        <TableCell><div className="h-4 bg-gray-200 rounded w-1/4"></div></TableCell>
        <TableCell><div className="h-4 bg-gray-200 rounded w-1/3"></div></TableCell>
        <TableCell><div className="h-4 bg-gray-200 rounded w-1/2"></div></TableCell>
      </TableRow>
    ))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      <main className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
              <ClipboardList className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Task List View</h1>
              <p className="text-gray-600 mt-1">
                {currentDepartment ? (
                  <span className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" />
                    {currentDepartment.name}
                  </span>
                ) : (
                  'Select a department to view tasks'
                )}
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          {currentDepartment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Tasks</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <ClipboardList className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">In Progress</p>
                    <p className="text-3xl font-bold text-blue-600 mt-1">{stats.inProgress}</p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Completed</p>
                    <p className="text-3xl font-bold text-green-600 mt-1">{stats.completed}</p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">High Priority</p>
                    <p className="text-3xl font-bold text-red-600 mt-1">{stats.highPriority}</p>
                  </div>
                  <div className="bg-red-100 p-3 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-200">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search tasks, projects, assignees..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                  {filters.search && (
                    <button
                      onClick={() => setFilters({ ...filters, search: '' })}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filter Dropdowns */}
                <FilterDropdown
                  label="Status"
                  icon={ClipboardList}
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
                  icon={AlertCircle}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={filters.priority}
                  onValueChange={(value) => setFilters({ ...filters, priority: value })}
                />

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="flex items-center gap-2 border-red-300 text-red-600 hover:bg-red-50"
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
                  className="flex items-center gap-2"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Download size={14} />
                  Export
                </Button>
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Filter className="w-4 h-4" />
                  <span className="font-medium">Active filters:</span>
                  {filters.status !== 'all' && (
                    <Badge variant="secondary" className="capitalize">
                      Status: {filters.status.replace('-', ' ')}
                    </Badge>
                  )}
                  {filters.priority !== 'all' && (
                    <Badge variant="secondary" className="capitalize">
                      Priority: {filters.priority}
                    </Badge>
                  )}
                  {filters.search && (
                    <Badge variant="secondary">
                      Search: "{filters.search}"
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow duration-300">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                <TableRow>
                  <SortableHeader title="Task" sortKey="title" sorting={sorting} onSort={handleSort} icon={Tag} />
                  <SortableHeader title="Project" sortKey="board.name" sorting={sorting} onSort={handleSort} icon={FolderKanban} />
                  <SortableHeader title="Assignee" sortKey="assignees[0].name" sorting={sorting} onSort={handleSort} icon={User} />
                  <SortableHeader title="Priority" sortKey="priority" sorting={sorting} onSort={handleSort} icon={AlertCircle} />
                  <SortableHeader title="Status" sortKey="list.title" sorting={sorting} onSort={handleSort} icon={ClipboardList} />
                  <SortableHeader title="Due Date" sortKey="dueDate" sorting={sorting} onSort={handleSort} icon={Calendar} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  renderSkeleton()
                ) : filteredAndSortedCards.length > 0 ? (
                  filteredAndSortedCards.map((card, index) => (
                    <TableRow 
                      key={card._id} 
                      className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group animate-slide-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          {card.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-600">
                          <FolderKanban className="w-4 h-4 text-gray-400" />
                          {card.board?.name || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {card.assignees && card.assignees.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {card.assignees[0].name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-gray-700 font-medium">{card.assignees[0].name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getPriorityPill(card.priority)}</TableCell>
                      <TableCell>{getStatusBadge(card.list?.title || 'N/A')}</TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${getDueDateColor(card.dueDate)}`}>
                          <Calendar className="w-4 h-4" />
                          {formatDueDate(card.dueDate)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <div className="bg-gray-100 p-6 rounded-full">
                          <Filter size={48} className="text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">No tasks found</h3>
                          <p className="text-sm text-gray-500">
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
                            className="flex items-center gap-2 mt-2"
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
          <div className="mt-4 text-center text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{filteredAndSortedCards.length}</span> of{' '}
            <span className="font-semibold text-gray-900">{cards.length}</span> tasks
          </div>
        )}
      </main>

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

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
};

const FilterDropdown = ({ label, icon: Icon, options, value, onValueChange }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="flex items-center gap-2 hover:bg-gray-50 transition-colors">
        {Icon && <Icon size={14} className="text-gray-500" />}
        <span className="text-gray-700">{label}:</span>
        <span className="font-semibold capitalize text-blue-600">
          {value === 'all' ? 'All' : value.replace('-', ' ')}
        </span>
        <ChevronsUpDown size={14} className="text-gray-400" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      {options.map(option => (
        <DropdownMenuItem 
          key={option.value} 
          onSelect={() => onValueChange(option.value)}
          className={value === option.value ? 'bg-blue-50 text-blue-700 font-semibold' : ''}
        >
          {option.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const SortableHeader = ({ title, sortKey, sorting, onSort, icon: Icon }) => (
  <TableHead 
    className="cursor-pointer select-none hover:bg-gray-100 transition-colors group"
    onClick={() => onSort(sortKey)}
  >
    <div className="flex items-center gap-2 font-semibold text-gray-700">
      {Icon && <Icon className="w-4 h-4 text-gray-500" />}
      {title}
      {sorting.key === sortKey ? (
        <ArrowUpDown 
          size={14} 
          className={`transition-transform text-blue-600 ${sorting.order === 'desc' ? 'rotate-180' : ''}`} 
        />
      ) : (
        <ChevronsUpDown size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
      )}
    </div>
  </TableHead>
);

export default ListView;