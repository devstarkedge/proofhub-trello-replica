/**
 * AppearanceModal - Premium Theme Settings Modal
 * 
 * A beautifully designed modal for customizing application appearance:
 * - Light/Dark/Auto mode selection with visual previews
 * - Theme color picker with gradient highlights
 * - Live preview with Apply/Cancel
 */

import React, { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Monitor, Check, RotateCcw, Sparkles, Palette } from 'lucide-react';
import useThemeStore, { THEME_COLORS, APPEARANCE_MODES } from '../store/themeStore';

// Mode icon colors for visual distinction
const modeColors = {
  light: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
  dark: { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', gradient: 'linear-gradient(135deg, #818cf8, #6366f1)' },
  auto: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', gradient: 'linear-gradient(135deg, #34d399, #10b981)' },
};

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

  const [hoveredMode, setHoveredMode] = useState(null);
  const [hoveredColor, setHoveredColor] = useState(null);

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

  // Get mode description
  const getModeDescription = (mode) => {
    switch (mode) {
      case 'light': return 'Bright & clean';
      case 'dark': return 'Easy on eyes';
      case 'auto': return 'Match system';
      default: return '';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] overflow-y-auto backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={handleClose}
        >
          {/* Centering wrapper */}
          <div className="min-h-screen flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              style={{ 
                backgroundColor: 'var(--color-modal-bg)',
                border: '1px solid var(--color-border-default)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with gradient accent */}
              <div 
                className="relative px-6 py-5 border-b overflow-hidden"
                style={{ borderColor: 'var(--color-border-subtle)' }}
              >
                {/* Decorative gradient blob */}
                <div 
                  className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20 blur-3xl"
                  style={{ background: 'var(--gradient-primary)' }}
                />
                
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="flex items-center justify-center w-11 h-11 rounded-xl"
                      style={{ 
                        background: 'linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50))',
                      }}
                    >
                      <Palette 
                        size={22} 
                        style={{ color: 'var(--color-primary)' }}
                      />
                    </div>
                    <div>
                      <h2 
                        className="text-lg font-bold"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        Appearance
                      </h2>
                      <p 
                        className="text-sm"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        Personalize your experience
                      </p>
                    </div>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleClose}
                    className="p-2 rounded-xl transition-colors"
                    style={{ 
                      color: 'var(--color-text-muted)',
                      backgroundColor: 'var(--color-bg-muted)',
                    }}
                  >
                    <X size={18} />
                  </motion.button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Theme Mode Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
                    <label 
                      className="text-sm font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Theme Mode
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {APPEARANCE_MODES.map((mode) => {
                      const isSelected = currentAppearance === mode.id;
                      const isHovered = hoveredMode === mode.id;
                      const modeConfig = modeColors[mode.id];
                      
                      return (
                        <motion.button
                          key={mode.id}
                          whileHover={{ scale: 1.03, y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setAppearance(mode.id)}
                          onMouseEnter={() => setHoveredMode(mode.id)}
                          onMouseLeave={() => setHoveredMode(null)}
                          className="relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200"
                          style={{
                            borderColor: isSelected ? modeConfig.color : 'var(--color-border-default)',
                            backgroundColor: isSelected ? modeConfig.bg : isHovered ? 'var(--color-bg-muted)' : 'var(--color-bg-subtle)',
                            boxShadow: isSelected ? `0 4px 12px ${modeConfig.color}30` : 'none',
                          }}
                        >
                          {/* Icon with gradient background */}
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200"
                            style={{
                              background: isSelected || isHovered ? modeConfig.gradient : 'var(--color-bg-muted)',
                              color: isSelected || isHovered ? '#fff' : 'var(--color-text-muted)',
                              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                            }}
                          >
                            {getModeIcon(mode.id, 24)}
                          </div>
                          
                          {/* Label */}
                          <span 
                            className="text-sm font-semibold"
                            style={{ 
                              color: isSelected ? modeConfig.color : 'var(--color-text-primary)',
                            }}
                          >
                            {mode.name}
                          </span>
                          
                          {/* Description */}
                          <span 
                            className="text-xs"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            {getModeDescription(mode.id)}
                          </span>
                          
                          {/* Selection indicator */}
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                              style={{ 
                                background: modeConfig.gradient,
                              }}
                            >
                              <Check size={14} className="text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  
                  {/* Auto mode indicator */}
                  {currentAppearance === 'auto' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: 'var(--color-bg-muted)' }}
                    >
                      <Monitor size={14} style={{ color: 'var(--color-text-muted)' }} />
                      <span 
                        className="text-xs"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        Using <strong style={{ color: 'var(--color-primary)' }}>{effectiveMode}</strong> mode based on your system
                      </span>
                    </motion.div>
                  )}
                </div>

                {/* Accent Color Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ background: 'var(--gradient-primary)' }}
                    />
                    <label 
                      className="text-sm font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Accent Color
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-3">
                    {THEME_COLORS.map((color) => {
                      const isSelected = currentThemeColor === color.id;
                      const isHovered = hoveredColor === color.id;
                      
                      return (
                        <motion.button
                          key={color.id}
                          whileHover={{ scale: 1.08, y: -3 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setThemeColor(color.id)}
                          onMouseEnter={() => setHoveredColor(color.id)}
                          onMouseLeave={() => setHoveredColor(null)}
                          className="group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200"
                          style={{
                            borderColor: isSelected ? color.color : 'var(--color-border-default)',
                            backgroundColor: isSelected ? `${color.color}15` : isHovered ? 'var(--color-bg-muted)' : 'var(--color-bg-subtle)',
                            boxShadow: isSelected ? `0 4px 12px ${color.color}40` : 'none',
                          }}
                        >
                          {/* Color orb */}
                          <div className="relative">
                            <motion.div
                              className="w-10 h-10 rounded-full shadow-lg transition-all duration-200"
                              style={{ 
                                backgroundColor: color.color,
                                boxShadow: isHovered || isSelected 
                                  ? `0 0 20px ${color.color}60, 0 4px 8px ${color.color}40`
                                  : `0 2px 4px rgba(0,0,0,0.1)`,
                              }}
                              animate={{
                                scale: isHovered ? 1.15 : 1,
                              }}
                            >
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0, rotate: -180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: 'spring', damping: 15 }}
                                  className="w-full h-full rounded-full flex items-center justify-center"
                                >
                                  <Check size={18} className="text-white" strokeWidth={3} />
                                </motion.div>
                              )}
                            </motion.div>
                            
                            {/* Glow effect on hover */}
                            {isHovered && !isSelected && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 rounded-full"
                                style={{
                                  background: color.color,
                                  filter: 'blur(8px)',
                                  opacity: 0.4,
                                }}
                              />
                            )}
                          </div>
                          
                          {/* Color name */}
                          <span 
                            className="text-xs font-medium transition-colors"
                            style={{ 
                              color: isSelected ? color.color : 'var(--color-text-secondary)',
                            }}
                          >
                            {color.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview Status */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ 
                    backgroundColor: 'var(--color-primary-subtle)',
                    border: '1px solid var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    opacity: 0.8,
                  }}
                >
                  <div className="relative">
                    <div 
                      className="w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    />
                    <div 
                      className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
                      style={{ backgroundColor: 'var(--color-primary)', opacity: 0.4 }}
                    />
                  </div>
                  <span 
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Preview active — click Apply to save changes
                  </span>
                </motion.div>
              </div>

              {/* Footer */}
              <div 
                className="flex items-center justify-between px-6 py-4 border-t"
                style={{ 
                  borderColor: 'var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-subtle)',
                }}
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ 
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  <RotateCcw size={16} />
                  Reset
                </motion.button>
                
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleClose}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-all"
                    style={{ 
                      color: 'var(--color-text-secondary)',
                      borderColor: 'var(--color-border-default)',
                      backgroundColor: 'var(--color-bg-base)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                      e.currentTarget.style.borderColor = 'var(--color-border-emphasis)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-base)';
                      e.currentTarget.style.borderColor = 'var(--color-border-default)';
                    }}
                  >
                    Cancel
                  </motion.button>
                  
                  <motion.button
                    whileHover={{ scale: 1.03, boxShadow: '0 8px 20px var(--color-primary)40' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleApply}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all flex items-center gap-2"
                    style={{ 
                      background: 'var(--gradient-primary)',
                      color: 'var(--color-text-on-primary)',
                      boxShadow: '0 4px 12px rgba(var(--color-primary-rgb), 0.3)',
                    }}
                  >
                    <Check size={16} />
                    Apply
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AppearanceModal;
