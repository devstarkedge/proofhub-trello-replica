import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
const configureCloudinary = () => {
  if (cloudinary.config().cloud_name) return;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Missing Cloudinary configuration in production!');
    }
    throw new Error('Cloudinary configuration missing. Please check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
};

// Initialize on first load
configureCloudinary();

// Allowed file types for announcements
const ANNOUNCEMENT_ALLOWED_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

const MAX_ANNOUNCEMENT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file for announcement upload
 * @param {Object} file - The file object with mimetype and size
 * @returns {Object} Validation result
 */
export const validateAnnouncementFile = (file) => {
  const allAllowedTypes = [...ANNOUNCEMENT_ALLOWED_TYPES.images, ...ANNOUNCEMENT_ALLOWED_TYPES.documents];
  
  if (!allAllowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.mimetype}. Allowed types: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX`
    };
  }
  
  if (file.size > MAX_ANNOUNCEMENT_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: 10MB`
    };
  }
  
  return { valid: true };
};

/**
 * Generate a hash for file content to prevent duplicates
 * @param {Buffer} buffer - File buffer
 * @returns {string} MD5 hash
 */
export const generateFileHash = (buffer) => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

/**
 * Upload announcement attachment to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer
 * @param {Object} options - Upload options
 * @param {string} options.announcementId - The announcement ID for folder organization
 * @param {string} options.originalName - Original file name
 * @param {string} options.mimetype - File MIME type
 * @param {string} options.uploadedBy - User ID who uploaded
 * @returns {Promise<Object>} Cloudinary upload response with metadata
 */
export const uploadAnnouncementAttachment = async (fileBuffer, options = {}) => {
  configureCloudinary();
  
  const { announcementId, originalName, mimetype, uploadedBy } = options;
  const isImage = ANNOUNCEMENT_ALLOWED_TYPES.images.includes(mimetype);
  const resourceType = isImage ? 'image' : 'raw';
  const fileHash = generateFileHash(fileBuffer);
  
  // Create folder structure: /announcements/{announcementId}/attachments/
  const folder = announcementId 
    ? `flowtask/announcements/${announcementId}/attachments`
    : 'flowtask/announcements/temp';

  const uploadOptions = {
    folder,
    resource_type: resourceType,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    tags: ['announcement', 'attachment'],
    context: {
      original_name: originalName,
      uploaded_by: uploadedBy,
      file_hash: fileHash
    }
  };

  // Add image-specific transformations
  if (isImage) {
    uploadOptions.eager = [
      { width: 150, height: 150, crop: 'thumb', gravity: 'auto', quality: 'auto:low', format: 'webp' },
      { width: 400, height: 400, crop: 'limit', quality: 'auto:good', format: 'webp' },
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto:best' }
    ];
    uploadOptions.eager_async = true;
    uploadOptions.transformation = [
      { quality: 'auto:good' },
      { fetch_format: 'auto' }
    ];
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          // Format the response with all needed metadata
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type,
            format: result.format,
            file_size: result.bytes,
            original_name: originalName,
            mimetype: mimetype,
            width: result.width || null,
            height: result.height || null,
            file_hash: fileHash,
            thumbnail_url: isImage ? getThumbnailUrl(result.public_id, 150, 150) : null,
            preview_url: isImage ? getOptimizedUrl(result.public_id, { width: 400, height: 400, crop: 'limit' }) : null,
            uploadedBy,
            uploadedAt: new Date()
          });
        }
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(fileBuffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload multiple announcement attachments in parallel
 * @param {Array} files - Array of file objects with buffer and metadata
 * @param {string} announcementId - The announcement ID
 * @param {string} uploadedBy - User ID
 * @returns {Promise<Object>} Results with successful and failed uploads
 */
export const uploadMultipleAnnouncementAttachments = async (files, announcementId, uploadedBy) => {
  const results = {
    successful: [],
    failed: []
  };

  const uploadPromises = files.map(async (file) => {
    try {
      // Validate file
      const validation = validateAnnouncementFile(file);
      if (!validation.valid) {
        return { 
          success: false, 
          originalName: file.originalname, 
          error: validation.error 
        };
      }

      const result = await uploadAnnouncementAttachment(file.buffer, {
        announcementId,
        originalName: file.originalname,
        mimetype: file.mimetype,
        uploadedBy
      });

      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        originalName: file.originalname, 
        error: error.message 
      };
    }
  });

  const uploadResults = await Promise.all(uploadPromises);

  uploadResults.forEach(result => {
    if (result.success) {
      results.successful.push(result.data);
    } else {
      results.failed.push({
        originalName: result.originalName,
        error: result.error
      });
    }
  });

  return results;
};

/**
 * Delete announcement attachment from Cloudinary
 * @param {string} publicId - The public ID of the file
 * @param {string} resourceType - 'image' or 'raw'
 * @returns {Promise<Object>} Deletion result
 */
