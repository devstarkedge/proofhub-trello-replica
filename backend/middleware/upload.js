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

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(cardImagesDir)) {
  fs.mkdirSync(cardImagesDir, { recursive: true });
}
if (!fs.existsSync(commentImagesDir)) {
  fs.mkdirSync(commentImagesDir, { recursive: true });
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

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type.'));
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: fileFilter
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