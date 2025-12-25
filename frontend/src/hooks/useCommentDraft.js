import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useCommentDraft - Hook for auto-saving comment drafts to localStorage
 * Persists drafts across page reloads and browser sessions
 */
const useCommentDraft = (entityType, entityId, options = {}) => {
  const {
    debounceMs = 1000,
    maxDraftAge = 7 * 24 * 60 * 60 * 1000, // 7 days
    onDraftRestored = () => {},
  } = options;

  const [hasDraft, setHasDraft] = useState(false);
  const saveTimeoutRef = useRef(null);
  
  // Generate storage key
  const getStorageKey = useCallback(() => {
    return `comment_draft_${entityType}_${entityId}`;
  }, [entityType, entityId]);

  // Load draft from localStorage
  const loadDraft = useCallback(() => {
    if (!entityId) return null;
    
    try {
      const key = getStorageKey();
      const stored = localStorage.getItem(key);
      
      if (!stored) return null;
      
      const draft = JSON.parse(stored);
      
      // Check if draft is expired
      if (Date.now() - draft.timestamp > maxDraftAge) {
        localStorage.removeItem(key);
        return null;
      }
      
      setHasDraft(true);
      return draft;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }, [entityId, getStorageKey, maxDraftAge]);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback((content, htmlContent = '', attachments = []) => {
    if (!entityId) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        // Don't save empty content
        const plainText = (htmlContent || content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        
        if (!plainText && (!attachments || attachments.length === 0)) {
          // If content is empty, clear the draft
          clearDraft();
          return;
        }
        
        const key = getStorageKey();
        const draft = {
          content,
          htmlContent,
          attachments,
          timestamp: Date.now(),
          entityType,
          entityId
        };
        
        localStorage.setItem(key, JSON.stringify(draft));
        setHasDraft(true);
      } catch (error) {
        console.error('Error saving draft:', error);
        // Handle quota exceeded
        if (error.name === 'QuotaExceededError') {
          cleanupOldDrafts();
        }
      }
    }, debounceMs);
  }, [entityId, entityType, getStorageKey, debounceMs]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (!entityId) return;
    
    try {
      const key = getStorageKey();
      localStorage.removeItem(key);
      setHasDraft(false);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }, [entityId, getStorageKey]);

  // Cleanup old drafts to free up space
  const cleanupOldDrafts = useCallback(() => {
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('comment_draft_')) {
        try {
          const draft = JSON.parse(localStorage.getItem(key));
          if (Date.now() - draft.timestamp > maxDraftAge) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, [maxDraftAge]);

  // Restore draft on mount
  const restoreDraft = useCallback(() => {
    const draft = loadDraft();
    if (draft) {
      onDraftRestored(draft);
      return draft;
    }
    return null;
  }, [loadDraft, onDraftRestored]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup old drafts periodically
  useEffect(() => {
    cleanupOldDrafts();
  }, [cleanupOldDrafts]);

  return {
    hasDraft,
    saveDraft,
    loadDraft,
    clearDraft,
    restoreDraft,
  };
};

export default useCommentDraft;
