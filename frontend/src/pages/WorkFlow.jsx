import React, { useState, useEffect, useContext, Suspense, memo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Filter, Search, Users, Calendar, Loader2, Pencil, Shield, User, Crown, RefreshCw, Archive, Trash2 } from 'lucide-react';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import { lazy } from 'react';
const EditProjectModal = lazy(() => import('../components/EditProjectModal'));
import DepartmentContext from '../context/DepartmentContext';
import socketService from '../services/socket';
import AuthContext from '../context/AuthContext';
import useWorkflowStore from '../store/workflowStore';
import useModalHierarchyStore from '../store/modalHierarchyStore';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu';
import HierarchyModalStack from '../components/hierarchy/HierarchyModalStack';
import { WorkflowSkeleton } from '../components/LoadingSkeleton';
import { toast } from 'react-toastify';
import AllRecurringTasksPage from './AllRecurringTasksPage';
import Avatar from '../components/Avatar';

const WorkFlow = memo(() => {
  const { deptId, projectId, taskId, subtaskId, nenoId } = useParams();
  const navigate = useNavigate();
  const { currentTeam, loading: teamLoading } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);
  
  // Track previous projectId to detect changes
  const prevProjectIdRef = useRef(projectId);

  // Use workflow store
  const {
    board,
    lists,
    cardsByList,
    loading,
    error,
    currentProjectId,
    initializeWorkflow,
    clearWorkflow,
    updateBoard,
    addCard,
    deleteCard,
    updateCard,
    moveCard,
    addList,
    deleteList,
    updateListColor,
    updateListTitle,
    moveList,
    getCard,
    updateCardRecurrence
  } = useWorkflowStore();

  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [fullProjectData, setFullProjectData] = useState(null);
  const [shareAutoOpened, setShareAutoOpened] = useState(false);
  const [showRecurringPage, setShowRecurringPage] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCardsByList, setArchivedCardsByList] = useState({});
  const [loadingArchived, setLoadingArchived] = useState(false);
  const shareKey = `${taskId || ''}-${subtaskId || ''}-${nenoId || ''}`;
  const modalStack = useModalHierarchyStore((state) => state.stack);
  const openHierarchyModal = useModalHierarchyStore((state) => state.openModalByType);
  const closeHierarchy = useModalHierarchyStore((state) => state.closeAll);
  const closeHierarchyToDepth = useModalHierarchyStore((state) => state.closeToDepth);
  const updateHierarchyLabel = useModalHierarchyStore((state) => state.updateItemLabel);
  const setHierarchyProject = useModalHierarchyStore((state) => state.setProject);

  // Reset local state when projectId changes
  useEffect(() => {
    // We rely on store's initializeWorkflow to handle data loading/clearing.
    // However, we MUST reset local UI state (filters, etc.) when switching projects.
    if (prevProjectIdRef.current && prevProjectIdRef.current !== projectId) {
       setStatusFilter('All');
       setPriorityFilter('All');
       setSearchQuery('');
       setDebouncedSearch('');
       setShowFilters(false);
       setEditModalOpen(false);
       setSelectedProject(null);
       setFullProjectData(null);
       setShareAutoOpened(false);
       setShowRecurringPage(false);
       setShowArchived(false);
       closeHierarchy();
    }
    prevProjectIdRef.current = projectId;
  }, [projectId, closeHierarchy]);

  useEffect(() => {
    if (projectId && !teamLoading) {
      loadData();
    }
  }, [deptId, projectId, teamLoading]);

  useEffect(() => {
    if (user && board) {
      socketService.connect(user.id);
      socketService.joinBoard(board._id);

      return () => {
        socketService.leaveBoard(board._id);
      };
    }
  }, [user, board]);

  // Listen for real-time recurrence updates to show/hide recurring label on cards
  useEffect(() => {
    if (!board) return;

    const handleRecurrenceCreated = (event) => {
      const { cardId } = event.detail || {};
      if (cardId) {
        updateCardRecurrence(cardId, true);
      }
    };

    const handleRecurrenceStopped = (event) => {
      const { cardId } = event.detail || {};
      if (cardId) {
        updateCardRecurrence(cardId, false);
      }
    };

    const handleRecurrenceUpdated = (event) => {
      const { cardId, recurrence } = event.detail || {};
      if (cardId && recurrence) {
        // If recurrence was deactivated via update, hide the label
        updateCardRecurrence(cardId, recurrence.isActive !== false);
      }
    };

    const handleCardCoverUpdated = (event) => {
      const { cardId, coverImage, coverAttachment } = event.detail || {};
      // Use coverImage if provided, fallback to coverAttachment (backend sends coverAttachment)
      const coverData = coverImage || coverAttachment;
      // Only update if we have a valid cardId AND valid cover data (or explicitly null to remove)
      if (cardId && coverData !== undefined) {
         updateCard(cardId, { 
           coverImage: coverData,
           _coverImagePopulated: typeof coverData === 'object' ? coverData : undefined
         });
      }
    };

    window.addEventListener('socket-recurrence-created', handleRecurrenceCreated);
    window.addEventListener('socket-recurrence-stopped', handleRecurrenceStopped);
    window.addEventListener('socket-recurrence-updated', handleRecurrenceUpdated);
    window.addEventListener('socket-card-cover-updated', handleCardCoverUpdated);

    return () => {
      window.removeEventListener('socket-recurrence-created', handleRecurrenceCreated);
      window.removeEventListener('socket-recurrence-stopped', handleRecurrenceStopped);
      window.removeEventListener('socket-recurrence-updated', handleRecurrenceUpdated);
      window.removeEventListener('socket-card-cover-updated', handleCardCoverUpdated);
    };
  }, [board, updateCardRecurrence]);

