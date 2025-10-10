import React, { useState, useEffect } from 'react';
import { X, AlignLeft, Users, Tag, CheckSquare, Calendar, Trash2, Clock } from 'lucide-react';

const CardDetailModal = ({ card, onClose, onUpdate, onDelete }) => {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  
  const handleSave = () => {
    onUpdate(card.id, { title, description });
  };
  
  useEffect(() => {
    handleSave();
  }, [title, description]);
  
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
      <div className="bg-white rounded-lg w-full max-w-3xl mt-12 mb-12 shadow-xl">
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
                    in list <span className="underline">Today</span>
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
                      rows="6"
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
              
              {/* Activity */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Clock size={20} className="text-gray-600" />
                  <h4 className="font-semibold text-gray-800">Activity</h4>
                </div>
                <div className="ml-8">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                      U
                    </div>
                    <div className="flex-1">
                      <textarea
                        placeholder="Write a comment..."
                        className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        rows="3"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 space-y-3">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-semibold text-sm">
                        U
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">User Name</span>
                          <span className="text-xs text-gray-500">
                            {new Date(card.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">added this card to Today</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sidebar */}
            <div className="space-y-4">
              {/* Add to card */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Add to card</h4>
                <div className="space-y-1">
                  <button className="flex items-center gap-2 w-full p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-left">
                    <Users size={16} className="text-gray-600" />
                    Members
                  </button>
                  <button className="flex items-center gap-2 w-full p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-left">
                    <Tag size={16} className="text-gray-600" />
                    Labels
                  </button>
                  <button className="flex items-center gap-2 w-full p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-left">
                    <CheckSquare size={16} className="text-gray-600" />
                    Checklist
                  </button>
                  <button className="flex items-center gap-2 w-full p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-left">
                    <Calendar size={16} className="text-gray-600" />
                    Dates
                  </button>
                </div>
              </div>
              
              {/* Actions */}
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 px-2">Actions</h4>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this card?')) {
                        onDelete(card.id);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2 w-full p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-left"
                  >
                    <Trash2 size={16} className="text-gray-600" />
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