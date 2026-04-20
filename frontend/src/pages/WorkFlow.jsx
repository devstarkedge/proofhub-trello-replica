import React, { useState, useEffect, useContext, Suspense, memo, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import Database from '../services/database';
import Board from '../components/Board';
import { lazy } from 'react';
import EditProjectModal from '../components/EditProjectModal';
import DepartmentContext from '../context/DepartmentContext';
import socketService from '../services/socket';
import AuthContext from '../context/AuthContext';
import useWorkflowStore from '../store/workflowStore';
import useModalHierarchyStore from '../store/modalHierarchyStore';
import useFieldVisibilityStore from '../store/fieldVisibilityStore';
import useWorkflowFilterStore from '../store/workflowFilterStore';
import useProjectStore from '../store/projectStore';

import HierarchyModalStack from '../components/hierarchy/HierarchyModalStack';
import { WorkflowSkeleton } from '../components/LoadingSkeleton';
import { toast } from 'react-toastify';
import AllRecurringTasksPage from './AllRecurringTasksPage';

import WorkflowHeader from '../components/workflow/WorkflowHeader';
import ShowFieldsPanel from '../components/workflow/ShowFieldsPanel';
import FilterPanel from '../components/workflow/FilterPanel';
import FilterChipsBar from '../components/workflow/FilterChipsBar';
import { generateWorkflowCSV } from '../utils/csvExport';

const WorkFlow = memo(() => {
  const { deptId, projectId, taskId, subtaskId, nenoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTeam, loading: teamLoading } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);
  
  // Track previous projectId to detect changes
  const prevProjectIdRef = useRef(projectId);

  const { departments, fetchDepartments } = useProjectStore();

  useEffect(() => {
    if (departments.length === 0) {
      fetchDepartments();
    }
  }, [departments.length, fetchDepartments]);

  const departmentManagers = useMemo(() => {
    if (!deptId) return [];
    const dept = departments.find(d => d._id === deptId);
    return dept?.managers || [];
  }, [deptId, departments]);

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
    updateCardRecurrence,
    addCardFromSocket,
    removeCardFromSocket
  } = useWorkflowStore();

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
  const [highlightedEntityId, setHighlightedEntityId] = useState(null);
  const [showFieldsPanel, setShowFieldsPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [boardLabels, setBoardLabels] = useState([]);
  const shareKey = `${taskId || ''}-${subtaskId || ''}-${nenoId || ''}`;
  const modalStack = useModalHierarchyStore((state) => state.stack);
  const openHierarchyModal = useModalHierarchyStore((state) => state.openModalByType);
  const closeHierarchy = useModalHierarchyStore((state) => state.closeAll);
  const closeHierarchyToDepth = useModalHierarchyStore((state) => state.closeToDepth);
  const updateHierarchyLabel = useModalHierarchyStore((state) => state.updateItemLabel);
  const setHierarchyProject = useModalHierarchyStore((state) => state.setProject);

  // Field visibility & filter stores
  const initializeFieldVisibility = useFieldVisibilityStore((s) => s.initialize);
  const initializeFilters = useWorkflowFilterStore((s) => s.initialize);
  const filters = useWorkflowFilterStore((s) => s.filters);
  const matchesFilters = useWorkflowFilterStore((s) => s.matchesFilters);
  const getActiveFilterCount = useWorkflowFilterStore((s) => s.getActiveFilterCount);
  const clearAllFilters = useWorkflowFilterStore((s) => s.clearAllFilters);
  const startDraft = useWorkflowFilterStore((s) => s.startDraft);

  // Initialize stores when project + user change
  useEffect(() => {
    if (projectId && user?.id) {
      initializeFieldVisibility(projectId, user.id);
      initializeFilters(projectId, user.id);
    }
  }, [projectId, user?.id, initializeFieldVisibility, initializeFilters]);

  // Fetch board labels for filter panel
  useEffect(() => {
    if (board?._id) {
      Database.getLabelsByBoard(board._id)
        .then(res => {
          if (res.success || res.data) {
            setBoardLabels(res.data || res || []);
          }
        })
        .catch(() => setBoardLabels([]));
    }
  }, [board?._id]);

  // Reset local state when projectId changes
  useEffect(() => {
    // We rely on store's initializeWorkflow to handle data loading/clearing.
    // However, we MUST reset local UI state (filters, etc.) when switching projects.
    if (prevProjectIdRef.current && prevProjectIdRef.current !== projectId) {
       setSearchQuery('');
       setDebouncedSearch('');
       setEditModalOpen(false);
       setSelectedProject(null);
       setFullProjectData(null);
       setShareAutoOpened(false);
       setShowRecurringPage(false);
       setShowArchived(false);
       setShowFieldsPanel(false);
       setShowFilterPanel(false);
       setBoardLabels([]);
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

// Listen for real-time task copy & cross-move events from other users
useEffect(() => {
  if (!board) return;
  const boardId = board._id;

  const handleTaskCopied = (event) => {
    const { card: newCard, boardId: destBoardId } = event.detail || {};
    if (!newCard) return;
    // Only add card if it was copied INTO this board
    if (destBoardId === boardId) {
      const listId = typeof newCard.list === 'object' ? newCard.list._id : newCard.list;
      addCardFromSocket(newCard, listId);
    }
  };

  const handleTaskMovedCross = (event) => {
    const { card: movedCard, sourceBoardId, destinationBoardId, sourceListId, isUndo } = event.detail || {};
    if (!movedCard) return;
    const cardId = movedCard._id || movedCard.id;
    const destListId = typeof movedCard.list === 'object' ? movedCard.list._id : movedCard.list;

    // Card was moved AWAY from this board
    if (sourceBoardId === boardId) {
      removeCardFromSocket(cardId);
    }
    // Card was moved INTO this board
    if (destinationBoardId === boardId) {
      addCardFromSocket(movedCard, destListId);
    }
  };

  window.addEventListener('socket-task-copied', handleTaskCopied);
  window.addEventListener('socket-task-moved-cross', handleTaskMovedCross);

  return () => {
    window.removeEventListener('socket-task-copied', handleTaskCopied);
    window.removeEventListener('socket-task-moved-cross', handleTaskMovedCross);
  };
}, [board, addCardFromSocket, removeCardFromSocket]);

// Listen for real-time subtask/nano changes to update card progress bar
useEffect(() => {
  const handleSubtaskHierarchy = (event) => {
    const { taskId, subtaskStats } = event.detail || {};
    if (taskId && subtaskStats) {
      useWorkflowStore.getState().updateCardLocal(taskId, { subtaskStats });
    }
  };

  const handleNanoHierarchy = (event) => {
    const { taskId, subtaskStats } = event.detail || {};
    if (taskId && subtaskStats) {
      useWorkflowStore.getState().updateCardLocal(taskId, { subtaskStats });
    }
  };

  window.addEventListener('socket-subtask-hierarchy', handleSubtaskHierarchy);
  window.addEventListener('socket-nano-hierarchy', handleNanoHierarchy);

  return () => {
    window.removeEventListener('socket-subtask-hierarchy', handleSubtaskHierarchy);
    window.removeEventListener('socket-nano-hierarchy', handleNanoHierarchy);
  };
}, []);

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

  // Handle notification navigation state — highlight entity or fallback on error
  useEffect(() => {
    const navState = location.state;
    if (navState?.highlightEntity) {
      setHighlightedEntityId(navState.highlightEntity);
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => setHighlightedEntityId(null), 3000);
      // Clear the state so refreshing doesn't re-trigger
      window.history.replaceState({}, document.title);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // When loading finishes with error and navigation came from a notification, redirect gracefully
  useEffect(() => {
    if (!loading && error && location.state?.highlightEntity) {
      // Entity likely deleted — navigate to parent or home
      if (taskId && deptId && projectId) {
        toast.info('This task no longer exists. Opening project instead.');
        navigate(`/workflow/${deptId}/${projectId}`, { replace: true });
      } else {
        toast.info('This item is no longer available.');
        navigate('/', { replace: true });
      }
    }
  }, [loading, error, location.state, taskId, deptId, projectId, navigate]);
  
  // Memoize card handlers
  const handleAddCard = useCallback(async (listId, title) => {
    try {
      await addCard(listId, title, board._id);
    } catch (error) {
      console.error('Error adding card:', error);
    }
  }, [addCard, board?._id]);

  const handleSearchChange = useCallback((e) => setSearchQuery(e.target.value), []);

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
    
    // Update URL to include task ID
    const cardId = card._id || card.id;
    if (cardId && deptId && projectId) {
      navigate(`/workflow/${deptId}/${projectId}/${cardId}`, { replace: true });
    }
    
    openHierarchyModal({
      type: 'task',
      entity: card,
      project: board
    });
  }, [openHierarchyModal, board, deptId, projectId, navigate]);

  const closeAllModals = useCallback(() => {
    closeHierarchy();
    // Navigate back to the project URL (without taskId)
    if (deptId && projectId) {
      navigate(`/workflow/${deptId}/${projectId}`, { replace: true });
    }
  }, [closeHierarchy, deptId, projectId, navigate]);

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
    return {
      search: debouncedSearch ? debouncedSearch.toLowerCase() : '',
      selectedProjectId: selectedProject ? (selectedProject._id || selectedProject) : null,
      hasStoreFilters: getActiveFilterCount() > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedProject, getActiveFilterCount, filters]);

  // Compute filtered cards per list with enterprise filtering
  const { filteredCardsByList, totalFilteredCount } = React.useMemo(() => {
    const result = {};
    let total = 0;

    for (const list of lists) {
      const listId = list._id;
      // Use archived cards if showing archived view, otherwise use active cards
      const cards = showArchived ? (archivedCardsByList[listId] || []) : (cardsByList[listId] || []);

      const hasFilters = activeFilters.search || activeFilters.selectedProjectId || activeFilters.hasStoreFilters;

      const filtered = hasFilters ? cards.filter(card => {
        // Enterprise multi-filter via store
        if (activeFilters.hasStoreFilters) {
          if (!matchesFilters(card, list.title)) return false;
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
          if (labels.some(l => {
            const labelText = typeof l === 'object' ? l.name : String(l);
            return (labelText || '').toLowerCase().includes(activeFilters.search);
          })) return true;

          return false;
        }

        return true;
      }) : cards;

      result[listId] = filtered;
      total += filtered.length;
    }

    return { filteredCardsByList: result, totalFilteredCount: total };
  }, [lists, cardsByList, archivedCardsByList, activeFilters, showArchived, matchesFilters]);

  // Flat array of all cards for FilterPanel preview counts
  const allCards = useMemo(() => {
    const all = [];
    for (const list of lists) {
      const cards = cardsByList[list._id] || [];
      all.push(...cards);
    }
    return all;
  }, [lists, cardsByList]);

  // Maps for FilterChipsBar display names
  const assigneeMap = useMemo(() => {
    const map = {};
    allCards.forEach(card => {
      (card.assignees || []).forEach(a => {
        if (typeof a === 'object' && a._id) map[a._id] = a.name || a.email || 'Unknown';
      });
    });
    return map;
  }, [allCards]);

  const labelMap = useMemo(() => {
    const map = {};
    (boardLabels || []).forEach(l => { if (l._id) map[l._id] = l.name; });
    allCards.forEach(card => {
      (card.labels || []).forEach(l => {
        if (typeof l === 'object' && l._id && !map[l._id]) map[l._id] = l.name;
      });
    });
    return map;
  }, [allCards, boardLabels]);

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

  // CSV export handler
  const handleDownloadCSV = useCallback(() => {
    try {
      const filename = generateWorkflowCSV({
        board,
        lists,
        cardsByList: filteredCardsByList,
        userName: user?.name || user?.email || 'Unknown',
      });
      toast.success(`Exported: ${filename}`);
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error('Failed to export CSV');
    }
  }, [board, lists, filteredCardsByList, user]);

  // Navigation handler for header
  const handleNavigateBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);
  
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
    <div className="h-full flex flex-col bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 overflow-hidden">
      {/* Enterprise Workflow Header */}
      <WorkflowHeader
        board={board}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onFilterToggle={() => {
          if (!showFilterPanel) startDraft();
          setShowFilterPanel(prev => !prev);
          setShowFieldsPanel(false);
        }}
        activeFilterCount={getActiveFilterCount()}
        onNavigateBack={handleNavigateBack}
        onEditProject={handleOpenEditModal}
        onDownloadCSV={handleDownloadCSV}
        onShowFields={() => {
          setShowFieldsPanel(prev => !prev);
          setShowFilterPanel(false);
        }}
        onTrash={() => navigate(`/workflow/${deptId}/${projectId}/trash`)}
        onRecurringTasks={() => setShowRecurringPage(true)}
        onArchiveToggle={() => setShowArchived(prev => !prev)}
        showArchived={showArchived}
      />

      {/* Show Fields Panel */}
      <ShowFieldsPanel
        isOpen={showFieldsPanel}
        onClose={() => setShowFieldsPanel(false)}
      />

      {/* Enterprise Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        lists={lists}
        cardsByList={cardsByList}
        boardLabels={boardLabels}
        allCards={allCards}
      />

      {/* Active Filter Chips */}
      <FilterChipsBar assigneeMap={assigneeMap} labelMap={labelMap} />

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
        ) : totalFilteredCount === 0 && (activeFilters.hasStoreFilters || activeFilters.search) ? (
          <div className="flex items-center justify-center h-full">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-white max-w-sm mx-4"
            >
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-10 border border-white/20">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-xl font-bold mb-2">No tasks match</h3>
                <p className="text-sm text-white/70 mb-6">
                  {activeFilters.search
                    ? `No results for "${debouncedSearch}"`
                    : 'Try adjusting your filters to see more tasks.'}
                </p>
                <button
                  onClick={() => { clearAllFilters(); setSearchQuery(''); }}
                  className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear all filters
                </button>
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
            departmentManagers={departmentManagers}
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
