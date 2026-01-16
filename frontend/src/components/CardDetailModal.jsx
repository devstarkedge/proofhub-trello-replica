import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlignLeft, Tag, AlertCircle, MessageSquare, Activity, RefreshCw } from "lucide-react";
import Database from "../services/database";
import commentService from "../services/commentService";
import AuthContext from "../context/AuthContext";
import { toast } from "react-toastify";
import useWorkflowStore from "../store/workflowStore";
import useDepartmentStore from "../store/departmentStore";
import useModalHierarchyStore from "../store/modalHierarchyStore";
import useAttachmentStore, { getEntityKey } from "../store/attachmentStore";
import CardDescription from "./CardDetailModal/CardDescription";
import TimeTrackingSection from "./CardDetailModal/TimeTrackingSection";
import SubtasksSection from "./CardDetailModal/SubtasksSection";
import AttachmentsSection from "./CardDetailModal/AttachmentsSection";
import CommentsSection from "./CardDetailModal/CommentsSection";
import ActivitySection from "./CardDetailModal/ActivitySection";
import TabsContainer from "./CardDetailModal/TabsContainer";
import CardSidebar from "./CardDetailModal/CardSidebar";
import BreadcrumbNavigation from "./hierarchy/BreadcrumbNavigation";
import CardActionMenu from "./CardDetailModal/CardActionMenu";
import RecurringSettingsModal from "./RecurringSettingsModal";
import DeletePopup from "./ui/DeletePopup";
import ArchiveConfirmationModal from "./ui/ArchiveConfirmationModal";
import RestoreConfirmationModal from "./ui/RestoreConfirmationModal";
import useBilledTimeAccess from "../hooks/useBilledTimeAccess";

const themeOverlay = {
  blue: 'bg-blue-950/60',
  purple: 'bg-purple-950/50',
  pink: 'bg-pink-950/50'
};

