import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, FileText, Copy, Check, ExternalLink } from 'lucide-react';

// Rich text display with markdown-like formatting
const RichTextDisplay = ({ content, className = '' }) => {
  // Simple markdown-like rendering for bold, italic, links
  const renderContent = (text) => {
    if (!text) return null;

    // Split by newlines and render paragraphs
    const paragraphs = text.split('\n');
    
    return paragraphs.map((paragraph, index) => {
      if (!paragraph.trim()) {
        return <br key={index} />;
      }

      // Basic markdown parsing
      let processed = paragraph;
      
      // Bold: **text** or __text__
      processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      processed = processed.replace(/__(.*?)__/g, '<strong>$1</strong>');
      
      // Italic: *text* or _text_
      processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
      processed = processed.replace(/_(.*?)_/g, '<em>$1</em>');
      
      // Links: [text](url)
      processed = processed.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline">$1</a>'
      );
      
      // Auto-detect URLs
      processed = processed.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline break-all">$1</a>'
      );

      return (
        <p 
          key={index} 
          className="mb-2 last:mb-0"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      );
    });
  };

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      {renderContent(content)}
    </div>
  );
};

// Main Expandable Description Component
const ExpandableDescription = ({
  description = '',
  title = 'Description',
  maxCollapsedHeight = 120,
  maxCollapsedChars = 300,
  showCopyButton = true,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldShowToggle, setShouldShowToggle] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);

  // Determine if content exceeds limits
  useEffect(() => {
    if (contentRef.current) {
      const needsExpand = 
        contentRef.current.scrollHeight > maxCollapsedHeight ||
        description.length > maxCollapsedChars;
      setShouldShowToggle(needsExpand);
    }
  }, [description, maxCollapsedHeight, maxCollapsedChars]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [description]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Truncate for collapsed view
  const truncatedDescription = React.useMemo(() => {
    if (!shouldShowToggle || isExpanded) return description;
    if (description.length <= maxCollapsedChars) return description;
    return description.slice(0, maxCollapsedChars).trim() + '...';
  }, [description, shouldShowToggle, isExpanded, maxCollapsedChars]);

  if (!description || !description.trim()) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
          <p className="text-sm text-gray-400 italic">No description provided</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        </div>
        <div className="flex items-center gap-2">
          {showCopyButton && description.length > 50 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Copy description"
            >
              {copied ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <Copy size={14} />
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* Description Content */}
      <motion.div
        initial={false}
        animate={{
          maxHeight: isExpanded ? 'none' : maxCollapsedHeight,
        }}
        className={`relative bg-white border border-gray-200 rounded-xl overflow-hidden ${
          !isExpanded && shouldShowToggle ? 'mask-gradient' : ''
        }`}
      >
        <div
          ref={contentRef}
          className={`p-4 text-gray-700 text-sm leading-relaxed ${
            !isExpanded && shouldShowToggle ? 'overflow-hidden' : ''
          }`}
          style={{
            maxHeight: !isExpanded && shouldShowToggle ? maxCollapsedHeight : 'none',
          }}
        >
          <RichTextDisplay content={isExpanded ? description : truncatedDescription} />
        </div>

        {/* Gradient fade for collapsed state */}
        {!isExpanded && shouldShowToggle && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none" />
        )}
      </motion.div>

      {/* Toggle Button */}
      {shouldShowToggle && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={toggleExpanded}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-indigo-50 hover:to-purple-50 border border-gray-200 hover:border-indigo-300 rounded-xl text-sm font-medium text-gray-700 hover:text-indigo-700 transition-all"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={16} />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown size={16} />
              Read More
            </>
          )}
        </motion.button>
      )}

      {/* Character count for long descriptions */}
      {description.length > 500 && (
        <p className="mt-2 text-xs text-gray-400 text-right">
          {description.length.toLocaleString()} characters
        </p>
      )}

      {/* Custom styles for gradient mask */}
      <style jsx>{`
        .mask-gradient {
          -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
          mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

// Scrollable version for larger content areas
export const ScrollableDescription = ({
  description = '',
  title = 'Description',
  maxHeight = 300,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [description]);

  if (!description || !description.trim()) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
          <p className="text-sm text-gray-400 italic">No description provided</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopy}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Copy description"
        >
          {copied ? (
            <Check size={14} className="text-green-500" />
          ) : (
            <Copy size={14} />
          )}
        </motion.button>
      </div>

      {/* Scrollable Content */}
      <div
        className="bg-white border border-gray-200 rounded-xl overflow-y-auto custom-scrollbar"
        style={{ maxHeight }}
      >
        <div className="p-4 text-gray-700 text-sm leading-relaxed">
          <RichTextDisplay content={description} />
        </div>
      </div>

      {/* Character count */}
      {description.length > 200 && (
        <p className="mt-2 text-xs text-gray-400 text-right">
          {description.length.toLocaleString()} characters
        </p>
      )}

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a1a1a1;
        }
      `}</style>
    </div>
  );
};

export default ExpandableDescription;
