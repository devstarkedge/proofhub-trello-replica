import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlignLeft, FileText, AlertCircle, Tag } from "lucide-react";
import { toast } from "react-toastify";
import Database from "../services/database";
import commentService from "../services/commentService";
import AuthContext from "../context/AuthContext";
import CardDescription from "./CardDetailModal/CardDescription";
import AttachmentsSection from "./CardDetailModal/AttachmentsSection";
import CommentsSection from "./CardDetailModal/CommentsSection";
import ActivitySection from "./CardDetailModal/ActivitySection";
import TabsContainer from "./CardDetailModal/TabsContainer";
import CardSidebar from "./CardDetailModal/CardSidebar";
import SubtasksSection from "./CardDetailModal/SubtasksSection";
import BreadcrumbNavigation from "./hierarchy/BreadcrumbNavigation";
import useModalHierarchyStore from "../store/modalHierarchyStore";
import useNanoSubtaskStore from "../store/nanoSubtaskStore";
import CardActionMenu from "./CardDetailModal/CardActionMenu";
import TimeTrackingSection from "./CardDetailModal/TimeTrackingSection";
import DeletePopup from "../components/ui/DeletePopup";
import useBilledTimeAccess from "../hooks/useBilledTimeAccess";

const overlayMap = {
  purple: "bg-purple-950/50",
  pink: "bg-pink-950/50"
};

