import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import announcementService from '../services/announcementService';

export const useAnnouncementActions = (onSuccess) => {
  const [loadingAction, setLoadingAction] = useState(false);

  // Add Comment
  const addComment = useCallback(async (announcementId, text) => {
    try {
      setLoadingAction(true);
      await announcementService.addComment(announcementId, text);
      toast.success('Comment added');
      if (onSuccess) onSuccess('comment-added', announcementId);
      return true;
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      return false;
    } finally {
      setLoadingAction(false);
    }
  }, [onSuccess]);

  // Delete Comment
  const deleteComment = useCallback(async (announcementId, commentId) => {
    try {
      setLoadingAction(true);
      await announcementService.deleteComment(announcementId, commentId);
      toast.success('Comment deleted');
      if (onSuccess) onSuccess('comment-deleted', announcementId);
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
      return false;
    } finally {
      setLoadingAction(false);
    }
  }, [onSuccess]);

  // Add Reaction
  const addReaction = useCallback(async (announcementId, emoji) => {
    try {
      // Don't set global loading state for reactions to keep UI snappy
      await announcementService.addReaction(announcementId, emoji);
      if (onSuccess) onSuccess('reaction-added', announcementId);
      return true;
    } catch (error) {
      console.error('Error adding reaction:', error);
      toast.error('Failed to add reaction');
      return false;
    }
  }, [onSuccess]);

  // Remove Reaction
  const removeReaction = useCallback(async (announcementId, emoji) => {
    try {
      await announcementService.removeReaction(announcementId, emoji);
      if (onSuccess) onSuccess('reaction-removed', announcementId);
      return true;
    } catch (error) {
      console.error('Error removing reaction:', error);
      toast.error('Failed to remove reaction');
      return false;
    }
  }, [onSuccess]);

  // Delete Attachment
  const deleteAttachment = useCallback(async (announcementId, attachmentId) => {
    try {
        setLoadingAction(true);
        await announcementService.deleteAttachment(announcementId, attachmentId);
        toast.success("Attachment deleted successfully");
        if (onSuccess) onSuccess('attachment-deleted', announcementId, attachmentId);
        return true;
    } catch (error) {
        console.error('Error deleting attachment:', error);
        toast.error(error.message || "Failed to delete attachment");
        return false;
    } finally {
        setLoadingAction(false);
    }
  }, [onSuccess]);

  return {
    addComment,
    deleteComment,
    addReaction,
    removeReaction,
    deleteAttachment,
    loadingAction
  };
};

export default useAnnouncementActions;
