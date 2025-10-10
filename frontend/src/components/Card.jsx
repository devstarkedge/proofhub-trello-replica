import React from 'react';
import { Trash2, Calendar, Tag, MessageSquare, Paperclip } from 'lucide-react';

const Card = ({ card, onClick, onDelete }) => {
  const hasDetails = card.description || card.labels?.length > 0 || card.dueDate || card.checklist?.length > 0;
  
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg p-3 mb-2 shadow-sm hover:shadow-md cursor-pointer transition-shadow group"
    >
      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.map((label, idx) => (
            <span key={idx} className={`h-2 w-10 rounded ${label.color}`}></span>
          ))}
        </div>
      )}
      
      {/* Card Title */}
      <div className="flex justify-between items-start">
        <p className="text-sm text-gray-800 flex-1 mb-2">{card.title}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-gray-400 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
      
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
          {card.checklist && card.checklist.length > 0 && (
            <div className="flex items-center gap-1">
              <Paperclip size={12} />
              <span>{card.checklist.filter(i => i.completed).length}/{card.checklist.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Card;