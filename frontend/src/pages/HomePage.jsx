import React, { useState, useEffect, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Eye, EyeOff, Building2, FolderKanban,
  TrendingUp, Users, AlertCircle, Search, Filter,
  Grid, List as ListIcon, ChevronDown, Sparkles, User
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import { lazy, Suspense } from 'react';
const AddProjectModal = lazy(() => import('../components/AddProjectModal'));
const EditProjectModal = lazy(() => import('../components/EditProjectModal'));
const ViewProjectModal = lazy(() => import('../components/ViewProjectModal'));

const HomePage = () => {
  const { user } = useContext(AuthContext);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedMembers, setSelectedMembers] = useState({});
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState({});
  const [membersWithAssignments, setMembersWithAssignments] = useState({});
  const [projectsWithMemberAssignments, setProjectsWithMemberAssignments] = useState({});
  const statusDropdownRef = useRef(null);
  const memberDropdownRefs = useRef({});

  useEffect(() => {
    fetchDepartments();
  }, []);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setStatusDropdownOpen(false);
      }

      // Close member dropdowns when clicking outside
      Object.keys(memberDropdownRefs.current).forEach(deptId => {
        if (memberDropdownRefs.current[deptId] && !memberDropdownRefs.current[deptId].contains(event.target)) {
          setMemberDropdownOpen(prev => ({ ...prev, [deptId]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await Database.getDepartments();
      setDepartments(response.data || []);
      setError(null);

      // Fetch members with assignments for each department
      const membersPromises = response.data.map(async (dept) => {
        try {
          const membersResponse = await Database.getMembersWithAssignments(dept._id);
          return { deptId: dept._id, members: membersResponse.data || [] };
        } catch (error) {
          console.error(`Error fetching members for department ${dept._id}:`, error);
          return { deptId: dept._id, members: [] };
        }
      });

      const membersResults = await Promise.all(membersPromises);
      const membersMap = {};
      membersResults.forEach(result => {
        membersMap[result.deptId] = result.members;
      });
      setMembersWithAssignments(membersMap);

      // Fetch projects with member assignments for each department
      const projectsPromises = response.data.map(async (dept) => {
        try {
          const projectsMap = {};
          // For each member in this department, fetch their assigned projects
          for (const member of membersMap[dept._id] || []) {
            const projectsResponse = await Database.getProjectsWithMemberAssignments(dept._id, member._id);
            projectsMap[member._id] = projectsResponse.data || [];
          }
          return { deptId: dept._id, projectsMap };
        } catch (error) {
          console.error(`Error fetching projects for department ${dept._id}:`, error);
          return { deptId: dept._id, projectsMap: {} };
        }
      });

      const projectsResults = await Promise.all(projectsPromises);
      const projectsMap = {};
      projectsResults.forEach(result => {
        projectsMap[result.deptId] = result.projectsMap;
      });
      setProjectsWithMemberAssignments(projectsMap);

    } catch (err) {
      console.error('Error fetching departments:', err);
      setError('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = (departmentId) => {
    setSelectedDepartment(departmentId);
    setModalOpen(true);
  };

  const handleProjectAdded = (newProject) => {
    setDepartments(prev => prev.map(dept => {
      if (dept._id === selectedDepartment) {
        return {
          ...dept,
          projects: [...(dept.projects || []), newProject]
        };
      }
      return dept;
    }));
  };

  const handleEditProject = (project, departmentId) => {
    setSelectedProject({ ...project, departmentId });
    setEditModalOpen(true);
  };

  const handleProjectUpdated = (updatedProject) => {
    setDepartments(prev => prev.map(dept => {
      if (dept._id === selectedProject.departmentId) {
        return {
          ...dept,
          projects: dept.projects.map(project =>
            project._id === updatedProject._id ? updatedProject : project
          )
        };
      }
      return dept;
    }));
  };

  const handleDeleteProject = async (project, departmentId) => {
    if (window.confirm(`Are you sure you want to delete the project "${project.name}"?`)) {
      try {
        await Database.deleteProject(project._id);
        setDepartments(prev => prev.map(dept => {
          if (dept._id === departmentId) {
            return {
              ...dept,
              projects: dept.projects.filter(p => p._id !== project._id)
            };
          }
          return dept;
        }));
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete project. Please try again.');
      }
    }
  };

  const handleViewProject = (projectId) => {
    setSelectedProjectId(projectId);
    setViewModalOpen(true);
  };

  const toggleViewAllProjects = (departmentId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [departmentId]: !prev[departmentId]
    }));
  };

  const filterProjects = (projects, departmentId) => {
    if (!projects) return [];

    let filtered = projects;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(project =>
        project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(project =>
        project.status?.toLowerCase() === filterStatus.toLowerCase()
      );
    }

    // Member filter - now filters projects where the member has assignments
    const selectedMember = selectedMembers[departmentId];
    if (selectedMember && selectedMember !== 'all') {
      // Get projects where this member has assignments (direct or through tasks)
      const memberProjects = projectsWithMemberAssignments[departmentId]?.[selectedMember] || [];
      const memberProjectIds = new Set(memberProjects.map(p => p._id));
      filtered = filtered.filter(project => memberProjectIds.has(project._id));
    }

    return filtered;
  };

  const canAddProject = user?.role === 'admin' || user?.role === 'manager';

  const getStatusLabel = (status) => {
    const statusMap = {
      'all': 'All Status',
      'planning': 'Planning',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'on-hold': 'On Hold'
    };
    return statusMap[status] || 'All Status';
  };

  const handleStatusSelect = (status) => {
    setFilterStatus(status);
    setStatusDropdownOpen(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-gray-600 font-medium"
              >
                Loading your workspace...
              </motion.p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl p-8 max-w-md"
            >
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="text-red-600" size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Something went wrong</h3>
              <p className="text-gray-600 text-center mb-6">{error}</p>
              <button
                onClick={fetchDepartments}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
              >
                Try Again
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6 space-y-6">
          {/* Welcome Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4"
              >
                <Sparkles size={20} />
                <span className="text-sm font-medium">Welcome!</span>
              </motion.div>
              <h1 className="text-4xl font-bold mb-2">Hello, {user?.name}! 👋</h1>
              <p className="text-blue-100 text-lg">Manage your projects and collaborate with your team</p>
            </div>
          </motion.div>

          {/* Controls Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-lg p-4 border border-gray-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[300px]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Filters and View Mode */}
              <div className="flex items-center gap-3">
                {/* Status Filter */}
                <div className="relative" ref={statusDropdownRef}>
                  <div className="flex items-center justify-between pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <div className="flex items-center gap-2">
                      <Filter className="text-gray-400" size={18} />
                      <span className="text-gray-700 font-medium">{getStatusLabel(filterStatus)}</span>
                    </div>
                    <ChevronDown
                      className={`text-gray-400 transition-transform duration-200 cursor-pointer ${statusDropdownOpen ? 'rotate-180' : ''}`}
                      size={18}
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    />
                  </div>
                  <AnimatePresence>
                    {statusDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                      >
                        <div className="py-1">
                          {[
                            { value: 'all', label: 'All Status' },
                            { value: 'planning', label: 'Planning' },
                            { value: 'in-progress', label: 'In Progress' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'on-hold', label: 'On Hold' }
                          ].map((option) => (
                            <div
                              key={option.value}
                              className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                                filterStatus === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                              }`}
                              onClick={() => handleStatusSelect(option.value)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{option.label}</span>
                                {filterStatus === option.value && (
                                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* View Mode Toggle */}
                <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-200">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === 'grid'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Grid size={20} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <ListIcon size={20} />
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Departments Section */}
          {departments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Building2 size={40} className="text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No departments found</h3>
              <p className="text-gray-600 mb-6">Contact your administrator to create departments and get started.</p>
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {departments.map((department, deptIndex) => {
                const filteredProjects = filterProjects(department.projects, department._id);
                const isExpanded = expandedDepartments[department._id];
                const displayedProjects = isExpanded ? filteredProjects : filteredProjects.slice(0, 6);
                const hasMore = filteredProjects.length > 6;

                // Get members assigned to this department
                const departmentMembers = department.members || [];

                return (
                  <motion.div
                    key={department._id}
                    variants={itemVariants}
                    className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
                  >
                    {/* Department Header */}
                    <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-6 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <motion.div
                            whileHover={{ rotate: 360 }}
                            transition={{ duration: 0.5 }}
                            className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg"
                          >
                            <Building2 className="text-white" size={24} />
                          </motion.div>
                          <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                              {department.name}
                              <span className="text-sm font-normal text-gray-500">
                                ({filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'})
                              </span>
                            </h2>
                            {department.description && (
                              <p className="text-gray-600 mt-1">{department.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Member Filter Dropdown */}
                          <div className="relative" ref={(el) => (memberDropdownRefs.current[department._id] = el)}>
                            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                              <User className="text-gray-400" size={16} />
                              <span className="text-sm font-medium text-gray-700 flex-1 pointer-events-none">
                                {selectedMembers[department._id] === 'all' || !selectedMembers[department._id]
                                  ? 'All Members'
                                  : departmentMembers.find(m => m._id === selectedMembers[department._id])?.name || 'All Members'}
                              </span>
                              <ChevronDown
                                className={`text-gray-400 transition-transform duration-200 cursor-pointer ${memberDropdownOpen[department._id] ? 'rotate-180' : ''}`}
                                size={16}
                                onClick={() => setMemberDropdownOpen(prev => ({ ...prev, [department._id]: !prev[department._id] }))}
                              />
                            </div>
                            <AnimatePresence>
                              {memberDropdownOpen[department._id] && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                                >
                                  <div className="py-1">
                                    <div
                                      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                                        (selectedMembers[department._id] || 'all') === 'all' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                      }`}
                                      onClick={() => {
                                        setSelectedMembers(prev => ({ ...prev, [department._id]: 'all' }));
                                        setMemberDropdownOpen(prev => ({ ...prev, [department._id]: false }));
                                      }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">All Members</span>
                                        {(selectedMembers[department._id] || 'all') === 'all' && (
                                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                                        )}
                                      </div>
                                    </div>
                                    {(membersWithAssignments[department._id] || []).map((member) => (
                                      <div
                                        key={member._id}
                                        className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                                          selectedMembers[department._id] === member._id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                        }`}
                                        onClick={() => {
                                          setSelectedMembers(prev => ({ ...prev, [department._id]: member._id }));
                                          setMemberDropdownOpen(prev => ({ ...prev, [department._id]: false }));
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">{member.name}</span>
                                          {selectedMembers[department._id] === member._id && (
                                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          {canAddProject && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleAddProject(department._id)}
                              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
                            >
                              <Plus size={20} />
                              <span>Add Project</span>
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Projects Grid/List */}
                    <div className="p-6">
                      {filteredProjects.length > 0 ? (
                        <>
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={viewMode}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={
                                viewMode === 'grid'
                                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                                  : 'space-y-4'
                              }
                            >
                              {displayedProjects.map((project, index) => (
                                <motion.div
                                  key={project._id}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                >
                                  <ProjectCard
                                    project={project}
                                    deptId={department._id}
                                    projectId={project._id}
                                    departmentManager={department.managers?.map(manager => manager.name).join(', ') || 'No Manager'}
                                    showManager={true}
                                    onEdit={() => handleEditProject(project, department._id)}
                                    onDelete={() => handleDeleteProject(project, department._id)}
                                    onView={() => handleViewProject(project._id)}
                                    viewMode={viewMode}
                                  />
                                </motion.div>
                              ))}
                            </motion.div>
                          </AnimatePresence>

                          {/* View More Button */}
                          {hasMore && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex justify-center mt-8"
                            >
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => toggleViewAllProjects(department._id)}
                                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-gray-50 to-blue-50 text-gray-700 rounded-xl hover:from-gray-100 hover:to-blue-100 transition-all border border-gray-200 shadow-sm hover:shadow-md font-medium"
                              >
                                {isExpanded ? (
                                  <>
                                    <EyeOff size={20} />
                                    <span>Show Less</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye size={20} />
                                    <span>View All {filteredProjects.length} Projects</span>
                                  </>
                                )}
                              </motion.button>
                            </motion.div>
                          )}
                        </>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center py-16"
                        >
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FolderKanban size={32} className="text-gray-400" />
                          </div>
                          <p className="text-gray-500 text-lg">
                            {searchQuery || filterStatus !== 'all' 
                              ? 'No projects match your filters'
                              : 'No projects in this department yet'}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </main>
      </div>

      {/* Modals */}
      <Suspense fallback={<div>Loading...</div>}>
        <AddProjectModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          departmentId={selectedDepartment}
          onProjectAdded={handleProjectAdded}
        />
      </Suspense>

      <Suspense fallback={<div>Loading...</div>}>
        <EditProjectModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          project={selectedProject}
          onProjectUpdated={handleProjectUpdated}
        />
      </Suspense>

      <Suspense fallback={<div>Loading...</div>}>
        <ViewProjectModal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          projectId={selectedProjectId}
        />
      </Suspense>
    </div>
  );
};

export default HomePage;