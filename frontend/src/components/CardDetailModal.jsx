import React, { useState, useEffect, useContext } from 'react';
import { X, AlignLeft, Users, Tag, CheckSquare, Calendar, Trash2, Clock, Paperclip, MessageSquare, AlertCircle, User } from 'lucide-react';
import Database from '../services/database';
import AuthContext from '../context/AuthContext';

const CardDetailModal = ({ card, onClose, onUpdate, onDelete }) => {
  const { user } = useContext(AuthContext);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [assignee, setAssignee] = useState(card.assignee?._id || '');
  const [priority, setPriority] = useState(card.priority || '');
  const [status, setStatus] = useState(card.status || '');
  const [dueDate, setDueDate] = useState(card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : '');
  const [labels, setLabels] = useState(card.labels || []);
  const [newLabel, setNewLabel] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [subtasks, setSubtasks] = useState(card.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [attachments, setAttachments] = useState(card.attachments || []);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    loadComments();
    loadTeamMembers();
  }, []);

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

  const handleSave = () => {
    const updates = {
      title,
      description,
      assignee: assignee ? teamMembers.find(m => m._id === assignee) : null,
      priority,
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
      labels,
      subtasks
    };
    onUpdate(card._id, updates);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const cardId = card.id || card._id;
    if (!cardId) return;
    try {
      await Database.createComment(cardId, newComment);
      setNewComment('');
      loadComments();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    const subtask = { id: Date.now(), text: newSubtask, completed: false };
    setSubtasks([...subtasks, subtask]);
    setNewSubtask('');
  };

  const toggleSubtask = (id) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const handleAddLabel = () => {
    if (!newLabel.trim()) return;
    setLabels([...labels, newLabel]);
    setNewLabel('');
  };

  const removeLabel = (index) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg w-full max-w-4xl mt-8 mb-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-start gap-3 mb-4">
                <AlignLeft size={24} className="text-gray-600 mt-1" />
                <div className="flex-1">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-xl font-semibold w-full border-none outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2"
                  />
                  <p className="text-sm text-gray-600 mt-2 px-2">
                    in list <span className="underline">{card.listName || 'List'}</span>
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 ml-4 hover:bg-gray-100 p-2 rounded transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="col-span-2 space-y-6">
              {/* Labels */}
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {labels.map((label, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm flex items-center gap-1">
                      {label}
                      <button onClick={() => removeLabel(index)} className="hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <AlignLeft size={20} className="text-gray-600" />
                  <h4 className="font-semibold text-gray-800">Description</h4>
                </div>

                {isEditingDescription || description ? (
                  <div className="ml-8">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onFocus={() => setIsEditingDescription(true)}
                      onBlur={() => setIsEditingDescription(false)}
                      placeholder="Add a more detailed description..."
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="4"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="ml-8 w-full text-left p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
                  >
                    Add a more detailed description...
                  </button>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <CheckSquare size={20} className="text-gray-600" />
                  <h4 className="font-semibold text-gray-800">Subtasks ({subtasks.filter(s => s.completed).length}/{subtasks.length})</h4>
                </div>
                <div className="ml-8 space-y-2">
                  {subtasks.map(subtask => (
                    <div key={subtask.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={subtask.completed}
                        onChange={() => toggleSubtask(subtask.id)}
                        className="rounded"
                      />
                      <span className={subtask.completed ? 'line-through text-gray-500' : ''}>{subtask.text}</span>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                      placeholder="Add a subtask..."
                      className="flex-1 p-2 border rounded"
                    />
                    <button onClick={handleAddSubtask} className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <Paperclip size={20} className="text-gray-600" />
                    <h4 className="font-semibold text-gray-800">Attachments</h4>
                  </div>
                  <div className="ml-8 space-y-2">
                    {attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded">
                        <Paperclip size={16} />
                        <span>{attachment.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <MessageSquare size={20} className="text-gray-600" />
                  <h4 className="font-semibold text-gray-800">Comments</h4>
                </div>
                <div className="ml-8 space-y-4">
                  {comments.map(comment => (
                    <div key={comment._id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                        {comment.user?.name?.[0] || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{comment.user?.name || 'User'}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                      {user?.name?.[0] || 'U'}
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        rows="3"
                      />
                      <button
                        onClick={handleAddComment}
                        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Quick Actions */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Quick Actions</h4>
                <div className="space-y-1">
                  <button onClick={handleSave} className="flex items-center gap-2 w-full p-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-left">
                    Save Changes
                  </button>
                </div>
              </div>

              {/* Add to card */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Add to card</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-600" />
                    <select
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                      className="flex-1 p-2 text-sm border rounded"
                    >
                      <option value="">Assign to...</option>
                      {teamMembers.map(member => (
                        <option key={member._id} value={member._id}>{member.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-gray-600" />
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="flex-1 p-2 text-sm border rounded"
                    >
                      <option value="">Priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag size={16} className="text-gray-600" />
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddLabel()}
                      placeholder="Add label..."
                      className="flex-1 p-2 text-sm border rounded"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-600" />
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="flex-1 p-2 text-sm border rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Status</h4>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full p-2 text-sm border rounded"
                >
                  <option value="">Select status</option>
                  <option value="To-Do">To-Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Review">Review</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              {/* Actions */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Actions</h4>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this card?')) {
                        onDelete(card._id);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2 w-full p-2 text-sm bg-red-100 hover:bg-red-200 rounded-lg transition-colors text-left text-red-700"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardDetailModal;
