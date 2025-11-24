import React, { useState, useEffect, useContext, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlignLeft, FileText, AlertCircle } from "lucide-react";
import { toast } from "react-toastify";
import Database from "../services/database";
import AuthContext from "../context/AuthContext";
import CardDescription from "./CardDetailModal/CardDescription";
import AttachmentsSection from "./CardDetailModal/AttachmentsSection";
import CommentsSection from "./CardDetailModal/CommentsSection";
import TabsContainer from "./CardDetailModal/TabsContainer";
import CardSidebar from "./CardDetailModal/CardSidebar";
import SubtasksSection from "./CardDetailModal/SubtasksSection";
import HierarchyBreadcrumbs from "./hierarchy/HierarchyBreadcrumbs";

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
  breadcrumbs = [],
  onBreadcrumbNavigate,
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
  const [newTag, setNewTag] = useState("");
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
  const [nanoItems, setNanoItems] = useState([]);
  const [nanoLoading, setNanoLoading] = useState(false);
  const [newNanoTitle, setNewNanoTitle] = useState("");
  const [parentTaskId, setParentTaskId] = useState(initialData.task || null);

  const overlayClass = overlayMap[theme] || overlayMap.purple;

  useEffect(() => {
    loadSubtask();
    loadTeamMembers();
    loadComments();
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

  const labelUpdateRef = useRef(onLabelUpdate);
  useEffect(() => {
    labelUpdateRef.current = onLabelUpdate;
  }, [onLabelUpdate]);

  useEffect(() => {
    if (title && labelUpdateRef.current) {
      labelUpdateRef.current(title);
    }
  }, [title]);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const filtered = teamMembers.filter(member =>
        member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const grouped = {};
      filtered.forEach(member => {
        const dept = member.department && Array.isArray(member.department) && member.department.length > 0 ? member.department[0] : null;
        const deptId = (dept?._id || dept || "Unassigned") || "Unassigned";
        const deptName = dept?.name || "Unassigned";
        if (!grouped[deptId]) {
          grouped[deptId] = {
            department: { _id: deptId, name: deptName },
            members: []
          };
        }
        grouped[deptId].members.push(member);
      });
      setGroupedFilteredMembers(grouped);
      const initialExpanded = {};
      Object.keys(grouped).forEach(deptId => {
        initialExpanded[deptId] = true;
      });
      setExpandedDepartments(initialExpanded);
      setIsDropdownOpen(true);
    } else {
      setGroupedFilteredMembers({});
      setIsDropdownOpen(false);
    }
  }, [searchQuery, teamMembers]);

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
      const data = await Database.getSubtaskComments(entityId);
      setComments(data || []);
    } catch (error) {
      console.error("Error loading comments:", error);
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
      const payload = {
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        assignees,
        tags,
        attachments
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

  const handleDelete = async () => {
    if (!window.confirm("Delete this subtask?")) return;
    try {
      await Database.deleteSubtask(entityId);
      toast.success("Subtask deleted");
      onClose();
    } catch (error) {
      console.error("Error deleting subtask:", error);
      toast.error("Failed to delete subtask");
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim() || tags.includes(newTag.trim())) return;
    setTags([...tags, newTag.trim()]);
    setNewTag("");
  };

  const removeTag = (tag) => {
    setTags(tags.filter(t => t !== tag));
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
    try {
      await Database.createNano(entityId, { title: newNanoTitle.trim() });
      setNewNanoTitle("");
      loadNanos();
    } catch (error) {
      console.error("Error creating nano subtask:", error);
      toast.error("Failed to create nano subtask");
    }
  };

  const handleToggleNano = async (nano) => {
    if (!nano?._id) return;
    try {
      await Database.updateNano(nano._id, {
        status: nano.status === "done" ? "todo" : "done"
      });
      loadNanos();
    } catch (error) {
      console.error("Error updating nano subtask:", error);
      toast.error("Failed to update nano subtask");
    }
  };

  const handleDeleteNano = async (nano) => {
    if (!nano?._id) return;
    if (!window.confirm("Delete this nano subtask?")) return;
    try {
      await Database.deleteNano(nano._id);
      loadNanos();
    } catch (error) {
      console.error("Error deleting nano subtask:", error);
      toast.error("Failed to delete nano subtask");
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
      await Database.createComment({
        cardId: parentTaskId,
        subtaskId: entityId,
        htmlContent: newComment
      });
      setNewComment("");
      loadComments();
      toast.success("Comment added");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    }
  };

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
                  <HierarchyBreadcrumbs items={breadcrumbs} onNavigate={onBreadcrumbNavigate} />
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
              <div className="lg:col-span-2 space-y-6 lg:space-y-8">
                <CardDescription
                  description={description}
                  teamMembers={teamMembers}
                  onChange={setDescription}
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
                    <CommentsSection
                      comments={comments}
                      newComment={newComment}
                      teamMembers={teamMembers}
                      onCommentChange={setNewComment}
                      onAddComment={handleAddComment}
                    />
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
                newLabel={newTag}
                availableStatuses={statusOptions}
                searchQuery={searchQuery}
                isDropdownOpen={isDropdownOpen}
                groupedFilteredMembers={groupedFilteredMembers}
                expandedDepartments={expandedDepartments}
                onPriorityChange={setPriority}
                onStatusChange={setStatus}
                onDueDateChange={setDueDate}
                onStartDateChange={setStartDate}
                onLabelChange={setNewTag}
                onAddLabel={handleAddTag}
                onRemoveLabel={removeTag}
                onSelectMember={handleSelectMember}
                onRemoveAssignee={handleRemoveAssignee}
                onToggleDepartment={handleToggleDepartment}
                onSearchQueryChange={setSearchQuery}
                onIsDropdownOpenChange={setIsDropdownOpen}
                onDeleteCard={handleDelete}
                card={{ _id: entityId }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SubtaskDetailModal;

