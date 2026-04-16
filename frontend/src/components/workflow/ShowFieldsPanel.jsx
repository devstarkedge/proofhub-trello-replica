import React, { memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Eye } from 'lucide-react';
import useFieldVisibilityStore, { FIELD_DEFINITIONS } from '../../store/fieldVisibilityStore';

const ShowFieldsPanel = memo(({ isOpen, onClose }) => {
  const panelRef = useRef(null);
  const visibleFields = useFieldVisibilityStore((s) => s.visibleFields);
  const toggleField = useFieldVisibilityStore((s) => s.toggleField);
  const resetDefaults = useFieldVisibilityStore((s) => s.resetDefaults);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    // Delay listener to prevent instant close from the menu click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const activeCount = Object.values(visibleFields).filter(Boolean).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed right-4 top-20 w-72 z-50"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
            borderRadius: '16px',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Gradient accent */}
          <div
            className="absolute top-0 left-4 right-4 h-0.5 rounded-full"
            style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)' }}
          />

          {/* Header */}
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
                }}
              >
                <Eye size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Show Fields</h3>
                <p className="text-[10px] text-gray-400">{activeCount} of {FIELD_DEFINITIONS.length} visible</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Field list */}
          <div className="px-3 py-2 max-h-[calc(100vh-200px)] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <div className="space-y-0.5">
              {FIELD_DEFINITIONS.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={visibleFields[field.key] ?? false}
                      onChange={() => toggleField(field.key)}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-gray-200 peer-checked:border-blue-500 peer-checked:bg-blue-500 transition-all flex items-center justify-center">
                      {visibleFields[field.key] && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm transition-colors ${visibleFields[field.key] ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                    {field.label}
                  </span>
                  {field.defaultVisible && (
                    <span className="ml-auto text-[9px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                      default
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100">
            <button
              onClick={resetDefaults}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={14} />
              Reset to defaults
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ShowFieldsPanel.displayName = 'ShowFieldsPanel';
export default ShowFieldsPanel;
