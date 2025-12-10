import React, { useState, useEffect, useContext, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlignLeft, Tag, AlertCircle, MessageSquare, Activity, RefreshCw } from "lucide-react";
import Database from "../services/database";
import commentService from "../services/commentService";
import AuthContext from "../context/AuthContext";
import { toast } from "react-toastify";
import useWorkflowStore from "../store/workflowStore";
import useDepartmentStore from "../store/departmentStore";
import useModalHierarchyStore from "../store/modalHierarchyStore";
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
  const [teamMembers, setTeamMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [groupedFilteredMembers, setGroupedFilteredMembers] = useState({});
  const [expandedDepartments, setExpandedDepartments] = useState({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Recurring Task States
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [existingRecurrence, setExistingRecurrence] = useState(null);
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);
  const setHierarchyActiveItem = useModalHierarchyStore((state) => state.setActiveItem);
  const setHierarchyProject = useModalHierarchyStore((state) => state.setProject);
  const initializeHierarchyTask = useModalHierarchyStore((state) => state.initializeTaskStack);
  const closeHierarchy = useModalHierarchyStore((state) => state.closeAll);
  const hierarchyStackLength = useModalHierarchyStore((state) => state.stack.length);
  const currentProject = useModalHierarchyStore((state) => state.currentProject);

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

  // Time Tracking States
  const [estimationEntries, setEstimationEntries] = useState(
    (card.estimationTime || []).map((entry, idx) => {
      const id = String(entry.id || entry._id || `estimation-${idx}`).trim() || `estimation-${idx}`;
      return { ...entry, id };
    })
  );
  const [loggedTime, setLoggedTime] = useState(
    (card.loggedTime || []).map((entry, idx) => {
      const id = String(entry.id || entry._id || `logged-${idx}`).trim() || `logged-${idx}`;
      return { ...entry, id };
    })
  );
  const [billedTime, setBilledTime] = useState(
    (card.billedTime || []).map((entry, idx) => {
      const id = String(entry.id || entry._id || `billed-${idx}`).trim() || `billed-${idx}`;
      return { ...entry, id };
    })
  );
  const [newEstimationHours, setNewEstimationHours] = useState("");
  const [newEstimationMinutes, setNewEstimationMinutes] = useState("");
  const [newEstimationReason, setNewEstimationReason] = useState("");
  const [newLoggedHours, setNewLoggedHours] = useState("");
  const [newLoggedMinutes, setNewLoggedMinutes] = useState("");
  const [newLoggedDescription, setNewLoggedDescription] = useState("");
  const [newBilledHours, setNewBilledHours] = useState("");
  const [newBilledMinutes, setNewBilledMinutes] = useState("");
  const [newBilledDescription, setNewBilledDescription] = useState("");
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

  useEffect(() => {
    // Load fresh card data from server when modal opens
    const loadFreshCardData = async () => {
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
          setHierarchyActiveItem("task", freshCard);
        } else if (card) {
          setHierarchyActiveItem("task", card);
        }
      } catch (error) {
        console.error("Error loading fresh card data:", error);
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
        if (updates.labels) setLabels(updates.labels);
        if (updates.assignees) setAssignees(updates.assignees.map(a => a._id).filter(Boolean));
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

    const handleCommentAdded = (event) => {
      const { cardId, comment } = event.detail;
      if (cardId === card._id) {
        setComments(prev => [...prev, comment]);
      }
    };

    const handleCommentUpdated = (event) => {
      const { cardId, commentId, updates } = event.detail;
      if (cardId === card._id) {
        setComments(prev => prev.map(c =>
          c._id === commentId ? { ...c, ...updates } : c
        ));
      }
    };

    const handleCommentDeleted = (event) => {
      const { cardId, commentId } = event.detail;
      if (cardId === card._id) {
        setComments(prev => prev.filter(c => c._id !== commentId));
      }
    };

    const handleActivityAdded = (event) => {
      const { cardId, activity } = event.detail;
      if (cardId === card._id) {
        setActivities(prev => [activity, ...prev]);
      }
    };

    // Subscribe to events
    window.addEventListener('socket-card-updated', handleCardUpdate);
    window.addEventListener('socket-comment-added', handleCommentAdded);
    window.addEventListener('socket-comment-updated', handleCommentUpdated);
    window.addEventListener('socket-comment-deleted', handleCommentDeleted);
    window.addEventListener('socket-activity-added', handleActivityAdded);

    // Cleanup
    return () => {
      window.removeEventListener('socket-card-updated', handleCardUpdate);
      window.removeEventListener('socket-comment-added', handleCommentAdded);
      window.removeEventListener('socket-comment-updated', handleCommentUpdated);
      window.removeEventListener('socket-comment-deleted', handleCommentDeleted);
      window.removeEventListener('socket-activity-added', handleActivityAdded);
    };
  }, [card._id]);

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
    const handler = (event) => {
      const { taskId, subtasks: incoming } = event.detail || {};
      if (!taskId || taskId !== (card?._id || card?.id)) return;
      if (Array.isArray(incoming)) {
        setSubtasks(incoming);
      } else {
        fetchSubtasks();
      }
    };
    window.addEventListener('socket-subtask-hierarchy', handler);
    return () => window.removeEventListener('socket-subtask-hierarchy', handler);
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

  const handleSelectMember = (memberId) => {
    if (!memberId) return;
    if (!assignees.includes(memberId)) {
      setAssignees([...assignees, memberId]);
    }
  };

  const handleRemoveAssignee = (memberId) => {
    setAssignees(assignees.filter(id => id !== memberId));
  };

  const toggleDepartment = (deptId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  };

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

  const handleAddEstimation = () => {
    const hours = parseInt(newEstimationHours || 0);
    const minutes = parseInt(newEstimationMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newEstimationReason.trim()) {
      toast.error("Please enter a valid estimation time and reason.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      id: Date.now(),
      hours: normalized.hours,
      minutes: normalized.minutes,
      reason: newEstimationReason,
      user: user._id,
      date: new Date().toISOString(),
    };

    setEstimationEntries([...estimationEntries, newEntry]);
    setNewEstimationHours("");
    setNewEstimationMinutes("");
    setNewEstimationReason("");
    toast.success("Estimation added successfully!");
  };

  const handleAddLoggedTime = () => {
    const hours = parseInt(newLoggedHours || 0);
    const minutes = parseInt(newLoggedMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newLoggedDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      id: Date.now(),
      hours: normalized.hours,
      minutes: normalized.minutes,
      description: newLoggedDescription,
      user: user._id,
      date: new Date().toISOString(),
    };

    setLoggedTime([...loggedTime, newEntry]);
    setNewLoggedHours("");
    setNewLoggedMinutes("");
    setNewLoggedDescription("");
    toast.success("Time logged successfully!");
  };

  const handleAddBilledTime = () => {
    const hours = parseInt(newBilledHours || 0);
    const minutes = parseInt(newBilledMinutes || 0);

    if ((hours === 0 && minutes === 0) || !newBilledDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    const newEntry = {
      id: Date.now(),
      hours: normalized.hours,
      minutes: normalized.minutes,
      description: newBilledDescription,
      user: user._id,
      date: new Date().toISOString(),
    };

    setBilledTime([...billedTime, newEntry]);
    setNewBilledHours("");
    setNewBilledMinutes("");
    setNewBilledDescription("");
    toast.success("Billed time added successfully!");
  };

  const startEditingEstimation = (entry) => {
    setEditingEstimation(entry.id);
    setEditEstimationHours(entry.hours.toString());
    setEditEstimationMinutes(entry.minutes.toString());
    setEditEstimationReason(entry.reason);
  };

  const startEditingLogged = (entry) => {
    setEditingLogged(entry.id);
    setEditLoggedHours(entry.hours.toString());
    setEditLoggedMinutes(entry.minutes.toString());
    setEditLoggedDescription(entry.description);
  };

  const saveEstimationEdit = (id) => {
    const hours = parseInt(editEstimationHours || 0);
    const minutes = parseInt(editEstimationMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editEstimationReason.trim()) {
      toast.error("Please enter a valid estimation time and reason.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setEstimationEntries(
      estimationEntries.map((entry) =>
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
  };

  const saveLoggedEdit = (id) => {
    const hours = parseInt(editLoggedHours || 0);
    const minutes = parseInt(editLoggedMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editLoggedDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setLoggedTime(
      loggedTime.map((entry) =>
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
  };

  const cancelEstimationEdit = () => {
    setEditingEstimation(null);
    setEditEstimationHours("");
    setEditEstimationMinutes("");
    setEditEstimationReason("");
  };

  const cancelLoggedEdit = () => {
    setEditingLogged(null);
    setEditLoggedHours("");
    setEditLoggedMinutes("");
    setEditLoggedDescription("");
  };

  const startEditingBilled = (entry) => {
    setEditingBilled(entry.id);
    setEditBilledHours(entry.hours.toString());
    setEditBilledMinutes(entry.minutes.toString());
    setEditBilledDescription(entry.description);
  };

  const saveBilledEdit = (id) => {
    const hours = parseInt(editBilledHours || 0);
    const minutes = parseInt(editBilledMinutes || 0);

    if ((hours === 0 && minutes === 0) || !editBilledDescription.trim()) {
      toast.error("Please enter valid time and a description.");
      return;
    }

    const normalized = normalizeTime(hours, minutes);
    setBilledTime(
      billedTime.map((entry) =>
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
  };

  const cancelBilledEdit = () => {
    setEditingBilled(null);
    setEditBilledHours("");
    setEditBilledMinutes("");
    setEditBilledDescription("");
  };

  const confirmDeleteEstimation = (id) => {
    if (window.confirm("Are you sure you want to delete this estimation entry?")) {
      setEstimationEntries(estimationEntries.filter((entry) => entry.id !== id));
      toast.info("Estimation entry removed");
    }
  };

  const confirmDeleteLoggedTime = (id) => {
    if (window.confirm("Are you sure you want to delete this logged time entry?")) {
      setLoggedTime(loggedTime.filter((entry) => entry.id !== id));
      toast.info("Time entry removed");
    }
  };

  const confirmDeleteBilledTime = (id) => {
    if (window.confirm("Are you sure you want to delete this billed time entry?")) {
      setBilledTime(billedTime.filter((entry) => entry.id !== id));
      toast.info("Billed time entry removed");
    }
  };

  const handleSave = async () => {
    const cardId = card._id || card.id;
    if (!cardId) {
      toast.error("Invalid card ID");
      return;
    }

    setSaving(true);
    try {
    // Convert labels to IDs for backend, but keep full objects for optimistic update
    const labelIds = labels.map(l => typeof l === 'object' ? l._id : l);
    
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
      estimationTime: estimationEntries.map((entry) => ({
        hours: entry.hours,
        minutes: entry.minutes,
        reason: entry.reason,
        user: entry.user,
        date: entry.date,
      })),
      loggedTime: loggedTime.map((entry) => ({
        hours: entry.hours,
        minutes: entry.minutes,
        description: entry.description,
        user: entry.user,
        date: entry.date,
      })),
      billedTime: billedTime.map((entry) => ({
        hours: entry.hours,
        minutes: entry.minutes,
        description: entry.description,
        user: entry.user,
        date: entry.date,
      })),
    };
    
    // Include full label objects for optimistic UI update
    backendUpdates._labelsPopulated = labels.filter(l => typeof l === 'object' && l.name);
    
    const updates = backendUpdates;

      // Check if status has changed and move card if needed
      if (status !== card.status) {
        try {
          // Get all lists to find the target list ID
          const boardId = card.board?._id || card.board;
          const listsResponse = await Database.getLists(boardId);
          const targetListObj = listsResponse.data.find(list =>
            list.title.toLowerCase().replace(/\s+/g, '-') === status
          );

          if (targetListObj) {
            // Move the card to the new list
            const newPosition = 0; // Add to the beginning of the list
            await onMoveCard(card._id, targetListObj._id, newPosition);
            toast.success(`Card moved to "${targetListObj.title}" list`);
          }
        } catch (moveError) {
          console.error("Error moving card:", moveError);
          toast.error("Card status updated but failed to move to new list");
        }
      }

      await onUpdate(updates);
      toast.success("Task updated successfully!");
      onClose();
    } catch (error) {
      console.error("Error saving card:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    // newComment may be HTML; check plain text
    const plain = (newComment || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain) return;
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
    toast.info("Attachment removed");
  };

  // Handle comment edit
  const handleEditComment = async (commentId, newContent) => {
    const cardId = card.id || card._id;
    if (!cardId || !commentId) return;

    try {
      await commentService.updateComment(commentId, newContent, 'card', cardId);
      
      setComments(prev => prev.map(c => 
        (c._id === commentId || c.id === commentId) 
          ? { ...c, htmlContent: newContent, text: newContent, isEdited: true }
          : c
      ));
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
      setComments(prev => prev.filter(c => c._id !== commentId && c.id !== commentId));
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
    if (!window.confirm("Delete this subtask?")) return;
    try {
      await Database.deleteSubtask(subtask._id);
      fetchSubtasks();
    } catch (error) {
      console.error("Error deleting subtask:", error);
      toast.error("Failed to delete subtask");
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

  const getPriorityColor = (priority) => {
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
  };

  const getStatusColor = (status) => {
    const colors = {
      done: "bg-green-100 text-green-700",
      "in-progress": "bg-blue-100 text-blue-700",
      review: "bg-purple-100 text-purple-700",
      todo: "bg-gray-100 text-gray-700",
    };
    return colors[status?.toLowerCase()] || "bg-gray-100 text-gray-700";
  };

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
    const confirmed = window.confirm(
      "Are you sure you want to delete this task? This action cannot be undone."
    );
    if (!confirmed) return;
    await executeDelete();
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
                  isDeleting={deleteLoading}
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
                  newLoggedHours={newLoggedHours}
                  newLoggedMinutes={newLoggedMinutes}
                  newLoggedDescription={newLoggedDescription}
                  newBilledHours={newBilledHours}
                  newBilledMinutes={newBilledMinutes}
                  newBilledDescription={newBilledDescription}
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
                  onLoggedHoursChange={setNewLoggedHours}
                  onLoggedMinutesChange={setNewLoggedMinutes}
                  onLoggedDescriptionChange={setNewLoggedDescription}
                  onBilledHoursChange={setNewBilledHours}
                  onBilledMinutesChange={setNewBilledMinutes}
                  onBilledDescriptionChange={setNewBilledDescription}
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
                  cardId={card._id || card.id}
                  boardId={card?.board?._id || card?.board}
                  onDeleteAttachment={handleDeleteAttachment}
                  onAttachmentAdded={(newAttachments) => {
                    setAttachments(prev => [...prev, ...newAttachments]);
                  }}
                  onCoverChange={(coverData) => {
                    // Handle cover image change if needed
                    console.log('Cover changed:', coverData);
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
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* Recurring Settings Modal - Only for main task (outside AnimatePresence to avoid key conflicts) */}
    <RecurringSettingsModal
      isOpen={showRecurringModal}
      onClose={() => setShowRecurringModal(false)}
      card={card}
      existingRecurrence={existingRecurrence}
      onSave={handleSaveRecurrence}
      onDelete={handleDeleteRecurrence}
    />
  </>
  );
});

export default CardDetailModal;
