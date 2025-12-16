import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
const configureCloudinary = () => {
  if (cloudinary.config().cloud_name) return;

  const { CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Missing Cloudinary configuration in production!');
    }
    throw new Error('Cloudinary configuration missing. Please check CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_NAME,
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
  if (mimetype === 'application/pdf') return 'pdf';
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

export default cloudinary;
