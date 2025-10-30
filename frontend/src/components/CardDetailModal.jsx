import React, { useState, useEffect, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  AlignLeft,
  Users,
  Tag,
  CheckSquare,
  Calendar,
  Trash2,
  Clock,
  Paperclip,
  MessageSquare,
  AlertCircle,
  User,
  Save,
  Plus,
  TrendingUp,
  FileText,
  Pencil,
  Timer,
  PlayCircle,
  Target,
  Edit2,
  PlusCircle,
} from "lucide-react";
import Database from "../services/database";
import AuthContext from "../context/AuthContext";
import { toast } from "react-toastify";

const CardDetailModal = ({ card, onClose, onUpdate, onDelete, onMoveCard }) => {
  const { user } = useContext(AuthContext);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [assignees, setAssignees] = useState(
    card.assignees ? card.assignees.map((a) => a._id) : []
  );
  const [priority, setPriority] = useState(card.priority || "");
  const [status, setStatus] = useState(card.status || "");
  const [availableStatuses, setAvailableStatuses] = useState([]);
  const [dueDate, setDueDate] = useState(
    card.dueDate ? new Date(card.dueDate).toISOString().split("T")[0] : ""
  );
  const [startDate, setStartDate] = useState(
    card.startDate ? new Date(card.startDate).toISOString().split("T")[0] : ""
  );
  const [labels, setLabels] = useState(card.labels || []);
  const [newLabel, setNewLabel] = useState("");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [subtasks, setSubtasks] = useState(
    card.subtasks
      ? card.subtasks.map((s) => ({
          id: s._id || Date.now(),
          text: s.title || s.text,
          completed: s.completed,
        }))
      : []
  );
  const [newSubtask, setNewSubtask] = useState("");
  const [attachments, setAttachments] = useState(card.attachments || []);
  const [teamMembers, setTeamMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredMembers, setFilteredMembers] = useState([]);

  // Time Tracking States
  const [estimationEntries, setEstimationEntries] = useState(
    card.estimationTime || []
  );
  const [loggedTime, setLoggedTime] = useState(card.loggedTime || []);
  const [newEstimationHours, setNewEstimationHours] = useState("");
  const [newEstimationMinutes, setNewEstimationMinutes] = useState("");
  const [newEstimationReason, setNewEstimationReason] = useState("");
  const [newLoggedHours, setNewLoggedHours] = useState("");
  const [newLoggedMinutes, setNewLoggedMinutes] = useState("");
  const [newLoggedDescription, setNewLoggedDescription] = useState("");
  const [editingEstimation, setEditingEstimation] = useState(null);
  const [editingLogged, setEditingLogged] = useState(null);
  const [editEstimationHours, setEditEstimationHours] = useState("");
  const [editEstimationMinutes, setEditEstimationMinutes] = useState("");
  const [editEstimationReason, setEditEstimationReason] = useState("");
  const [editLoggedHours, setEditLoggedHours] = useState("");
  const [editLoggedMinutes, setEditLoggedMinutes] = useState("");
  const [editLoggedDescription, setEditLoggedDescription] = useState("");

  useEffect(() => {
    loadComments();
    loadTeamMembers();
    loadProjectName();
    loadAvailableStatuses();
  }, []);

  // Filter members based on search query
  useEffect(() => {
    if (searchQuery.length >= 3) {
      const filtered = teamMembers.filter(member =>
        member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMembers(filtered);
    } else {
      setFilteredMembers([]);
    }
  }, [searchQuery, teamMembers]);

  const loadProjectName = async () => {
    try {
      const boardId = card.board?._id || card.board;
      if (boardId) {
        const response = await Database.getProject(boardId);
        setProjectName(response.data?.name || "Unknown Project");
      }
    } catch (error) {
      console.error("Error loading project name:", error);
      setProjectName("Project");
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
      const cardComments = await Database.getComments(cardId);
      setComments(cardComments);
    } catch (error) {
      console.error("Error loading comments:", error);
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

  const normalizeTime = (hours, minutes) => {
    const totalMinutes = parseInt(hours || 0) * 60 + parseInt(minutes || 0);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  };

  const formatTime = (hours, minutes) => {
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.length > 0 ? parts.join(" ") : "0m";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const calculateTotalEstimation = () => {
    const total = estimationEntries.reduce((acc, entry) => {
      return acc + entry.hours * 60 + entry.minutes;
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const calculateTotalLoggedTime = () => {
    const total = loggedTime.reduce((acc, entry) => {
      return acc + entry.hours * 60 + entry.minutes;
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const getTimeProgress = () => {
    const totalLogged = loggedTime.reduce(
      (acc, entry) => acc + entry.hours * 60 + entry.minutes,
      0
    );
    const totalEstimated = estimationEntries.reduce(
      (acc, entry) => acc + entry.hours * 60 + entry.minutes,
      0
    );

    if (totalEstimated === 0) return 0;
    return Math.round((totalLogged / totalEstimated) * 100);
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

  const handleUpdateEstimation = (id, hours, minutes) => {
    const normalized = normalizeTime(hours, minutes);
    setEstimationEntries(
      estimationEntries.map((entry) =>
        entry.id === id
          ? { ...entry, hours: normalized.hours, minutes: normalized.minutes }
          : entry
      )
    );
    setEditingEstimation(null);
    toast.success("Estimation updated!");
  };

  const handleDeleteEstimation = (id) => {
    setEstimationEntries(estimationEntries.filter((entry) => entry.id !== id));
    toast.info("Estimation entry removed");
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

  const handleUpdateLoggedTime = (id, hours, minutes) => {
    const normalized = normalizeTime(hours, minutes);
    setLoggedTime(
      loggedTime.map((entry) =>
        entry.id === id
          ? { ...entry, hours: normalized.hours, minutes: normalized.minutes }
          : entry
      )
    );
    setEditingLogged(null);
    toast.success("Logged time updated!");
  };

  const handleDeleteLoggedTime = (id) => {
    setLoggedTime(loggedTime.filter((entry) => entry.id !== id));
    toast.info("Time entry removed");
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

  const confirmDeleteEstimation = (id) => {
    if (
      window.confirm("Are you sure you want to delete this estimation entry?")
    ) {
      handleDeleteEstimation(id);
    }
  };

  const confirmDeleteLoggedTime = (id) => {
    if (
      window.confirm("Are you sure you want to delete this logged time entry?")
    ) {
      handleDeleteLoggedTime(id);
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
      const updates = {
        title,
        description,
        assignees: assignees.length > 0 ? assignees : null,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        labels,
        subtasks: subtasks.map((s) => ({
          title: s.text || "",
          completed: Boolean(s.completed),
        })),
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
      };

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
    if (!newComment.trim()) return;
    const cardId = card.id || card._id;
    if (!cardId) return;

    try {
      await Database.createComment(cardId, newComment);
      setNewComment("");
      loadComments();
      toast.success("Comment added!");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    const subtask = { id: Date.now(), text: newSubtask, completed: false };
    setSubtasks([...subtasks, subtask]);
    setNewSubtask("");
  };

  const toggleSubtask = (id) => {
    setSubtasks(
      subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const deleteSubtask = (id) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const handleAddLabel = () => {
    if (!newLabel.trim() || labels.includes(newLabel.trim())) return;
    setLabels([...labels, newLabel.trim()]);
    setNewLabel("");
  };

  const removeLabel = (label) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const calculateProgress = () => {
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter((s) => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
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

  const totalEstimation = calculateTotalEstimation();
  const totalLogged = calculateTotalLoggedTime();
  const timeProgress = getTimeProgress();
  const isOvertime = timeProgress > 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
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
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={20} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900">
                    {projectName}
                  </span>
                  <span className="text-sm text-gray-400">›</span>
                  <span className="text-sm text-gray-600">
                    {card.list?.title || "List"}
                  </span>
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

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 ml-4 hover:bg-gray-100 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </motion.button>
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
                    {labels.map((label, index) => (
                      <motion.span
                        key={index}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm"
                      >
                        <Tag size={14} />
                        {label}
                        <button
                          onClick={() => removeLabel(label)}
                          className="hover:bg-white hover:bg-opacity-20 rounded-full p-0.5 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </motion.span>
                    ))}
                  </div>
                )}

                {/* Dates */}
                {(startDate || dueDate) && (
                  <div className="flex gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    {startDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-500" />
                        <span className="text-gray-600">Start:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(startDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {dueDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-500" />
                        <span className="text-gray-600">Due:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <AlignLeft size={20} className="text-gray-600" />
                    <h4 className="font-semibold text-gray-800 text-lg">
                      Description
                    </h4>
                  </div>

                  {isEditingDescription || description ? (
                    <div className="ml-8">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={() => setIsEditingDescription(true)}
                        onBlur={() => setIsEditingDescription(false)}
                        placeholder="Add a more detailed description..."
                        className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 transition-shadow"
                        rows="2"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingDescription(true)}
                      className="ml-8 w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-600 transition-colors border border-dashed border-gray-300"
                    >
                      Add a more detailed description...
                    </button>
                  )}
                </div>

                {/* Time Tracking Section */}
                <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-4 border-2 border-indigo-200 shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 2, ease: "linear" }}
                      className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg shadow-md"
                    >
                      <Timer size={20} className="text-white" />
                    </motion.div>

                    <div>
                      <h4 className="font-bold text-gray-800 text-lg">
                        Time Tracking
                      </h4>
                      <p className="text-xs text-gray-600">
                        Manage estimates and log your work time
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Estimation Time */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Target size={16} className="text-indigo-600" />
                        <h5 className="font-semibold text-gray-800">
                          Estimated Time
                        </h5>
                      </div>

                      {/* Add Estimation Input */}
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              value={newEstimationHours}
                              onChange={(e) =>
                                setNewEstimationHours(e.target.value)
                              }
                              placeholder="0"
                              className="w-full p-2 pr-7 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                              h
                            </span>
                          </div>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              value={newEstimationMinutes}
                              onChange={(e) =>
                                setNewEstimationMinutes(e.target.value)
                              }
                              placeholder="0"
                              className="w-full p-2 pr-7 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                              m
                            </span>
                          </div>
                        </div>
                        <textarea
                          value={newEstimationReason}
                          onChange={(e) =>
                            setNewEstimationReason(e.target.value)
                          }
                          placeholder="Reason for estimation (mandatory)"
                          className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          rows="2"
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleAddEstimation}
                          className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 shadow-md text-sm font-semibold"
                        >
                          Add Estimate
                        </motion.button>
                      </div>

                      {/* Estimation Entries */}
                      {estimationEntries.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
                          <AnimatePresence>
                            {estimationEntries.map((entry, index) => (
                              <motion.div
                                key={entry.id || index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="group relative bg-indigo-50 rounded-lg p-3 border border-indigo-200 hover:border-indigo-300 transition-all text-xs"
                              >
                                {editingEstimation === entry.id ? (
                                  <div className="space-y-2">
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editEstimationHours}
                                          onChange={(e) =>
                                            setEditEstimationHours(
                                              e.target.value
                                            )
                                          }
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                          h
                                        </span>
                                      </div>
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editEstimationMinutes}
                                          onChange={(e) =>
                                            setEditEstimationMinutes(
                                              e.target.value
                                            )
                                          }
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                          m
                                        </span>
                                      </div>
                                    </div>
                                    <textarea
                                      value={editEstimationReason}
                                      onChange={(e) =>
                                        setEditEstimationReason(e.target.value)
                                      }
                                      placeholder="Reason for estimation"
                                      className="w-full p-1 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      rows="2"
                                    />
                                    <div className="flex gap-1">
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() =>
                                          saveEstimationEdit(entry.id)
                                        }
                                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition-colors"
                                      >
                                        Save
                                      </motion.button>
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={cancelEstimationEdit}
                                        className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 transition-colors"
                                      >
                                        Cancel
                                      </motion.button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-indigo-700 text-base">
                                          {formatTime(
                                            entry.hours,
                                            entry.minutes
                                          )}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() =>
                                            startEditingEstimation(entry)
                                          }
                                          className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-all duration-200 border border-indigo-200 hover:border-indigo-300"
                                          title="Edit estimation"
                                        >
                                          <Pencil size={14} />
                                        </motion.button>
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() =>
                                            confirmDeleteEstimation(entry.id)
                                          }
                                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                          title="Delete estimation"
                                        >
                                          <Trash2 size={14} />
                                        </motion.button>
                                      </div>
                                    </div>
                                    <p className="text-gray-700 mb-1 p-1 bg-indigo-100 rounded">
                                      Reason: {entry.reason}
                                    </p>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 text-gray-500">
                                        <User size={12} />
                                        <span>
                                          {card.createdBy?.name || "Unknown"}
                                        </span>
                                      </div>
                                      <span className="text-gray-600">
                                        {formatDate(entry.date)}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Total Estimation */}
                      {estimationEntries.length > 0 && (
                        <div className="pt-2 border-t-2 border-indigo-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">
                              Total Estimate:
                            </span>
                            <span className="text-lg font-bold text-indigo-600">
                              {formatTime(
                                totalEstimation.hours,
                                totalEstimation.minutes
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Logged Time */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-green-100">
                      <div className="flex items-center gap-2 mb-3">
                        <PlayCircle size={16} className="text-green-600" />
                        <h5 className="font-semibold text-gray-800">
                          Logged Time
                        </h5>
                      </div>

                      {/* Add Logged Time Input */}
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              value={newLoggedHours}
                              onChange={(e) =>
                                setNewLoggedHours(e.target.value)
                              }
                              placeholder="0"
                              className="w-full p-2 pr-7 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                              h
                            </span>
                          </div>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              value={newLoggedMinutes}
                              onChange={(e) =>
                                setNewLoggedMinutes(e.target.value)
                              }
                              placeholder="0"
                              className="w-full p-2 pr-7 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                              m
                            </span>
                          </div>
                        </div>
                        <textarea
                          value={newLoggedDescription}
                          onChange={(e) =>
                            setNewLoggedDescription(e.target.value)
                          }
                          placeholder="Description of work (mandatory)"
                          className="w-full p-2 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          rows="2"
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleAddLoggedTime}
                          className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-md text-sm font-semibold"
                        >
                          Log Time
                        </motion.button>
                      </div>

                      {/* Logged Time Entries */}
                      {loggedTime.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
                          <AnimatePresence>
                            {loggedTime.map((entry, index) => (
                              <motion.div
                                key={entry.id || index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="group relative bg-green-50 rounded-lg p-3 border border-green-200 hover:border-green-300 transition-all text-xs"
                              >
                                {editingLogged === entry.id ? (
                                  <div className="space-y-2">
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editLoggedHours}
                                          onChange={(e) =>
                                            setEditLoggedHours(e.target.value)
                                          }
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                        />
                                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                          h
                                        </span>
                                      </div>
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editLoggedMinutes}
                                          onChange={(e) =>
                                            setEditLoggedMinutes(e.target.value)
                                          }
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                        />
                                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                          m
                                        </span>
                                      </div>
                                    </div>
                                    <textarea
                                      value={editLoggedDescription}
                                      onChange={(e) =>
                                        setEditLoggedDescription(e.target.value)
                                      }
                                      placeholder="Description of work"
                                      className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                      rows="2"
                                    />
                                    <div className="flex gap-1">
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => saveLoggedEdit(entry.id)}
                                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                                      >
                                        Save
                                      </motion.button>
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={cancelLoggedEdit}
                                        className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 transition-colors"
                                      >
                                        Cancel
                                      </motion.button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <Clock
                                          size={12}
                                          className="text-green-600"
                                        />
                                        <span className="font-bold text-green-700 text-base">
                                          {formatTime(
                                            entry.hours,
                                            entry.minutes
                                          )}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() =>
                                            startEditingLogged(entry)
                                          }
                                          className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-all duration-200 border border-green-200 hover:border-green-300"
                                          title="Edit logged time"
                                        >
                                          <Pencil size={14} />
                                        </motion.button>
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() =>
                                            confirmDeleteLoggedTime(entry.id)
                                          }
                                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                          title="Delete logged time"
                                        >
                                          <Trash2 size={14} />
                                        </motion.button>
                                      </div>
                                    </div>
                                    <p className="text-gray-700 mb-1 p-1 bg-green-100 rounded">
                                      Desc: {entry.description}
                                    </p>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 text-gray-500">
                                        <User size={12} />
                                        <span>
                                          {card.createdBy?.name || "Unknown"}
                                        </span>
                                      </div>
                                      <span className="text-gray-600">
                                        {formatDate(entry.date)}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Total Logged Time */}
                      {loggedTime.length > 0 && (
                        <div className="pt-2 border-t-2 border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">
                              Total Logged:
                            </span>
                            <span
                              className={`text-lg font-bold ${
                                isOvertime ? "text-red-600" : "text-green-600"
                              }`}
                            >
                              {formatTime(
                                totalLogged.hours,
                                totalLogged.minutes
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {estimationEntries.length > 0 && loggedTime.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h5 className="font-semibold text-gray-800 text-xs mb-1">
                            Overall Progress
                          </h5>
                          <p className="text-xs text-gray-600">
                            {formatTime(totalLogged.hours, totalLogged.minutes)}{" "}
                            of{" "}
                            {formatTime(
                              totalEstimation.hours,
                              totalEstimation.minutes
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-xl font-bold ${
                              isOvertime ? "text-red-600" : "text-blue-600"
                            }`}
                          >
                            {timeProgress}%
                          </span>
                          {isOvertime && (
                            <p className="text-xs text-red-600 font-medium">
                              Over estimate!
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(timeProgress, 100)}%` }}
                          className={`h-full ${
                            isOvertime
                              ? "bg-gradient-to-r from-red-500 via-orange-500 to-red-600"
                              : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"
                          } shadow-md`}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      {isOvertime && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200"
                        >
                          <AlertCircle size={14} />
                          <span className="font-medium">
                            Exceeded estimate by{" "}
                            {formatTime(
                              Math.floor(
                                (totalLogged.hours * 60 +
                                  totalLogged.minutes -
                                  totalEstimation.hours * 60 -
                                  totalEstimation.minutes) /
                                  60
                              ),
                              (totalLogged.hours * 60 +
                                totalLogged.minutes -
                                totalEstimation.hours * 60 -
                                totalEstimation.minutes) %
                                60
                            )}
                          </span>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Subtasks with Progress */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <CheckSquare size={20} className="text-gray-600" />
                      <h4 className="font-semibold text-gray-800 text-lg">
                        Subtasks
                      </h4>
                      <span className="text-sm text-gray-500">
                        ({subtasks.filter((s) => s.completed).length}/
                        {subtasks.length})
                      </span>
                    </div>
                    {subtasks.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${calculateProgress()}%` }}
                            className="h-full bg-gradient-to-r from-green-400 to-green-600"
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {calculateProgress()}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="ml-8 space-y-2">
                    <AnimatePresence>
                      {subtasks.map((subtask) => (
                        <motion.div
                          key={subtask.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                        >
                          <input
                            type="checkbox"
                            checked={subtask.completed}
                            onChange={() => toggleSubtask(subtask.id)}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span
                            className={`flex-1 text-sm ${
                              subtask.completed
                                ? "line-through text-gray-500"
                                : "text-gray-700"
                            }`}
                          >
                            {subtask.text}
                          </span>
                          <button
                            onClick={() => deleteSubtask(subtask.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyPress={(e) =>
                          e.key === "Enter" && handleAddSubtask()
                        }
                        placeholder="Add a subtask..."
                        className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleAddSubtask}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                      >
                        <Plus size={18} />
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <Paperclip size={20} className="text-gray-600" />
                      <h4 className="font-semibold text-gray-800 text-lg">
                        Attachments
                      </h4>
                    </div>
                    <div className="ml-8 space-y-2">
                      {attachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors bg-white"
                        >
                          <Paperclip size={16} className="text-gray-500" />
                          <span className="text-sm text-gray-700">
                            {attachment.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <MessageSquare size={20} className="text-gray-600" />
                    <h4 className="font-semibold text-gray-800 text-lg">
                      Activity
                    </h4>
                  </div>

                  <div className="ml-8 space-y-4">
                    {/* Add Comment */}
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-sm flex-shrink-0">
                        {user?.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Write a comment..."
                          className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          rows="3"
                        />
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleAddComment}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                        >
                          Comment
                        </motion.button>
                      </div>
                    </div>

                    {/* Comments List with Scrollbar */}
                    <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      <AnimatePresence>
                        {comments.map((comment) => (
                          <motion.div
                            key={comment._id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-3 mb-4"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold shadow-sm flex-shrink-0">
                              {comment.user?.name?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-sm text-gray-900">
                                  {comment.user?.name || "User"}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(comment.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {comment.text}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar - 1 column */}
              <div className="lg:col-span-1 space-y-4 lg:space-y-6">
                {/* Save Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg disabled:opacity-50 font-medium"
                >
                  <Save size={18} />
                  {saving ? "Saving..." : "Save Changes"}
                </motion.button>

                {/* Add to card section */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider">
                    Add to card
                  </h4>

                  <div className="space-y-3">
                    {/* Assignees */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-3 font-medium">
                        <Users size={14} />
                        Assignees
                      </label>

                      {/* Assigned Users Display */}
                      {assignees.length > 0 && (
                        <div className="mb-3">
                          <div className="flex flex-wrap gap-2">
                            {assignees.map((assigneeId) => {
                              const member = teamMembers.find(
                                (m) => m._id === assigneeId
                              );
                              return (
                                <motion.div
                                  key={assigneeId}
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0 }}
                                  className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-full text-sm font-medium"
                                >
                                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                                    {member?.name?.[0]?.toUpperCase() || "U"}
                                  </div>
                                  <span>{member?.name || "Unknown"}</span>
                                  <button
                                    onClick={() =>
                                      setAssignees(
                                        assignees.filter(
                                          (id) => id !== assigneeId
                                        )
                                      )
                                    }
                                    className="text-blue-600 hover:text-blue-800 ml-1"
                                  >
                                    <X size={14} />
                                  </button>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Search Bar */}
                      <div className="mb-3">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search members by name or email..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>

                      {/* Search Results */}
                      {searchQuery.length >= 3 && (
                        <div className="border border-gray-200 rounded-lg bg-white max-h-48 overflow-y-auto">
                          {filteredMembers.length > 0 ? (
                            filteredMembers.map((member) => {
                              const isAssigned = assignees.includes(member._id);
                              return (
                                <motion.button
                                  key={member._id}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => {
                                    if (!isAssigned) {
                                      setAssignees([...assignees, member._id]);
                                    }
                                  }}
                                  disabled={isAssigned}
                                  className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-all ${
                                    isAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                  }`}
                                >
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center text-sm font-bold">
                                    {member.name?.[0]?.toUpperCase() || "U"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                      {member.name}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {member.email}
                                    </div>
                                  </div>
                                  {isAssigned ? (
                                    <span className="text-xs text-green-600 font-medium">Assigned</span>
                                  ) : (
                                    <Plus size={16} className="text-blue-500 flex-shrink-0" />
                                  )}
                                </motion.button>
                              );
                            })
                          ) : (
                            <div className="text-center text-gray-500 text-sm py-4">
                              No members found
                            </div>
                          )}
                        </div>
                      )}

                      {searchQuery.length < 3 && searchQuery.length > 0 && (
                        <div className="text-center text-gray-500 text-sm py-4">
                          Type at least 3 characters to search
                        </div>
                      )}
                    </div>

                    {/* Priority */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <AlertCircle size={14} />
                        Priority
                      </label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">No Priority</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <TrendingUp size={14} />
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select status</option>
                        {availableStatuses.map((statusOption) => (
                          <option key={statusOption.value} value={statusOption.value}>
                            {statusOption.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dates */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <Calendar size={14} />
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <Calendar size={14} />
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Add Label */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <Tag size={14} />
                        Add Label
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          onKeyPress={(e) =>
                            e.key === "Enter" && handleAddLabel()
                          }
                          placeholder="Label name..."
                          className="flex-1 p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleAddLabel}
                          className="px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions section */}
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h4 className="text-xs font-semibold text-red-700 mb-3 uppercase tracking-wider">
                    Danger Zone
                  </h4>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to delete this task? This action cannot be undone."
                        )
                      ) {
                        onDelete(card._id);
                        onClose();
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
                  >
                    <Trash2 size={16} />
                    Delete Task
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Custom Scrollbar Styles */}
      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </AnimatePresence>
  );
};

export default CardDetailModal;
