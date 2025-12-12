import React, { useState, useEffect, useContext, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlignLeft, FileText, AlertCircle } from "lucide-react";
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
import CardActionMenu from "./CardDetailModal/CardActionMenu";
import TimeTrackingSection from "./CardDetailModal/TimeTrackingSection";

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
  const setHierarchyActiveItem = useModalHierarchyStore((state) => state.setActiveItem);
  const currentProject = useModalHierarchyStore((state) => state.currentProject);

   // Time Tracking States
  const [estimationEntries, setEstimationEntries] = useState(
    (initialData.estimationTime || []).map((entry, idx) => {
      const id = String(entry.id || entry._id || `estimation-${idx}`).trim() || `estimation-${idx}`;
      return { ...entry, id };
    })
  );
  const [loggedTime, setLoggedTime] = useState(
    (initialData.loggedTime || []).map((entry, idx) => {
      const id = String(entry.id || entry._id || `logged-${idx}`).trim() || `logged-${idx}`;
      return { ...entry, id };
    })
  );
  const [billedTime, setBilledTime] = useState(
    (initialData.billedTime || []).map((entry, idx) => {
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


  const overlayClass = overlayMap[theme] || overlayMap.purple;

  useEffect(() => {
    loadSubtask();
    loadTeamMembers();
    loadComments();
    loadActivities();
    loadNanos();
  }, [entityId]);

  useEffect(() => {
    const handler = (event) => {
      const { subtaskId, nanos } = event.detail || {};
      if (!subtaskId || subtaskId !== entityId) return;
      if (Array.isArray(nanos)) {
        setNanoItems(nanos);
      } else {
        loadNanos();
      }
    };
    window.addEventListener("socket-nano-hierarchy", handler);
    return () => window.removeEventListener("socket-nano-hierarchy", handler);
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
      setEstimationEntries((data.estimationTime || []).map((entry, idx) => {
        const id = String(entry.id || entry._id || `estimation-${idx}`).trim() || `estimation-${idx}`;
        return { ...entry, id };
      }));
      setLoggedTime((data.loggedTime || []).map((entry, idx) => {
        const id = String(entry.id || entry._id || `logged-${idx}`).trim() || `logged-${idx}`;
        return { ...entry, id };
      }));
      setBilledTime((data.billedTime || []).map((entry, idx) => {
        const id = String(entry.id || entry._id || `billed-${idx}`).trim() || `billed-${idx}`;
        return { ...entry, id };
      }));
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
        estimationTime: estimationEntries,
        loggedTime: loggedTime,
        billedTime: billedTime
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

  const handleSidebarDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this subtask? This action cannot be undone.")) {
      return;
    }
    await runDelete();
  };

  const handleSelectMember = (memberId) => {
    if (!memberId) return;
    if (!assignees.includes(memberId)) {
      setAssignees([...assignees, memberId]);
    }
  };

  const handleRemoveAssignee = (memberId) => {
    setAssignees(assignees.filter(id => id !== memberId));
  };

  const handleToggleDepartment = (deptId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  };

  const handleDeleteAttachment = (index) => {
    setAttachments(attachments.filter((_, idx) => idx !== index));
  };

  const handleCreateNano = async () => {
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
  };

  const handleToggleNano = async (nano) => {
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
  };

  const handleDeleteNano = async (nano) => {
    if (!nano?._id) return;
    if (!window.confirm("Delete this nano subtask?")) return;

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

  const handleOpenNano = (nano) => {
    if (!nano?._id) return;
    onOpenChild?.({
      type: "subtaskNano",
      entityId: nano._id,
      label: nano.title,
      initialData: nano,
      parentId: entityId,
      taskId: parentTaskId
    });
  };

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
  const handleAddEstimation = async () => {
    if (!newEstimationHours && !newEstimationMinutes) return;
    try {
      const hours = parseInt(newEstimationHours) || 0;
      const minutes = parseInt(newEstimationMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const newEntry = {
        id: `estimation-${Date.now()}`,
        hours,
        minutes,
        reason: newEstimationReason,
        totalMinutes,
        createdAt: new Date().toISOString(),
        user: user?._id
      };
      const updatedEntries = [...estimationEntries, newEntry];
      setEstimationEntries(updatedEntries);
      setNewEstimationHours("");
      setNewEstimationMinutes("");
      setNewEstimationReason("");
      toast.success("Estimation added");
    } catch (error) {
      console.error("Error adding estimation:", error);
      toast.error("Failed to add estimation");
    }
  };

  const handleEditEstimation = (entry) => {
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
      const updatedEntries = estimationEntries.filter(entry => entry.id !== entryId);
      setEstimationEntries(updatedEntries);
      toast.success("Estimation deleted");
    } catch (error) {
      console.error("Error deleting estimation:", error);
      toast.error("Failed to delete estimation");
    }
  };

  const handleAddLoggedTime = async () => {
    if (!newLoggedHours && !newLoggedMinutes) return;
    try {
      const hours = parseInt(newLoggedHours) || 0;
      const minutes = parseInt(newLoggedMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const newEntry = {
        id: `logged-${Date.now()}`,
        hours,
        minutes,
        description: newLoggedDescription,
        totalMinutes,
        createdAt: new Date().toISOString(),
        user: user?._id
      };
      const updatedEntries = [...loggedTime, newEntry];
      setLoggedTime(updatedEntries);
      setNewLoggedHours("");
      setNewLoggedMinutes("");
      setNewLoggedDescription("");
      toast.success("Logged time added");
    } catch (error) {
      console.error("Error adding logged time:", error);
      toast.error("Failed to add logged time");
    }
  };

  const handleEditLoggedTime = (entry) => {
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
      const updatedEntries = loggedTime.filter(entry => entry.id !== entryId);
      setLoggedTime(updatedEntries);
      toast.success("Logged time deleted");
    } catch (error) {
      console.error("Error deleting logged time:", error);
      toast.error("Failed to delete logged time");
    }
  };

  const handleAddBilledTime = async () => {
    if (!newBilledHours && !newBilledMinutes) return;
    try {
      const hours = parseInt(newBilledHours) || 0;
      const minutes = parseInt(newBilledMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      const newEntry = {
        id: `billed-${Date.now()}`,
        hours,
        minutes,
        description: newBilledDescription,
        totalMinutes,
        createdAt: new Date().toISOString(),
        user: user?._id
      };
      const updatedEntries = [...billedTime, newEntry];
      setBilledTime(updatedEntries);
      setNewBilledHours("");
      setNewBilledMinutes("");
      setNewBilledDescription("");
      toast.success("Billed time added");
    } catch (error) {
      console.error("Error adding billed time:", error);
      toast.error("Failed to add billed time");
    }
  };

  const handleEditBilledTime = (entry) => {
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
    <AnimatePresence>
      <motion.div
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
                <CardDescription
                  description={description}
                  teamMembers={teamMembers}
                  onChange={setDescription}
                  modalContainerRef={modalContentRef}
                  cardId={parentTaskId}
                  enableCloudinaryAttachments={!!parentTaskId}
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
                  attachments={attachments}
                  onDeleteAttachment={handleDeleteAttachment}
                />
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
                  card={{ _id: entityId }}
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
                        enableCloudinaryAttachments={!!parentTaskId}
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
  );
};

export default SubtaskDetailModal;