export const deleteAnnouncementAttachment = async (publicId, resourceType = 'image') => {
  configureCloudinary();
  
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    });
    return { success: result.result === 'ok', result };
  } catch (error) {
    console.error('Error deleting announcement attachment:', error);
    throw error;
  }
};

/**
 * Delete multiple announcement attachments
 * @param {Array} attachments - Array of attachment objects with public_id and resource_type
 * @returns {Promise<Object>} Deletion results
 */
export const deleteMultipleAnnouncementAttachments = async (attachments) => {
  configureCloudinary();
  
  const results = {
    successful: [],
    failed: []
  };

  // Group by resource type
  const imageIds = attachments.filter(a => a.resource_type === 'image').map(a => a.public_id);
  const rawIds = attachments.filter(a => a.resource_type === 'raw').map(a => a.public_id);

  try {
    if (imageIds.length > 0) {
      const imageResult = await cloudinary.api.delete_resources(imageIds, {
        resource_type: 'image',
        invalidate: true
      });
      results.successful.push(...Object.keys(imageResult.deleted).filter(k => imageResult.deleted[k] === 'deleted'));
      results.failed.push(...Object.keys(imageResult.deleted).filter(k => imageResult.deleted[k] !== 'deleted'));
    }

    if (rawIds.length > 0) {
      const rawResult = await cloudinary.api.delete_resources(rawIds, {
        resource_type: 'raw',
        invalidate: true
      });
      results.successful.push(...Object.keys(rawResult.deleted).filter(k => rawResult.deleted[k] === 'deleted'));
      results.failed.push(...Object.keys(rawResult.deleted).filter(k => rawResult.deleted[k] !== 'deleted'));
    }
  } catch (error) {
    console.error('Error deleting multiple announcement attachments:', error);
    throw error;
  }

  return results;
};

/**
 * Move temp attachments to permanent folder after announcement creation
 * @param {Array} attachments - Array of attachment objects
 * @param {string} announcementId - The permanent announcement ID
 * @returns {Promise<Array>} Updated attachments with new public_ids
 */
export const moveAnnouncementAttachments = async (attachments, announcementId) => {
  configureCloudinary();
  
  const movedAttachments = [];
  
  for (const attachment of attachments) {
    if (attachment.public_id.includes('/temp/')) {
      try {
        // Rename/move the resource
        const newPublicId = attachment.public_id.replace('/temp/', `/${announcementId}/attachments/`);
        
        await cloudinary.uploader.rename(
          attachment.public_id,
          newPublicId,
          { resource_type: attachment.resource_type, invalidate: true }
        );
        
        movedAttachments.push({
          ...attachment,
          public_id: newPublicId,
          url: attachment.url.replace(attachment.public_id, newPublicId)
        });
      } catch (error) {
        console.error('Error moving attachment:', error);
        movedAttachments.push(attachment);
      }
    } else {
      movedAttachments.push(attachment);
    }
  }
  
  return movedAttachments;
};

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder to upload to
 * @param {string} options.resourceType - 'image', 'video', 'raw', or 'auto'
 * @param {string} options.publicId - Custom public ID (optional)
 * @param {Object} options.transformation - Image transformations (optional)
 * @returns {Promise<Object>} Cloudinary upload response
 */
export const uploadToCloudinary = (fileBuffer, options = {}) => {
  // Ensure Cloudinary is configured
  configureCloudinary();
  
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || 'flowtask/attachments',
      resource_type: options.resourceType || 'auto',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options
    };

    // Add transformations for images (thumbnails)
    if (options.resourceType === 'image' || !options.resourceType) {
      uploadOptions.eager = [
        { width: 200, height: 200, crop: 'thumb', gravity: 'auto', quality: 'auto:low' },
        { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
      ];
      uploadOptions.eager_async = true;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    // Convert buffer to readable stream and pipe to upload
    const readable = new Readable();
    readable._read = () => {};
    readable.push(fileBuffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload a file from a URL to Cloudinary
 * @param {string} url - The URL of the file
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Cloudinary upload response
 */
export const uploadFromUrl = async (url, options = {}) => {
  const uploadOptions = {
    folder: options.folder || 'flowtask/attachments',
    resource_type: options.resourceType || 'auto',
    use_filename: true,
    unique_filename: true,
    ...options
  };

  return await cloudinary.uploader.upload(url, uploadOptions);
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @returns {Promise<Object>} Cloudinary deletion response
 */
export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    });
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    throw error;
  }
};

/**
 * Delete multiple files from Cloudinary
 * @param {Array<string>} publicIds - Array of public IDs
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @returns {Promise<Object>} Cloudinary deletion response
 */
