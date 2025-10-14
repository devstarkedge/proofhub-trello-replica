import React from 'react';
import { Trash2, Calendar, Tag, MessageSquare, Paperclip, User, AlertCircle, CheckSquare } from 'lucide-react';

const Card = ({ card, onClick, onDelete, compact = false }) => {
  const hasDetails = card.description || card.labels?.length > 0 || card.dueDate || card.subtasks?.length > 0 || card.attachments?.length > 0 || card.comments?.length > 0;

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-800 border-red-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Done': return 'bg-green-100 text-green-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Review': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (compact) {
    return (
      <div className="p-2 border rounded hover:bg-gray-50">
        <p className="text-sm font-medium">{card.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
          {card.assignee && <User size={12} />}
          {card.priority && <span className={`px-1 rounded ${getPriorityColor(card.priority)}`}>{card.priority}</span>}
          {card.dueDate && <Calendar size={12} />}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg p-3 mb-2 shadow-sm hover:shadow-md cursor-pointer transition-shadow group"
    >
      {/* Labels/Tags */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.map((label, idx) => (
            <span key={idx} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">{label}</span>
          ))}
        </div>
      )}

      {/* Card Title */}
      <div className="flex justify-between items-start">
        <p className="text-sm text-gray-800 flex-1 mb-2">{card.title}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card._id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-gray-400 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Assignee and Priority */}
      <div className="flex items-center gap-2 mb-2">
        {card.assignee && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <User size={12} />
            <span>{card.assignee.name}</span>
          </div>
        )}
        {card.priority && (
          <span className={`px-2 py-1 text-xs rounded border ${getPriorityColor(card.priority)}`}>
            <AlertCircle size={10} className="inline mr-1" />
            {card.priority}
          </span>
        )}
      </div>

      {/* Status */}
      {card.status && (
        <div className="mb-2">
          <span className={`px-2 py-1 text-xs rounded ${getStatusColor(card.status)}`}>
            {card.status}
          </span>
        </div>
      )}

      {/* Card Badges */}
      {hasDetails && (
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {card.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{new Date(card.dueDate).toLocaleDateString()}</span>
            </div>
          )}
          {card.description && (
            <div className="flex items-center gap-1">
              <MessageSquare size={12} />
            </div>
          )}
          {card.subtasks && card.subtasks.length > 0 && (
            <div className="flex items-center gap-1">
              <CheckSquare size={12} />
              <span>{card.subtasks.filter(s => s.completed).length}/{card.subtasks.length}</span>
            </div>
          )}
          {card.attachments && card.attachments.length > 0 && (
            <div className="flex items-center gap-1">
              <Paperclip size={12} />
              <span>{card.attachments.length}</span>
            </div>
          )}
          {card.comments && card.comments.length > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare size={12} />
              <span>{card.comments.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Card;