useEffect(() => {
  if (board) {
    setHierarchyProject(board);
  }
}, [board, setHierarchyProject]);

// Listen for card restore events from CardDetailModal for instant UI sync
useEffect(() => {
  const handleCardRestoredFromModal = (event) => {
    const { cardId, card } = event.detail || {};
    if (!cardId || !card) return;
    
    const listId = typeof card.list === 'object' ? card.list._id : card.list;
    if (!listId) return;
    
    // 1. Optimistic Update: Add to active workflow immediately
    useWorkflowStore.getState().restoreCardOptimistic(card);
    
    // 2. Optimistic Update: Remove from archived view immediately
    setArchivedCardsByList(prev => ({
      ...prev,
      [listId]: (prev[listId] || []).filter(c => c._id !== cardId)
    }));
  };
  
  const handleCardRestoreFailed = (event) => {
    const { cardId, card } = event.detail || {};
    if (!cardId || !card) return;
    
    const listId = typeof card.list === 'object' ? card.list._id : card.list;
    if (!listId) return;
    
    // Rollback: Remove from active workflow
    useWorkflowStore.getState().restoreCardRollback(cardId, listId);
    
    // Rollback: Add back to archived view
    setArchivedCardsByList(prev => ({
      ...prev,
      [listId]: [...(prev[listId] || []), card]
    }));
  };
  
  window.addEventListener('card-restored-from-modal', handleCardRestoredFromModal);
  window.addEventListener('card-restore-failed', handleCardRestoreFailed);
  
  return () => {
    window.removeEventListener('card-restored-from-modal', handleCardRestoredFromModal);
    window.removeEventListener('card-restore-failed', handleCardRestoreFailed);
  };
}, []);