export const deleteMultipleFromCloudinary = async (publicIds, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
      invalidate: true
    });
    return result;
  } catch (error) {
    console.error('Cloudinary bulk deletion error:', error);
    throw error;
  }
};

/**
 * Get optimized URL for a file
 * @param {string} publicId - The public ID of the file
 * @param {Object} options - Transformation options
 * @returns {string} Optimized URL
 */
export const getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto',
    ...options
  };

  return cloudinary.url(publicId, defaultOptions);
};

/**
 * Get thumbnail URL for an image
 * @param {string} publicId - The public ID of the image
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {string} Thumbnail URL
 */
export const getThumbnailUrl = (publicId, width = 200, height = 200) => {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'thumb',
    gravity: 'auto',
    quality: 'auto:low',
    fetch_format: 'auto'
  });
};

/**
 * Get file type category from mimetype
 * @param {string} mimetype - File mimetype
 * @returns {string} File type category
 */
export const getFileTypeCategory = (mimetype) => {
  if (!mimetype) return 'other';
  
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('google-apps.document')) return 'document';
  if (mimetype.includes('google-apps.spreadsheet')) return 'spreadsheet';
  if (mimetype.includes('google-apps.presentation')) return 'presentation';
  if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'spreadsheet';
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'presentation';
  if (mimetype.startsWith('text/')) return 'text';
  
  return 'other';
};

/**
 * Get resource type for Cloudinary based on mimetype
 * @param {string} mimetype - File mimetype
 * @returns {string} Cloudinary resource type
 */
export const getCloudinaryResourceType = (mimetype) => {
  if (!mimetype) return 'raw';
  
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  
  return 'raw';
};

/**
 * Generate a signed URL for secure file access
 * @param {string} publicId - The public ID of the file
 * @param {Object} options - URL options
 * @returns {string} Signed URL
 */
export const getSignedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    sign_url: true,
    type: 'authenticated',
    ...options
  });
};

/**
 * Upload user avatar to Cloudinary with optimizations
 * @param {Buffer} fileBuffer - The image buffer
 * @param {Object} options - Upload options
 * @param {string} options.userId - User ID for folder organization
 * @param {string} options.originalName - Original file name
 * @returns {Promise<Object>} Upload result with URL and metadata
 */
export const uploadAvatarToCloudinary = async (fileBuffer, options = {}) => {
  configureCloudinary();
  
  const { userId, originalName } = options;
  
  // Create folder structure: /avatars/{userId}/
  const folder = `flowtask/avatars/${userId}`;
  
  const uploadOptions = {
    folder,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: true,
    // Avatar-specific transformations
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'face' },
      { quality: 'auto:good' },
      { fetch_format: 'webp' }
    ],
    // Generate eager transformations for different sizes
    eager: [
      // Thumbnail (for lists, mentions, etc.)
      { width: 128, height: 128, crop: 'fill', gravity: 'face', quality: 'auto:good', format: 'webp' },
      // Medium (for cards, comments)
      { width: 256, height: 256, crop: 'fill', gravity: 'face', quality: 'auto:good', format: 'webp' }
    ],
    eager_async: false, // Wait for eager transforms to complete
    tags: ['avatar', 'user-profile'],
    context: {
      original_name: originalName,
      user_id: userId,
      uploaded_at: new Date().toISOString()
    }
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          // Build response with all needed URLs
          const thumbnailUrl = result.eager && result.eager[0] 
            ? result.eager[0].secure_url 
            : getThumbnailUrl(result.public_id, 128, 128);
          
          const mediumUrl = result.eager && result.eager[1]
            ? result.eager[1].secure_url
            : getOptimizedUrl(result.public_id, { width: 256, height: 256, crop: 'fill' });

          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            thumbnail_url: thumbnailUrl,
            medium_url: mediumUrl
          });
        }
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(fileBuffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Get avatar URL with specific size transformation
 * @param {string} publicId - Avatar public ID
 * @param {number} size - Desired size (width/height)
 * @returns {string} Transformed avatar URL
 */
export const getAvatarUrl = (publicId, size = 256) => {
  if (!publicId) return null;
  
  return cloudinary.url(publicId, {
    width: size,
    height: size,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto:good',
    fetch_format: 'webp'
  });
};

// =============================================
// PROJECT COVER IMAGE FUNCTIONS
// =============================================

// Allowed cover image types
const COVER_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_COVER_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Magic bytes for file type validation
const FILE_SIGNATURES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/jpg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]] // RIFF header (WebP starts with RIFF)
};

/**
 * Validate file using magic bytes (file header validation)
 * @param {Buffer} buffer - File buffer
 * @param {string} declaredMimetype - Declared MIME type
 * @returns {Object} Validation result
 */
