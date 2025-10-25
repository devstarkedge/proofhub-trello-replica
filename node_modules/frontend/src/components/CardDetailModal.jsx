import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, AlignLeft, Users, Tag, CheckSquare, Calendar, 
  Trash2, Clock, Paperclip, MessageSquare, AlertCircle, 
  User, Save, Plus, TrendingUp, FileText
} from 'lucide-react';
import Database from '../services/database';
import AuthContext from '../context/AuthContext';
import { toast } from 'react-toastify';

const CardDetailModal = ({ card, onClose, onUpdate, onDelete }) => {
  const { user } = useContext(AuthContext);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [assignee, setAssignee] = useState(card.assignee?._id || '');
  const [priority, setPriority] = useState(card.priority || '');
  const [status, setStatus] = useState(card.status || '');
  const [dueDate, setDueDate] = useState(
    card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''
  );
  const [startDate, setStartDate] = useState(
    card.startDate ? new Date(card.startDate).toISOString().split('T')[0] : ''
  );
  const [labels, setLabels] = useState(card.labels || []);
  const [newLabel, setNewLabel] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [subtasks, setSubtasks] = useState(
    card.subtasks ? card.subtasks.map(s => ({ 
      id: s._id || Date.now(), 
      text: s.title || s.text, 
      completed: s.completed 
    })) : []
  );
  const [newSubtask, setNewSubtask] = useState('');
  const [attachments, setAttachments] = useState(card.attachments || []);
  const [teamMembers, setTeamMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    loadComments();
    loadTeamMembers();
    loadProjectName();
  }, []);

  const loadProjectName = async () => {
    try {
      const boardId = card.board?._id || card.board;
      if (boardId) {
        const response = await Database.getProject(boardId);
        setProjectName(response.data?.name || 'Unknown Project');
      }
    } catch (error) {
      console.error('Error loading project name:', error);
      setProjectName('Project');
    }
  };

  const loadComments = async () => {
    const cardId = card.id || card._id;
    if (!cardId) return;
    try {
      const cardComments = await Database.getComments(cardId);
      setComments(cardComments);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const users = await Database.getUsers();
      setTeamMembers(users.data || []);
    } catch (error) {
      console.error('Error loading team members:', error);
      setTeamMembers([]);
    }
  };

  const handleSave = async () => {
    const cardId = card._id || card.id;
    if (!cardId) {
      toast.error('Invalid card ID');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        title,
        description,
        assignee: assignee || null,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        labels,
        subtasks: subtasks.map(s => ({
          title: s.text || '',
          completed: Boolean(s.completed)
        }))
      };
      
      await onUpdate(cardId, updates);
      toast.success('Task updated successfully!');
    } catch (error) {
      console.error('Error saving card:', error);
      toast.error('Failed to save changes');
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
      setNewComment('');
      loadComments();
      toast.success('Comment added!');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    const subtask = { id: Date.now(), text: newSubtask, completed: false };
    setSubtasks([...subtasks, subtask]);
    setNewSubtask('');
  };

  const toggleSubtask = (id) => {
    setSubtasks(subtasks.map(s => 
      s.id === id ? { ...s, completed: !s.completed } : s
    ));
  };

  const deleteSubtask = (id) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const handleAddLabel = () => {
    if (!newLabel.trim() || labels.includes(newLabel.trim())) return;
    setLabels([...labels, newLabel.trim()]);
    setNewLabel('');
  };

  const removeLabel = (label) => {
    setLabels(labels.filter(l => l !== label));
  };

  const calculateProgress = () => {
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'critical': 'bg-red-100 text-red-700 border-red-300',
      'high': 'bg-orange-100 text-orange-700 border-orange-300',
      'medium': 'bg-yellow-100 text-yellow-700 border-yellow-300',
      'low': 'bg-green-100 text-green-700 border-green-300'
    };
    return colors[priority?.toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const getStatusColor = (status) => {
    const colors = {
      'done': 'bg-green-100 text-green-700',
      'in-progress': 'bg-blue-100 text-blue-700',
      'review': 'bg-purple-100 text-purple-700',
      'todo': 'bg-gray-100 text-gray-700'
    };
    return colors[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 }
  };

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
          className="bg-white rounded-xl w-full max-w-5xl mt-8 mb-8 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            {/* Header with Project Name */}
            <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={20} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900">
                    {projectName}
                  </span>
                  <span className="text-sm text-gray-400">›</span>
                  <span className="text-sm text-gray-600">
                    {card.list?.title || 'List'}
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

            <div className="grid grid-cols-3 gap-6">
              {/* Main Content - 2 columns */}
              <div className="col-span-2 space-y-6">
                {/* Status & Priority Badges */}
                <div className="flex flex-wrap gap-2">
                  {status && (
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(status)}`}>
                      {status}
                    </span>
                  )}
                  {priority && (
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${getPriorityColor(priority)}`}>
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
                    <h4 className="font-semibold text-gray-800 text-lg">Description</h4>
                  </div>

                  {isEditingDescription || description ? (
                    <div className="ml-8">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={() => setIsEditingDescription(true)}
                        onBlur={() => setIsEditingDescription(false)}
                        placeholder="Add a more detailed description..."
                        className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 transition-shadow"
                        rows="5"
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

                {/* Subtasks with Progress */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <CheckSquare size={20} className="text-gray-600" />
                      <h4 className="font-semibold text-gray-800 text-lg">
                        Subtasks
                      </h4>
                      <span className="text-sm text-gray-500">
                        ({subtasks.filter(s => s.completed).length}/{subtasks.length})
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
                      {subtasks.map(subtask => (
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
                          <span className={`flex-1 text-sm ${
                            subtask.completed 
                              ? 'line-through text-gray-500' 
                              : 'text-gray-700'
                          }`}>
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
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
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
                      <h4 className="font-semibold text-gray-800 text-lg">Attachments</h4>
                    </div>
                    <div className="ml-8 space-y-2">
                      {attachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors bg-white"
                        >
                          <Paperclip size={16} className="text-gray-500" />
                          <span className="text-sm text-gray-700">{attachment.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <MessageSquare size={20} className="text-gray-600" />
                    <h4 className="font-semibold text-gray-800 text-lg">Activity</h4>
                  </div>
                  
                  <div className="ml-8 space-y-4">
                    {/* Add Comment */}
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-sm flex-shrink-0">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
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

                    {/* Comments List */}
                    <AnimatePresence>
                      {comments.map(comment => (
                        <motion.div
                          key={comment._id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex gap-3"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold shadow-sm flex-shrink-0">
                            {comment.user?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-sm text-gray-900">
                                {comment.user?.name || 'User'}
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

              {/* Sidebar - 1 column */}
              <div className="space-y-4">
                {/* Save Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg disabled:opacity-50 font-medium"
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </motion.button>

                {/* Add to card section */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider">
                    Add to card
                  </h4>
                  
                  <div className="space-y-3">
                    {/* Assignee */}
                    <div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
                        <User size={14} />
                        Assignee
                      </label>
                      <select
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map(member => (
                          <option key={member._id} value={member._id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
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
                        <option value="todo">To-Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="review">Review</option>
                        <option value="done">Done</option>
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
                          onKeyPress={(e) => e.key === 'Enter' && handleAddLabel()}
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
                      if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
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
    </AnimatePresence>
  );
};

export default CardDetailModal;