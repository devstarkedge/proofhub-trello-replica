import React, { useRef, useEffect } from 'react';
import { Send, X, Loader } from 'lucide-react';
import RichTextEditor from '../RichTextEditor';

/**
 * CommentEditor - Rich text editor wrapper for comments
 */
const CommentEditor = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  users = [],
  theme = 'light',
  placeholder = 'Write a comment...',
  isEditing = false,
  compact = false,
}) => {
  const editorRef = useRef(null);
  const isDark = theme === 'dark';

  // Focus editor on mount for editing mode
  useEffect(() => {
    if (isEditing && editorRef.current) {
      // Focus logic can be added here if RichTextEditor exposes focus method
    }
  }, [isEditing]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSubmitting) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div 
      className={`comment-editor ${compact ? 'compact' : ''}`}
      onKeyDown={handleKeyDown}
    >
      <div className={`rounded-xl overflow-hidden border transition-colors ${
        isDark 
          ? 'border-gray-700 bg-gray-800/50 focus-within:border-indigo-500' 
          : 'border-gray-200 bg-white focus-within:border-indigo-400'
      }`}>
        <RichTextEditor
          ref={editorRef}
          content={value}
          onChange={onChange}
          users={users}
          placeholder={placeholder}
          isComment={true}
          allowMentions={true}
          collapsible={false}
          startExpanded={true}
        />
      </div>

      {/* Action Buttons */}
      <div className={`flex items-center justify-between mt-2 ${compact ? 'mt-1' : 'mt-2'}`}>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Ctrl+Enter to submit {onCancel && '• Escape to cancel'}
        </span>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isDark 
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X size={16} className="inline mr-1" />
              Cancel
            </button>
          )}

          <button
            onClick={onSubmit}
            disabled={isSubmitting || !value?.trim()}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              isSubmitting || !value?.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader size={14} className="animate-spin" />
                {isEditing ? 'Saving...' : 'Posting...'}
              </>
            ) : (
              <>
                <Send size={14} />
                {isEditing ? 'Save' : 'Post'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentEditor;
