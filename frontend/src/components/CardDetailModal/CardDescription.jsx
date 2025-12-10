import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, memo } from "react";
import { AlignLeft, ChevronRight, History, Loader2 } from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import { motion, AnimatePresence } from "framer-motion";
import versionService from "../../services/versionService";

// Lazy load VersionHistoryModal for performance
const VersionHistoryModal = lazy(() => import("../VersionHistoryModal"));

const CardDescription = memo(({ 
  description, 
  teamMembers, 
  onChange, 
  onImageUpload, 
  modalContainerRef,
  cardId,
  onVersionRollback 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const containerRef = useRef(null);

  // Fetch version count on mount
  useEffect(() => {
    const fetchVersionCount = async () => {
      if (cardId) {
        try {
          const count = await versionService.getVersionCount('card', cardId);
          setVersionCount(count);
        } catch (error) {
          console.error('Error fetching version count:', error);
        }
      }
    };
    fetchVersionCount();
  }, [cardId, description]);

  // Handle clicking outside to collapse (scoped to modal)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't collapse if clicking inside the description container
      if (containerRef.current && containerRef.current.contains(event.target)) {
        return;
      }
      
      // If modal container is provided, only collapse if click is within the modal
      if (modalContainerRef?.current) {
        if (modalContainerRef.current.contains(event.target)) {
          setIsExpanded(false);
        }
      }
    };

    if (isExpanded) {
      // Use a small delay to prevent immediate collapse
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded, modalContainerRef]);

  // Handle version rollback
  const handleVersionRollback = useCallback(async (version) => {
    if (onVersionRollback) {
      onVersionRollback(version.htmlContent || version.content);
    } else if (onChange) {
      onChange(version.htmlContent || version.content);
    }
    setShowVersionHistory(false);
  }, [onChange, onVersionRollback]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div 
          className="flex items-center gap-3 cursor-pointer group flex-1"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <AlignLeft size={20} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800 text-lg">
            Description
          </h4>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400 group-hover:text-gray-600"
          >
            <ChevronRight size={18} />
          </motion.div>
        </div>
        
        {/* Version History Button */}
        {cardId && versionCount > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowVersionHistory(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 
                     bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200
                     hover:text-gray-800 group"
            title="View version history"
          >
            <History size={14} className="group-hover:rotate-[-20deg] transition-transform" />
            <span>{versionCount} version{versionCount !== 1 ? 's' : ''}</span>
          </motion.button>
        )}
        
        {!isExpanded && description && (
          <span className="text-xs text-gray-400">Click to expand</span>
        )}
      </div>

      <div className="ml-8 relative">
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors shadow-sm hover:shadow-md">
                <RichTextEditor
                  content={description}
                  onChange={onChange}
                  placeholder="Add a more detailed description..."
                  users={teamMembers}
                  onImageUpload={onImageUpload}
                  className="prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg"
                  startExpanded={true}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsExpanded(true)}
              className="p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50 min-h-[60px] border border-gray-200 hover:border-gray-300 transition-all shadow-sm"
            >
              {description ? (
                <div className="prose prose-sm max-w-none text-gray-800 line-clamp-2 overflow-hidden">
                  <div dangerouslySetInnerHTML={{ __html: description }} />
                </div>
              ) : (
                <p className="text-gray-500">Add a more detailed description...</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Version History Modal */}
      {showVersionHistory && cardId && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        }>
          <VersionHistoryModal
            entityType="card"
            entityId={cardId}
            isOpen={showVersionHistory}
            onClose={() => setShowVersionHistory(false)}
            onRollback={handleVersionRollback}
            title="Description History"
          />
        </Suspense>
      )}
    </motion.div>
  );
});

CardDescription.displayName = 'CardDescription';

export default CardDescription;
