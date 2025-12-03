import React, { useState, useEffect, useRef } from "react";
import { AlignLeft, ChevronRight, ChevronDown } from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import { motion, AnimatePresence } from "framer-motion";

const CardDescription = ({ description, teamMembers, onChange, onImageUpload, modalContainerRef }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef(null);

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

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div 
        className="flex items-center gap-3 mb-3 cursor-pointer group"
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
        {!isExpanded && description && (
          <span className="text-xs text-gray-400 ml-auto">Click to expand</span>
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
    </motion.div>
  );
};

export default CardDescription;
