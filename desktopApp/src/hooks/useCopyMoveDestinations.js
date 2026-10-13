import { useState, useCallback, useRef, useEffect } from 'react';
import Database from '../services/database';

/**
 * Custom hook for managing copy/move destination cascading selection.
 * Handles department → project → list cascade with caching and loading states.
 *
 * @param {Object} options
 * @param {string} options.currentDepartmentId - Current card's department
 * @param {string} options.currentProjectId - Current card's project (board)
 * @param {string} options.currentListId - Current card's list
 * @returns {Object} Destination state and handlers
 */
const useCopyMoveDestinations = ({ currentDepartmentId, currentProjectId, currentListId } = {}) => {
  // Selection state
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(currentDepartmentId || '');
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId || '');
  const [selectedListId, setSelectedListId] = useState(currentListId || '');

  // Data state
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [lists, setLists] = useState([]);
  const [recentDestinations, setRecentDestinations] = useState([]);

  // Loading state
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Caches to avoid redundant fetches
  const projectsCache = useRef({});
  const listsCache = useRef({});

  // Load departments on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingDepartments(true);
      try {
        const res = await Database.getCopyMoveDepartments();
        if (!cancelled) setDepartments(res?.data || []);
      } catch (err) {
        console.error('Failed to load departments:', err);
      } finally {
        if (!cancelled) setLoadingDepartments(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load recent destinations on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingRecent(true);
      try {
        const res = await Database.getRecentDestinations();
        if (!cancelled) setRecentDestinations(res?.data || []);
      } catch (err) {
        console.error('Failed to load recent destinations:', err);
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load projects when department changes
  const loadProjects = useCallback(async (departmentId) => {
    if (!departmentId) {
      setProjects([]);
      return;
    }
    // Check cache
    if (projectsCache.current[departmentId]) {
      setProjects(projectsCache.current[departmentId]);
      return;
    }
    setLoadingProjects(true);
    try {
      const res = await Database.getCopyMoveProjects(departmentId);
      const result = res?.data || [];
      projectsCache.current[departmentId] = result;
      setProjects(result);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // Load lists when project changes
  const loadLists = useCallback(async (boardId) => {
    if (!boardId) {
      setLists([]);
      return;
    }
    // Check cache
    if (listsCache.current[boardId]) {
      setLists(listsCache.current[boardId]);
      return;
    }
    setLoadingLists(true);
    try {
      const res = await Database.getCopyMoveLists(boardId);
      const result = res?.data || [];
      listsCache.current[boardId] = result;
      setLists(result);
    } catch (err) {
      console.error('Failed to load lists:', err);
      setLists([]);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  // Department selection handler — cascades reset for project and list
  const selectDepartment = useCallback((departmentId) => {
    setSelectedDepartmentId(departmentId);
    setSelectedProjectId('');
    setSelectedListId('');
    setLists([]);
    loadProjects(departmentId);
  }, [loadProjects]);

  // Project selection handler — cascades reset for list
  const selectProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedListId('');
    loadLists(projectId);
  }, [loadLists]);

  // List selection handler
  const selectList = useCallback((listId) => {
    setSelectedListId(listId);
  }, []);

  // Apply a recent destination — sets all three selectors at once
  const applyRecentDestination = useCallback((dest) => {
    setSelectedDepartmentId(dest.departmentId);
    setSelectedProjectId(dest.projectId);
    setSelectedListId(dest.listId);
    // Load projects and lists for this selection
    loadProjects(dest.departmentId);
    loadLists(dest.projectId);
  }, [loadProjects, loadLists]);

  // Pre-load current location on mount
  useEffect(() => {
    if (currentDepartmentId) {
      loadProjects(currentDepartmentId);
    }
    if (currentProjectId) {
      loadLists(currentProjectId);
    }
  }, [currentDepartmentId, currentProjectId, loadProjects, loadLists]);

  // Determine if the destination is the same as current location
  const isSameLocation = selectedDepartmentId === currentDepartmentId
    && selectedProjectId === currentProjectId
    && selectedListId === currentListId;

  // Determine if destination is cross-board (different project)
  const isCrossBoard = selectedProjectId && selectedProjectId !== currentProjectId;

  // Determine if all selections are made
  const isDestinationComplete = !!(selectedDepartmentId && selectedProjectId && selectedListId);

  // Clear caches (useful if user wants fresh data)
  const clearCaches = useCallback(() => {
    projectsCache.current = {};
    listsCache.current = {};
  }, []);

  return {
    // Selection state
    selectedDepartmentId,
    selectedProjectId,
    selectedListId,

    // Data
    departments,
    projects,
    lists,
    recentDestinations,

    // Loading
    loadingDepartments,
    loadingProjects,
    loadingLists,
    loadingRecent,
    loading: loadingDepartments || loadingProjects || loadingLists,

    // Handlers
    selectDepartment,
    selectProject,
    selectList,
    applyRecentDestination,
    clearCaches,

    // Computed
    isSameLocation,
    isCrossBoard,
    isDestinationComplete,
  };
};

export default useCopyMoveDestinations;