export const validateFileSignature = (buffer, declaredMimetype) => {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'Invalid file buffer' };
  }

  // SVG is XML text — no binary magic bytes, skip signature check
  if (declaredMimetype === 'image/svg+xml') {
    return { valid: true };
  }

  const signatures = FILE_SIGNATURES[declaredMimetype];
  if (!signatures) {
    return { valid: false, error: `Unsupported file type: ${declaredMimetype}` };
  }

  const headerBytes = buffer.slice(0, 12); // Get first 12 bytes for checking
  const isValid = signatures.some(sig => 
    sig.every((byte, index) => headerBytes[index] === byte)
  );

  if (!isValid) {
    return { valid: false, error: 'File content does not match declared type' };
  }

  return { valid: true };
};

/**
 * Validate cover image file
 * @param {Object} file - File object with mimetype, size, and buffer
 * @returns {Object} Validation result
 */
export const validateCoverImage = (file) => {
  // Check MIME type
  if (!COVER_ALLOWED_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.mimetype}. Allowed: JPG, PNG, WebP, GIF, SVG`
    };
  }

  // Check file size
  if (file.size > MAX_COVER_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 5MB`
    };
  }

  // Validate magic bytes if buffer is available
  if (file.buffer) {
    const signatureCheck = validateFileSignature(file.buffer, file.mimetype);
    if (!signatureCheck.valid) {
      return signatureCheck;
    }
  }

  return { valid: true };
};

/**
 * Upload project cover image to Cloudinary with optimizations
 * @param {Buffer} fileBuffer - The image buffer
 * @param {Object} options - Upload options
 * @param {string} options.projectId - Project ID for folder organization
 * @param {string} options.originalName - Original file name
 * @param {string} options.mimetype - File MIME type
 * @param {string} options.uploadedBy - User ID who uploaded
 * @returns {Promise<Object>} Upload result with URLs and metadata
 */
export const uploadProjectCover = async (fileBuffer, options = {}) => {
  configureCloudinary();
  
  const { projectId, originalName, mimetype, uploadedBy } = options;
  const fileHash = generateFileHash(fileBuffer);
  
  // Folder structure: /projects/{projectId}/covers/
  const folder = projectId 
    ? `flowtask/projects/${projectId}/covers`
    : 'flowtask/projects/temp/covers';

  const uploadOptions = {
    folder,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // Transformations for optimization
    transformation: [
      { width: 1200, height: 800, crop: 'limit' }, // Max size
      { quality: 'auto:good' },
      { fetch_format: 'auto' } // WebP/AVIF where supported
    ],
    // Generate eager transformations for different sizes
    eager: [
      // Tiny blur placeholder for progressive loading (20px wide, heavily compressed)
      { width: 20, height: 14, crop: 'fill', quality: 30, effect: 'blur:1000', format: 'webp' },
      // Thumbnail for version history
      { width: 100, height: 67, crop: 'fill', quality: 'auto:low', format: 'webp' },
      // Card size (desktop)
      { width: 400, height: 267, crop: 'fill', quality: 'auto:good', format: 'webp' },
      // Card size (tablet)
      { width: 300, height: 200, crop: 'fill', quality: 'auto:good', format: 'webp' },
      // Card size (mobile)
      { width: 200, height: 133, crop: 'fill', quality: 'auto:good', format: 'webp' }
    ],
    eager_async: true,
    colors: true, // Extract dominant colors
    tags: ['project-cover'],
    context: {
      original_name: originalName,
      uploaded_by: uploadedBy,
      file_hash: fileHash,
      project_id: projectId
    }
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          // Extract dominant color from Cloudinary's color analysis
          let dominantColor = '#6366f1'; // Default fallback
          if (result.colors && result.colors.length > 0) {
            dominantColor = result.colors[0][0]; // First color is usually dominant
          }

          // Build thumbnail URL for blur placeholder
          const thumbnailUrl = result.eager && result.eager[0] 
            ? result.eager[0].secure_url 
            : getThumbnailUrl(result.public_id, 20, 14);

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            thumbnailUrl,
            dominantColor,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            originalName,
            uploadedBy,
            uploadedAt: new Date()
          });
        }
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(fileBuffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Get cover image URL with responsive transformation
 * @param {string} publicId - Cover image public ID
 * @param {Object} options - Transformation options
 * @returns {string} Transformed URL
 */
export const getCoverImageUrl = (publicId, options = {}) => {
  if (!publicId) return null;
  
  const { width = 400, height = 267, quality = 'auto:good' } = options;
  
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    gravity: 'auto',
    quality,
    fetch_format: 'auto'
  });
};

/**
 * Delete project cover image from Cloudinary
 * @param {string} publicId - Cover image public ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteProjectCover = async (publicId) => {
  if (!publicId) return { success: true };
  
  configureCloudinary();
  
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true
    });
    return { success: result.result === 'ok', result };
  } catch (error) {
    console.error('Error deleting project cover:', error);
    throw error;
  }
};

export default cloudinary;
