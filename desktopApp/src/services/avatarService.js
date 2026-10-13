import api from './api';

/**
 * Avatar Service - API interactions for avatar management
 */

/**
 * Upload avatar from device
 * @param {File} file - The image file to upload
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} Upload result with avatar URL
 */
export const uploadAvatar = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('avatar', file);

  const config = {
    headers: { 'Content-Type': 'multipart/form-data' }
  };

  // Add progress tracking if callback provided
  if (onProgress) {
    config.onUploadProgress = (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress(percentCompleted);
    };
  }

  const response = await api.post('/api/users/avatar', formData, config);
  return response.data;
};

/**
 * Upload avatar from Google Drive
 * @param {Object} params - Google Drive file params
 * @param {string} params.fileId - Google Drive file ID
 * @param {string} params.accessToken - Google OAuth access token
 * @param {string} params.fileName - Original file name
 * @param {string} params.mimeType - File MIME type
 * @returns {Promise<Object>} Upload result with avatar URL
 */
export const uploadAvatarFromGoogleDrive = async ({ fileId, accessToken, fileName, mimeType }) => {
  const response = await api.post('/api/users/avatar/google-drive', {
    fileId,
    accessToken,
    fileName,
    mimeType
  });
  return response.data;
};

/**
 * Remove avatar
 * @returns {Promise<Object>} Success response
 */
export const removeAvatar = async () => {
  const response = await api.delete('/api/users/avatar');
  return response.data;
};

/**
 * Validate file before upload
 * @param {File} file - File to validate
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
export const validateAvatarFile = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: JPG, PNG, WEBP`
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: 5MB`
    };
  }

  return { valid: true };
};

export default {
  uploadAvatar,
  uploadAvatarFromGoogleDrive,
  removeAvatar,
  validateAvatarFile
};
