import React, { useState, useEffect, useContext, useMemo } from 'react';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { Filter, Calendar, User, Tag, ChevronsUpDown, ArrowUpDown } from 'lucide-react';

const ListView = () => {
  const { currentDepartment } = useContext(TeamContext);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
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
      // Use the direct API endpoint for getting cards by department
      const response = await Database.getCardsByDepartment(currentDepartment._id);
      setCards(response.data || []);
    } catch (error) {
      console.error('Error loading cards:', error);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedCards = useMemo(() => {
    let filtered = cards;

    if (filters.status !== 'all') {
      filtered = filtered.filter(card => card.list.title.toLowerCase().replace(' ', '-') === filters.status);
    }

    if (filters.priority !== 'all') {
      filtered = filtered.filter(card => card.priority.toLowerCase() === filters.priority);
    }

    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sorting.key];
      const bValue = b[sorting.key];

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

  const getPriorityPill = (priority) => {
    switch (priority) {
      case 'High': return <Badge variant="destructive">High</Badge>;
      case 'Medium': return <Badge variant="secondary">Medium</Badge>;
      case 'Low': return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const renderSkeleton = () => (
    [...Array(10)].map((_, i) => (
      <TableRow key={i}>
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
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Task List</h1>
            <p className="text-sm text-gray-500 mt-1">
              {currentDepartment ? `Showing tasks for ${currentDepartment.name}` : 'Select a department to view tasks'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterDropdown
              label="Status"
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
              options={[
                { value: 'all', label: 'All' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
              value={filters.priority}
              onValueChange={(value) => setFilters({ ...filters, priority: value })}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <SortableHeader title="Task" sortKey="title" sorting={sorting} onSort={handleSort} />
                <SortableHeader title="Project" sortKey="board.name" sorting={sorting} onSort={handleSort} />
                <SortableHeader title="Assignee" sortKey="assignees[0].name" sorting={sorting} onSort={handleSort} />
                <SortableHeader title="Priority" sortKey="priority" sorting={sorting} onSort={handleSort} />
                <SortableHeader title="Status" sortKey="list.title" sorting={sorting} onSort={handleSort} />
                <SortableHeader title="Due Date" sortKey="dueDate" sorting={sorting} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                renderSkeleton()
              ) : filteredAndSortedCards.length > 0 ? (
                filteredAndSortedCards.map(card => (
                  <TableRow key={card._id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <TableCell className="font-medium text-gray-800">{card.title}</TableCell>
                    <TableCell className="text-gray-600">{card.board?.name || 'N/A'}</TableCell>
                    <TableCell className="text-gray-600">
                      {card.assignees && card.assignees.length > 0 ? card.assignees[0].name : 'Unassigned'}
                    </TableCell>
                    <TableCell>{getPriorityPill(card.priority)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {card.list?.title || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'No due date'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-gray-500">
                    <div className="flex flex-col items-center gap-4">
                      <Filter size={48} className="text-gray-300" />
                      <h3 className="text-lg font-medium">No tasks found</h3>
                      <p className="text-sm">Try adjusting your filters or create a new task.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
};

const FilterDropdown = ({ label, options, value, onValueChange }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="flex items-center gap-2">
        <Filter size={14} />
        <span>{label}:</span>
        <span className="font-semibold capitalize">{value}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {options.map(option => (
        <DropdownMenuItem key={option.value} onSelect={() => onValueChange(option.value)}>
          {option.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const SortableHeader = ({ title, sortKey, sorting, onSort }) => (
  <TableHead className="cursor-pointer select-none" onClick={() => onSort(sortKey)}>
    <div className="flex items-center gap-2">
      {title}
      {sorting.key === sortKey ? (
        <ArrowUpDown size={14} className={`transition-transform ${sorting.order === 'desc' ? 'rotate-180' : ''}`} />
      ) : (
        <ChevronsUpDown size={14} className="text-gray-400" />
      )}
    </div>
  </TableHead>
);

export default ListView;