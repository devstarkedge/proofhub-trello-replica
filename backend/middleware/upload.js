import multer from 'multer';
import path from 'path';

/**
 * Enterprise In-Memory Upload Middleware
 * Eliminates ephemeral local disk storage (/uploads) entirely.
 * All uploads stream into memory buffers and persist directly to Cloudinary CDN.
 */

// Memory storage for stateless cloud operation
const memoryStorage = multer.memoryStorage();

// Cloudinary upload filter - supports images and documents
const cloudinaryFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip|csv/;
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ];

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPG, PNG, GIF, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV, ZIP, TXT'));
  }
};

// General upload middleware (in-memory)
export const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: cloudinaryFileFilter
});

// Dedicated Cloudinary upload middleware
export const uploadToCloudinaryMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: cloudinaryFileFilter
});

// Cover image specific upload - images only, 5MB limit
const coverImageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images allowed: JPG, JPEG, PNG, GIF, WEBP'));
  }
};

export const uploadCoverImageMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB for cover images
  },
  fileFilter: coverImageFilter
});

export function getFileUrl(file) {
  // Legacy compatibility: In cloud mode, URLs are provided directly by Cloudinary result
  return file?.secure_url || file?.url || null;
}

export default upload;
