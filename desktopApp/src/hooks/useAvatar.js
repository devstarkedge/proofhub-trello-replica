import { useState, useCallback, useContext, useEffect } from 'react';
import AuthContext from '../context/AuthContext';
import avatarService from '../services/avatarService';
import { toast } from 'react-toastify';

/**
 * useAvatar Hook - Manages avatar state and operations
 * 
 * Features:
 * - Upload with progress tracking
 * - Remove avatar
 * - Auto-sync with AuthContext
 * - Socket event integration for real-time sync
 * - Retry on failure
 * - Loading states
 */
const useAvatar = () => {
  const { user, setUser } = useContext(AuthContext);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Listen for socket avatar updates from other sessions
  useEffect(() => {
    const handleAvatarUpdate = (event) => {
      const { userId, avatar, name } = event.detail;
      
      // Update local user if it's the current user
      if (user && userId === user._id) {
        setUser(prev => ({
          ...prev,
          avatar: avatar
        }));
      }
    };

    window.addEventListener('socket-avatar-updated', handleAvatarUpdate);
    return () => window.removeEventListener('socket-avatar-updated', handleAvatarUpdate);
  }, [user, setUser]);

  /**
   * Upload avatar from device file
   */
  const uploadFromDevice = useCallback(async (file) => {
    // Validate file
    const validation = avatarService.validateAvatarFile(file);
    if (!validation.valid) {
      setError(validation.error);
      toast.error(validation.error);
      return { success: false, error: validation.error };
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const result = await avatarService.uploadAvatar(file, (percent) => {
        setProgress(percent);
      });

      if (result.success) {
        // Update local user state
        setUser(prev => ({
          ...prev,
          avatar: result.data.avatar,
          avatarMetadata: result.data.avatarMetadata
        }));
        
        toast.success('Avatar updated successfully!');
        return { success: true, avatar: result.data.avatar };
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to upload avatar';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [setUser]);

  /**
   * Upload avatar from Google Drive
   */
  const uploadFromGoogleDrive = useCallback(async ({ files, accessToken }) => {
    if (!files || files.length === 0) {
      toast.warning('No file selected');
      return { success: false, error: 'No file selected' };
    }

    const file = files[0]; // Use first selected file
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (file.mimeType && !allowedTypes.includes(file.mimeType)) {
      const errorMsg = 'Invalid file type. Please select JPG, PNG, or WEBP.';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    setUploading(true);
    setError(null);

    try {
      const result = await avatarService.uploadAvatarFromGoogleDrive({
        fileId: file.id,
        accessToken,
        fileName: file.name,
        mimeType: file.mimeType
      });

      if (result.success) {
        // Update local user state
        setUser(prev => ({
          ...prev,
          avatar: result.data.avatar,
          avatarMetadata: result.data.avatarMetadata
        }));
        
        toast.success('Avatar updated successfully!');
        return { success: true, avatar: result.data.avatar };
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to upload from Google Drive';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setUploading(false);
    }
  }, [setUser]);

  /**
   * Remove current avatar
   */
  const remove = useCallback(async () => {
    setRemoving(true);
    setError(null);

    try {
      const result = await avatarService.removeAvatar();

      if (result.success) {
        // Update local user state
        setUser(prev => ({
          ...prev,
          avatar: '',
          avatarMetadata: undefined
        }));
        
        toast.success('Avatar removed successfully!');
        return { success: true };
      } else {
        throw new Error(result.message || 'Remove failed');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to remove avatar';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setRemoving(false);
    }
  }, [setUser]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Current avatar data
    avatar: user?.avatar || '',
    userName: user?.name || '',
    userRole: user?.role,
    isVerified: user?.isVerified,

    // Operations
    uploadFromDevice,
    uploadFromGoogleDrive,
    remove,
    clearError,

    // States
    uploading,
    removing,
    progress,
    error,
    isLoading: uploading || removing
  };
};

export default useAvatar;
