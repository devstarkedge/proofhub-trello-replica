import React, { useState, useEffect, useContext, useMemo, Suspense, memo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, FolderKanban, Users,
  Clock, CheckCircle2, Search,
  ArrowUpRight, Bell, AlertCircle, Calendar, ChevronRight
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import DepartmentContext from '../context/DepartmentContext';
import { useDashboardData } from '../hooks/useProjects';
import { useDebounce } from '../hooks/useDebounce';
import Database from '../services/database';
import useWorkflowStore from '../store/workflowStore';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import { lazy } from 'react';
const ViewProjectModal = lazy(() => import('../components/ViewProjectModal'));
const EditProjectModal = lazy(() => import('../components/EditProjectModal'));

// Memoized StatCard component for better performance
const StatCard = memo(({ stat, index }) => (
  <div
    className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-gray-100 hover:-translate-y-1 duration-200"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    <div className="flex items-center justify-between mb-4">
      <div className={`${stat.color} p-3 rounded-lg`}>
        <stat.icon className="text-white" size={24} />
      </div>
      <div className="flex items-center gap-1 text-sm text-green-600">
        <ArrowUpRight size={16} />
        <span>{stat.change}</span>
      </div>
    </div>
    <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
    <p className="text-gray-600 text-sm mt-1">{stat.title}</p>
  </div>
));
StatCard.displayName = 'StatCard';

// Memoized ProjectCardWrapper to reduce re-renders
const ProjectCardWrapper = memo(({ project, onView, onEdit, onDelete, onHover }) => (
  <div className="animate-fade-in" onMouseEnter={() => onHover && onHover(project.id)}>
    <ProjectCard
      project={project}
      departmentName={project.department}
      showManager={false}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  </div>
));
ProjectCardWrapper.displayName = 'ProjectCardWrapper';

// Reminder Widget Component
const ReminderWidget = memo(({ reminders, loading }) => {
  const getStatusColor = (reminder) => {
    const scheduledDate = new Date(reminder.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduledDate - now) / (1000 * 60 * 60);
    
    if (reminder.status === 'completed') return 'border-l-green-500 bg-green-50';
    if (hoursUntil < 0) return 'border-l-red-500 bg-red-50';
    if (hoursUntil <= 24) return 'border-l-orange-500 bg-orange-50';
    return 'border-l-blue-500 bg-blue-50';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-100 rounded"></div>
            <div className="h-16 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Bell className="text-indigo-600" size={20} />
          Upcoming Reminders
        </h3>
        <Link
          to="/reminders"
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          View All
          <ChevronRight size={16} />
        </Link>
      </div>

      {reminders.length === 0 ? (
        <div className="text-center py-6">
          <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No upcoming reminders</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.slice(0, 4).map((reminder) => (
            <motion.div
              key={reminder._id}
              whileHover={{ x: 4 }}
              className={`p-3 rounded-lg border-l-4 transition-colors ${getStatusColor(reminder)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {reminder.project?.name || 'Unknown Project'}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {reminder.client?.name || 'No client'}
                  </p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(reminder.scheduledDate)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
});
ReminderWidget.displayName = 'ReminderWidget';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { currentTeam, currentDepartment, departments, loadDepartments, setCurrentDepartment } = useContext(DepartmentContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const { prefetchWorkflow } = useWorkflowStore();
  
  // Reminders state
  const [upcomingReminders, setUpcomingReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  
  // Check if user can view reminders
  const canViewReminders = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager';

  // Check if user can view department filter (admin only)
  // Note: Department visibility is controlled by the backend based on user role:
  // - Admin users see ALL departments and have access to the department filter
  // - Non-admin users see ONLY departments they're assigned to (no filter needed)
  const canViewDepartmentFilter = user?.role?.toLowerCase() === 'admin';

  // Use React Query for optimized data fetching
  const { data: dashboardData, isLoading, refetch } = useDashboardData();

  useEffect(() => {
    if (departments.length === 0) {
      loadDepartments();
    }
  }, [departments, loadDepartments]);

  // Fetch upcoming reminders for widget
  useEffect(() => {
    const fetchReminders = async () => {
      if (!canViewReminders) {
        setRemindersLoading(false);
        return;
      }
      
      try {
        setRemindersLoading(true);
        const response = await Database.getAllReminders({ status: 'pending' });
        // Sort by scheduled date and take upcoming ones
        const sorted = (response.data || [])
          .filter(r => r.status !== 'completed' && r.status !== 'cancelled')
          .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
        setUpcomingReminders(sorted);
      } catch (error) {
        console.error('Error fetching reminders:', error);
      } finally {
        setRemindersLoading(false);
      }
    };
    
    fetchReminders();
  }, [canViewReminders]);

  const projects = dashboardData?.data?.projects || [];
  const loading = isLoading;

  const handleViewProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setViewModalOpen(true);
  }, []);

  const handleEditProject = useCallback((project) => {
    // Normalize the project object to ensure consistent id field
    const normalizedProject = {
      ...project,
      id: project.id || project._id,
      _id: project._id || project.id
    };
    setSelectedProject(normalizedProject);
    setEditModalOpen(true);
  }, []);

  const handleDeleteProject = useCallback(async (projectId) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await Database.deleteProject(projectId);
        refetch();
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete project. Please try again.');
      }
    }
  }, [refetch]);



  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesDept = !currentDepartment || currentDepartment._id === 'all' || p.departmentId === currentDepartment._id;
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesSearch = !debouncedSearchQuery ||
        p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      return matchesDept && matchesStatus && matchesSearch;
    });
  }, [projects, currentDepartment, statusFilter, debouncedSearchQuery]);

  const teamMembersCount = useMemo(() => {
    if (!currentDepartment || currentDepartment._id === 'all') {
      // All departments - sum all department members
      return departments.reduce((total, dept) => total + (dept.members?.length || 0), 0);
    } else {
      // Specific department - get members of selected department
      const selectedDept = departments.find(dept => dept._id === currentDepartment._id);
      return selectedDept?.members?.length || 0;
    }
  }, [currentDepartment, departments]);

  // Optimized stats calculation - single pass through data
  const { stats, projectCounts } = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    
    for (const p of filteredProjects) {
      if (p.status === 'Completed') completed++;
      else if (p.status === 'In Progress') inProgress++;
    }
    
    const counts = { total: filteredProjects.length, completed, inProgress };
    
    return {
      projectCounts: counts,
      stats: [
        {
          title: 'Total Projects',
          value: counts.total,
          icon: FolderKanban,
          color: 'bg-blue-500',
          change: '+12%',
          trend: 'up'
        },
        {
          title: 'Completed',
          value: counts.completed,
          icon: CheckCircle2,
          color: 'bg-green-500',
          change: '+8%',
          trend: 'up'
        },
        {
          title: 'In Progress',
          value: counts.inProgress,
          icon: Clock,
          color: 'bg-yellow-500',
          change: '+5%',
          trend: 'up'
        },
        {
          title: 'Team Members',
          value: teamMembersCount,
          icon: Users,
          color: 'bg-purple-500',
          change: '+3',
          trend: 'up'
        }
      ]
    };
  }, [filteredProjects, teamMembersCount]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Sidebar />
        <div className="flex-1 lg:ml-64">
          <Header />
          <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar />
      <div className="flex-1 lg:ml-64">
        <Header />
        <main className="p-6 space-y-6">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <LayoutDashboard className="text-blue-600" size={32} />
                Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Welcome, {user?.name}! 👋</p>
            </div>
            <div className="flex items-center gap-3">
            </div>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <StatCard key={stat.title} stat={stat} index={index} />
            ))}
          </div>

          {/* Reminders Widget - Only for Admin/Manager */}
          {canViewReminders && upcomingReminders.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {/* Placeholder for other widgets or leave empty */}
              </div>
              <ReminderWidget reminders={upcomingReminders} loading={remindersLoading} />
            </div>
          )}

          {/* Filters & Search */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
          >
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {canViewDepartmentFilter && (
                <select
                  value={currentDepartment?._id || 'all'}
                  onChange={(e) => {
                    const selected = departments.find(d => d._id === e.target.value);
                    setCurrentDepartment(selected);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {departments.map(dept => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              )}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Status</option>
                <option value="Planning">Planning</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </motion.div>

          {/* Projects Grid */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FolderKanban size={24} className="text-blue-600" />
                Projects ({filteredProjects.length})
              </h2>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <FolderKanban size={64} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg mb-2">No projects found</p>
                <p className="text-gray-400 mb-6">Create your first project to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <ProjectCardWrapper
                    key={project.id}
                    project={project}
                    onView={() => handleViewProject(project.id)}
                    onEdit={() => handleEditProject(project)}
                    onDelete={() => handleDeleteProject(project.id)}
                    onHover={prefetchWorkflow}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <ViewProjectModal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          projectId={selectedProjectId}
        />
      </Suspense>

      <Suspense fallback={<div>Loading...</div>}>
        <EditProjectModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          project={selectedProject}
          onProjectUpdated={() => refetch()}
        />
      </Suspense>
    </div>
  );
});

export default Dashboard;
