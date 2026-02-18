import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
const cardImagesDir = path.join(uploadsDir, 'card-images');
const commentImagesDir = path.join(uploadsDir, 'comment-images');
const announcementImagesDir = path.join(uploadsDir, 'announcement-images');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(cardImagesDir)) {
  fs.mkdirSync(cardImagesDir, { recursive: true });
}
if (!fs.existsSync(commentImagesDir)) {
  fs.mkdirSync(commentImagesDir, { recursive: true });
}
if (!fs.existsSync(announcementImagesDir)) {
  fs.mkdirSync(announcementImagesDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadType = req.query.type || 'general';
    let uploadPath = uploadsDir;

    switch (uploadType) {
      case 'card-image':
        uploadPath = cardImagesDir;
        break;
      case 'comment-image':
        uploadPath = commentImagesDir;
        break;
      case 'announcement':
        uploadPath = announcementImagesDir;
        break;
    }

    // For announcements, default to announcement-images folder
    if (file.fieldname === 'attachments') {
      uploadPath = announcementImagesDir;
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|gif|webp/;
  const documentTypes = /pdf|doc|docx|xls|xlsx|txt|zip/;

  const uploadType = req.query.type || 'general';
  let allowedTypes = documentTypes;

  if (uploadType === 'card-image' || uploadType === 'comment-image') {
    allowedTypes = imageTypes;
  }

  // For announcements, allow both images and documents
  if (file.fieldname === 'attachments' || uploadType === 'announcement') {
    allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip/;
  }

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type.'));
  }
};

// Create multer instance with disk storage (for local files)
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: fileFilter
});

// Memory storage for Cloudinary uploads
const memoryStorage = multer.memoryStorage();

// Cloudinary upload filter - supports images and documents
const cloudinaryFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPG, JPEG, PNG, GIF, WEBP, PDF, DOC, DOCX'));
  }
};

// Create multer instance with memory storage for Cloudinary uploads
export const uploadToCloudinaryMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB for Cloudinary uploads
  },
  fileFilter: cloudinaryFileFilter
});

// Cover image specific upload - images only, 5MB limit
const coverImageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images allowed: JPG, JPEG, PNG, GIF, WEBP, SVG'));
  }
};

export const uploadCoverImageMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB for cover images
  },
  fileFilter: coverImageFilter
});

export function getFileUrl(file, req) {
  if (!file) return null;
  const uploadType = req.query.type || 'general';
  let basePath = '/uploads';

  switch (uploadType) {
    case 'card-image':
      basePath = '/uploads/card-images';
      break;
    case 'comment-image':
      basePath = '/uploads/comment-images';
      break;
  }

  // Return full URL including protocol and host
  const fullUrl = `${req.protocol}://${req.get('host')}${basePath}/${file.filename}`;
  return fullUrl;
}

export default upload;