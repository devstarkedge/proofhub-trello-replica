import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
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
