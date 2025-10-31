import React, { useState, useEffect, useContext, useMemo, Suspense, memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FolderKanban, TrendingUp, Users,
  Clock, CheckCircle2, AlertCircle, Filter, Search,
  Calendar, BarChart3, ArrowUpRight, Plus, RefreshCw
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import TeamContext from '../context/TeamContext';
import { useDashboardData } from '../hooks/useProjects';
import { useDebounce } from '../hooks/useDebounce';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import { lazy } from 'react';
const ViewProjectModal = lazy(() => import('../components/ViewProjectModal'));
import EditProjectModal from '../components/EditProjectModal';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { currentTeam, currentDepartment, departments, loadDepartments } = useContext(TeamContext);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Use React Query for optimized data fetching
  const { data: dashboardData, isLoading, refetch } = useDashboardData();

  useEffect(() => {
    loadDepartments();
  }, []);

  const projects = dashboardData?.data?.projects || [];
  const loading = isLoading;

  const handleViewProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setViewModalOpen(true);
  }, []);

  const handleEditProject = useCallback((project) => {
    setSelectedProject(project);
    setEditModalOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesDept = !selectedDepartment || p.departmentId === selectedDepartment;
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesSearch = !debouncedSearchQuery ||
        p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      return matchesDept && matchesStatus && matchesSearch;
    });
  }, [projects, selectedDepartment, statusFilter, debouncedSearchQuery]);

  const stats = useMemo(() => [
    {
      title: 'Total Projects',
      value: filteredProjects.length,
      icon: FolderKanban,
      color: 'bg-blue-500',
      change: '+12%',
      trend: 'up'
    },
    {
      title: 'Completed',
      value: filteredProjects.filter(p => p.status === 'Completed').length,
      icon: CheckCircle2,
      color: 'bg-green-500',
      change: '+8%',
      trend: 'up'
    },
    {
      title: 'In Progress',
      value: filteredProjects.filter(p => p.status === 'In Progress').length,
      icon: Clock,
      color: 'bg-yellow-500',
      change: '+5%',
      trend: 'up'
    },
    {
      title: 'Team Members',
      value: currentTeam?.members?.length || 0,
      icon: Users,
      color: 'bg-purple-500',
      change: '+3',
      trend: 'up'
    }
  ], [filteredProjects, currentTeam?.members?.length]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
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
      <div className="flex-1 ml-64">
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
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </motion.button>
            </div>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-gray-100"
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
              </motion.div>
            ))}
          </div>

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
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Status</option>
                <option value="Planning">Planning</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </motion.div>

          {/* Projects Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FolderKanban size={24} className="text-blue-600" />
                Projects ({filteredProjects.length})
              </h2>
            </div>

            {filteredProjects.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <FolderKanban size={64} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg mb-2">No projects found</p>
                <p className="text-gray-400 mb-6">Create your first project to get started</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {filteredProjects.map((project, index) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ y: -5 }}
                    >
                      <ProjectCard
                        project={project}
                        onView={() => handleViewProject(project.id)}
                        onEdit={() => handleEditProject(project)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </main>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <ViewProjectModal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          projectId={selectedProjectId}
        />
      </Suspense>

      <EditProjectModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        project={selectedProject}
        onProjectUpdated={() => refetch()}
      />
    </div>
  );
});

export default Dashboard;
