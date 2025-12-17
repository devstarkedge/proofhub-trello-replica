import React, { useState, useEffect, useContext, useRef, useMemo, useCallback, memo, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Eye, EyeOff, Building2, FolderKanban,
  TrendingUp, Users, AlertCircle, Search, Filter,
  Grid, List as ListIcon, ChevronDown, Sparkles, User, Shield
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import HomePageSkeleton from '../components/LoadingSkeleton';
import NeonSparkText from '../components/NeonSparkText';
import { useDebounce } from '../hooks/useDebounce';
import useProjectStore from '../store/projectStore';
import { lazy, Suspense } from 'react';

// Lazy load modals for better initial load
const AddProjectModal = lazy(() => import('../components/AddProjectModal'));
const EditProjectModal = lazy(() => import('../components/EditProjectModal'));
const ViewProjectModal = lazy(() => import('../components/ViewProjectModal'));
import DeletePopup from '../components/ui/DeletePopup';

// Memoized modal loading fallback
const ModalLoadingFallback = memo(() => (
  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-white rounded-xl p-6 shadow-xl">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="text-gray-600 mt-3 text-sm">Loading...</p>
    </div>
  </div>
));
ModalLoadingFallback.displayName = 'ModalLoadingFallback';

const HomePage = () => {
  // Store state
  const { 
    departments, 
    membersWithAssignments, 
    projectsWithMemberAssignments, 
    loading, 
    error,
    fetchDepartments,
    projectAdded,
    projectUpdated,
    projectDeleted
  } = useProjectStore(); // Using the new store

  const { user } = useContext(AuthContext);
  // Removed local useState for departments, loading, error, members assignments
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [viewMode, setViewMode] = useState('grid');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedMembers, setSelectedMembers] = useState({});
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState({});
  const [memberListExpanded, setMemberListExpanded] = useState({});
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  
  const statusDropdownRef = useRef(null);
  const memberDropdownRefs = useRef({});
  const memberListRefs = useRef({});

  // Fetch departments on mount using store
  // Note: Department visibility is controlled by the backend based on user role:
  // - Admin users see ALL departments
  // - Non-admin users see ONLY departments they're assigned to
  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // Handle outside click to close dropdown - optimized with useCallback
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

  // Removed local fetchDepartments function as it is now in the store

  const handleAddProject = useCallback((departmentId) => {
    setSelectedDepartment(departmentId);
    setModalOpen(true);
  }, []);

  // Use store action for optimistic update
  const handleProjectAdded = useCallback((newProject, tempId = null, revert = false) => {
    if (revert) {
        // Handle revert if needed - for now fetchDepartments is safest on error or specific rollback logic
        // But since we are using store, we can just fetch fresh.
        fetchDepartments(true);
    } else if (newProject) {
        // Optimistic add or replace
        projectAdded(selectedDepartment, newProject, tempId);
    }
  }, [selectedDepartment, projectAdded, fetchDepartments]);

  const handleEditProject = useCallback((project, departmentId) => {
    setSelectedProject({ ...project, departmentId });
    setEditModalOpen(true);
  }, []);

  const handleProjectUpdated = useCallback((updatedProject) => {
    projectUpdated(updatedProject);
  }, [projectUpdated]);

  const handleDeleteProject = useCallback((project, departmentId) => {
    setProjectToDelete({ project, departmentId });
    setShowDeletePopup(true);
  }, []);

  const confirmDeleteProject = useCallback(async () => {
    if (!projectToDelete) return;
    const { project, departmentId } = projectToDelete;

    try {
        // Optimistic delete
        projectDeleted(departmentId, project._id);
        await Database.deleteProject(project._id);
        setShowDeletePopup(false);
        setProjectToDelete(null);
    } catch (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete project. Please try again.');
        // Revert by fetching
        fetchDepartments(true);
        setShowDeletePopup(false);
    }
  }, [projectToDelete, projectDeleted, fetchDepartments]);

  const handleViewProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setViewModalOpen(true);
  }, []);

  const toggleViewAllProjects = useCallback((departmentId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [departmentId]: !prev[departmentId]
    }));
  }, []);

  // Optimized search handler with debounce effect
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  const filterProjects = useCallback((projects, departmentId) => {
    if (!projects) return [];

    let filtered = projects;

    // Search filter - use debounced value
    if (debouncedSearchQuery) {
      filtered = filtered.filter(project =>
        project.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
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
  }, [debouncedSearchQuery, filterStatus, selectedMembers, projectsWithMemberAssignments]);

  const canAddProject = useMemo(() => user?.role === 'admin' || user?.role === 'manager', [user?.role]);

  const getStatusLabel = useCallback((status) => {
    const statusMap = {
      'all': 'All Status',
      'planning': 'Planning',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'on-hold': 'On Hold'
    };
    return statusMap[status] || 'All Status';
  }, []);

  const handleStatusSelect = useCallback((status) => {
    setFilterStatus(status);
    setStatusDropdownOpen(false);
  }, []);
  
  // ref for the hand emoji to trigger animations
  const handRef = useRef(null);

  const triggerShake = useCallback((ms) => {
    const el = handRef.current;
    if (!el) return;
    // restart animation by removing and re-adding class
    el.classList.remove('hand-shake');
    // ensure duration is updated
    el.style.animationDuration = `${ms}ms`;
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add('hand-shake');
    // clear after duration
    clearTimeout(el._shakeTimeout);
    el._shakeTimeout = setTimeout(() => {
      el.classList.remove('hand-shake');
      el.style.animationDuration = '';
    }, ms);
  }, []);

  // On mount: shake for 5 seconds
  useEffect(() => {
    // small delay so entrance animations don't conflict
    const t = setTimeout(() => triggerShake(5000), 300);
    return () => clearTimeout(t);
  }, [triggerShake]);

  if (loading) {
    return <HomePageSkeleton />;
  }

    // Simplified error handling - rely on store state or toast if needed
    // But currently using error state from store if we wanted to show full page error
    // check if we have data to show even if error
    
    // Only show full page error if we have NO data.
    if (error && departments.length === 0) {
       return (
         <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
            <Sidebar />
            <div className="flex-1 lg:ml-64">
               <Header />
               <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                  <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="text-red-600" size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Something went wrong</h3>
                     <p className="text-gray-600 text-center mb-6">{error}</p>
                     <button
                        onClick={() => fetchDepartments(true)}
                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
                     >
                        Try Again
                     </button>
                  </div>
               </div>
            </div>
         </div>
       );
    }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 lg:ml-64">
        <Header />
        <main className="p-6 space-y-6">
          {/* Welcome Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4 animate-in zoom-in duration-300 delay-200">
                <Sparkles size={20} />
                <span className="text-sm font-medium">Welcome!</span>
              </div>
              <h1 className="text-4xl font-bold mb-2 animate-in fade-in slide-in-from-left-4 duration-500 delay-300">
                Hello, <NeonSparkText text={user?.name || 'User'} className="text-4xl" />!{' '}
                <span
                  ref={handRef}
                  className="inline-block hand-emoji"
                  onMouseEnter={() => triggerShake(3000)}
                >
                  👋
                </span>
              </h1>
              <p className="text-blue-100 text-lg animate-in fade-in duration-500 delay-500">Manage your projects and collaborate with your team</p>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[300px]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={handleSearchChange}
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
          </div>

          {/* Departments Section */}
          {departments.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Building2 size={40} className="text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No departments found</h3>
              <p className="text-gray-600 mb-6">Contact your administrator to create departments and get started.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500 delay-400">
              {departments.map((department, deptIndex) => {
                const filteredProjects = filterProjects(department.projects, department._id);
                const isExpanded = expandedDepartments[department._id];
                const displayedProjects = isExpanded ? filteredProjects : filteredProjects.slice(0, 6);
                const hasMore = filteredProjects.length > 6;

                // Get members assigned to this department
                const departmentMembers = department.members || [];

                return (
                  <div
                    key={department._id}
                    className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
                    style={{ animationDelay: `${deptIndex * 100}ms` }}
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
                          {/* Manager Avatars */}
                          {department.managers && department.managers.length > 0 && (
                            <div className="flex items-center gap-2 ml-4">
                              <Shield size={20} className="text-gray-500" />
                              <div className="flex -space-x-2">
                                {department.managers.slice(0, 3).map((manager, index) => (
                                  <div
                                    key={manager._id}
                                    className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                                    title={manager.name}
                                  >
                                    <span className="text-xs font-semibold text-white">
                                      {manager.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                ))}
                                {department.managers.length > 3 && (
                                  <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    <span className="text-xs font-semibold text-white">
                                      +{department.managers.length - 3}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Member Avatars */}
                          <div className="relative">
                            <div
                              className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-all"
                              onClick={() => setMemberListExpanded(prev => ({ ...prev, [department._id]: !prev[department._id] }))}
                            >
                              <div className="flex -space-x-2">
                                {(membersWithAssignments[department._id] || []).slice(0, 5).map((member, index) => (
                                  <div
                                    key={member._id}
                                    className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                                    title={member.name}
                                  >
                                    <span className="text-xs font-semibold text-white">
                                      {member.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                ))}
                                {(membersWithAssignments[department._id] || []).length > 5 && (
                                  <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    <span className="text-xs font-semibold text-white">
                                      +{(membersWithAssignments[department._id] || []).length - 5}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ChevronDown
                                className={`text-gray-400 transition-transform duration-200 ${memberListExpanded[department._id] ? 'rotate-180' : ''}`}
                                size={16}
                              />
                            </div>
                            {/* Expandable Member List */}
                            <AnimatePresence>
                              {memberListExpanded[department._id] && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden min-w-[200px]"
                                >
                                  <div className="py-2">
                                    <div
                                      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-3 ${
                                        (selectedMembers[department._id] || 'all') === 'all' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                      }`}
                                      onClick={() => {
                                        setSelectedMembers(prev => ({ ...prev, [department._id]: 'all' }));
                                        setMemberListExpanded(prev => ({ ...prev, [department._id]: false }));
                                      }}
                                    >
                                      <Users size={16} />
                                      <span className="font-medium">All Members</span>
                                      {(selectedMembers[department._id] || 'all') === 'all' && (
                                        <div className="w-2 h-2 bg-blue-600 rounded-full ml-auto"></div>
                                      )}
                                    </div>
                                    {(membersWithAssignments[department._id] || []).map((member) => (
                                      <div
                                        key={member._id}
                                        className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-3 ${
                                          selectedMembers[department._id] === member._id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                        }`}
                                        onClick={() => {
                                          setSelectedMembers(prev => ({ ...prev, [department._id]: member._id }));
                                          setMemberListExpanded(prev => ({ ...prev, [department._id]: false }));
                                        }}
                                      >
                                        <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                                          <span className="text-xs font-semibold text-white">
                                            {member.name.charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                        <span className="font-medium">{member.name}</span>
                                        {selectedMembers[department._id] === member._id && (
                                          <div className="w-2 h-2 bg-blue-600 rounded-full ml-auto"></div>
                                        )}
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
                                <div
                                  key={project._id}
                                  className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                                  style={{ animationDelay: `${index * 50}ms` }}
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
                                </div>
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
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Modals - Render only when open for better performance */}
      {modalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <AddProjectModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            departmentId={selectedDepartment}
            onProjectAdded={handleProjectAdded}
          />
        </Suspense>
      )}

      {editModalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <EditProjectModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            project={selectedProject}
            onProjectUpdated={handleProjectUpdated}
          />
        </Suspense>
      )}

      {viewModalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <ViewProjectModal
            isOpen={viewModalOpen}
            onClose={() => setViewModalOpen(false)}
            projectId={selectedProjectId}
          />
        </Suspense>
      )}

      <DeletePopup
        isOpen={showDeletePopup}
        onCancel={() => {
          setShowDeletePopup(false);
          setProjectToDelete(null);
        }}
        onConfirm={confirmDeleteProject}
        itemType="project"
      />
    </div>
  );
};

export default memo(HomePage);