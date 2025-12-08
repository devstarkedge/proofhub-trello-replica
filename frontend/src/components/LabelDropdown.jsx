import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Search, X, Plus, Check } from 'lucide-react';
import useLabelStore from '../store/labelStore';
import AddLabelModal from './AddLabelModal';

// Preset colors for labels
const PRESET_COLORS = [
  '#22C55E', // Green
  '#EAB308', // Yellow
  '#F97316', // Orange
  '#EF4444', // Red
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#6B7280', // Gray
];

const LabelDropdown = ({
  boardId,
  selectedLabels = [],
  onLabelsChange,
  entityType = 'card', // 'card', 'subtask', 'nano'
  entityId,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [allLabels, setAllLabels] = useState([]);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Zustand store
  const { 
    fetchLabels, 
    createLabel, 
    syncLabels,
    loading 
  } = useLabelStore();

  // Fetch labels when component mounts or boardId changes
  useEffect(() => {
    const loadLabels = async () => {
      if (boardId) {
        const labels = await fetchLabels(boardId);
        setAllLabels(labels || []);
      }
    };
    loadLabels();
  }, [boardId, fetchLabels]);

  // Filter labels based on search
  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return allLabels;
    const query = searchQuery.toLowerCase();
    return allLabels.filter(label => 
      label.name.toLowerCase().includes(query)
    );
  }, [allLabels, searchQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Toggle label selection
  const toggleLabel = useCallback((labelId) => {
    const isSelected = selectedLabels.some(l => 
      (typeof l === 'object' ? l._id : l) === labelId
    );
    
    let newLabels;
    if (isSelected) {
      newLabels = selectedLabels.filter(l => 
        (typeof l === 'object' ? l._id : l) !== labelId
      );
    } else {
      const labelToAdd = allLabels.find(l => l._id === labelId);
      if (labelToAdd) {
        newLabels = [...selectedLabels, labelToAdd];
      } else {
        return;
      }
    }

    onLabelsChange(newLabels);

    // Sync with backend if entityId provided
    if (entityId && entityType) {
      const labelIds = newLabels.map(l => typeof l === 'object' ? l._id : l);
      syncLabels(entityType, entityId, labelIds).catch(console.error);
    }
  }, [selectedLabels, allLabels, onLabelsChange, entityId, entityType, syncLabels]);

  // Remove a label (from chip click)
  const removeLabel = useCallback((labelId, e) => {
    e.stopPropagation();
    const newLabels = selectedLabels.filter(l => 
      (typeof l === 'object' ? l._id : l) !== labelId
    );
    onLabelsChange(newLabels);

    if (entityId && entityType) {
      const labelIds = newLabels.map(l => typeof l === 'object' ? l._id : l);
      syncLabels(entityType, entityId, labelIds).catch(console.error);
    }
  }, [selectedLabels, onLabelsChange, entityId, entityType, syncLabels]);

  // Handle creating a new label
  const handleCreateLabel = async (name, color) => {
    try {
      const newLabel = await createLabel(name, color, boardId);
      
      // Refresh labels list
      const updatedLabels = await fetchLabels(boardId);
      setAllLabels(updatedLabels || []);
      
      // Auto-select the new label
      const newLabels = [...selectedLabels, newLabel];
      onLabelsChange(newLabels);

      if (entityId && entityType) {
        const labelIds = newLabels.map(l => typeof l === 'object' ? l._id : l);
        syncLabels(entityType, entityId, labelIds).catch(console.error);
      }

      setShowAddModal(false);
      return true;
    } catch (error) {
      console.error('Failed to create label:', error);
      throw error;
    }
  };

  // Check if a label is selected
  const isLabelSelected = (labelId) => {
    return selectedLabels.some(l => 
      (typeof l === 'object' ? l._id : l) === labelId
    );
  };

  // Get text color based on background
  const getTextColor = (bgColor) => {
    // Simple luminance check
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button and Selected Labels Display */}
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
          <Tag size={14} />
          Labels
        </label>
        
        {/* Selected Labels Chips */}
        {selectedLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedLabels.map((label, index) => {
              const labelObj = typeof label === 'object' ? label : allLabels.find(l => l._id === label);
              if (!labelObj) return null;
              
              return (
                <motion.span
                  key={labelObj._id || index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm"
                  style={{
                    backgroundColor: labelObj.color,
                    color: getTextColor(labelObj.color)
                  }}
                >
                  {labelObj.name}
                  <button
                    onClick={(e) => removeLabel(labelObj._id, e)}
                    className="hover:opacity-70 transition-opacity ml-0.5"
                  >
                    <X size={12} />
                  </button>
                </motion.span>
              );
            })}
          </div>
        )}

        {/* Dropdown Trigger */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 p-2.5 text-sm border border-gray-300 rounded-lg hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors"
        >
          <span className="text-gray-500">
            {selectedLabels.length > 0 
              ? `${selectedLabels.length} label${selectedLabels.length > 1 ? 's' : ''} selected`
              : 'Select labels...'}
          </span>
          <Tag size={16} className="text-gray-400" />
        </motion.button>
      </div>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          >
            {/* Search Bar */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search labels..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Labels List */}
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  Loading labels...
                </div>
              ) : filteredLabels.length > 0 ? (
                <div className="p-2">
                  {filteredLabels.map((label) => {
                    const isSelected = isLabelSelected(label._id);
                    return (
                      <motion.button
                        key={label._id}
                        type="button"
                        whileHover={{ backgroundColor: '#F3F4F6' }}
                        onClick={() => toggleLabel(label._id)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left"
                      >
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected 
                            ? 'bg-blue-500 border-blue-500' 
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        
                        {/* Label Chip */}
                        <span
                          className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium"
                          style={{
                            backgroundColor: label.color,
                            color: getTextColor(label.color)
                          }}
                        >
                          {label.name}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {searchQuery ? 'No labels found' : 'No labels yet'}
                </div>
              )}
            </div>

            {/* Add Label Button */}
            <div className="p-3 border-t border-gray-100">
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-2 p-2.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
              >
                <Plus size={16} />
                Add label
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Label Modal */}
      <AddLabelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateLabel}
        presetColors={PRESET_COLORS}
        existingLabels={allLabels}
      />

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
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
    </div>
  );
};

export default LabelDropdown;
