import { useEffect, useCallback, useRef } from 'react';
import useAttachmentStore from '../store/attachmentStore';
import { removeImageFromHtml, htmlContainsImage, sanitizeEditorHtml } from '../utils/attachmentHtmlUtils';

/**
 * Hook to synchronize editor content with attachment deletions (bidirectional).
 *
 * Forward direction  (Attachments section → editor):
 *   Listens for the 'attachment-deleted' CustomEvent and removes the corresponding
 *   image from the TipTap editor HTML.
 *
 * Reverse direction  (editor → Attachments section):
 *   Listens for the 'editor-image-removed' CustomEvent (dispatched by RichTextEditor
 *   when the user deletes an image in the editor) and removes the matching attachment
 *   from the Zustand attachment store + calls the delete API.
 *
 * @param {Object} options
 * @param {Object}   options.editor            - TipTap editor instance
 * @param {string}   options.entityType        - 'card' | 'subtask' | 'nanoSubtask'
 * @param {string}   options.entityId          - The entity ID
 * @param {Function} options.onChange          - Callback when editor content changes
 * @param {Object}   [options.previousImgSrcsRef] - Ref to the image-src Set in RichTextEditor
 *                                               Updated after external deletions so the
 *                                               image-diff in onUpdate stays accurate.
 */
const useEditorAttachmentSync = ({
  editor,
  entityType,
  entityId,
  onChange,
  previousImgSrcsRef,
}) => {
  const editorRef = useRef(editor);
  
  // Keep editor ref updated
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Handler for attachment deletion events (forward: store → editor)
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
      // Update editor content (emitUpdate=false to avoid re-triggering onUpdate)
      currentEditor.commands.setContent(newHtml, false);

      // Keep previousImgSrcsRef in sync so the onUpdate diff stays accurate
      if (previousImgSrcsRef) {
        previousImgSrcsRef.current.delete(imageUrl);
      }

      // Notify parent of content change
      if (onChange) {
        onChange(newHtml);
      }
    }
  }, [entityType, entityId, onChange, previousImgSrcsRef]);

  // Handler for images deleted by the user inside the editor (reverse: editor → store)
  const handleEditorImageRemoved = useCallback(async (event) => {
    const { entityType: removedEntityType, entityId: removedEntityId, url } = event.detail || {};

    if (removedEntityType !== entityType || removedEntityId !== entityId) return;
    if (!url || !entityId) return;

    // Look up the attachment in the store by URL
    const storeState = useAttachmentStore.getState();
    const entityKey = `${entityType}:${entityId}`;
    const storeAttachments = storeState.attachments[entityKey] || [];

    const attachment = storeAttachments.find(
      (a) =>
        !a.isDeleted &&
        (a.url === url ||
          a.secureUrl === url ||
          a.thumbnailUrl === url ||
          a.previewUrl === url)
    );

    // Already deleted or not tracked — nothing to do
    if (!attachment) return;

    try {
      await storeState.deleteAttachment(entityType, entityId, attachment._id);
    } catch (error) {
      console.error('[useEditorAttachmentSync] Failed to sync image removal to attachments:', error);
    }
  }, [entityType, entityId]);

  // Forward: Attachments section → editor
  useEffect(() => {
    window.addEventListener('attachment-deleted', handleAttachmentDeleted);
    return () => {
      window.removeEventListener('attachment-deleted', handleAttachmentDeleted);
    };
  }, [handleAttachmentDeleted]);

  // Reverse: editor image deleted → Attachments section
  useEffect(() => {
    window.addEventListener('editor-image-removed', handleEditorImageRemoved);
    return () => {
      window.removeEventListener('editor-image-removed', handleEditorImageRemoved);
    };
  }, [handleEditorImageRemoved]);

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
