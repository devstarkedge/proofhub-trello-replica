import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useCommentDraft - Hook for auto-saving comment drafts to localStorage
 * Persists drafts across page reloads and browser sessions
 * Also detects online/offline status for user feedback
 */
const useCommentDraft = (draftKey, options = {}) => {
  const {
    debounceMs = 1000,
    maxDraftAge = 7 * 24 * 60 * 60 * 1000, // 7 days
    enabled = true,
  } = options;

  const [draft, setDraft] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const saveTimeoutRef = useRef(null);
  
  // Generate storage key
  const getStorageKey = useCallback(() => {
    if (!draftKey) return null;
    return `comment_draft_${draftKey}`;
  }, [draftKey]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load draft from localStorage
  const loadDraft = useCallback(() => {
    if (!enabled || !draftKey) return null;
    
    try {
      const key = getStorageKey();
      if (!key) return null;
      
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        setHasDraft(false);
        setDraft(null);
        return null;
      }
      
      const draftData = JSON.parse(stored);
      
      // Check if draft is expired
      if (Date.now() - draftData.timestamp > maxDraftAge) {
        localStorage.removeItem(key);
        setHasDraft(false);
        setDraft(null);
        return null;
      }
      
      setHasDraft(true);
      setDraft(draftData.content);
      return draftData.content;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }, [enabled, draftKey, getStorageKey, maxDraftAge]);

  // Load draft on mount
  useEffect(() => {
    if (enabled && draftKey) {
      loadDraft();
    }
  }, [enabled, draftKey, loadDraft]);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback((content) => {
    if (!enabled || !draftKey) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        // Don't save empty content
        const plainText = (content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        
        if (!plainText) {
          // If content is empty, clear the draft
          clearDraft();
          return;
        }
        
        const key = getStorageKey();
        if (!key) return;
        
        const draftData = {
          content,
          timestamp: Date.now(),
          draftKey
        };
        
        localStorage.setItem(key, JSON.stringify(draftData));
        setHasDraft(true);
        setDraft(content);
      } catch (error) {
        console.error('Error saving draft:', error);
        // Handle quota exceeded
        if (error.name === 'QuotaExceededError') {
          cleanupOldDrafts();
        }
      }
    }, debounceMs);
  }, [enabled, draftKey, getStorageKey, debounceMs]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    
    try {
      const key = getStorageKey();
      if (key) {
        localStorage.removeItem(key);
      }
      setHasDraft(false);
      setDraft(null);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }, [draftKey, getStorageKey]);

  // Cleanup old drafts to free up space
  const cleanupOldDrafts = useCallback(() => {
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('comment_draft_')) {
        try {
          const draftData = JSON.parse(localStorage.getItem(key));
          if (Date.now() - draftData.timestamp > maxDraftAge) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, [maxDraftAge]);

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
    if (enabled) {
      cleanupOldDrafts();
    }
  }, [enabled, cleanupOldDrafts]);

  return {
    draft,
    hasDraft,
    isOnline,
    saveDraft,
    loadDraft,
    clearDraft,
  };
};

export default useCommentDraft;

