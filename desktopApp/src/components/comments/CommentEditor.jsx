import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, X, Loader, Save, AlertCircle, WifiOff } from 'lucide-react';
import RichTextEditor from '../RichTextEditor';
import useCommentDraft from '../../hooks/useCommentDraft';

/**
 * CommentEditor - Rich text editor wrapper for comments
 * Features: Offline draft save, spam protection, keyboard shortcuts
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
  entityType = 'card',
  entityId = null,
  enableDraft = true,
}) => {
  const editorRef = useRef(null);
  const isDark = theme === 'dark';
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  
  // Spam protection - minimum 2 seconds between submissions
  const SUBMIT_COOLDOWN = 2000;

  // Draft auto-save hook
  const draftKey = entityId ? `${entityType}-${entityId}` : null;
  const {
    draft,
    saveDraft,
    clearDraft,
    hasDraft,
    isOnline
  } = useCommentDraft(draftKey, { enabled: enableDraft && !isEditing });

  // Restore draft on mount if available
  useEffect(() => {
    if (hasDraft && draft && !value && !isEditing) {
      onChange(draft);
    }
  }, [hasDraft, draft, isEditing]);

  // Auto-save draft when content changes
  useEffect(() => {
    if (enableDraft && !isEditing && value && value.trim()) {
      saveDraft(value);
    }
  }, [value, enableDraft, isEditing, saveDraft]);

  // Focus editor on mount for editing mode
  useEffect(() => {
    if (isEditing && editorRef.current) {
      // Focus logic can be added here if RichTextEditor exposes focus method
    }
  }, [isEditing]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSubmitting && !submitBlocked) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  }, [isSubmitting, submitBlocked, onCancel]);

  // Submit with spam protection
  const handleSubmit = useCallback(() => {
    const now = Date.now();
    if (now - lastSubmitTime < SUBMIT_COOLDOWN) {
      setSubmitBlocked(true);
      setTimeout(() => setSubmitBlocked(false), SUBMIT_COOLDOWN - (now - lastSubmitTime));
      return;
    }
    
    setLastSubmitTime(now);
    clearDraft(); // Clear draft on successful submit
    onSubmit();
  }, [lastSubmitTime, clearDraft, onSubmit]);

  const hasContent = value && value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  return (
    <div 
      className={`comment-editor ${compact ? 'compact' : ''}`}
      onKeyDown={handleKeyDown}
    >
      {/* Offline/Draft indicator */}
      {enableDraft && !isEditing && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className={`flex items-center gap-1 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                <WifiOff size={12} />
                Offline - draft saved locally
              </span>
            )}
            {hasDraft && isOnline && (
              <span className={`flex items-center gap-1 text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                <Save size={12} />
                Draft recovered
              </span>
            )}
          </div>
        </div>
      )}

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
          {/* Rate limit warning */}
          {submitBlocked && (
            <span className={`flex items-center gap-1 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              <AlertCircle size={12} />
              Please wait...
            </span>
          )}
          
          {onCancel && (
            <button
              onClick={() => {
                clearDraft();
                onCancel();
              }}
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
            onClick={handleSubmit}
            disabled={isSubmitting || !hasContent || submitBlocked}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              isSubmitting || !hasContent || submitBlocked
                ? isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
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