const statusOptions = [
  { value: "todo", label: "To-Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const SubtaskDetailModal = ({
  entityId,
  initialData = {},
  onClose,
  onOpenChild,
  depth = 1,
  theme = "purple",
  onLabelUpdate
}) => {
  const { user } = useContext(AuthContext);
  const [title, setTitle] = useState(initialData.title || "");
  const [description, setDescription] = useState(initialData.description || "");
  const [status, setStatus] = useState(initialData.status || "todo");
  const [priority, setPriority] = useState(initialData.priority || "");
  const [dueDate, setDueDate] = useState(
    initialData.dueDate ? new Date(initialData.dueDate).toISOString().split("T")[0] : ""
  );
  const [startDate, setStartDate] = useState(
    initialData.startDate ? new Date(initialData.startDate).toISOString().split("T")[0] : ""
  );
  const [assignees, setAssignees] = useState(
    initialData.assignees ? initialData.assignees.map(a => (typeof a === "object" ? a._id : a)).filter(Boolean) : []
  );
  const [tags, setTags] = useState(initialData.tags || []);
  const [attachments, setAttachments] = useState(initialData.attachments || []);
  const [teamMembers, setTeamMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupedFilteredMembers, setGroupedFilteredMembers] = useState({});
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("comments");
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [nanoItems, setNanoItems] = useState([]);
  const [nanoLoading, setNanoLoading] = useState(false);
  const [newNanoTitle, setNewNanoTitle] = useState("");
  const [parentTaskId, setParentTaskId] = useState(initialData.task || null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletePopup, setDeletePopup] = useState({ isOpen: false, type: null, data: null });
  const setHierarchyActiveItem = useModalHierarchyStore((state) => state.setActiveItem);
  const currentProject = useModalHierarchyStore((state) => state.currentProject);

  // Check if user can access billed time based on project client info and user role
  const { canAccessBilledTime, hiddenReason: billedTimeHiddenReason } = useBilledTimeAccess(
    currentProject?.clientDetails
  );

  /**
   * Check if the current user owns a time entry
   * Used to prevent users from editing/deleting other users' time entries
   */
  const userOwnsTimeEntry = useCallback((entry) => {
    if (!entry || !user) return false;
    
    // Extract user ID from entry (handles both populated and unpopulated cases)
    const entryUserId = typeof entry.user === 'object' 
      ? (entry.user?._id || entry.user?.id) 
      : entry.user;
    
    // Compare with current user's ID
    return entryUserId?.toString() === user._id?.toString();
  }, [user]);

  /**
   * Helper to normalize time entries from server response
   * CRITICAL: Preserve MongoDB _id for existing entries to maintain ownership integrity
   * The 'id' field is only for React key purposes, never used for backend identification
   */
  const normalizeTimeEntries = (entries, prefix) => {
    return (entries || []).map((entry, idx) => {
      // Use MongoDB _id as the primary identifier if available
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
    normalizeTimeEntries(initialData.estimationTime, 'estimation')
  );
  const [loggedTime, setLoggedTime] = useState(
    normalizeTimeEntries(initialData.loggedTime, 'logged')
  );
  const [billedTime, setBilledTime] = useState(
    normalizeTimeEntries(initialData.billedTime, 'billed')
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

  const overlayClass = overlayMap[theme] || overlayMap.purple;

  useEffect(() => {
    loadSubtask();
    loadTeamMembers();
    loadComments();
    loadActivities();
    loadNanos();
  }, [entityId]);

  useEffect(() => {
    const hierarchyHandler = (event) => {
      const { subtaskId, nanos } = event.detail || {};
      if (!subtaskId || subtaskId !== entityId) return;
      if (Array.isArray(nanos)) {
        setNanoItems(nanos);
      } else {
        loadNanos();
      }
    };

    const coverUpdateHandler = (event) => {
      const { nanoSubtaskId, coverImage, coverAttachment } = event.detail || {};
      if (!nanoSubtaskId) return;
      
      // Use coverImage if provided, fallback to coverAttachment
      const coverData = coverImage || coverAttachment;
      if (coverData === undefined) return;
      
      setNanoItems(prev => prev.map(item => 
        item._id === nanoSubtaskId 
          ? { ...item, coverImage: coverData } 
          : item
      ));
    };

    const handleLocalEntityUpdate = (event) => {
      const { entityType, entityId, updates } = event.detail || {};
      
      // Update Nanos in list
      if ((entityType === 'nano' || entityType === 'subtaskNano') && updates.coverImage) {
        setNanoItems(prev => prev.map(item => 
          item._id === entityId
            ? { ...item, coverImage: updates.coverImage }
            : item
        ));
      }
    };

    window.addEventListener("socket-nano-hierarchy", hierarchyHandler);
    window.addEventListener("socket-nano-cover-updated", coverUpdateHandler);
    window.addEventListener('local-entity-update', handleLocalEntityUpdate);
    
    return () => {
      window.removeEventListener("socket-nano-hierarchy", hierarchyHandler);
      window.removeEventListener("socket-nano-cover-updated", coverUpdateHandler);
      window.removeEventListener('local-entity-update', handleLocalEntityUpdate);
    };
  }, [entityId]);

  // Subscribe to comment service updates for real-time UI synchronization
  useEffect(() => {
    if (!entityId) return;

    // Subscribe to comment updates from the service
    const unsubscribe = commentService.onCommentsUpdated('subtask', entityId, (updatedComments, error) => {
      if (error) {
        console.error("Error updating comments:", error);
      } else {
        setComments(updatedComments);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [entityId]);

  const labelUpdateRef = useRef(onLabelUpdate);
  const modalContentRef = useRef(null);
  useEffect(() => {
    labelUpdateRef.current = onLabelUpdate;
  }, [onLabelUpdate]);

  useEffect(() => {
    if (title && labelUpdateRef.current) {
      labelUpdateRef.current(title);
    }
  }, [title]);

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

  const loadSubtask = async () => {
    try {
      const response = await Database.getSubtask(entityId);
      const data = response.data || response;
      if (!data) return;
      setTitle(data.title);
      setDescription(data.description || "");
      setStatus(data.status || "todo");
      setPriority(data.priority || "");
      setDueDate(data.dueDate ? new Date(data.dueDate).toISOString().split("T")[0] : "");
      setStartDate(data.startDate ? new Date(data.startDate).toISOString().split("T")[0] : "");
      setAssignees(data.assignees ? data.assignees.map(a => (typeof a === "object" ? a._id : a)).filter(Boolean) : []);
      setTags(data.tags || []);
      setAttachments(data.attachments || []);
      setParentTaskId(data.task);
      // Use normalizeTimeEntries to preserve MongoDB _id for ownership tracking
      setEstimationEntries(normalizeTimeEntries(data.estimationTime, 'estimation'));
      setLoggedTime(normalizeTimeEntries(data.loggedTime, 'logged'));
      setBilledTime(normalizeTimeEntries(data.billedTime, 'billed'));
      setHierarchyActiveItem("subtask", data);
    } catch (error) {
      console.error("Error loading subtask:", error);
      toast.error("Failed to load subtask");
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

  const loadComments = async () => {
    try {
      const data = await commentService.fetchComments('subtask', entityId);
      setComments(data || []);
    } catch (error) {
      console.error("Error loading comments:", error);
    }
  };

  const loadActivities = async () => {
    if (!entityId) return;
    setActivitiesLoading(true);
    try {
      const response = await Database.getSubtaskActivity(entityId, 100, 1);
      setActivities(response.data || []);
    } catch (error) {
      console.error("Error loading activities:", error);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadNanos = async () => {
    setNanoLoading(true);
    try {
      const response = await Database.getNanoSubtasks(entityId);
      setNanoItems(response.data || []);
    } catch (error) {
      console.error("Error loading nano subtasks:", error);
    } finally {
      setNanoLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert tags (labels) to IDs if they are objects
      const tagIds = tags.map(t => typeof t === 'object' ? t._id : t);
      
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
      
      const payload = {
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        assignees,
        tags: tagIds,
        attachments,
        // Properly prepare time entries with _id preservation for ownership
        estimationTime: estimationEntries.map(entry => prepareTimeEntry(entry, 'estimation')),
        loggedTime: loggedTime.map(entry => prepareTimeEntry(entry, 'logged')),
        billedTime: billedTime.map(entry => prepareTimeEntry(entry, 'billed'))
      };
      await Database.updateSubtask(entityId, payload);
      toast.success("Subtask updated");
      await loadSubtask();
    } catch (error) {
      console.error("Error saving subtask:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async () => {
    if (!entityId) return;
    setDeleteLoading(true);
    try {
      await Database.deleteSubtask(entityId);
      toast.success("Deleted successfully");
      onClose?.();
    } catch (error) {
      console.error("Error deleting subtask:", error);
      toast.error("Failed to delete subtask");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSidebarDelete = () => {
    setDeletePopup({
      isOpen: true,
      type: 'subtask',
      data: null
    });
  };

  const executeDeleteNano = async (nano) => {
    // Optimistic Delete
    const originalItems = [...nanoItems];
    setNanoItems(prev => prev.filter(item => item._id !== nano._id));

    try {
      await Database.deleteNano(nano._id);
    } catch (error) {
      console.error("Error deleting nano subtask:", error);
      toast.error("Failed to delete nano subtask");
      // Revert
      setNanoItems(originalItems);
    }
  };

  const handleConfirmGlobalDelete = async () => {
    const { type, data } = deletePopup;
    
    if (type === 'subtask') {
      await runDelete();
    } else if (type === 'subtaskNano') {
      await executeDeleteNano(data);
    }
    
    setDeletePopup(prev => ({ ...prev, isOpen: false }));
  };

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

  const handleToggleDepartment = useCallback((deptId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  }, []);

  const handleDeleteAttachment = useCallback((attachmentIdOrIndex) => {
    // Remove attachment by comparing with both _id and index
    setAttachments(prev => prev.filter((a, idx) => {
      const attachmentId = a._id || a.id;
      if (attachmentIdOrIndex === idx) return false;
      if (attachmentId === attachmentIdOrIndex) return false;
      return true;
    }));
  }, []);

  // Memoized nano subtask handlers
  const handleCreateNano = useCallback(async () => {
    if (!newNanoTitle.trim()) return;
    
    // Optimistic UI Update
    const tempId = `temp-${Date.now()}`;
    const optimisticNano = {
       _id: tempId,
       title: newNanoTitle.trim(),
       status: 'todo',
       subtask: entityId,
       task: parentTaskId,
       board: currentProject?._id || initialData.board,
       createdAt: new Date().toISOString()
    };

    try {
      setNanoItems(prev => [...prev, optimisticNano]);
      setNewNanoTitle("");

      // Background API Call
      const response = await Database.createNano(entityId, { title: optimisticNano.title });
      const createdNano = response.data || response;

      // Replace temp item with real item
      setNanoItems(prev => prev.map(item => item._id === tempId ? createdNano : item));
    } catch (error) {
      console.error("Error creating nano subtask:", error);
      toast.error("Failed to create nano subtask");
      // Revert optimization
      setNanoItems(prev => prev.filter(item => item._id !== tempId));
    }
  }, [newNanoTitle, entityId, parentTaskId, currentProject?._id, initialData.board]);

  const handleToggleNano = useCallback(async (nano) => {
    if (!nano?._id) return;
    
    // Optimistic Toggle
    const newStatus = nano.status === "done" ? "todo" : "done";
    
    setNanoItems(prev => prev.map(item => 
       item._id === nano._id ? { ...item, status: newStatus } : item
    ));

    try {
      await Database.updateNano(nano._id, { status: newStatus });
      // No need to reload, we already updated state
    } catch (error) {
      console.error("Error updating nano subtask:", error);
      toast.error("Failed to update nano subtask");
      // Revert on failure
      setNanoItems(prev => prev.map(item => 
         item._id === nano._id ? { ...item, status: nano.status } : item
      ));
    }
  }, []);

  const handleDeleteNano = useCallback((nano) => {
    if (!nano?._id) return;
    setDeletePopup({
      isOpen: true,
      type: 'subtaskNano',
      data: nano
    });
  }, []);

  const handleOpenNano = useCallback((nano) => {
    if (!nano?._id) return;
    onOpenChild?.({
      type: "subtaskNano",
      entityId: nano._id,
      label: nano.title,
      initialData: nano,
      parentId: entityId,
      taskId: parentTaskId
    });
  }, [onOpenChild, entityId, parentTaskId]);

  const handleAddComment = async () => {
    const plain = (newComment || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!plain) return;
    if (!parentTaskId) {
      toast.error("Parent task not available yet");
      return;
    }
    try {
      // Use optimistic update
      const { promise } = await commentService.addCommentOptimistic({
        type: 'subtask',
        entityId,
        htmlContent: newComment,
        user,
        parentTaskId
      });

      // Clear input immediately
      setNewComment("");
      
      // Show success toast immediately
      toast.success("Comment added");

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

  // Handle comment edit
  const handleEditComment = async (commentId, newContent) => {
    if (!entityId || !commentId) return;

    try {
      await commentService.updateComment(commentId, newContent, 'subtask', entityId);
      toast.success("Comment updated!");
    } catch (error) {
      console.error("Error updating comment:", error);
      toast.error(error.message || "Failed to update comment");
    }
  };

  // Handle comment delete
  const handleDeleteComment = async (commentId) => {
    if (!entityId || !commentId) return;

    try {
      await commentService.deleteComment(commentId, 'subtask', entityId);
      toast.success("Comment deleted!");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error(error.message || "Failed to delete comment");
    }
  };

  // Time Tracking Handlers
  /**
   * Time tracking handlers
   * CRITICAL: New entries must NOT have _id field - this tells the backend it's a new entry
   * The backend will assign req.user.id as the owner for entries without _id
   */
  const handleAddEstimation = async () => {
    // Check validation error first
    if (estimationValidationError) {
      toast.error(estimationValidationError);
      return;
    }
    if (!newEstimationHours && !newEstimationMinutes) return;
    try {
      const hours = parseInt(newEstimationHours) || 0;
      const minutes = parseInt(newEstimationMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      
      // Use selected date or default to today
      const selectedDate = newEstimationDate || getTodayDate();
      const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues
      
      const newEntry = {
        // NO _id field - backend will detect this as new entry and assign current user
        id: `new-estimation-${Date.now()}`, // Only for React key, not for backend
        hours,
        minutes,
        reason: newEstimationReason,
        totalMinutes,
        date: dateObj.toISOString(),
        // Store user info for immediate UI display (backend will override with req.user)
        user: user ? { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } : null,
        userName: user?.name // Denormalized for display
      };
      const updatedEntries = [...estimationEntries, newEntry];
      setEstimationEntries(updatedEntries);
      setNewEstimationHours("");
      setNewEstimationMinutes("");
      setNewEstimationReason("");
      setNewEstimationDate("");
      toast.success("Estimation added");
    } catch (error) {
      console.error("Error adding estimation:", error);
      toast.error("Failed to add estimation");
    }
  };

  const handleEditEstimation = (entry) => {
    // Ownership check: Only allow editing own time entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingEstimation(entry.id);
    setEditEstimationHours(entry.hours || 0);
    setEditEstimationMinutes(entry.minutes || 0);
    setEditEstimationReason(entry.reason || "");
  };

  const handleSaveEstimationEdit = async () => {
    try {
      const hours = parseInt(editEstimationHours) || 0;
      const minutes = parseInt(editEstimationMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const updatedEntries = estimationEntries.map(entry =>
        entry.id === editingEstimation
          ? { ...entry, hours, minutes, reason: editEstimationReason, totalMinutes }
          : entry
      );
      setEstimationEntries(updatedEntries);
      setEditingEstimation(null);
      setEditEstimationHours("");
      setEditEstimationMinutes("");
      setEditEstimationReason("");
      toast.success("Estimation updated");
    } catch (error) {
      console.error("Error updating estimation:", error);
      toast.error("Failed to update estimation");
    }
  };

  const handleCancelEstimationEdit = () => {
    setEditingEstimation(null);
    setEditEstimationHours("");
    setEditEstimationMinutes("");
    setEditEstimationReason("");
  };

  const handleDeleteEstimation = async (entryId) => {
    try {
      // Find the entry to check ownership
      const entry = estimationEntries.find(e => e.id === entryId);
      if (entry && !userOwnsTimeEntry(entry)) {
        toast.error("You can only delete your own time entries");
        return;
      }
      const updatedEntries = estimationEntries.filter(entry => entry.id !== entryId);
      setEstimationEntries(updatedEntries);
      toast.success("Estimation deleted");
    } catch (error) {
      console.error("Error deleting estimation:", error);
      toast.error("Failed to delete estimation");
    }
  };

  const handleAddLoggedTime = async () => {
    // Check validation error first
    if (loggedValidationError) {
      toast.error(loggedValidationError);
      return;
    }
    if (!newLoggedHours && !newLoggedMinutes) return;
    try {
      const hours = parseInt(newLoggedHours) || 0;
      const minutes = parseInt(newLoggedMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      
      // Use selected date or default to today
      const selectedDate = newLoggedDate || getTodayDate();
      const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues
      
      const newEntry = {
        // NO _id field - backend will detect this as new entry and assign current user
        id: `new-logged-${Date.now()}`, // Only for React key, not for backend
        hours,
        minutes,
        description: newLoggedDescription,
        totalMinutes,
        date: dateObj.toISOString(),
        // Store user info for immediate UI display (backend will override with req.user)
        user: user ? { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } : null,
        userName: user?.name // Denormalized for display
      };
      const updatedEntries = [...loggedTime, newEntry];
      setLoggedTime(updatedEntries);
      setNewLoggedHours("");
      setNewLoggedMinutes("");
      setNewLoggedDescription("");
      setNewLoggedDate("");
      toast.success("Logged time added");
    } catch (error) {
      console.error("Error adding logged time:", error);
      toast.error("Failed to add logged time");
    }
  };

  const handleEditLoggedTime = (entry) => {
    // Ownership check: Only allow editing own time entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingLogged(entry.id);
    setEditLoggedHours(entry.hours || 0);
    setEditLoggedMinutes(entry.minutes || 0);
    setEditLoggedDescription(entry.description || "");
  };

  const handleSaveLoggedTimeEdit = async () => {
    try {
      const hours = parseInt(editLoggedHours) || 0;
      const minutes = parseInt(editLoggedMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const updatedEntries = loggedTime.map(entry =>
        entry.id === editingLogged
          ? { ...entry, hours, minutes, description: editLoggedDescription, totalMinutes }
          : entry
      );
      setLoggedTime(updatedEntries);
      setEditingLogged(null);
      setEditLoggedHours("");
      setEditLoggedMinutes("");
      setEditLoggedDescription("");
      toast.success("Logged time updated");
    } catch (error) {
      console.error("Error updating logged time:", error);
      toast.error("Failed to update logged time");
    }
  };

  const handleCancelLoggedTimeEdit = () => {
    setEditingLogged(null);
    setEditLoggedHours("");
    setEditLoggedMinutes("");
    setEditLoggedDescription("");
  };

  const handleDeleteLoggedTime = async (entryId) => {
    try {
      // Find the entry to check ownership
      const entry = loggedTime.find(e => e.id === entryId);
      if (entry && !userOwnsTimeEntry(entry)) {
        toast.error("You can only delete your own time entries");
        return;
      }
      const updatedEntries = loggedTime.filter(entry => entry.id !== entryId);
      setLoggedTime(updatedEntries);
      toast.success("Logged time deleted");
    } catch (error) {
      console.error("Error deleting logged time:", error);
      toast.error("Failed to delete logged time");
    }
  };

  const handleAddBilledTime = async () => {
    // Check validation error first
    if (billedValidationError) {
      toast.error(billedValidationError);
      return;
    }
    if (!newBilledHours && !newBilledMinutes) return;
    try {
      const hours = parseInt(newBilledHours) || 0;
      const minutes = parseInt(newBilledMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      
      // Use selected date or default to today
      const selectedDate = newBilledDate || getTodayDate();
      const dateObj = new Date(selectedDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues
      
      const newEntry = {
        // NO _id field - backend will detect this as new entry and assign current user
        id: `new-billed-${Date.now()}`, // Only for React key, not for backend
        hours,
        minutes,
        description: newBilledDescription,
        totalMinutes,
        date: dateObj.toISOString(),
        // Store user info for immediate UI display (backend will override with req.user)
        user: user ? { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } : null,
        userName: user?.name // Denormalized for display
      };
      const updatedEntries = [...billedTime, newEntry];
      setBilledTime(updatedEntries);
      setNewBilledHours("");
      setNewBilledMinutes("");
      setNewBilledDescription("");
      setNewBilledDate("");
      toast.success("Billed time added");
    } catch (error) {
      console.error("Error adding billed time:", error);
      toast.error("Failed to add billed time");
    }
  };

  const handleEditBilledTime = (entry) => {
    // Ownership check: Only allow editing own time entries
    if (!userOwnsTimeEntry(entry)) {
      toast.error("You can only edit your own time entries");
      return;
    }
    setEditingBilled(entry.id);
    setEditBilledHours(entry.hours || 0);
    setEditBilledMinutes(entry.minutes || 0);
    setEditBilledDescription(entry.description || "");
  };

  const handleSaveBilledTimeEdit = async () => {
    try {
      const hours = parseInt(editBilledHours) || 0;
      const minutes = parseInt(editBilledMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const updatedEntries = billedTime.map(entry =>
        entry.id === editingBilled
          ? { ...entry, hours, minutes, description: editBilledDescription, totalMinutes }
          : entry
      );
      setBilledTime(updatedEntries);
      setEditingBilled(null);
      setEditBilledHours("");
      setEditBilledMinutes("");
      setEditBilledDescription("");
      toast.success("Billed time updated");
    } catch (error) {
      console.error("Error updating billed time:", error);
      toast.error("Failed to update billed time");
    }
  };

  const handleCancelBilledTimeEdit = () => {
    setEditingBilled(null);
    setEditBilledHours("");
    setEditBilledMinutes("");
    setEditBilledDescription("");
  };

  const handleDeleteBilledTime = async (entryId) => {
    try {
      // Find the entry to check ownership
      const entry = billedTime.find(e => e.id === entryId);
      if (entry && !userOwnsTimeEntry(entry)) {
        toast.error("You can only delete your own time entries");
        return;
      }
      const updatedEntries = billedTime.filter(entry => entry.id !== entryId);
      setBilledTime(updatedEntries);
      toast.success("Billed time deleted");
    } catch (error) {
      console.error("Error deleting billed time:", error);
      toast.error("Failed to delete billed time");
    }
  };

  const resolvedProjectId =
    currentProject?._id ||
    (typeof (initialData.board || initialData.project) === "object"
      ? initialData.board?._id || initialData.project?._id
      : initialData.board || initialData.project) ||
    null;
  const resolvedTaskId =
    parentTaskId ||
    (typeof initialData.task === "object" ? initialData.task?._id : initialData.task) ||
    null;

  return (
    <>
    <AnimatePresence>
      <motion.div
        key="subtask-detail-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 flex items-start justify-center p-4 overflow-y-auto backdrop-blur-sm ${overlayClass}`}
        style={{ zIndex: 65 + depth }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          ref={modalContentRef}
          variants={{
            hidden: { opacity: 0, scale: 0.95 },
            visible: { opacity: 1, scale: 1 },
            exit: { opacity: 0, scale: 0.95 }
          }}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl w-full max-w-5xl mt-4 mb-4 shadow-2xl max-h-[95vh] overflow-y-auto relative"
        >
          <div className="p-6 lg:p-8">
            <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
              <div className="flex-1">
                <div className="mb-3">
                  <BreadcrumbNavigation />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={20} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900">
                    Subtask
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <AlignLeft size={24} className="text-gray-600 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-2xl font-bold w-full border-none outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2 text-gray-900 transition-colors"
                      placeholder="Subtask title"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <CardActionMenu
                  entityType="subtask"
                  ids={{
                    projectId: resolvedProjectId,
                    taskId: resolvedTaskId,
                    subtaskId: entityId,
                  }}
                  onDelete={runDelete}
                  isDeleting={deleteLoading}
                  disabled={!entityId}
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
              <div className="lg:col-span-2 space-y-6 lg:space-y-8">
                {/* Labels */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((label, index) => {
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

                <CardDescription
                  description={description}
                  teamMembers={teamMembers}
                  onChange={setDescription}
                  modalContainerRef={modalContentRef}
                  cardId={parentTaskId}
                  entityType="subtask"
                  entityId={entityId}
                  enableCloudinaryAttachments={true}
                />

                <SubtasksSection
                  title="Nano subtasks"
                  items={nanoItems}
                  loading={nanoLoading}
                  newItemTitle={newNanoTitle}
                  onNewItemTitleChange={setNewNanoTitle}
                  onCreateItem={handleCreateNano}
                  onToggleComplete={handleToggleNano}
                  onDeleteItem={handleDeleteNano}
                  onOpenItem={handleOpenNano}
                  theme="pink"
                  emptyLabel="No nano subtasks yet"
                />

                <AttachmentsSection
                  entityType="subtask"
                  entityId={entityId}
                  boardId={currentProject?._id}
                  onDeleteAttachment={handleDeleteAttachment}
                  readOnly={false}
                />
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
                  onStartEditingEstimation={handleEditEstimation}
                  onStartEditingLogged={handleEditLoggedTime}
                  onStartEditingBilled={handleEditBilledTime}
                  onSaveEstimationEdit={handleSaveEstimationEdit}
                  onSaveLoggedEdit={handleSaveLoggedTimeEdit}
                  onSaveBilledEdit={handleSaveBilledTimeEdit}
                  onCancelEstimationEdit={handleCancelEstimationEdit}
                  onCancelLoggedEdit={handleCancelLoggedTimeEdit}
                  onCancelBilledEdit={handleCancelBilledTimeEdit}
                  onConfirmDeleteEstimation={handleDeleteEstimation}
                  onConfirmDeleteLoggedTime={handleDeleteLoggedTime}
                  onConfirmDeleteBilledTime={handleDeleteBilledTime}
                  userOwnsEntry={userOwnsTimeEntry}
                  card={{ _id: entityId }}
                  estimationValidationError={estimationValidationError}
                  loggedValidationError={loggedValidationError}
                  billedValidationError={billedValidationError}
                  canAccessBilledTime={canAccessBilledTime}
                  billedTimeHiddenReason={billedTimeHiddenReason}
                />

                <div className="mt-8">
                  <TabsContainer
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabs={[
                      {
                        id: "comments",
                        label: "Comments",
                        icon: AlertCircle,
                        badge: comments.length
                      },
                      {
                        id: "activity",
                        label: "Activity",
                        icon: AlertCircle,
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
                        onEditComment={handleEditComment}
                        onDeleteComment={handleDeleteComment}
                        modalContainerRef={modalContentRef}
                        cardId={parentTaskId}
                        entityType="subtask"
                        entityId={entityId}
                        enableCloudinaryAttachments={true}
                      />
                    ) : (
                      <ActivitySection
                        activities={activities}
                        loading={activitiesLoading}
                        teamMembers={teamMembers}
                        type="subtask"
                      />
                    )}
                  </motion.div>
                </div>
              </div>

              <CardSidebar
                saving={saving}
                onSave={handleSave}
                assignees={assignees}
                teamMembers={teamMembers}
                priority={priority}
                status={status}
                dueDate={dueDate}
                startDate={startDate}
                labels={tags}
                availableStatuses={statusOptions}
                searchQuery={searchQuery}
                isDropdownOpen={isDropdownOpen}
                groupedFilteredMembers={groupedFilteredMembers}
                expandedDepartments={expandedDepartments}
                onPriorityChange={setPriority}
                onStatusChange={setStatus}
                onDueDateChange={setDueDate}
                onStartDateChange={setStartDate}
                onLabelsChange={setTags}
                onSelectMember={handleSelectMember}
                onRemoveAssignee={handleRemoveAssignee}
                onToggleDepartment={handleToggleDepartment}
                onSearchQueryChange={setSearchQuery}
                onIsDropdownOpenChange={setIsDropdownOpen}
                onDeleteCard={handleSidebarDelete}
                card={{ _id: entityId }}
                boardId={currentProject?._id}
                entityType="subtask"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>

    </AnimatePresence>
      <DeletePopup
        isOpen={deletePopup.isOpen}
        onCancel={() => setDeletePopup(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmGlobalDelete}
        itemType={deletePopup.type || 'subtask'}
        isLoading={deleteLoading}
      />
    </>
  );
};

export default SubtaskDetailModal;