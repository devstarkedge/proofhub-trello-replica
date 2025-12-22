import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { uploadAvatarToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';

// Allowed avatar file types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * @desc    Upload user avatar
 * @route   POST /api/users/avatar
 * @access  Private
 */
export const uploadAvatar = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  const file = req.file;

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return next(new ErrorResponse(
      `Invalid file type: ${file.mimetype}. Allowed types: JPG, PNG, WEBP`, 
      400
    ));
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return next(new ErrorResponse(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 5MB`, 
      400
    ));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  try {
    // Store old avatar public_id for cleanup (if exists)
    const oldAvatarPublicId = user.avatarPublicId || null;

    // Upload to Cloudinary with avatar-specific optimizations
    const result = await uploadAvatarToCloudinary(file.buffer, {
      userId: req.user.id,
      originalName: file.originalname
    });

    // Update user with new avatar
    user.avatar = result.url;
    user.avatarPublicId = result.public_id;
    user.avatarMetadata = {
      originalName: file.originalname,
      uploadedAt: new Date(),
      source: 'device',
      format: result.format,
      width: result.width,
      height: result.height
    };

    await user.save();

    // Invalidate cached user data so fresh data is returned on next request
    try {
      const { invalidateCache } = await import('../middleware/cache.js');
      invalidateCache('/api/auth/me');
      invalidateCache('/api/auth/verify');
      invalidateCache('/api/users/profile');
    } catch (cacheErr) {
      console.error('Cache invalidation error:', cacheErr);
    }

    // Delete old avatar from Cloudinary (non-blocking)
    if (oldAvatarPublicId) {
      deleteFromCloudinary(oldAvatarPublicId, 'image').catch(err => {
        console.error('Failed to delete old avatar:', err);
      });
    }

    // Emit socket event for real-time sync
    try {
      const { emitToAll } = await import('../server.js');
      emitToAll('avatar-updated', {
        userId: user._id,
        avatar: user.avatar,
        name: user.name
      });
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr);
    }

    res.status(200).json({
      success: true,
      data: {
        avatar: user.avatar,
        avatarMetadata: user.avatarMetadata
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return next(new ErrorResponse('Failed to upload avatar', 500));
  }
});

/**
 * @desc    Upload avatar from Google Drive
 * @route   POST /api/users/avatar/google-drive
 * @access  Private
 */
export const uploadAvatarFromGoogleDrive = asyncHandler(async (req, res, next) => {
  const { fileId, accessToken, fileName, mimeType } = req.body;

  if (!fileId || !accessToken) {
    return next(new ErrorResponse('File ID and access token required', 400));
  }

  // Validate mime type
  if (mimeType && !ALLOWED_TYPES.includes(mimeType)) {
    return next(new ErrorResponse(
      `Invalid file type: ${mimeType}. Allowed types: JPG, PNG, WEBP`, 
      400
    ));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  try {
    // Fetch file from Google Drive
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      return next(new ErrorResponse('Failed to fetch file from Google Drive', 400));
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      return next(new ErrorResponse(
        `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum: 5MB`, 
        400
      ));
    }

    // Store old avatar for cleanup
    const oldAvatarPublicId = user.avatarPublicId || null;

    // Upload to Cloudinary
    const result = await uploadAvatarToCloudinary(buffer, {
      userId: req.user.id,
      originalName: fileName || 'google-drive-avatar'
    });

    // Update user
    user.avatar = result.url;
    user.avatarPublicId = result.public_id;
    user.avatarMetadata = {
      originalName: fileName,
      uploadedAt: new Date(),
      source: 'google_drive',
      googleDriveFileId: fileId,
      format: result.format,
      width: result.width,
      height: result.height
    };

    await user.save();

    // Invalidate cached user data
    try {
      const { invalidateCache } = await import('../middleware/cache.js');
      invalidateCache('/api/auth/me');
      invalidateCache('/api/auth/verify');
      invalidateCache('/api/users/profile');
    } catch (cacheErr) {
      console.error('Cache invalidation error:', cacheErr);
    }

    // Delete old avatar
    if (oldAvatarPublicId) {
      deleteFromCloudinary(oldAvatarPublicId, 'image').catch(err => {
        console.error('Failed to delete old avatar:', err);
      });
    }

    // Emit socket event
    try {
      const { emitToAll } = await import('../server.js');
      emitToAll('avatar-updated', {
        userId: user._id,
        avatar: user.avatar,
        name: user.name
      });
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr);
    }

    res.status(200).json({
      success: true,
      data: {
        avatar: user.avatar,
        avatarMetadata: user.avatarMetadata
      }
    });
  } catch (error) {
    console.error('Google Drive avatar upload error:', error);
    return next(new ErrorResponse('Failed to upload avatar from Google Drive', 500));
  }
});

/**
 * @desc    Remove user avatar
 * @route   DELETE /api/users/avatar
 * @access  Private
 */
export const removeAvatar = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const avatarPublicId = user.avatarPublicId;

  // Clear avatar from user
  user.avatar = '';
  user.avatarPublicId = undefined;
  user.avatarMetadata = undefined;

  await user.save();

  // Invalidate cached user data
  try {
    const { invalidateCache } = await import('../middleware/cache.js');
    invalidateCache('/api/auth/me');
    invalidateCache('/api/auth/verify');
    invalidateCache('/api/users/profile');
  } catch (cacheErr) {
    console.error('Cache invalidation error:', cacheErr);
  }

  // Delete from Cloudinary (optional cleanup)
  if (avatarPublicId) {
    deleteFromCloudinary(avatarPublicId, 'image').catch(err => {
      console.error('Failed to delete avatar from Cloudinary:', err);
    });
  }

  // Emit socket event
  try {
    const { emitToAll } = await import('../server.js');
    emitToAll('avatar-updated', {
      userId: user._id,
      avatar: '',
      name: user.name
    });
  } catch (socketErr) {
    console.error('Socket emit error:', socketErr);
  }

  res.status(200).json({
    success: true,
    message: 'Avatar removed successfully'
  });
});
