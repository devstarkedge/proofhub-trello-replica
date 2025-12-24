import { useState, useCallback, useRef } from 'react';
import Database from '../services/database';
import useProjectStore from '../store/projectStore';
import { toast } from 'react-toastify';

/**
 * Custom hook for managing project cover images
 * Provides upload, remove, and restore functionality with optimistic updates
 * 
 * @param {string} projectId - The project/board ID
 * @returns {Object} Cover image operations and state
 */
const useCoverImage = (projectId) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Undo functionality
  const undoTimeoutRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [undoData, setUndoData] = useState(null);
  
  // Get store actions for optimistic updates
  const { projectUpdated } = useProjectStore();

  /**
   * Upload a new cover image
   * @param {File} file - Image file to upload
   * @returns {Promise<Object>} Upload result
   */
  const uploadCoverImage = useCallback(async (file) => {
    if (!projectId || !file) {
      setError('Invalid project ID or file');
      return { success: false, error: 'Invalid project ID or file' };
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      const errorMsg = 'Invalid file type. Only images allowed: JPG, PNG, WebP, GIF';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const errorMsg = `File too large. Maximum size: 5MB`;
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    setIsUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      setUploadProgress(30);
      
      const result = await Database.uploadProjectCoverImage(projectId, file);
      
      setUploadProgress(100);
      
      if (result.success && result.data) {
        // Update store for instant UI refresh
        projectUpdated({
          _id: projectId,
          coverImage: result.data.coverImage,
          coverImageHistory: result.data.coverImageHistory
        });
        
        toast.success('Cover image uploaded successfully!');
        return { success: true, data: result.data };
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to upload cover image';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [projectId, projectUpdated]);

  /**
   * Remove cover image with undo option
   * @returns {Promise<Object>} Removal result
   */
  const removeCoverImage = useCallback(async () => {
    if (!projectId) {
      setError('Invalid project ID');
      return { success: false, error: 'Invalid project ID' };
    }

    setIsRemoving(true);
    setError(null);

    try {
      const result = await Database.removeProjectCoverImage(projectId);
      
      if (result.success) {
        // Store undo data
        setUndoData({
          previousCover: result.data.previousCover,
          projectId
        });
        setCanUndo(true);
        
        // Update store for instant UI refresh
        projectUpdated({
          _id: projectId,
          coverImage: null,
          coverImageHistory: result.data.coverImageHistory
        });
        
        // Show undo toast (plain text since this is a .js file, not .jsx)
        toast.info('Cover image removed. Use version history to restore.', { autoClose: 10000 });
        
        // Clear undo after 10 seconds
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
          setCanUndo(false);
          setUndoData(null);
        }, 10000);
        
        return { success: true, data: result.data };
      } else {
        throw new Error(result.message || 'Removal failed');
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to remove cover image';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsRemoving(false);
    }
  }, [projectId, projectUpdated]);

  /**
   * Restore cover image from version history
   * @param {number} versionIndex - Index in history (0 = most recent)
   * @returns {Promise<Object>} Restore result
   */
  const restoreFromHistory = useCallback(async (versionIndex) => {
    if (!projectId) {
      setError('Invalid project ID');
      return { success: false, error: 'Invalid project ID' };
    }

    setIsRestoring(true);
    setError(null);

    try {
      const result = await Database.restoreProjectCoverImage(projectId, versionIndex);
      
      if (result.success && result.data) {
        // Update store for instant UI refresh
        projectUpdated({
          _id: projectId,
          coverImage: result.data.coverImage,
          coverImageHistory: result.data.coverImageHistory
        });
        
        // Clear undo state
        setCanUndo(false);
        setUndoData(null);
        clearTimeout(undoTimeoutRef.current);
        
        toast.success('Cover image restored!');
        return { success: true, data: result.data };
      } else {
        throw new Error(result.message || 'Restore failed');
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to restore cover image';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsRestoring(false);
    }
  }, [projectId, projectUpdated]);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Actions
    uploadCoverImage,
    removeCoverImage,
    restoreFromHistory,
    clearError,
    
    // State
    isUploading,
    isRemoving,
    isRestoring,
    uploadProgress,
    error,
    canUndo,
    undoData,
    
    // Computed
    isLoading: isUploading || isRemoving || isRestoring
  };
};

export default useCoverImage;