// Load archived cards when archive view is toggled
useEffect(() => {
  if (showArchived && board && lists.length > 0) {
    const loadArchivedCards = async () => {
      setLoadingArchived(true);
      try {
        const archivedByList = {};
        
        // Fetch archived cards for each list
        const archivePromises = lists.map(async (list) => {
          try {
            const response = await Database.getArchivedCards(list._id, board._id);
            archivedByList[list._id] = response.data || [];
          } catch (error) {
            console.error(`Failed to load archived cards for list ${list._id}:`, error);
            archivedByList[list._id] = [];
          }
        });
        
        await Promise.all(archivePromises);
        setArchivedCardsByList(archivedByList);
      } catch (error) {
        console.error('Error loading archived cards:', error);
        setArchivedCardsByList({});
      } finally {
        setLoadingArchived(false);
      }
    };
    
    loadArchivedCards();
  } else if (!showArchived) {
    // Clear archived cards when switching back to active view
    setArchivedCardsByList({});
  }
}, [showArchived, board, lists]);

  // Memoize loadData to prevent recreation
  const loadData = useCallback(async () => {
    try {
      // Initialize workflow store with project data directly
      // This fetches board, lists, and cards in one parallelized/optimized call
      await initializeWorkflow(projectId);
    } catch (error) {
      console.error('Error loading project data:', error);
      // Store already handles error state
    }
  }, [projectId, initializeWorkflow]);
  
  // Memoize card handlers
  const handleAddCard = useCallback(async (listId, title) => {
    try {
      await addCard(listId, title, board._id);
    } catch (error) {
      console.error('Error adding card:', error);
    }
  }, [addCard, board?._id]);

  const handleSearchChange = useCallback((e) => setSearchQuery(e.target.value), []);
  const handleStatusChange = useCallback((e) => setStatusFilter(e.target.value), []);
  const handlePriorityChange = useCallback((e) => setPriorityFilter(e.target.value), []);

  const handleDeleteCard = useCallback(async (cardId, options = {}) => {
    if (!cardId) return;
    const {
      skipConfirm = false,
      showToast = true,
      closeModals = true,
    } = options;

    if (!skipConfirm) {
      const confirmed = window.confirm('Are you sure you want to delete this card?');
      if (!confirmed) {
        return;
      }
    }

    try {
      await deleteCard(cardId);
      if (showToast) {
        toast.success('Deleted successfully');
      }
      if (closeModals) {
        closeHierarchy();
      }
    } catch (error) {
      console.error('Error deleting card:', error);
      if (showToast) {
        toast.error('Failed to delete card');
      }
      throw error;
    }
  }, [deleteCard, closeHierarchy]);

  const handleRestoreCard = useCallback(async (cardId) => {
    if (!cardId) return;

    // Find the card in archived lists
    let cardToRestore = null;
    let originalListId = null;
    
    // Search in local archived state first
    for (const listId in archivedCardsByList) {
      const found = archivedCardsByList[listId]?.find(c => c._id === cardId);
      if (found) {
        cardToRestore = found;
        originalListId = listId;
        break;
      }
    }
    
    // If not found in local archived state, we can't do optimistic update easily
    // without fetching it first. But usually it should be there if user is viewing it.
    
    if (cardToRestore) {
      // 1. Optimistic Update: Add to active workflow immediately
      useWorkflowStore.getState().restoreCardOptimistic(cardToRestore);
      
      // 2. Optimistic Update: Remove from archived view immediately
      setArchivedCardsByList(prev => ({
        ...prev,
        [originalListId]: prev[originalListId].filter(c => c._id !== cardId)
      }));
      
      toast.success('Task restored successfully');
    }

    try {
      // 3. API Call
      const response = await Database.restoreCard(cardId);
      
      if (response.success) {
        // 4. Background Reconciliation
        // Fetch fully populated card to ensure consistency (e.g. populated fields)
        // This runs in background without blocking UI
        const full = await Database.getCard(cardId);
        const hydrated = full.data || full;
        
        // Update store locally with fresh data
        useWorkflowStore.getState().updateCardLocal(cardId, {
          ...hydrated,
          isArchived: false,
          archivedAt: null,
          autoDeleteAt: null
        });
      } else {
        throw new Error(response.message || 'Failed to restore');
      }
    } catch (error) {
      console.error('Error restoring card:', error);
      toast.error('Failed to restore task');
      
      // 5. Rollback on error
      if (cardToRestore && originalListId) {
        // Remove from active workflow
        useWorkflowStore.getState().restoreCardRollback(cardId, originalListId);
        
        // Add back to archived view
        setArchivedCardsByList(prev => ({
          ...prev,
          [originalListId]: [...(prev[originalListId] || []), cardToRestore]
        }));
      }
    }
  }, [archivedCardsByList]);

  const handleUpdateCard = useCallback(async (cardId, updates) => {
    try {
      await updateCard(cardId, updates);
    } catch (error) {
      console.error('Error updating card:', error);
    }
  }, [updateCard]);

  const handleMoveCard = useCallback(async (cardId, newListId, newPosition, newStatus) => {
    try {
      // Fallback: derive status from target list if not provided
      let status = newStatus;
      if (!status) {
        const targetList = lists.find(list => list._id === newListId);
        if (targetList) {
          status = targetList.title.toLowerCase().replace(/\s+/g, '-');
        }
      }

      await moveCard(cardId, newListId, newPosition, status);

    } catch (error) {
      console.error('Error moving card:', error);
    }
  }, [lists, moveCard]);

  const handleAddList = useCallback(async (title) => {
    try {
      await addList(board._id, title);
    } catch (error) {
      console.error('Error adding list:', error);
    }
  }, [addList, board?._id]);

  const handleDeleteList = useCallback(async (listId, options = {}) => {
    const { skipConfirm = false } = options;
    
    if (!skipConfirm) {
      if (!window.confirm('Are you sure you want to delete this list and all its cards?')) {
        return;
      }
    }

    try {
      await deleteList(listId);
      toast.success('List deleted successfully');
    } catch (error) {
      console.error('Error deleting list:', error);
      toast.error('Failed to delete list');
    }
  }, [deleteList]);

  const handleUpdateListColor = useCallback(async (listId, color) => {
    try {
      await updateListColor(listId, color);
    } catch (error) {
      console.error('Error updating list color:', error);
    }
  }, [updateListColor]);

  const handleMoveList = useCallback(async (listId, newPosition) => {
    try {
      await moveList(listId, newPosition);
    } catch (error) {
      console.error('Error moving list:', error);
    }
  }, [moveList]);

  const handleOpenEditModal = useCallback(async () => {
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      try {
        // Fetch full project data to ensure team members are loaded
        const response = await Database.getProject(projectId);
        if (response.success) {
          setFullProjectData(response.data);
          setSelectedProject(response.data);
          setEditModalOpen(true);
        }
      } catch (error) {
        console.error('Error fetching full project data:', error);
      }
    }
  }, [user, projectId]);

  const handleProjectUpdated = useCallback((updatedProject) => {
    updateBoard({
      name: updatedProject.name,
      description: updatedProject.description
    });
  }, [updateBoard]);

  const handleOpenCardModal = useCallback((card) => {
    if (!card) return;
    
    // Prevent opening modal for cards with temporary IDs (not yet saved to database)
    if (card.isOptimistic || (card._id && card._id.toString().startsWith('temp-'))) {
      console.log('Card is still being created. Please wait...');
      return;
    }
    
    openHierarchyModal({
      type: 'task',
      entity: card,
      project: board
    });
  }, [openHierarchyModal, board]);

  const closeAllModals = useCallback(() => closeHierarchy(), [closeHierarchy]);

  const closeModalToDepth = useCallback((depth) => {
    closeHierarchyToDepth(depth);
  }, [closeHierarchyToDepth]);

  const handleOpenChildEntity = useCallback((child, parentDepth) => {
    if (!child?.entityId || !child?.type) return;
    const entity =
      child.initialData ||
      {
        _id: child.entityId,
        id: child.entityId,
        title: child.label || 'Untitled',
        name: child.label || 'Untitled'
      };
    openHierarchyModal({
      type: child.type,
      entity,
      parentDepth
    });
  }, [openHierarchyModal]);

  const handleStackLabelUpdate = useCallback((item, label) => {
    if (!item?.entityId) return;
    updateHierarchyLabel(item.entityId, item.type, label);
  }, [updateHierarchyLabel]);

  useEffect(() => {
    setShareAutoOpened(false);
  }, [shareKey]);

  // Debounced search to avoid frequent re-computation and improve responsiveness
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Memoize filter values to prevent unnecessary re-computations
  const activeFilters = React.useMemo(() => {
    const mapPriorityValue = (val) => {
      if (!val || val === 'All') return null;
      const map = { 'Low': 'low', 'Medium': 'medium', 'High': 'high' };
      return map[val] || val.toLowerCase();
    };

    const normalize = (s) => (s || '').toString().trim().toLowerCase();

    return {
      status: statusFilter && statusFilter !== 'All' ? normalize(statusFilter) : null,
      priority: mapPriorityValue(priorityFilter),
      search: debouncedSearch ? debouncedSearch.toLowerCase() : '',
      selectedProjectId: selectedProject ? (selectedProject._id || selectedProject) : null
    };
  }, [statusFilter, priorityFilter, debouncedSearch, selectedProject]);

  // Compute filtered cards per list with optimized filtering
  const { filteredCardsByList, totalFilteredCount } = React.useMemo(() => {
    const result = {};
    let total = 0;

    // Pre-compute normalized values for better performance
    const normalize = (s) => (s || '').toString().trim().toLowerCase();

    for (const list of lists) {
      const listId = list._id;
      // Use archived cards if showing archived view, otherwise use active cards
      const cards = showArchived ? (archivedCardsByList[listId] || []) : (cardsByList[listId] || []);

      // Only filter if we have active filters
      const hasFilters = activeFilters.status || activeFilters.priority || activeFilters.search || activeFilters.selectedProjectId;

      const filtered = hasFilters ? cards.filter(card => {
        // Status filter
        if (activeFilters.status) {
          const cstatus = normalize(card.status);
          if (cstatus !== activeFilters.status) return false;
        }

        // Priority filter
        if (activeFilters.priority) {
          const cprio = normalize(card.priority);
          if (cprio !== activeFilters.priority) return false;
        }

        // Project filter
        if (activeFilters.selectedProjectId) {
          const cardBoardId = typeof card.board === 'string' ? card.board : (card.board?._id || card.board);
          if (cardBoardId !== activeFilters.selectedProjectId) return false;
        }

        // Search filter - optimized with early returns
        if (activeFilters.search) {
          const title = (card.title || '').toLowerCase();
          if (title.includes(activeFilters.search)) return true;

          const desc = (card.description || '').toLowerCase();
          if (desc.includes(activeFilters.search)) return true;

          const labels = card.labels || [];
          if (labels.some(l => ('' + l).toLowerCase().includes(activeFilters.search))) return true;

          return false;
        }

        return true;
      }) : cards;

      result[listId] = filtered;
      total += filtered.length;
    }

    return { filteredCardsByList: result, totalFilteredCount: total };
  }, [lists, cardsByList, archivedCardsByList, activeFilters, showArchived]);

  const autoOpenSharedPath = useCallback(async () => {
    if (!taskId || !board) return;
    try {
      closeHierarchy();

      // Check if task data is already available in the store
      let taskData = getCard(taskId);
      if (!taskData) {
        const taskResponse = await Database.getCard(taskId);
        taskData = taskResponse.data || taskResponse;
      }

      if (!taskData?._id) {
        throw new Error('Task not found');
      }

      openHierarchyModal({
        type: 'task',
        entity: taskData,
        project: board,
      });

      if (subtaskId || nenoId) {
        // Fetch subtask and nano data in parallel if both are needed
        const fetchPromises = [];
        if (subtaskId) fetchPromises.push(Database.getSubtask(subtaskId));
        if (nenoId) fetchPromises.push(Database.getNano(nenoId));

        const responses = await Promise.all(fetchPromises);

        if (subtaskId) {
          const subtaskData = responses[0]?.data || responses[0];
          if (!subtaskData?._id) {
            throw new Error('Subtask not found');
          }
          openHierarchyModal({
            type: 'subtask',
            entity: subtaskData,
            parentDepth: 0,
          });

          if (nenoId) {
            const nanoData = responses[1]?.data || responses[1];
            if (!nanoData?._id) {
              throw new Error('Neno subtask not found');
            }
            openHierarchyModal({
              type: 'subtaskNano',
              entity: nanoData,
              parentDepth: 1,
            });
          }
        }
      }

      setShareAutoOpened(true);
    } catch (error) {
      console.error('Error auto-opening shared card:', error);
      toast.error('Unable to open the shared item. It may have been removed.');
      setShareAutoOpened(true);
    }
  }, [taskId, subtaskId, nenoId, board, closeHierarchy, openHierarchyModal, getCard]);

  useEffect(() => {
    if (!taskId || loading || shareAutoOpened || !board) {
      return;
    }
    autoOpenSharedPath();
  }, [taskId, loading, shareAutoOpened, board, autoOpenSharedPath]);
  
  // Show loading skeleton while loading, team loading, or when projectId doesn't match current data
  const isProjectMismatch = currentProjectId && currentProjectId !== projectId;
  if (loading || teamLoading || isProjectMismatch) {
    return <WorkflowSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white text-center max-w-md mx-4"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p className="text-xl mb-6 text-white/80">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
            >
              Return to Home
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white text-center max-w-md mx-4"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold mb-4">Project Not Found</h2>
            <p className="text-xl mb-6 text-white/80">The requested project could not be found.</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
            >
              Return to Home
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  const hasNoLists = lists.length === 0;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 overflow-hidden">
      {/* Custom Header for Workflow */}
      <header className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
              >
                <ArrowLeft size={24} />
              </motion.button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-white">{board.name}</h1>
                  {(user?.role === 'admin' || user?.role === 'manager') && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={handleOpenEditModal}
                      className="p-1 hover:bg-white/20 rounded text-white/70 hover:text-white"
                    >
                      <Pencil size={16} />
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-white/70 text-sm">{board.description || 'Project Board'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden md:block">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-lg"
                />
              </div>

              {/* Filters */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors backdrop-blur-lg border border-white/20"
              >
                <Filter size={18} />
                Filters
              </motion.button>

              {/* Archive View Toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowArchived(!showArchived)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors backdrop-blur-lg border ${
                  showArchived
                    ? 'bg-orange-600 border-orange-500 hover:bg-orange-700'
                    : 'bg-white/10 hover:bg-white/20 border-white/20'
                }`}
                title={showArchived ? 'Show Active Tasks' : 'Show Archived Tasks'}
              >
                <Archive size={18} />
                <span className="hidden lg:inline">{showArchived ? 'Archived' : 'View Archive'}</span>
              </motion.button>

              {/* Project Trash Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/workflow/${deptId}/${projectId}/trash`)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white transition-colors backdrop-blur-lg border border-red-400/50"
                title="Project Trash (Media)"
              >
                <Trash2 size={18} />
                <span className="hidden lg:inline">Trash</span>
              </motion.button>

              {/* View All Recurring Tasks Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowRecurringPage(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500/80 hover:bg-orange-500 rounded-lg text-white transition-colors backdrop-blur-lg border border-orange-400/50"
                title="View All Recurring Tasks"
              >
                <RefreshCw size={18} />
                <span className="hidden lg:inline">Recurring Tasks</span>
              </motion.button>

              {/* Team Members */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-lg border border-white/20 transition-colors"
                  >
                    <Users size={18} className="text-white" />
                    <span className="text-white font-medium">{board.members?.length || 0}</span>
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 bg-white/95 backdrop-blur-lg border border-white/20">
                  {board.members && board.members.length > 0 ? (
                    board.members.map((member) => {
                      const getRoleIcon = (role) => {
                        switch (role) {
                          case 'admin':
                            return <Crown size={14} className="text-yellow-500" />;
                          case 'manager':
                            return <Shield size={14} className="text-blue-500" />;
                          default:
                            return <User size={14} className="text-gray-500" />;
                        }
                      };

                      const getRoleLabel = (role) => {
                        switch (role) {
                          case 'admin':
                            return 'Admin';
                          case 'manager':
                            return 'Manager';
                          default:
                            return 'Member';
                        }
                      };

                      return (
                        <DropdownMenuItem key={member._id} className="flex items-center gap-3 px-3 py-3">
                          <Avatar
                            src={member.avatar}
                            name={member.name}
                            role={member.role}
                            size="md"
                            showBadge={true}
                          />
                          <div className="flex flex-col flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{member.name || 'Unknown'}</span>
                              {getRoleIcon(member.role)}
                            </div>
                            <span className="text-xs text-gray-500">{member.email || ''}</span>
                            <span className="text-xs text-blue-600 font-medium">{getRoleLabel(member.role)}</span>
                          </div>
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <DropdownMenuItem disabled className="text-center text-gray-500">
                      No members assigned
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Add List Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const title = prompt('Enter list name:');
                  if (title) handleAddList(title);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
              >
                <Plus size={18} />
                Add List
              </motion.button>
            </div>
          </div>

          {/* Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 flex gap-3"
              >
                <select
                  value={statusFilter}
                  onChange={handleStatusChange}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option className="bg-white text-gray-900" value="All">All Status</option>
                  {lists && lists.length > 0 && Array.from(new Set(lists.map(l => l.title))).map((title) => (
                    <option key={title} className="bg-white text-gray-900" value={title}>{title}</option>
                  ))}
                </select>
                <select
                  value={priorityFilter}
                  onChange={handlePriorityChange}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option className="bg-white text-gray-900" value="All">All Priority</option>
                  <option className="bg-white text-gray-900" value="Low">Low</option>
                  <option className="bg-white text-gray-900" value="Medium">Medium</option>
                  <option className="bg-white text-gray-900" value="High">High</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {hasNoLists ? (
          <div className="flex items-center justify-center h-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center text-white max-w-md mx-4"
            >
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20">
                <Plus size={64} className="mx-auto mb-4 text-white/50" />
                <h2 className="text-3xl font-bold mb-4">No lists yet!</h2>
                <p className="text-xl mb-8 text-white/70">Create your first list to get started with this project.</p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const title = prompt('Enter list name:');
                    if (title) handleAddList(title);
                  }}
                  className="px-8 py-4 bg-white text-purple-900 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg inline-flex items-center gap-2"
                >
                  <Plus size={24} />
                  Create First List
                </motion.button>
              </div>
            </motion.div>
          </div>
        ) : (
          <Board
            lists={lists}
            cardsByList={filteredCardsByList}
            onAddCard={handleAddCard}
            onDeleteCard={handleDeleteCard}
            onCardClick={handleOpenCardModal}
            onAddList={handleAddList}
            onDeleteList={handleDeleteList}
            onUpdateListColor={handleUpdateListColor}
            onUpdateListTitle={updateListTitle}
            onMoveCard={handleMoveCard}
            onMoveList={handleMoveList}
            onRestoreCard={handleRestoreCard}
            isArchivedView={showArchived}
          />
        )}
      </main>

      <HierarchyModalStack
        stack={modalStack}
        onCloseAll={closeAllModals}
        onCloseToDepth={closeModalToDepth}
        onOpenChild={handleOpenChildEntity}
        onUpdateTask={handleUpdateCard}
        onDeleteTask={handleDeleteCard}
        onMoveTask={handleMoveCard}
        onLabelUpdate={handleStackLabelUpdate}
      />

      {editModalOpen && (
        <Suspense fallback={<div>Loading...</div>}>
          <EditProjectModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            project={selectedProject}
            onProjectUpdated={handleProjectUpdated}
          />
        </Suspense>
      )}

      {/* All Recurring Tasks Page Overlay */}
      <AnimatePresence>
        {showRecurringPage && board && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <AllRecurringTasksPage
              boardId={board._id}
              boardName={board.name}
              onBack={() => setShowRecurringPage(false)}
              onOpenCard={(card) => {
                setShowRecurringPage(false);
                if (card?._id) {
                  handleOpenCardModal(card);
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default WorkFlow;