const CardDetailModal = React.memo(({
  card,
  onClose,
  onUpdate,
  onDelete,
  onMoveCard,
  onOpenChild,
  depth = 0,
  theme = 'blue',
  onLabelUpdate
}) => {
  const { user } = useContext(AuthContext);
  // Memoize card props to avoid unnecessary re-renders
  const initialCard = React.useMemo(() => card, [card]);
  const [title, setTitle] = useState(initialCard.title);
  const [description, setDescription] = useState(initialCard.description || "");
  const [assignees, setAssignees] = useState(
    initialCard.assignees ? initialCard.assignees.map((a) => (typeof a === 'object' ? a._id : a)).filter(Boolean) : []
  );
  const [priority, setPriority] = useState(initialCard.priority || "");
  const [status, setStatus] = useState(initialCard.status || "");
  const [availableStatuses, setAvailableStatuses] = useState([]);
  const [dueDate, setDueDate] = useState(
    initialCard.dueDate ? new Date(initialCard.dueDate).toISOString().split("T")[0] : ""
  );
  const [startDate, setStartDate] = useState(
    initialCard.startDate ? new Date(initialCard.startDate).toISOString().split("T")[0] : ""
  );
  const [labels, setLabels] = useState(initialCard.labels || []);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("comments");
  const [subtasks, setSubtasks] = useState([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [attachments, setAttachments] = useState(initialCard.attachments || []);
  const [coverImage, setCoverImage] = useState(initialCard.coverImage || null);
  const [coverImageOptimistic, setCoverImageOptimistic] = useState(null); // For optimistic UI
  const [teamMembers, setTeamMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [groupedFilteredMembers, setGroupedFilteredMembers] = useState({});
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletePopup, setDeletePopup] = useState({ isOpen: false, type: null, data: null });
  const [cardDataLoading, setCardDataLoading] = useState(true);
  // Recurring Task States
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [existingRecurrence, setExistingRecurrence] = useState(null);
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);
  
  // Archive States
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const setHierarchyActiveItem = useModalHierarchyStore((state) => state.setActiveItem);
  const setHierarchyProject = useModalHierarchyStore((state) => state.setProject);
  const initializeHierarchyTask = useModalHierarchyStore((state) => state.initializeTaskStack);
  const closeHierarchy = useModalHierarchyStore((state) => state.closeAll);
  const hierarchyStackLength = useModalHierarchyStore((state) => state.stack.length);
  const currentProject = useModalHierarchyStore((state) => state.currentProject);

  // Check if user can access billed time based on project client info and user role
  const { canAccessBilledTime, hiddenReason: billedTimeHiddenReason } = useBilledTimeAccess(
    currentProject?.clientDetails
  );

  const labelUpdateRef = React.useRef(onLabelUpdate);
  const managedHierarchyRef = React.useRef(false);
  const modalContentRef = useRef(null);
  useEffect(() => {
    labelUpdateRef.current = onLabelUpdate;
  }, [onLabelUpdate]);

  useEffect(() => {
    if (card?.title && labelUpdateRef.current) {
      labelUpdateRef.current(card.title);
    }
  }, [card?.title]);

  useEffect(() => {
    if (!card?._id || managedHierarchyRef.current) return;
    if (hierarchyStackLength === 0) {
      const projectPayload =
        typeof card?.board === "object" && card.board
          ? card.board
          : card?.board
            ? { _id: card.board, name: "Project" }
            : null;
      initializeHierarchyTask({
        project: projectPayload,
        task: card,
      });
      managedHierarchyRef.current = true;
    }
  }, [card, hierarchyStackLength, initializeHierarchyTask]);

  useEffect(() => {
    return () => {
      if (managedHierarchyRef.current) {
        closeHierarchy();
      }
    };
  }, [closeHierarchy]);

  useEffect(() => {
    if (typeof card?.board === "object" && card.board) {
      setHierarchyProject(card.board);
    }
  }, [card?.board, setHierarchyProject]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  /**
   * Helper to normalize time entries from server response
   * CRITICAL: Preserve MongoDB _id for existing entries to maintain ownership integrity
   * The 'id' field is only for React key purposes, never used for backend identification
   */
  const normalizeTimeEntries = (entries, prefix) => {
    return (entries || []).map((entry, idx) => {
      // Use MongoDB _id as the primary identifier if available
      // Only generate a temp ID for truly new entries (which shouldn't happen from server data)
      const mongoId = entry._id ? entry._id.toString() : null;
      return {
        ...entry,
        // Keep MongoDB _id intact for backend operations
        _id: entry._id,
        // 'id' is only for React keys - prefer MongoDB _id
        id: mongoId || `temp-${prefix}-${idx}-${Date.now()}`,
      };
    });
  };

  // Time Tracking States - preserve MongoDB _id for proper backend sync
  const [estimationEntries, setEstimationEntries] = useState(
    normalizeTimeEntries(card.estimationTime, 'estimation')
  );
  const [loggedTime, setLoggedTime] = useState(
    normalizeTimeEntries(card.loggedTime, 'logged')
  );
  const [billedTime, setBilledTime] = useState(
    normalizeTimeEntries(card.billedTime, 'billed')
  );
  const [newEstimationHours, setNewEstimationHours] = useState("");
  const [newEstimationMinutes, setNewEstimationMinutes] = useState("");
  const [newEstimationReason, setNewEstimationReason] = useState("");
  const [newEstimationDate, setNewEstimationDate] = useState("");
  const [newLoggedHours, setNewLoggedHours] = useState("");
  const [newLoggedMinutes, setNewLoggedMinutes] = useState("");
  const [newLoggedDescription, setNewLoggedDescription] = useState("");
  const [newLoggedDate, setNewLoggedDate] = useState("");
  const [newBilledHours, setNewBilledHours] = useState("");
  const [newBilledMinutes, setNewBilledMinutes] = useState("");
  const [newBilledDescription, setNewBilledDescription] = useState("");
  const [newBilledDate, setNewBilledDate] = useState("");
  const [editingEstimation, setEditingEstimation] = useState(null);
  const [editingLogged, setEditingLogged] = useState(null);
  const [editingBilled, setEditingBilled] = useState(null);
  const [editEstimationHours, setEditEstimationHours] = useState("");
  const [editEstimationMinutes, setEditEstimationMinutes] = useState("");
  const [editEstimationReason, setEditEstimationReason] = useState("");
  const [editLoggedHours, setEditLoggedHours] = useState("");
  const [editLoggedMinutes, setEditLoggedMinutes] = useState("");
  const [editLoggedDescription, setEditLoggedDescription] = useState("");
  const [editBilledHours, setEditBilledHours] = useState("");
  const [editBilledMinutes, setEditBilledMinutes] = useState("");
  const [editBilledDescription, setEditBilledDescription] = useState("");

  // Helper to get today's date in YYYY-MM-DD format
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  /**
   * Calculate total time for a user on a specific date from time entries
   * Returns total minutes for that user on that date
   */
  const calculateUserTimeForDate = (entries, userId, dateString, currentEntryId = null) => {
    const targetDate = dateString || getTodayDate();
    let totalMinutes = 0;

    entries.forEach(entry => {
      // Skip the current entry being edited (if editing)
      if (currentEntryId && (entry._id === currentEntryId || entry.id === currentEntryId)) {
        return;
      }

      // Get entry user ID
      const entryUserId = typeof entry.user === 'object' ? (entry.user._id || entry.user.id) : entry.user;
      
      // Get entry date (normalize to YYYY-MM-DD)
      const entryDate = entry.date ? new Date(entry.date).toISOString().split('T')[0] : getTodayDate();

      // Check if same user and same date
      if (entryUserId === userId && entryDate === targetDate) {
        const hours = parseInt(entry.hours || 0);
        const minutes = parseInt(entry.minutes || 0);
        totalMinutes += (hours * 60) + minutes;
      }
    });

    return totalMinutes;
  };

  /**
   * Check if the current user owns a time entry
   * Only owners can edit or delete their own entries
   * @param {Object} entry - The time entry to check
   * @returns {boolean} - True if current user owns the entry
   */
  const userOwnsTimeEntry = useCallback((entry) => {
    if (!entry || !user) return false;
    
    // Get the entry's user ID
    let entryUserId = null;
    if (entry.user) {
      if (typeof entry.user === 'object' && entry.user._id) {
        entryUserId = entry.user._id.toString();
      } else if (typeof entry.user === 'string') {
        entryUserId = entry.user;
      } else if (entry.user.id) {
        entryUserId = entry.user.id.toString();
      }
    }
    
    // Get current user ID
    const currentUserId = (user._id || user.id || '').toString();
    
    return entryUserId === currentUserId;
  }, [user]);

  /**
   * Validate if adding new time would exceed 24h limit for user on that date
   * Returns error message or null if valid
   */
  const validateTimeLimit = (entries, newHours, newMinutes, dateString, entryType) => {
    const hours = parseInt(newHours || 0);
    const minutes = parseInt(newMinutes || 0);
    const newTimeMinutes = (hours * 60) + minutes;

    if (newTimeMinutes === 0) {
      return null; // No time entered yet, no validation needed
    }

    const existingMinutes = calculateUserTimeForDate(entries, user._id, dateString);
    const totalMinutes = existingMinutes + newTimeMinutes;
    const maxMinutes = 24 * 60; // 24 hours in minutes

    if (totalMinutes > maxMinutes) {
      const existingHours = Math.floor(existingMinutes / 60);
      const existingMins = existingMinutes % 60;
      const remainingMinutes = maxMinutes - existingMinutes;
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      
      return `Total time for ${dateString || 'today'} cannot exceed 24 hours. You have already logged ${existingHours}h ${existingMins}m. Maximum you can add: ${remainingHours}h ${remainingMins}m.`;
    }

    return null;
  };

  // Validation error states
  const estimationValidationError = useMemo(() => 
    validateTimeLimit(estimationEntries, newEstimationHours, newEstimationMinutes, newEstimationDate, 'estimation'),
    [estimationEntries, newEstimationHours, newEstimationMinutes, newEstimationDate, user._id]
  );

  const loggedValidationError = useMemo(() => 
    validateTimeLimit(loggedTime, newLoggedHours, newLoggedMinutes, newLoggedDate, 'logged'),
    [loggedTime, newLoggedHours, newLoggedMinutes, newLoggedDate, user._id]
  );

  const billedValidationError = useMemo(() => 
    validateTimeLimit(billedTime, newBilledHours, newBilledMinutes, newBilledDate, 'billed'),
    [billedTime, newBilledHours, newBilledMinutes, newBilledDate, user._id]
  );

  // Check if card has a real database ID (not temporary)
  const isRealCard = card._id && !card._id.toString().startsWith('temp-');

  useEffect(() => {
    // Only load data if card has a real database ID
    if (!isRealCard) {
      setCardDataLoading(false);
      return;
    }

    // Load fresh card data from server when modal opens
    const loadFreshCardData = async () => {
      setCardDataLoading(true);
      try {
        const freshCard = await useWorkflowStore.getState().getFreshCard(card._id);
        if (freshCard) {
          setTitle(freshCard.title);
          setDescription(freshCard.description || "");
          setAssignees(freshCard.assignees ? freshCard.assignees.map((a) => (typeof a === 'object' ? a._id : a)).filter(Boolean) : []);
          setPriority(freshCard.priority || "");
          setStatus(freshCard.status || "");
          setDueDate(freshCard.dueDate ? new Date(freshCard.dueDate).toISOString().split("T")[0] : "");
          setStartDate(freshCard.startDate ? new Date(freshCard.startDate).toISOString().split("T")[0] : "");
          setLabels(freshCard.labels || []);
          setEstimationEntries((freshCard.estimationTime || []).map((entry, idx) => {
            const id = String(entry.id || entry._id || `estimation-${idx}`).trim() || `estimation-${idx}`;
            return { ...entry, id };
          }));
          setLoggedTime((freshCard.loggedTime || []).map((entry, idx) => {
            const id = String(entry.id || entry._id || `logged-${idx}`).trim() || `logged-${idx}`;
            return { ...entry, id };
          }));
          setBilledTime((freshCard.billedTime || []).map((entry, idx) => {
            const id = String(entry.id || entry._id || `billed-${idx}`).trim() || `billed-${idx}`;
            return { ...entry, id };
          }));
          setAttachments(freshCard.attachments || []);
          setCoverImage(freshCard.coverImage || null);
          setCoverImageOptimistic(null); // Clear optimistic state when fresh data loaded
          setHierarchyActiveItem("task", freshCard);
        } else if (card) {
          setHierarchyActiveItem("task", card);
        }
      } catch (error) {
        console.error("Error loading fresh card data:", error);
      } finally {
        setCardDataLoading(false);
      }
    };

    // Load existing recurrence data
    const loadRecurrence = async () => {
      if (!card?._id) return;
      setRecurrenceLoading(true);
      try {
        const response = await Database.getRecurrenceByCard(card._id);
        setExistingRecurrence(response.data || null);
      } catch (error) {
        console.error("Error loading recurrence:", error);
        setExistingRecurrence(null);
      } finally {
        setRecurrenceLoading(false);
      }
    };

    loadFreshCardData();
    loadComments();
    loadActivities();
    loadTeamMembers();
    loadDepartments();
    loadProjectName();
    loadAvailableStatuses();
    loadRecurrence();

    // Setup real-time update listeners
      const handleCardUpdate = (event) => {
      const { cardId, updates } = event.detail;
      if (cardId === card._id) {
        if (updates.title) setTitle(updates.title);
        if (updates.description) setDescription(updates.description);
        if (updates.status) setStatus(updates.status);
        if (updates.priority) setPriority(updates.priority);
        if (updates.dueDate) setDueDate(new Date(updates.dueDate).toISOString().split('T')[0]);
        if (updates.startDate) setStartDate(new Date(updates.startDate).toISOString().split('T')[0]);
        
        // Smart update for labels to prevent overwriting rich objects with IDs
        if (updates.labels) {
           // If incoming is array of objects, safe to use
           if (updates.labels.length > 0 && typeof updates.labels[0] === 'object') {
             setLabels(updates.labels);
           } 
           // If incoming is IDs, only update if we don't have rich data or if count mismatch
           // Ideally, we shouldn't downgrade from Objects to IDs
           else if (updates.labels.length === 0) {
             setLabels([]);
           }
           // Note: If updates.labels are IDs, we prefer NOT to overwrite our local rich state 
           // unless we can re-hydrate them. For now, ignoring ID-only updates to prevent regression
           // as the store/parent component should handle re-fetching or providing rich props.
        }

        // Smart update for assignees
        if (updates.assignees) {
          // If incoming is Objects (populated)
          if (updates.assignees.length > 0 && typeof updates.assignees[0] === 'object') {
             setAssignees(updates.assignees.map(a => a._id).filter(Boolean));
          }
          // If incoming is IDs
          else if (updates.assignees.length > 0 && typeof updates.assignees[0] === 'string') {
             setAssignees(updates.assignees);
          }
           else if (updates.assignees.length === 0) {
             setAssignees([]);
          }
        }

        if (updates.estimationTime) setEstimationEntries((updates.estimationTime || []).map((entry, idx) => {
          const id = String(entry.id || entry._id || `estimation-${idx}`).trim() || `estimation-${idx}`;
          return { ...entry, id };
        }));
        if (updates.loggedTime) setLoggedTime((updates.loggedTime || []).map((entry, idx) => {
          const id = String(entry.id || entry._id || `logged-${idx}`).trim() || `logged-${idx}`;
          return { ...entry, id };
        }));
        if (updates.billedTime) setBilledTime((updates.billedTime || []).map((entry, idx) => {
          const id = String(entry.id || entry._id || `billed-${idx}`).trim() || `billed-${idx}`;
          return { ...entry, id };
        }));
        if (updates.attachments) setAttachments(updates.attachments);
      }
    };

    // Note: Comment events (socket-comment-added, updated, deleted) are handled by
    // commentService subscription in the next useEffect block. We don't add those
    // listeners here to avoid duplicate comments.

    const handleActivityAdded = (event) => {
      const { cardId, activity } = event.detail;
      if (cardId === card._id) {
        setActivities(prev => [activity, ...prev]);
      }
    };

    const handleCardCoverUpdate = (event) => {
      const { cardId, coverImage, coverAttachment } = event.detail || {};
      // Use coverImage if provided, fallback to coverAttachment (backend sends coverAttachment)
      const coverData = coverImage || coverAttachment;
      if (cardId === card._id && coverData !== undefined) {
        setCoverImage(coverData);
      }
    };

    // Subscribe to events
    window.addEventListener('socket-card-updated', handleCardUpdate);
    window.addEventListener('socket-card-cover-updated', handleCardCoverUpdate);
    window.addEventListener('socket-activity-added', handleActivityAdded);

    // Cleanup
    return () => {
      window.removeEventListener('socket-card-updated', handleCardUpdate);
      window.removeEventListener('socket-card-cover-updated', handleCardCoverUpdate);
      window.removeEventListener('socket-activity-added', handleActivityAdded);
    };
  }, [card._id, isRealCard]);

  // Subscribe to comment service updates for real-time UI synchronization
  useEffect(() => {
    const cardId = card.id || card._id;
    if (!cardId) return;

    // Subscribe to comment updates from the service
    const unsubscribe = commentService.onCommentsUpdated('card', cardId, (updatedComments, error) => {
      if (error) {
        console.error("Error updating comments:", error);
      } else {
        setComments(updatedComments);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [card._id, card.id]);

  useEffect(() => {
    if (card?._id) {
      fetchSubtasks();
    }
  }, [card?._id]);

  useEffect(() => {
    const hierarchyHandler = (event) => {
      const { taskId, subtasks: incoming } = event.detail || {};
      if (!taskId || taskId !== (card?._id || card?.id)) return;
      if (Array.isArray(incoming)) {
        setSubtasks(incoming);
      } else {
        fetchSubtasks();
      }
    };

    const coverUpdateHandler = (event) => {
      const { subtaskId, coverImage, coverAttachment } = event.detail || {};
      if (!subtaskId) return;
      
      // Use coverImage if provided, fallback to coverAttachment
      const coverData = coverImage || coverAttachment;
      if (coverData === undefined) return;
      
      setSubtasks(prev => prev.map(item => 
        item._id === subtaskId 
          ? { ...item, coverImage: coverData } 
          : item
      ));
    };

    const handleLocalEntityUpdate = (event) => {
      const { entityType, entityId, updates } = event.detail || {};
      
      // 1. Update Subtasks in list
      if (entityType === 'subtask' && updates.coverImage) {
        setSubtasks(prev => prev.map(item => 
          item._id === entityId
            ? { ...item, coverImage: updates.coverImage }
            : item
        ));
      }
      
      // 2. Update Card Self (if not handled by socket-card-cover-updated or if this is faster)
      // Note: card cover is also handled in handleCardCoverUpdate via socket, but this is instant.
      if (entityType === 'card' && (entityId === card._id || entityId === card.id) && updates.coverImage) {
        setCoverImage(updates.coverImage);
      }
    };

    window.addEventListener('socket-subtask-hierarchy', hierarchyHandler);
    window.addEventListener('socket-subtask-cover-updated', coverUpdateHandler);
    window.addEventListener('local-entity-update', handleLocalEntityUpdate);
    
    return () => {
      window.removeEventListener('socket-subtask-hierarchy', hierarchyHandler);
      window.removeEventListener('socket-subtask-cover-updated', coverUpdateHandler);
      window.removeEventListener('local-entity-update', handleLocalEntityUpdate);
    };
  }, [card?._id]);

  // Filter members based on search query and group by department
  useEffect(() => {
    const groupMembers = (members) => {
      const grouped = {};
      members.forEach((member) => {
        const dept =
          member.department &&
          Array.isArray(member.department) &&
          member.department.length > 0
            ? member.department[0]
            : null;
        const deptId = (dept?._id || dept || "Unassigned") || "Unassigned";
        const deptName = dept?.name || "Unassigned";

        if (!grouped[deptId]) {
          grouped[deptId] = {
            department: { _id: deptId, name: deptName },
            members: [],
          };
        }
        grouped[deptId].members.push(member);
      });
      return grouped;
    };

    if (isDropdownOpen) {
      let membersToList = teamMembers;

      if (searchQuery.length > 0) {
        membersToList = teamMembers.filter(
          (member) =>
            member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      const grouped = groupMembers(membersToList);
      setGroupedFilteredMembers(grouped);

      const initialExpanded = {};
      Object.keys(grouped).forEach((deptId) => {
        initialExpanded[deptId] = true;
      });
      setExpandedDepartments(initialExpanded);
    } else {
      setGroupedFilteredMembers({});
    }
  }, [searchQuery, teamMembers, isDropdownOpen]);

  // Memoized member selection handlers
  const handleSelectMember = useCallback((memberId) => {
    if (!memberId) return;
    if (!assignees.includes(memberId)) {
      setAssignees(prev => [...prev, memberId]);
    }
  }, [assignees]);

  const handleRemoveAssignee = useCallback((memberId) => {
    setAssignees(prev => prev.filter(id => id !== memberId));
  }, []);

  const toggleDepartment = useCallback((deptId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  }, []);

  const loadProjectName = async () => {
    const boardId = card.board?._id || card.board;
    if (!boardId) {
      setHierarchyProject({ _id: null, name: "Project" });
      return;
    }
    try {
      const response = await Database.getProject(boardId);
      const projectData = response.data;
      const fallbackName = projectData?.name || "Unknown Project";
      setHierarchyProject(projectData || { _id: boardId, name: fallbackName });
    } catch (error) {
      console.error("Error loading project name:", error);
      setHierarchyProject({ _id: boardId, name: "Project" });
    }
  };

  // Image upload helpers for editors
  const uploadImageForDescription = async (formData) => {
    try {
      const res = await Database.uploadImage(card._id || card.id, formData, 'card-image', true);
      return res.url;
    } catch (err) {
      console.error('Error uploading description image:', err);
      toast.error('Failed to upload image');
      throw err;
    }
  };

  const uploadImageForComment = async (formData) => {
    try {
      const res = await Database.uploadImage(card._id || card.id, formData, 'comment-image', false);
      return res.url;
    } catch (err) {
      console.error('Error uploading comment image:', err);
      toast.error('Failed to upload image');
      throw err;
    }
  };

  const loadAvailableStatuses = async () => {
    try {
      const boardId = card.board?._id || card.board;
      if (boardId) {
        const response = await Database.getLists(boardId);
        const statuses = response.data.map(list => ({
          value: list.title.toLowerCase().replace(/\s+/g, '-'),
          label: list.title
        }));
        setAvailableStatuses(statuses);
      }
    } catch (error) {
      console.error("Error loading available statuses:", error);
      // Fallback to default statuses
      setAvailableStatuses([
        { value: 'todo', label: 'To-Do' },
        { value: 'in-progress', label: 'In Progress' },
        { value: 'review', label: 'Review' },
        { value: 'done', label: 'Done' }
      ]);
    }
  };

  const loadComments = async () => {
    const cardId = card.id || card._id;
    if (!cardId) return;
    try {
      const cardComments = await commentService.fetchComments('card', cardId);
      setComments(cardComments);
    } catch (error) {
      console.error("Error loading comments:", error);
    }
  };

  const loadActivities = async () => {
    const cardId = card.id || card._id;
    if (!cardId) return;
    setActivitiesLoading(true);
    try {
      const response = await Database.getCardActivity(cardId, 100, 1);
      setActivities(response.data || []);
    } catch (error) {
      console.error("Error loading activities:", error);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const users = await Database.getUsers();
      setTeamMembers(users.data || []);
    } catch (error) {
      console.error("Error loading team members:", error);
      setTeamMembers([]);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await useDepartmentStore.getState().loadDepartments();
      setDepartments(response || []);
    } catch (error) {
      console.error("Error loading departments:", error);
      setDepartments([]);
    }
  };

  const normalizeTime = (hours, minutes) => {
    const totalMinutes = parseInt(hours || 0) * 60 + parseInt(minutes || 0);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  };

  /**
   * Time tracking entry handlers
   * CRITICAL: New entries must NOT have _id field - this tells the backend it's a new entry
   * The backend will:
   * 1. Assign req.user.id as the owner for entries without _id
   * 2. Preserve the original user for entries WITH _id
   */
  const handleAddEstimation = useCallback(() => {
    // Check validation error first
    if (estimationValidationError) {
      toast.error(estimationValidationError);
      return;
    }

    const hours = parseInt(newEstimationHours || 0);
    const minutes = parseInt(newEstimationMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newEstimationReason.trim()) {
      toast.error("Please enter a valid estimation time and reason.");
      return;
    }

    // Use selected date or default to today
    const selectedDate = newEstimationDate || getTodayDate();
    const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      // NO _id field - backend will detect this as new entry and assign current user
      id: `new-estimation-${Date.now()}`, // Only for React key, not for backend
      hours: normalized.hours,
      minutes: normalized.minutes,
      reason: newEstimationReason,
      // Store user info for immediate UI display (backend will override with req.user)
      user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar },
      userName: user.name, // Denormalized for display
      date: dateObj.toISOString(),
    };

    setEstimationEntries(prev => [...prev, newEntry]);
    setNewEstimationHours("");
    setNewEstimationMinutes("");
    setNewEstimationReason("");
    setNewEstimationDate("");
    toast.success("Estimation added successfully!");
  }, [newEstimationHours, newEstimationMinutes, newEstimationReason, newEstimationDate, estimationValidationError, user._id, user.name, user.email, user.avatar]);

  const handleAddLoggedTime = useCallback(() => {
    // Check validation error first
    if (loggedValidationError) {
      toast.error(loggedValidationError);
      return;
    }

    const hours = parseInt(newLoggedHours || 0);
    const minutes = parseInt(newLoggedMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newLoggedDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    // Use selected date or default to today
    const selectedDate = newLoggedDate || getTodayDate();
    const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      // NO _id field - backend will detect this as new entry and assign current user
      id: `new-logged-${Date.now()}`, // Only for React key, not for backend
      hours: normalized.hours,
      minutes: normalized.minutes,
      description: newLoggedDescription,
      // Store user info for immediate UI display (backend will override with req.user)
      user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar },
      userName: user.name, // Denormalized for display
      date: dateObj.toISOString(),
    };

    setLoggedTime(prev => [...prev, newEntry]);
    setNewLoggedHours("");
    setNewLoggedMinutes("");
    setNewLoggedDescription("");
    setNewLoggedDate("");
    toast.success("Time logged successfully!");
  }, [newLoggedHours, newLoggedMinutes, newLoggedDescription, newLoggedDate, loggedValidationError, user._id, user.name, user.email, user.avatar]);

  const handleAddBilledTime = useCallback(() => {
    // Check validation error first
    if (billedValidationError) {
      toast.error(billedValidationError);
      return;
    }

    const hours = parseInt(newBilledHours || 0);
    const minutes = parseInt(newBilledMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newBilledDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    // Use selected date or default to today
    const selectedDate = newBilledDate || getTodayDate();
    const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      // NO _id field - backend will detect this as new entry and assign current user
      id: `new-billed-${Date.now()}`, // Only for React key, not for backend
      hours: normalized.hours,
      minutes: normalized.minutes,
      description: newBilledDescription,
      // Store user info for immediate UI display (backend will override with req.user)
      user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar },
      userName: user.name, // Denormalized for display
      date: dateObj.toISOString(),
    };

    setBilledTime(prev => [...prev, newEntry]);
    setNewBilledHours("");
    setNewBilledMinutes("");
    setNewBilledDescription("");
    setNewBilledDate("");
    toast.success("Billed time added successfully!");
  }, [newBilledHours, newBilledMinutes, newBilledDescription, newBilledDate, billedValidationError, user._id, user.name, user.email, user.avatar]);

  const startEditingEstimation = useCallback((entry) => {
    // Ownership check - only allow editing own entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingEstimation(entry.id);
    setEditEstimationHours(entry.hours.toString());
    setEditEstimationMinutes(entry.minutes.toString());
    setEditEstimationReason(entry.reason);
  }, [userOwnsTimeEntry]);

  const startEditingLogged = useCallback((entry) => {
    // Ownership check - only allow editing own entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingLogged(entry.id);
    setEditLoggedHours(entry.hours.toString());
    setEditLoggedMinutes(entry.minutes.toString());
    setEditLoggedDescription(entry.description);
  }, [userOwnsTimeEntry]);

  const saveEstimationEdit = useCallback((id) => {
    const hours = parseInt(editEstimationHours || 0);
    const minutes = parseInt(editEstimationMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editEstimationReason.trim()) {
      toast.error("Please enter a valid estimation time and reason.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setEstimationEntries(prev =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              hours: normalized.hours,
              minutes: normalized.minutes,
              reason: editEstimationReason,
            }
          : entry
      )
    );
    setEditingEstimation(null);
    setEditEstimationHours("");
    setEditEstimationMinutes("");
    setEditEstimationReason("");
    toast.success("Estimation updated successfully!");
  }, [editEstimationHours, editEstimationMinutes, editEstimationReason]);

  const saveLoggedEdit = useCallback((id) => {
    const hours = parseInt(editLoggedHours || 0);
    const minutes = parseInt(editLoggedMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editLoggedDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setLoggedTime(prev =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              hours: normalized.hours,
              minutes: normalized.minutes,
              description: editLoggedDescription,
            }
          : entry
      )
    );
    setEditingLogged(null);
    setEditLoggedHours("");
    setEditLoggedMinutes("");
    setEditLoggedDescription("");
    toast.success("Logged time updated successfully!");
  }, [editLoggedHours, editLoggedMinutes, editLoggedDescription]);

  const cancelEstimationEdit = useCallback(() => {
    setEditingEstimation(null);
    setEditEstimationHours("");
    setEditEstimationMinutes("");
    setEditEstimationReason("");
  }, []);

  const cancelLoggedEdit = useCallback(() => {
    setEditingLogged(null);
    setEditLoggedHours("");
    setEditLoggedMinutes("");
    setEditLoggedDescription("");
  }, []);

  const startEditingBilled = useCallback((entry) => {
    // Ownership check - only allow editing own entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingBilled(entry.id);
    setEditBilledHours(entry.hours.toString());
    setEditBilledMinutes(entry.minutes.toString());
    setEditBilledDescription(entry.description);
  }, [userOwnsTimeEntry]);

  const saveBilledEdit = useCallback((id) => {
    const hours = parseInt(editBilledHours || 0);
    const minutes = parseInt(editBilledMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editBilledDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setBilledTime(prev =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              hours: normalized.hours,
              minutes: normalized.minutes,
              description: editBilledDescription,
            }
          : entry
      )
    );
    setEditingBilled(null);
    setEditBilledHours("");
    setEditBilledMinutes("");
    setEditBilledDescription("");
    toast.success("Billed time updated successfully!");
  }, [editBilledHours, editBilledMinutes, editBilledDescription]);

  const cancelBilledEdit = useCallback(() => {
    setEditingBilled(null);
    setEditBilledHours("");
    setEditBilledMinutes("");
    setEditBilledDescription("");
  }, []);

  // Memoized delete handlers for time tracking entries with ownership validation
  const confirmDeleteEstimation = useCallback((id) => {
    // Find the entry and check ownership
    const entry = estimationEntries.find(e => e.id === id || e._id === id);
    if (entry && !userOwnsTimeEntry(entry)) {
      toast.error("You can only delete your own time entries");
      return;
    }
    setEstimationEntries(prev => prev.filter((entry) => entry.id !== id && entry._id !== id));
    toast.info("Estimation entry removed");
  }, [estimationEntries, userOwnsTimeEntry]);

  const confirmDeleteLoggedTime = useCallback((id) => {
    // Find the entry and check ownership
    const entry = loggedTime.find(e => e.id === id || e._id === id);
    if (entry && !userOwnsTimeEntry(entry)) {
      toast.error("You can only delete your own time entries");
      return;
    }
    setLoggedTime(prev => prev.filter((entry) => entry.id !== id && entry._id !== id));
    toast.info("Time entry removed");
  }, [loggedTime, userOwnsTimeEntry]);

  const confirmDeleteBilledTime = useCallback((id) => {
    // Find the entry and check ownership
    const entry = billedTime.find(e => e.id === id || e._id === id);
    if (entry && !userOwnsTimeEntry(entry)) {
      toast.error("You can only delete your own time entries");
      return;
    }
    setBilledTime(prev => prev.filter((entry) => entry.id !== id && entry._id !== id));
    toast.info("Billed time entry removed");
  }, [billedTime, userOwnsTimeEntry]);

  const handleSave = async () => {
    const cardId = card._id || card.id;
    if (!cardId) {
      toast.error("Invalid card ID");
      return;
    }

    // Optimistic Save: Close immediately, show success, then background sync
    try {
      // Convert labels to IDs for backend, but keep full objects for optimistic update
      const labelIds = labels.map(l => typeof l === 'object' ? l._id : l);
      
      // Get full assignee objects from teamMembers for optimistic UI
      const assigneeObjects = assignees.map(assigneeId => {
        // Check if it's already an object
        if (typeof assigneeId === 'object' && assigneeId._id) return assigneeId;
        // Find in team members
        const member = teamMembers.find(m => m._id === assigneeId);
        return member || { _id: assigneeId, name: 'Unknown', email: '' };
      });
      
      /**
       * Helper to prepare time entry for backend
       * CRITICAL: Include _id for existing entries to preserve ownership
       * Exclude _id for new entries so backend assigns current user
       */
      const prepareTimeEntry = (entry, type) => {
        const userId = entry.user
          ? (typeof entry.user === 'object' ? entry.user._id : entry.user)
          : null;
        
        const prepared = {
          hours: entry.hours,
          minutes: entry.minutes,
          date: entry.date,
        };
        
        // Include _id only for existing entries (valid MongoDB ObjectId)
        // This tells backend to preserve original ownership
        if (entry._id && /^[a-fA-F0-9]{24}$/.test(entry._id.toString())) {
          prepared._id = entry._id;
        }
        
        // Include user reference
        if (userId) {
          prepared.user = userId;
        }
        
        // Include type-specific fields
        if (type === 'estimation') {
          prepared.reason = entry.reason;
        } else {
          prepared.description = entry.description;
        }
        
        return prepared;
      };
      
      // Create updates for backend (with IDs)
      const backendUpdates = {
        title,
        description,
        assignees: assignees.length > 0 ? assignees : null,
        priority: priority || null,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        labels: labelIds,
        attachments: attachments.length > 0 ? attachments : [],
        coverImage: coverImage ? (typeof coverImage === 'object' ? coverImage._id : coverImage) : null,
        // Properly prepare time entries with _id preservation for ownership
        estimationTime: estimationEntries.map(entry => prepareTimeEntry(entry, 'estimation')),
        loggedTime: loggedTime.map(entry => prepareTimeEntry(entry, 'logged')),
        billedTime: billedTime.map(entry => prepareTimeEntry(entry, 'billed')),
      };
      
      // Include full label objects for optimistic UI update
      backendUpdates._labelsPopulated = labels.filter(l => typeof l === 'object' && l.name);
      // Include full assignee objects for optimistic UI update
      backendUpdates._assigneesPopulated = assigneeObjects;
      // Include full coverImage object for optimistic UI update
      if (coverImage) {
        if (typeof coverImage === 'object' && coverImage.url) {
          // Already a full object with URL
          backendUpdates._coverImagePopulated = coverImage;
        } else {
          // coverImage is an ID string or object without url - try to find the full object
          const coverImageId = typeof coverImage === 'object' ? coverImage._id : coverImage;
          
          // First try from local attachments state
          let coverAttachment = attachments.find(att => 
            (att._id === coverImageId || att.id === coverImageId) && att.url
          );
          
          // If not found in local state, try from attachment store
          if (!coverAttachment) {
            const entityKey = getEntityKey('card', card._id || card.id);
            const storeAttachments = useAttachmentStore.getState().attachments[entityKey] || [];
            coverAttachment = storeAttachments.find(att => 
              (att._id === coverImageId || att.id === coverImageId) && att.url
            );
          }
          
          if (coverAttachment) {
            backendUpdates._coverImagePopulated = coverAttachment;
          }
        }
      }
      
      const updates = backendUpdates;

      // Check if status has changed and move card if needed
      // Note: This part is tricky to do optimistically if it fails, but for UI speed we proceed
      if (status !== card.status) {
        // Move card logic - we trigger this but don't await to block the UI close
         Database.getLists(card.board?._id || card.board || currentProject?._id).then(listsResponse => {
            const targetListObj = listsResponse.data.find(list =>
              list.title.toLowerCase().replace(/\s+/g, '-') === status
            );
            if (targetListObj) {
               onMoveCard(card._id, targetListObj._id, 0).catch(console.error);
            }
         }).catch(console.error);
      }

      // Fire and forget (from UI perspective)
      onUpdate(updates).catch(error => {
         console.error("Background save failed:", error);
         toast.error("Failed to save changes regarding the last update. Please refresh.");
      });
      
      // Immediate feedback
      toast.success("Task updated!");
      onClose();
    } catch (error) {
      console.error("Error preparing save:", error);
      toast.error("Failed to save changes");
    }
  };

  const handleAddComment = async () => {
    // newComment may be HTML; check plain text or HTML content (images, etc.)
    const plain = (newComment || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    const hasHtmlContent = newComment && /<img|<a|<div/.test(newComment);
    if (!plain && !hasHtmlContent) return;
    const cardId = card.id || card._id;
    if (!cardId) return;

    try {
      // Use optimistic update
      const { promise } = await commentService.addCommentOptimistic({
        type: 'card',
        entityId: cardId,
        htmlContent: newComment,
        user
      });

      // Clear input immediately
      setNewComment("");
      
      // Show success toast immediately
      toast.success("Comment added!");

      // Wait for server save in background
      try {
        await promise;
      } catch (error) {
        toast.error("Failed to save comment to server");
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    }
  };

  const handleDeleteAttachment = (attachmentIdOrIndex) => {
    // Remove attachment by comparing with both _id and index
    const filteredAttachments = attachments.filter((a, idx) => {
      const attachmentId = a._id || a.id;
      // Return true to keep, false to remove
      if (attachmentIdOrIndex === idx) return false; // If passed index
      if (attachmentId === attachmentIdOrIndex) return false; // If passed ID
      return true;
    });
    setAttachments(filteredAttachments);
  };

  // Handle comment edit
  const handleEditComment = async (commentId, newContent) => {
    const cardId = card.id || card._id;
    if (!cardId || !commentId) return;

    try {
      await commentService.updateComment(commentId, newContent, 'card', cardId);
      // State is updated via commentService.onCommentsUpdated subscription
      toast.success("Comment updated!");
    } catch (error) {
      console.error("Error updating comment:", error);
      toast.error("Failed to update comment");
    }
  };

  // Handle comment delete
  const handleDeleteComment = async (commentId) => {
    const cardId = card.id || card._id;
    if (!cardId || !commentId) return;

    try {
      await commentService.deleteComment(commentId, 'card', cardId);
      // State is updated via commentService.onCommentsUpdated subscription
      toast.success("Comment deleted!");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Failed to delete comment");
    }
  };

  const fetchSubtasks = async () => {
    if (!card?._id) return;
    setSubtasksLoading(true);
    try {
      const response = await Database.getSubtasks(card._id);
      setSubtasks(response.data || []);
    } catch (error) {
      console.error("Error loading subtasks:", error);
    } finally {
      setSubtasksLoading(false);
    }
  };

  // Recurring Task Functions
  const handleSaveRecurrence = async (recurrenceData) => {
    try {
      if (existingRecurrence) {
        // Update existing recurrence
        await Database.updateRecurrence(existingRecurrence._id, recurrenceData);
        const response = await Database.getRecurrenceByCard(card._id);
        setExistingRecurrence(response.data || null);
      } else {
        // Create new recurrence
        await Database.createRecurrence(recurrenceData);
        const response = await Database.getRecurrenceByCard(card._id);
        setExistingRecurrence(response.data || null);
      }
      // Refresh subtasks to show newly created recurring subtask
      fetchSubtasks();
    } catch (error) {
      console.error("Error saving recurrence:", error);
      throw error;
    }
  };

  const handleDeleteRecurrence = async (recurrenceId) => {
    try {
      await Database.deleteRecurrence(recurrenceId);
      setExistingRecurrence(null);
    } catch (error) {
      console.error("Error deleting recurrence:", error);
      throw error;
    }
  };

  const handleCreateSubtask = async () => {
    if (!newSubtaskTitle.trim() || !card?._id) return;
    try {
      await Database.createSubtask(card._id, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle("");
      fetchSubtasks();
    } catch (error) {
      console.error("Error creating subtask:", error);
      toast.error("Failed to create subtask");
    }
  };

  const handleToggleSubtask = async (subtask) => {
    if (!subtask?._id) return;
    try {
      await Database.updateSubtask(subtask._id, {
        status: subtask.status === 'done' || subtask.completed ? 'todo' : 'done'
      });
      fetchSubtasks();
    } catch (error) {
      console.error("Error updating subtask:", error);
      toast.error("Failed to update subtask");
    }
  };

  const handleDeleteSubtask = async (subtask) => {
    if (!subtask?._id) return;
    // Open app DeletePopup instead of using browser confirm
    setDeletePopup({ isOpen: true, type: 'subtask', data: subtask });
  };

  const handleConfirmGlobalDelete = async () => {
    const { type, data } = deletePopup;
    if (!type) return;

    try {
      if (type === 'subtask' && data && data._id) {
        setDeleteLoading(true);
        await Database.deleteSubtask(data._id);
        await fetchSubtasks();
        toast.success("Subtask deleted");
      } else if (type === 'task') {
        setDeleteLoading(true);
        await executeDelete();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    } finally {
      setDeleteLoading(false);
      setDeletePopup(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleOpenSubtask = (subtask) => {
    if (!subtask?._id) return;
    onOpenChild?.({
      type: 'subtask',
      entityId: subtask._id,
      label: subtask.title,
      initialData: subtask,
      parentId: card._id
    });
  };

  // Memoized utility functions
  const getPriorityColor = useCallback((priority) => {
    const colors = {
      critical: "bg-red-100 text-red-700 border-red-300",
      high: "bg-orange-100 text-orange-700 border-orange-300",
      medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
      low: "bg-green-100 text-green-700 border-green-300",
    };
    return (
      colors[priority?.toLowerCase()] ||
      "bg-gray-100 text-gray-700 border-gray-300"
    );
  }, []);

  const getStatusColor = useCallback((status) => {
    const colors = {
      done: "bg-green-100 text-green-700",
      "in-progress": "bg-blue-100 text-blue-700",
      review: "bg-purple-100 text-purple-700",
      todo: "bg-gray-100 text-gray-700",
    };
    return colors[status?.toLowerCase()] || "bg-gray-100 text-gray-700";
  }, []);

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  };

  const overlayClass = themeOverlay[theme] || themeOverlay.blue;

  const resolvedProjectId =
    (typeof card?.board === "object" && card?.board?._id) ||
    (typeof card?.board === "string" && card.board) ||
    currentProject?._id ||
    null;

  const taskId = card?._id || card?.id;

  // Archive handler
  const handleArchiveCard = async () => {
    if (!taskId) return;
    setIsArchiving(true);
    try {
      const response = await Database.archiveCard(taskId);
      if (response.success && response.data) {
        // Update store with the full response data to ensure isArchived is set correctly
        useWorkflowStore.getState().updateCard(taskId, { 
          ...response.data,
          isArchived: true 
        });
        toast.success("Task archived successfully");
        onClose(); // Close modal
      } else {
        throw new Error('Archive failed');
      }
    } catch (error) {
      console.error("Error archiving card:", error);
      toast.error("Failed to archive task");
    } finally {
      setIsArchiving(false);
      setShowArchiveConfirmation(false);
    }
  };

  // Restore handler
  const handleRestoreCard = async () => {
    if (!taskId) return;
    setIsArchiving(true);
    
    // Dispatch event BEFORE API call for optimistic UI update in WorkFlow.jsx
    // This allows WorkFlow to immediately move the card from archived to active view
    window.dispatchEvent(new CustomEvent('card-restored-from-modal', {
      detail: {
        cardId: taskId,
        card: card // Pass full card data for optimistic update
      }
    }));
    
    try {
      const response = await Database.restoreCard(taskId);
      if (response.success && response.data) {
        // Fetch fully populated card and update locally to avoid UI gaps
        const full = await Database.getCard(taskId);
        const hydrated = full.data || full;
        useWorkflowStore.getState().updateCardLocal(taskId, {
          isArchived: false,
          archivedAt: null,
          autoDeleteAt: null,
          title: hydrated.title,
          description: hydrated.description,
          status: hydrated.status,
          priority: hydrated.priority,
          dueDate: hydrated.dueDate,
          position: hydrated.position,
          assignees: Array.isArray(hydrated.assignees) ? hydrated.assignees : undefined,
          members: Array.isArray(hydrated.members) ? hydrated.members : undefined,
          labels: Array.isArray(hydrated.labels) ? hydrated.labels : undefined,
          coverImage: hydrated.coverImage !== undefined ? hydrated.coverImage : undefined,
          hasRecurrence: hydrated.hasRecurrence,
        });
        toast.success("Task restored successfully");
        onClose(); // Close modal
      } else {
        // Rollback: dispatch event to revert the optimistic update
        window.dispatchEvent(new CustomEvent('card-restore-failed', {
          detail: { cardId: taskId, card }
        }));
        throw new Error('Restore failed');
      }
    } catch (error) {
      console.error("Error restoring card:", error);
      // Rollback: dispatch event to revert the optimistic update
      window.dispatchEvent(new CustomEvent('card-restore-failed', {
        detail: { cardId: taskId, card }
      }));
      toast.error("Failed to restore task");
    } finally {
      setIsArchiving(false);
      setShowRestoreConfirmation(false);
    }
  };

  const executeDelete = async () => {
    if (!taskId || !onDelete) return;
    setDeleteLoading(true);
    try {
      await onDelete(taskId, { skipConfirm: true, showToast: false, closeModals: true });
      toast.success("Deleted successfully");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSidebarDelete = async () => {
    if (!taskId) return;
    // Use DeletePopup instead of window.confirm for consistent UX
    setDeletePopup({ isOpen: true, type: 'task', data: { _id: taskId, title: card?.title } });
  };

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 flex items-start justify-center p-4 overflow-y-auto backdrop-blur-sm ${overlayClass}`}
        style={{ zIndex: 60 + depth }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          ref={modalContentRef}
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl w-full max-w-7xl mt-4 mb-4 shadow-2xl max-h-[95vh] overflow-y-auto relative"
        >
          {cardDataLoading ? (
            <div className="p-6 lg:p-8 animate-pulse">
              {/* Loading Skeleton */}
              <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-2/3"></div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="h-10 w-32 bg-gray-200 rounded"></div>
                  <div className="h-10 w-10 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="h-32 bg-gray-200 rounded"></div>
                  <div className="h-48 bg-gray-200 rounded"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
                <div className="space-y-4">
                  <div className="h-24 bg-gray-200 rounded"></div>
                  <div className="h-24 bg-gray-200 rounded"></div>
                  <div className="h-24 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="flex items-center justify-center mt-8">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="ml-2 text-gray-600">Loading card details...</span>
              </div>
            </div>
          ) : (
          <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
              <div className="flex-1">
                <div className="mb-3">
                  <BreadcrumbNavigation />
                </div>
                <div className="flex items-start gap-3">
                  <AlignLeft
                    size={24}
                    className="text-gray-600 mt-1 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-2xl font-bold w-full border-none outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2 text-gray-900 transition-colors"
                      placeholder="Task title"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {/* Set Recurring Button - Only shown on main task modal */}
                <motion.button
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowRecurringModal(true)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${
                    existingRecurrence
                      ? `bg-gradient-to-r from-${theme}-50 to-${theme}-100 text-${theme}-700 border border-${theme}-200 hover:from-${theme}-100 hover:to-${theme}-150 hover:shadow-md`
                      : `bg-gradient-to-r from-${theme}-500 to-${theme}-600 text-white hover:from-${theme}-600 hover:to-${theme}-700 hover:shadow-lg`
                  }`}
                  title={existingRecurrence ? 'Edit Recurring Settings' : 'Set Recurring'}
                >
                  <RefreshCw size={16} className={`${existingRecurrence ? 'animate-spin-slow text-${theme}-600' : 'text-white'} transition-colors`} />
                  {existingRecurrence ? 'Recurring' : 'Set Recurring'}
                </motion.button>
                <CardActionMenu
                  entityType="task"
                  ids={{
                    projectId: resolvedProjectId,
                    taskId,
                  }}
                  onDelete={executeDelete}
                  onArchive={() => setShowArchiveConfirmation(true)}
                  onUnarchive={() => setShowRestoreConfirmation(true)}
                  isArchived={card?.isArchived || false}
                  isDeleting={deleteLoading}
                  isArchiving={isArchiving}
                  disabled={!taskId}
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                >
                  <X size={24} />
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
              {/* Main Content - 2 columns */}
              <div className="lg:col-span-2 space-y-6 lg:space-y-8">
                {/* Status & Priority Badges */}
                <div className="flex flex-wrap gap-2">
                  {status && (
                    <span
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  )}
                  {priority && (
                    <span
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${getPriorityColor(
                        priority
                      )}`}
                    >
                      <AlertCircle size={14} className="inline mr-1" />
                      {priority}
                    </span>
                  )}
                </div>

                {/* Labels */}
                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {labels.map((label, index) => {
                      // Handle both object labels (new) and string labels (legacy)
                      const isObject = typeof label === 'object' && label !== null;
                      const labelName = isObject ? label.name : String(label || '').trim();
                      const labelColor = isObject && label.color ? label.color : '#3B82F6';
                      const labelId = isObject ? label._id : `label-${index}`;
                      
                      if (!labelName) return null;
                      
                      // Calculate contrasting text color
                      const hex = labelColor.replace('#', '');
                      const r = parseInt(hex.substr(0, 2), 16);
                      const g = parseInt(hex.substr(2, 2), 16);
                      const b = parseInt(hex.substr(4, 2), 16);
                      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                      const textColor = luminance > 0.5 ? '#1F2937' : '#FFFFFF';
                      
                      return (
                        <motion.span
                          key={labelId}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm"
                          style={{
                            backgroundColor: labelColor,
                            color: textColor
                          }}
                        >
                          <Tag size={14} />
                          {labelName}
                        </motion.span>
                      );
                    })}
                  </div>
                )}

                {/* Dates */}
                {(startDate || dueDate) && (
                  <div className="flex gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    {startDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle size={16} className="text-gray-500" style={{ transform: 'rotate(180deg)' }} />
                        <span className="text-gray-600">Start:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(startDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {dueDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle size={16} className="text-gray-500" style={{ transform: 'rotate(180deg)' }} />
                        <span className="text-gray-600">Due:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Card Description Component */}
                <CardDescription
                  description={description}
                  teamMembers={teamMembers}
                  onChange={setDescription}
                  onImageUpload={uploadImageForDescription}
                  modalContainerRef={modalContentRef}
                  cardId={card._id || card.id}
                  onVersionRollback={setDescription}
                />

                {/* Time Tracking Component */}
                <TimeTrackingSection
                  estimationEntries={estimationEntries}
                  loggedTime={loggedTime}
                  billedTime={billedTime}
                  newEstimationHours={newEstimationHours}
                  newEstimationMinutes={newEstimationMinutes}
                  newEstimationReason={newEstimationReason}
                  newEstimationDate={newEstimationDate}
                  newLoggedHours={newLoggedHours}
                  newLoggedMinutes={newLoggedMinutes}
                  newLoggedDescription={newLoggedDescription}
                  newLoggedDate={newLoggedDate}
                  newBilledHours={newBilledHours}
                  newBilledMinutes={newBilledMinutes}
                  newBilledDescription={newBilledDescription}
                  newBilledDate={newBilledDate}
                  editingEstimation={editingEstimation}
                  editingLogged={editingLogged}
                  editingBilled={editingBilled}
                  editEstimationHours={editEstimationHours}
                  editEstimationMinutes={editEstimationMinutes}
                  editEstimationReason={editEstimationReason}
                  editLoggedHours={editLoggedHours}
                  editLoggedMinutes={editLoggedMinutes}
                  editLoggedDescription={editLoggedDescription}
                  editBilledHours={editBilledHours}
                  editBilledMinutes={editBilledMinutes}
                  editBilledDescription={editBilledDescription}
                  onEstimationHoursChange={setNewEstimationHours}
                  onEstimationMinutesChange={setNewEstimationMinutes}
                  onEstimationReasonChange={setNewEstimationReason}
                  onEstimationDateChange={setNewEstimationDate}
                  onLoggedHoursChange={setNewLoggedHours}
                  onLoggedMinutesChange={setNewLoggedMinutes}
                  onLoggedDescriptionChange={setNewLoggedDescription}
                  onLoggedDateChange={setNewLoggedDate}
                  onBilledHoursChange={setNewBilledHours}
                  onBilledMinutesChange={setNewBilledMinutes}
                  onBilledDescriptionChange={setNewBilledDescription}
                  onBilledDateChange={setNewBilledDate}
                  onEditEstimationHoursChange={setEditEstimationHours}
                  onEditEstimationMinutesChange={setEditEstimationMinutes}
                  onEditEstimationReasonChange={setEditEstimationReason}
                  onEditLoggedHoursChange={setEditLoggedHours}
                  onEditLoggedMinutesChange={setEditLoggedMinutes}
                  onEditLoggedDescriptionChange={setEditLoggedDescription}
                  onEditBilledHoursChange={setEditBilledHours}
                  onEditBilledMinutesChange={setEditBilledMinutes}
                  onEditBilledDescriptionChange={setEditBilledDescription}
                  onAddEstimation={handleAddEstimation}
                  onAddLoggedTime={handleAddLoggedTime}
                  onAddBilledTime={handleAddBilledTime}
                  onStartEditingEstimation={startEditingEstimation}
                  onStartEditingLogged={startEditingLogged}
                  onStartEditingBilled={startEditingBilled}
                  onSaveEstimationEdit={saveEstimationEdit}
                  onSaveLoggedEdit={saveLoggedEdit}
                  onSaveBilledEdit={saveBilledEdit}
                  onCancelEstimationEdit={cancelEstimationEdit}
                  onCancelLoggedEdit={cancelLoggedEdit}
                  onCancelBilledEdit={cancelBilledEdit}
                  onConfirmDeleteEstimation={confirmDeleteEstimation}
                  onConfirmDeleteLoggedTime={confirmDeleteLoggedTime}
                  onConfirmDeleteBilledTime={confirmDeleteBilledTime}
                  card={card}
                  estimationValidationError={estimationValidationError}
                  loggedValidationError={loggedValidationError}
                  billedValidationError={billedValidationError}
                  canAccessBilledTime={canAccessBilledTime}
                  billedTimeHiddenReason={billedTimeHiddenReason}
                />

                {/* Subtasks Component */}
                <SubtasksSection
                  items={subtasks}
                  loading={subtasksLoading}
                  newItemTitle={newSubtaskTitle}
                  onNewItemTitleChange={setNewSubtaskTitle}
                  onCreateItem={handleCreateSubtask}
                  onToggleComplete={handleToggleSubtask}
                  onDeleteItem={handleDeleteSubtask}
                  onOpenItem={handleOpenSubtask}
                  theme={theme}
                />

                {/* Attachments Component */}
                <AttachmentsSection 
                  entityType="card"
                  entityId={card._id || card.id}
                  boardId={card?.board?._id || card?.board}
                  onDeleteAttachment={handleDeleteAttachment}
                  onAttachmentAdded={(newAttachments) => {
                    setAttachments(prev => [...prev, ...newAttachments]);
                  }}
                  currentCoverImageId={coverImage?._id || coverImage}
                  onCoverChange={async (coverData) => {
                    // Optimistic UI update: Update local state immediately
                    if (coverData && coverData._id) {
                      setCoverImage(coverData);
                      setCoverImageOptimistic(coverData);
                      
                      // Update the workflow store so the card on the board shows the cover immediately
                      try {
                        await onUpdate({ 
                          coverImage: coverData,
                          _coverImagePopulated: coverData // Include full object for optimistic UI
                        });
                      } catch (error) {
                        console.error('Error updating cover in workflow store:', error);
                      }
                      
                      toast.success('Cover image updated!');
                    }
                  }}
                />

                {/* Comments & Activity Section with Tabs */}
                <div className="mt-8">
                  <TabsContainer 
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabs={[
                      { 
                        id: "comments", 
                        label: "Comments", 
                        icon: MessageSquare,
                        badge: comments.length
                      },
                      { 
                        id: "activity", 
                        label: "Activity", 
                        icon: Activity,
                        badge: activities.length
                      }
                    ]}
                  />
                  
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "comments" ? (
                      <CommentsSection
                        comments={comments}
                        newComment={newComment}
                        teamMembers={teamMembers}
                        onCommentChange={setNewComment}
                        onAddComment={handleAddComment}
                        onImageUpload={uploadImageForComment}
                        modalContainerRef={modalContentRef}
                        onEditComment={handleEditComment}
                        onDeleteComment={handleDeleteComment}
                        cardId={card._id || card.id}
                        enableCloudinaryAttachments={true}
                      />
                    ) : (
                      <ActivitySection
                        activities={activities}
                        loading={activitiesLoading}
                        teamMembers={teamMembers}
                        type="task"
                      />
                    )}
                  </motion.div>
                </div>
              </div>

              {/* Sidebar Component */}
              <CardSidebar
                saving={saving}
                onSave={handleSave}
                assignees={assignees}
                teamMembers={teamMembers}
                priority={priority}
                status={status}
                dueDate={dueDate}
                startDate={startDate}
                labels={labels}
                availableStatuses={availableStatuses}
                searchQuery={searchQuery}
                isDropdownOpen={isDropdownOpen}
                groupedFilteredMembers={groupedFilteredMembers}
                expandedDepartments={expandedDepartments}
                onPriorityChange={setPriority}
                onStatusChange={setStatus}
                onDueDateChange={setDueDate}
                onStartDateChange={setStartDate}
                onLabelsChange={setLabels}
                onSelectMember={handleSelectMember}
                onRemoveAssignee={handleRemoveAssignee}
                onToggleDepartment={toggleDepartment}
                onSearchQueryChange={setSearchQuery}
                onIsDropdownOpenChange={setIsDropdownOpen}
                onDeleteCard={handleSidebarDelete}
                card={card}
                boardId={card?.board?._id || card?.board}
                entityType="card"
              />
            </div>
          </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
    {/* Delete confirmation popup for subtasks */}
    <DeletePopup
      isOpen={deletePopup.isOpen}
      onCancel={() => setDeletePopup(prev => ({ ...prev, isOpen: false }))}
      onConfirm={handleConfirmGlobalDelete}
      itemType={deletePopup.type || 'subtask'}
      isLoading={deleteLoading}
    />

    {/* Recurring Settings Modal - Only for main task (outside AnimatePresence to avoid key conflicts) */}
    <RecurringSettingsModal
      isOpen={showRecurringModal}
      onClose={() => setShowRecurringModal(false)}
      card={card}
      existingRecurrence={existingRecurrence}
      onSave={handleSaveRecurrence}
      onDelete={handleDeleteRecurrence}
    />

    {/* Archive Confirmation Modal */}
    <ArchiveConfirmationModal
      isOpen={showArchiveConfirmation}
      taskName={card?.title || 'Task'}
      onConfirm={handleArchiveCard}
      onCancel={() => setShowArchiveConfirmation(false)}
      isLoading={isArchiving}
    />

    {/* Restore Confirmation Modal */}
    <RestoreConfirmationModal
      isOpen={showRestoreConfirmation}
      taskName={card?.title || 'Task'}
      onConfirm={handleRestoreCard}
      onCancel={() => setShowRestoreConfirmation(false)}
      isLoading={isArchiving}
    />
  </>
  );
});

export default CardDetailModal;
