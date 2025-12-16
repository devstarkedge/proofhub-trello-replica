import { useEffect, useCallback, useRef } from 'react';
import useAttachmentStore from '../store/attachmentStore';
import { removeImageFromHtml, htmlContainsImage, sanitizeEditorHtml } from '../utils/attachmentHtmlUtils';

/**
 * Hook to synchronize editor content with attachment deletions.
 * When an attachment is deleted from any section (Description, Comment, or Attachments),
 * this hook will remove the corresponding image from the editor content.
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.editor - TipTap editor instance
 * @param {string} options.entityType - 'card', 'subtask', or 'nanoSubtask'
 * @param {string} options.entityId - The entity ID
 * @param {Function} options.onChange - Callback when content changes
 */
const useEditorAttachmentSync = ({
  editor,
  entityType,
  entityId,
  onChange
}) => {
  const editorRef = useRef(editor);
  
  // Keep editor ref updated
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Handler for attachment deletion events
  const handleAttachmentDeleted = useCallback((event) => {
    const { entityType: deletedEntityType, entityId: deletedEntityId, url, attachment } = event.detail || {};
    
    // Only process events for our entity
    if (deletedEntityType !== entityType || deletedEntityId !== entityId) {
      return;
    }

    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return;

    // Get the URL to search for in the editor content
    const imageUrl = url || attachment?.secureUrl || attachment?.url;
    if (!imageUrl) return;

    // Get current HTML content
    const currentHtml = currentEditor.getHTML();
    
    // Quick check if URL exists in content
    if (!htmlContainsImage(currentHtml, imageUrl)) return;

    // Remove the image from content using the utility function
    let newHtml = removeImageFromHtml(currentHtml, imageUrl);
    
    // Ensure proper structure
    newHtml = sanitizeEditorHtml(newHtml);
    
    // Only update if content actually changed
    if (newHtml !== currentHtml) {
      // Update editor content
      currentEditor.commands.setContent(newHtml, false);
      
      // Notify parent of content change
      if (onChange) {
        onChange(newHtml);
      }
    }
  }, [entityType, entityId, onChange]);

  // Subscribe to attachment-deleted events
  useEffect(() => {
    window.addEventListener('attachment-deleted', handleAttachmentDeleted);
    return () => {
      window.removeEventListener('attachment-deleted', handleAttachmentDeleted);
    };
  }, [handleAttachmentDeleted]);

  // Also subscribe to store changes for direct deletion tracking
  useEffect(() => {
    if (!entityId) return;

    // Subscribe to store's attachment removals
    const unsubscribe = useAttachmentStore.subscribe(
      (state) => state.attachments[`${entityType}:${entityId}`],
      (newAttachments, prevAttachments) => {
        // This fires when attachments change
        // We could use this for additional sync logic if needed
      }
    );

    return () => {
      unsubscribe();
    };
  }, [entityType, entityId]);

  return null;
};

export default useEditorAttachmentSync;
