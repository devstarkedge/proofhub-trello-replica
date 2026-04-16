import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Download, Eye, Trash2, RefreshCw, Archive, X } from 'lucide-react';

const menuItems = [
  { id: 'csv', label: 'Download CSV', sublabel: 'Export project report', icon: Download, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', hoverGradient: 'rgba(16, 185, 129, 0.08)' },
  { id: 'fields', label: 'Show Fields', sublabel: 'Toggle card fields', icon: Eye, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', hoverGradient: 'rgba(59, 130, 246, 0.08)' },
  { id: 'trash', label: 'Trash', sublabel: 'Deleted media', icon: Trash2, iconBg: 'bg-red-50', iconColor: 'text-red-600', hoverGradient: 'rgba(239, 68, 68, 0.08)' },
  { id: 'recurring', label: 'Recurring Tasks', sublabel: 'Manage schedules', icon: RefreshCw, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', hoverGradient: 'rgba(249, 115, 22, 0.08)' },
  { id: 'archive', label: 'View Archive', sublabel: 'Archived tasks', icon: Archive, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', hoverGradient: 'rgba(139, 92, 246, 0.08)', dynamicLabel: true },
];

const WorkflowMenu = memo(({
  onDownloadCSV,
  onShowFields,
  onTrash,
  onRecurringTasks,
  onArchiveToggle,
  showArchived,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleAction = useCallback((id) => {
    setIsOpen(false);
    switch (id) {
      case 'csv': onDownloadCSV?.(); break;
      case 'fields': onShowFields?.(); break;
      case 'trash': onTrash?.(); break;
      case 'recurring': onRecurringTasks?.(); break;
      case 'archive': onArchiveToggle?.(); break;
    }
  }, [onDownloadCSV, onShowFields, onTrash, onRecurringTasks, onArchiveToggle]);

  return (
    <div className="relative">
      <motion.button
        ref={triggerRef}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(prev => !prev)}
        className={`p-2.5 rounded-lg text-white transition-colors backdrop-blur-lg border ${
          isOpen
            ? 'bg-white/25 border-white/30'
            : 'bg-white/10 hover:bg-white/20 border-white/20'
        }`}
        title="More actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={18} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-64 z-50 origin-top-right"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
              borderRadius: '14px',
              backdropFilter: 'blur(20px)',
            }}
            role="menu"
            aria-orientation="vertical"
          >
            {/* Gradient accent */}
            <div
              className="absolute top-0 left-4 right-4 h-0.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)' }}
            />

            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                    boxShadow: '0 2px 6px rgba(139, 92, 246, 0.3)',
                  }}
                >
                  <MoreHorizontal size={12} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-sm font-bold text-gray-800">Actions</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={13} />
              </button>
            </div>

            {/* Menu items */}
            <div className="px-2 pb-2 space-y-0.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const label = item.dynamicLabel && showArchived ? 'Show Active' : item.label;
                const sublabel = item.dynamicLabel && showArchived ? 'Exit archive view' : item.sublabel;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleAction(item.id)}
                    className="group w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 rounded-xl flex items-center gap-3 transition-all duration-150"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${item.hoverGradient} 0%, transparent 100%)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    role="menuitem"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAction(item.id);
                      }
                    }}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.iconBg} group-hover:scale-105 transition-transform`}>
                      <Icon size={15} className={item.iconColor} strokeWidth={2} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-[13px] leading-tight">{label}</span>
                      <span className="text-[10px] text-gray-400 leading-tight">{sublabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

WorkflowMenu.displayName = 'WorkflowMenu';
export default WorkflowMenu;
