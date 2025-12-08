import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { toast } from 'react-toastify';

const AddLabelModal = ({
  isOpen,
  onClose,
  onSubmit,
  presetColors = [],
  existingLabels = [],
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(presetColors[0] || '#3B82F6');
  const [customColor, setCustomColor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setColor(presetColors[0] || '#3B82F6');
      setCustomColor('');
      setError('');
      // Focus input after a short delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, presetColors]);

  // Get text color based on background
  const getTextColor = (bgColor) => {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  };

  // Validate label name
  const validateName = (value) => {
    if (!value.trim()) {
      return 'Label name is required';
    }
    
    // Check for duplicate names (case-insensitive)
    const isDuplicate = existingLabels.some(
      label => label.name.toLowerCase() === value.trim().toLowerCase()
    );
    
    if (isDuplicate) {
      return 'A label with this name already exists';
    }
    
    if (value.trim().length > 50) {
      return 'Label name cannot exceed 50 characters';
    }
    
    return '';
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateName(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onSubmit(name.trim(), color);
      toast.success('Label created successfully!');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create label');
      toast.error(err.message || 'Failed to create label');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle color selection
  const handleColorSelect = (selectedColor) => {
    setColor(selectedColor);
    setCustomColor('');
  };

  // Handle custom color input
  const handleCustomColorChange = (e) => {
    const value = e.target.value;
    setCustomColor(value);
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
      setColor(value);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Create Label</h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Preview */}
            <div className="flex justify-center mb-2">
              <span
                className="px-4 py-2 rounded-lg text-sm font-medium shadow-sm min-w-[100px] text-center"
                style={{
                  backgroundColor: color,
                  color: getTextColor(color)
                }}
              >
                {name.trim() || 'Label Preview'}
              </span>
            </div>

            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Label Name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="Enter label name..."
                maxLength={50}
                className={`w-full p-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                }`}
              />
              {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">{name.length}/50 characters</p>
            </div>

            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Label Color
              </label>
              
              {/* Preset Colors */}
              <div className="flex flex-wrap gap-2 mb-3">
                {presetColors.map((presetColor) => (
                  <motion.button
                    key={presetColor}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleColorSelect(presetColor)}
                    className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                      color === presetColor && !customColor
                        ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                    style={{ backgroundColor: presetColor }}
                  >
                    {color === presetColor && !customColor && (
                      <Check size={16} style={{ color: getTextColor(presetColor) }} />
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Custom Color Input */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={customColor}
                    onChange={handleCustomColorChange}
                    placeholder="#3B82F6"
                    className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      setCustomColor(e.target.value);
                    }}
                    className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Label'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddLabelModal;
