import { useState, useRef, useEffect, memo, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, MoreVertical, Eye, Edit, Trash2,
  Clock, CheckCircle2, PauseCircle, Target,
  Layers, ChevronUp, ChevronDown, Check
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import Avatar from './Avatar';

/**
 * Format date to 'MMM DD, YYYY' (e.g., 'May 10, 2024')
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
};

/**
 * Strip HTML tags and clean up string for description preview
 */
const cleanDescription = (raw) => {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Status badge configurations matching enterprise design
 */
const getStatusBadge = (status) => {
  const normalized = (status || 'planning').toLowerCase().replace(/\s+/g, '-');
  switch (normalized) {
    case 'in-progress':
      return {
        label: 'In Progress',
        icon: <Clock size={13} className="text-blue-500 flex-shrink-0" />,
        className: 'bg-blue-50 text-blue-700 border border-blue-200/80',
      };
    case 'completed':
      return {
        label: 'Completed',
        icon: <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />,
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
      };
    case 'on-hold':
      return {
        label: 'On Hold',
        icon: <PauseCircle size={13} className="text-purple-500 flex-shrink-0" />,
        className: 'bg-purple-50 text-purple-700 border border-purple-200/80',
      };
    case 'planning':
    default:
      return {
        label: 'Planning',
        icon: <Target size={13} className="text-amber-500 flex-shrink-0" />,
        className: 'bg-amber-50 text-amber-700 border border-amber-200/80',
      };
  }
};

/**
 * Overlapping avatar group with overflow badge and viewport-safe portal popover/tooltip
 */
const UserAvatarGroupWithPopover = memo(({
  users = [],
  type = 'manager', // 'manager' | 'member'
  emptyText = 'Unassigned',
  maxVisible = 3,
}) => {
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      const popoverHeight = Math.min(users.length * 44 + 50, 240);
      const showAbove = rect.bottom + popoverHeight + 10 > window.innerHeight && rect.top > popoverHeight + 10;
      const top = showAbove ? rect.top - popoverHeight - 6 : rect.bottom + 6;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 16));
      setCoords({ top, left });
      setHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  if (!users || users.length === 0) {
    return <span className="text-xs text-gray-400 italic">{emptyText}</span>;
  }

  const isManager = type === 'manager';
  const displayed = users.slice(0, maxVisible);
  const overflow = users.length - displayed.length;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex items-center gap-2.5 cursor-default py-1 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {isManager && users.length === 1 ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              src={users[0]?.avatar}
              name={users[0]?.name || 'Manager'}
              size="sm"
              showBadge={false}
              className="w-8 h-8 flex-shrink-0"
            />
            <div className="min-w-0">
              <p
                className="text-xs font-semibold text-gray-900 truncate leading-tight max-w-[140px]"
                title={users[0]?.name}
              >
                {users[0]?.name || 'Manager'}
              </p>
              <p className="text-[11px] text-gray-400 font-normal leading-tight">
                Project Manager
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center -space-x-2 overflow-hidden flex-shrink-0">
              {displayed.map((u, i) => (
                <div
                  key={u._id || i}
                  className="relative inline-block border-2 border-white rounded-full flex-shrink-0 shadow-xs"
                >
                  <Avatar
                    src={u?.avatar}
                    name={u?.name || (isManager ? 'Manager' : 'Member')}
                    size={isManager ? "sm" : "xs"}
                    showBadge={false}
                    className={isManager ? "w-8 h-8" : "w-7 h-7"}
                  />
                </div>
              ))}
              {overflow > 0 && (
                <div
                  className={`${
                    isManager ? 'w-8 h-8' : 'w-7 h-7'
                  } rounded-full ${
                    isManager ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                  } border-2 border-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 shadow-xs`}
                >
                  +{overflow}
                </div>
              )}
            </div>
            {isManager && (
              <div className="min-w-0">
                <p
                  className="text-xs font-semibold text-gray-900 truncate leading-tight max-w-[130px]"
                  title={users.map(u => u.name).join(', ')}
                >
                  {users.map(u => u.name).join(', ')}
                </p>
                <p className="text-[11px] text-gray-400 font-normal leading-tight">
                  {users.length} Project Managers
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {hovered && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-gray-200/90 py-2.5 px-3 min-w-[220px] max-w-[280px] pointer-events-none transition-all duration-150 animate-in fade-in-0 zoom-in-95"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1 flex items-center justify-between">
            <span>{isManager ? 'Project Managers' : 'Assigned Members'}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full ${
                isManager ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
              } text-[10px] font-bold`}
            >
              {users.length}
            </span>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
            {users.map((u, i) => (
              <div key={u._id || i} className="flex items-center gap-2.5 p-1 rounded-lg">
                <Avatar
                  src={u?.avatar}
                  name={u?.name || (isManager ? 'Manager' : 'Member')}
                  size="xs"
                  showBadge={false}
                  className="w-6 h-6 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate leading-tight">
                    {u?.name || 'Unknown'}
                  </p>
                  {u?.email && (
                    <p className="text-[10px] text-gray-400 truncate leading-tight">
                      {u.email}
                    </p>
                  )}
                </div>
                {isManager && (
                  <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    PM
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

/**
 * ProjectListTable Component
 * Renders the department projects in a sleek, enterprise table format
 * as shown in the reference design.
 */
const ProjectListTable = ({
  projects = [],
  department,
  departmentManager,
  onEdit,
  onDelete,
  onView,
  isSelectable = false,
  isSelected,
  onSelect,
  deletingProjectIds = new Set()
}) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const canEditProject = user && (user.role === 'admin' || user.role === 'manager');

  // Local column sorting state (name, startDate, endDate)
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Actions dropdown menu state
  const [activeMenuProject, setActiveMenuProject] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const activeMenuButtonRef = useRef(null);
  const menuDropdownRef = useRef(null);

  // Close actions menu on outside click or scroll
  useEffect(() => {
    const handleOutside = (e) => {
      // Don't close if clicking the toggle button
      if (activeMenuButtonRef.current && activeMenuButtonRef.current.contains(e.target)) {
        return;
      }
      // Don't close if clicking inside the menu itself (allows click events to trigger!)
      if (menuDropdownRef.current && menuDropdownRef.current.contains(e.target)) {
        return;
      }
      setActiveMenuProject(null);
    };

    const handleScroll = () => {
      setActiveMenuProject(null);
    };

    if (activeMenuProject) {
      document.addEventListener('mousedown', handleOutside);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [activeMenuProject]);

  const toggleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleOpenMenu = (e, project) => {
    e.preventDefault();
    e.stopPropagation();

    const projId = project._id || project.id;
    const currentId = activeMenuProject ? (activeMenuProject._id || activeMenuProject.id) : null;
    if (currentId && String(currentId) === String(projId)) {
      setActiveMenuProject(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 135;
    const spaceBelow = window.innerHeight - rect.bottom;
    const fitsBelow = spaceBelow >= menuHeight + 10;

    setMenuPosition({
      top: fitsBelow ? rect.bottom + 6 : Math.max(10, rect.top - menuHeight - 6),
      left: Math.max(10, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16))
    });
    activeMenuButtonRef.current = e.currentTarget;
    setActiveMenuProject(project);
  };

  const handleRowClick = (project) => {
    const projId = project._id || project.id;
    if (isSelectable && isSelected && isSelected(projId)) {
      onSelect && onSelect(projId, department?._id);
      return;
    }
    if (project.isOptimistic || String(projId).startsWith('temp-')) {
      return;
    }
    const deptId = project.department?._id || project.department || department?._id;
    if (deptId && projId) {
      const scrollContainer = document.getElementById('main-scroll-container');
      if (scrollContainer) {
        sessionStorage.setItem('home_scroll_y', scrollContainer.scrollTop.toString());
      }
      navigate(`/workflow/${deptId}/${projId}`);
    }
  };

  // Sort projects if user clicked any column header
  const sortedProjects = useMemo(() => {
    if (!sortColumn) return projects;
    return [...projects].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortColumn === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortColumn === 'startDate') {
        valA = new Date(a.startDate || a.createdAt || 0).getTime();
        valB = new Date(b.startDate || b.createdAt || 0).getTime();
      } else if (sortColumn === 'endDate') {
        valA = new Date(a.dueDate || a.endDate || 0).getTime();
        valB = new Date(b.dueDate || b.endDate || 0).getTime();
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [projects, sortColumn, sortDirection]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[960px]">
        <thead>
          <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 select-none">
            {/* Project Name */}
            <th
              className="py-3 px-4 cursor-pointer hover:text-gray-800 transition-colors"
              onClick={() => toggleSort('name')}
            >
              <div className="flex items-center gap-1.5">
                <span>Project Name</span>
                {sortColumn === 'name' ? (
                  sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />
                ) : (
                  <ArrowUpDown size={12} className="text-gray-400" />
                )}
              </div>
            </th>

            {/* Description */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Description
            </th>

            {/* Manager */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Manager
            </th>

            {/* Members */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Members
            </th>

            {/* Tasks */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Tasks
            </th>

            {/* Progress */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Progress
            </th>

            {/* Status */}
            <th className="py-3 px-4 font-semibold text-gray-500">
              Status
            </th>

            {/* Start Date */}
            <th
              className="py-3 px-4 cursor-pointer hover:text-gray-800 transition-colors whitespace-nowrap"
              onClick={() => toggleSort('startDate')}
            >
              <div className="flex items-center gap-1.5">
                <span>Start Date</span>
                {sortColumn === 'startDate' ? (
                  sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />
                ) : (
                  <ArrowUpDown size={12} className="text-gray-400" />
                )}
              </div>
            </th>

            {/* End Date */}
            <th
              className="py-3 px-4 cursor-pointer hover:text-gray-800 transition-colors whitespace-nowrap"
              onClick={() => toggleSort('endDate')}
            >
              <div className="flex items-center gap-1.5">
                <span>End Date</span>
                {sortColumn === 'endDate' ? (
                  sortDirection === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />
                ) : (
                  <ArrowUpDown size={12} className="text-gray-400" />
                )}
              </div>
            </th>

            {/* Actions */}
            <th className="py-3 px-4 text-center font-semibold text-gray-500">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {sortedProjects.map((project, index) => {
            const projId = project._id || project.id;
            const projectSelected = isSelected ? isSelected(projId) : false;
            const isDeleting = deletingProjectIds.has(projId);

            // Description preview
            const desc = cleanDescription(project.description);

            // Manager resolution: all assigned project managers
            const projectManagers = (() => {
              if (Array.isArray(project.projectManagers) && project.projectManagers.length > 0) {
                return project.projectManagers;
              }
              if (department?.managers && department.managers.length > 0) {
                const assigned = department.managers.filter(m =>
                  project.members?.some(pm => (pm?._id ? String(pm._id) : String(pm)) === String(m._id)) ||
                  project.managers?.some(pm => (pm?._id ? String(pm._id) : String(pm)) === String(m._id))
                );
                if (assigned.length > 0) return assigned;
              }
              if (Array.isArray(project.managers) && project.managers.length > 0 && typeof project.managers[0] === 'object') {
                return project.managers;
              }
              if (project.manager && typeof project.manager === 'object') {
                return [project.manager];
              }
              if (departmentManager && typeof departmentManager === 'string' && departmentManager !== 'No Manager') {
                const names = departmentManager.split(',').map(s => s.trim()).filter(Boolean);
                return names.map(name => {
                  const match = (department?.managers || []).find(m => m.name === name);
                  return match || { name, role: 'manager' };
                });
              }
              return [];
            })();

            // Members resolution: dynamically calculated unique task assignees, excluding admins/managers
            const taskMembers = (() => {
              if (Array.isArray(project.taskMembers)) {
                return project.taskMembers;
              }
              if (Array.isArray(project.assignedMembers)) {
                return project.assignedMembers;
              }
              return [];
            })();

            // Tasks calculation
            const totalTasks = project.totalCards ?? project.totalTasks ?? 0;
            const completedTasks = project.completedCards ?? project.completedTasks ?? 0;

            // Progress calculation
            const progress = typeof project.progress === 'number'
              ? project.progress
              : totalTasks > 0
                ? Math.round((completedTasks / totalTasks) * 100)
                : 0;

            const statusBadge = getStatusBadge(project.status);
            const firstLetter = (project.name || 'P').trim().charAt(0).toUpperCase();

            // Dates
            const startDateFormatted = formatDate(project.startDate || project.createdAt);
            const endDateFormatted = formatDate(project.dueDate || project.endDate);

            return (
              <tr
                key={projId || index}
                onClick={() => handleRowClick(project)}
                className={`group cursor-pointer transition-colors ${
                  projectSelected
                    ? 'bg-blue-50/70 hover:bg-blue-100/60'
                    : 'hover:bg-gray-50/70 bg-white'
                } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
              >
                {/* 1. Project Name */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    {/* Optional Selection Checkbox when active or hovered */}
                    {isSelectable && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect && onSelect(projId, department?._id);
                        }}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                          projectSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 opacity-0 group-hover:opacity-100 hover:border-blue-500'
                        }`}
                      >
                        {projectSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    )}

                    {/* Letter Avatar Badge or Cover Image */}
                    {project.coverImage?.url ? (
                      <img
                        src={project.coverImage.url}
                        alt={project.name}
                        className="w-9 h-9 rounded-xl object-cover shadow-xs border border-gray-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 font-bold text-base flex items-center justify-center flex-shrink-0 shadow-xs">
                        {firstLetter}
                      </div>
                    )}

                    {/* Name */}
                    <div className="min-w-0">
                      <span
                        className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate block max-w-[220px]"
                        title={project.name}
                      >
                        {project.name}
                      </span>
                    </div>
                  </div>
                </td>

                {/* 2. Description */}
                <td className="py-3.5 px-4 max-w-[280px]">
                  <p
                    className={`text-xs truncate ${
                      desc ? 'text-gray-500' : 'text-gray-400 italic'
                    }`}
                    title={desc || 'No description available'}
                  >
                    {desc || 'No description available'}
                  </p>
                </td>

                {/* 3. Manager */}
                <td className="py-3.5 px-4">
                  <UserAvatarGroupWithPopover
                    users={projectManagers}
                    type="manager"
                    emptyText="Unassigned"
                  />
                </td>

                {/* 4. Members */}
                <td className="py-3.5 px-4">
                  <UserAvatarGroupWithPopover
                    users={taskMembers}
                    type="member"
                    emptyText="No members assigned"
                  />
                </td>

                {/* 5. Tasks */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-medium">
                    <Layers size={13} className="text-emerald-600 flex-shrink-0" />
                    <span>{completedTasks}/{totalTasks} Tasks</span>
                  </div>
                </td>

                {/* 6. Progress */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress === 100
                            ? 'bg-emerald-500'
                            : progress > 0
                              ? 'bg-amber-500'
                              : 'bg-gray-300'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-900 ml-2.5 w-9 text-right">
                      {progress}%
                    </span>
                  </div>
                </td>

                {/* 7. Status */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.icon}
                    <span>{statusBadge.label}</span>
                  </div>
                </td>

                {/* 8. Start Date */}
                <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-600 font-medium">
                  {startDateFormatted}
                </td>

                {/* 9. End Date */}
                <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-600 font-medium">
                  {endDateFormatted}
                </td>

                {/* 10. Actions */}
                <td
                  className="py-3.5 px-4 text-center whitespace-nowrap relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => handleOpenMenu(e, project)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 border border-gray-200/70 transition-colors focus:outline-none cursor-pointer"
                    aria-label="Project actions"
                  >
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Portal Actions Menu to prevent clipping inside scrollable table */}
      {activeMenuProject &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={menuDropdownRef}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                zIndex: 99999
              }}
              className="w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const proj = activeMenuProject;
                  setActiveMenuProject(null);
                  if (proj) {
                    const projId = proj._id || proj.id;
                    if (onView) onView(projId);
                    else handleRowClick(proj);
                  }
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50/60 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Eye size={15} className="text-gray-400 group-hover:text-blue-600" />
                <span>View Details</span>
              </button>

              {canEditProject && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const proj = activeMenuProject;
                      setActiveMenuProject(null);
                      if (proj && onEdit) {
                        const deptId = department?._id || proj.department?._id || proj.department;
                        onEdit(proj, deptId);
                      }
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-gray-700 hover:text-indigo-600 hover:bg-indigo-50/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Edit size={15} className="text-gray-400" />
                    <span>Edit Project</span>
                  </button>

                  <div className="border-t border-gray-100 my-1" />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const proj = activeMenuProject;
                      setActiveMenuProject(null);
                      if (proj && onDelete) {
                        const deptId = department?._id || proj.department?._id || proj.department;
                        onDelete(proj, deptId);
                      }
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50/60 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} className="text-red-500" />
                    <span>Delete Project</span>
                  </button>
                </>
              )}
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default memo(ProjectListTable);
