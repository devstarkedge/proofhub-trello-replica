/**
 * AppearanceModal - Theme Settings Modal
 * 
 * A premium modal for customizing application appearance:
 * - Light/Dark/Auto mode selection
 * - Theme color picker
 * - Live preview with Apply/Cancel
 */

import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Monitor, Check, RotateCcw } from 'lucide-react';
import useThemeStore, { THEME_COLORS, APPEARANCE_MODES } from '../store/themeStore';

const AppearanceModal = ({ isOpen, onClose }) => {
  // Theme store
  const {
    appearance,
    themeColor,
    effectiveMode,
    isPreviewMode,
    previewAppearance,
    previewThemeColor,
    setAppearance,
    setThemeColor,
    enterPreviewMode,
    applyPreview,
    cancelPreview,
    resetToDefault,
  } = useThemeStore();

  // Compute current values (preview-aware) for UI feedback
  const currentAppearance = isPreviewMode 
    ? (previewAppearance ?? appearance) 
    : appearance;
  const currentThemeColor = isPreviewMode 
    ? (previewThemeColor ?? themeColor) 
    : themeColor;

  // Enter preview mode when modal opens
  useEffect(() => {
    if (isOpen && !isPreviewMode) {
      enterPreviewMode();
    }
  }, [isOpen, isPreviewMode, enterPreviewMode]);

  // Handle close with cancel
  const handleClose = useCallback(() => {
    cancelPreview();
    onClose();
  }, [cancelPreview, onClose]);

  // Handle apply
  const handleApply = useCallback(() => {
    applyPreview();
    onClose();
  }, [applyPreview, onClose]);

  // Handle reset
  const handleReset = useCallback(() => {
    resetToDefault();
    onClose();
  }, [resetToDefault, onClose]);

  // ESC key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  // Get icon for appearance mode
  const getModeIcon = (mode, size = 20) => {
    switch (mode) {
      case 'light': return <Sun size={size} />;
      case 'dark': return <Moon size={size} />;
      case 'auto': return <Monitor size={size} />;
      default: return <Sun size={size} />;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-modal-overlay)' }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden"
            style={{ 
              backgroundColor: 'var(--color-modal-bg)',
              border: '1px solid var(--color-border-default)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div 
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <div>
                <h2 
                  className="text-xl font-bold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Appearance
                </h2>
                <p 
                  className="text-sm mt-1"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Customize how FlowTask looks on your device
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg transition-colors"
                style={{ 
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-bg-muted)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Appearance Mode */}
              <div>
                <label 
                  className="block text-sm font-semibold mb-3"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Mode
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {APPEARANCE_MODES.map((mode) => (
                    <motion.button
                      key={mode.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setAppearance(mode.id)}
                      className="relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                      style={{
                        borderColor: currentAppearance === mode.id 
                          ? 'var(--color-primary)' 
                          : 'var(--color-border-default)',
                        backgroundColor: currentAppearance === mode.id 
                          ? 'var(--color-primary-subtle)' 
                          : 'var(--color-bg-subtle)',
                        color: currentAppearance === mode.id 
                          ? 'var(--color-primary)' 
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {getModeIcon(mode.id, 24)}
                      <span className="text-sm font-medium">{mode.name}</span>
                      {currentAppearance === mode.id && (
                        <motion.div
                          layoutId="mode-check"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ 
                            backgroundColor: 'var(--color-primary)',
                            color: 'var(--color-text-on-primary)' 
                          }}
                        >
                          <Check size={12} strokeWidth={3} />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
                {appearance === 'auto' && (
                  <p 
                    className="text-xs mt-2 flex items-center gap-1"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <Monitor size={12} />
                    Currently using {effectiveMode} mode based on system preference
                  </p>
                )}
              </div>

              {/* Theme Color */}
              <div>
                <label 
                  className="block text-sm font-semibold mb-3"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Accent Color
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {THEME_COLORS.map((color) => (
                    <motion.button
                      key={color.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setThemeColor(color.id)}
                      className="relative group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
                      style={{
                        borderColor: currentThemeColor === color.id 
                          ? color.color 
                          : 'var(--color-border-default)',
                        backgroundColor: currentThemeColor === color.id 
                          ? `${color.color}15` 
                          : 'var(--color-bg-subtle)',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full shadow-md ring-2 ring-white/50 group-hover:ring-4 transition-all"
                        style={{ backgroundColor: color.color }}
                      >
                        {currentThemeColor === color.id && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-full h-full rounded-full flex items-center justify-center"
                          >
                            <Check size={16} className="text-white" strokeWidth={3} />
                          </motion.div>
                        )}
                      </div>
                      <span 
                        className="text-xs font-medium"
                        style={{ 
                          color: currentThemeColor === color.id 
                            ? color.color 
                            : 'var(--color-text-secondary)' 
                        }}
                      >
                        {color.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Preview Indicator */}
              <div 
                className="flex items-center gap-2 px-4 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-muted)' }}
              >
                <div 
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                />
                <span 
                  className="text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Preview mode active — changes will apply when you click "Apply"
                </span>
              </div>
            </div>

            {/* Footer */}
            <div 
              className="flex items-center justify-between px-6 py-4 border-t"
              style={{ 
                borderColor: 'var(--color-border-default)',
                backgroundColor: 'var(--color-bg-subtle)'
              }}
            >
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ 
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-bg-muted)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <RotateCcw size={16} />
                Reset to default
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                  style={{ 
                    color: 'var(--color-text-secondary)',
                    borderColor: 'var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-base)'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-bg-muted)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--color-bg-base)'}
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleApply}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold shadow-lg transition-all"
                  style={{ 
                    background: 'var(--gradient-primary)',
                    color: 'var(--color-text-on-primary)'
                  }}
                >
                  Apply
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AppearanceModal;
