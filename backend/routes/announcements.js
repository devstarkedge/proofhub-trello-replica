import express from 'express';
import { body } from 'express-validator';
import {
  getAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  addComment,
  deleteComment,
  addReaction,
  removeReaction,
  togglePin,
  toggleArchive,
  extendExpiry,
  getAnnouncementStats
} from '../controllers/announcementController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Apply protection middleware to all routes
router.use(protect);

// Middleware to parse JSON strings from FormData
const parseFormDataJSON = (req, res, next) => {
  if (req.body) {
    // Parse nested objects that came as JSON strings from FormData
    if (req.body.subscribers && typeof req.body.subscribers === 'string') {
      try {
        req.body.subscribers = JSON.parse(req.body.subscribers);
      } catch (e) {
        // If parsing fails, leave as is
      }
    }
    if (req.body.lastFor && typeof req.body.lastFor === 'string') {
      try {
        req.body.lastFor = JSON.parse(req.body.lastFor);
        // Ensure value is a number
        if (req.body.lastFor.value) {
          req.body.lastFor.value = parseInt(req.body.lastFor.value);
        }
      } catch (e) {
        // If parsing fails, leave as is
      }
    }
    // Convert boolean strings
    if (req.body.allowComments && typeof req.body.allowComments === 'string') {
      req.body.allowComments = req.body.allowComments === 'true';
    }
    if (req.body.isPinned && typeof req.body.isPinned === 'string') {
      req.body.isPinned = req.body.isPinned === 'true';
    }
  }
  next();
};

// Statistics routes
router.get('/stats/overview', getAnnouncementStats);

// Get all announcements
router.get('/', getAnnouncements);

// Get single announcement
router.get('/:id', getAnnouncement);

// Create announcement
router.post(
  '/',
  upload.array('attachments', 5),
  parseFormDataJSON,
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('category').isIn(['HR', 'General', 'Urgent', 'System Update', 'Events', 'Custom']).withMessage('Invalid category'),
    body('lastFor').custom((value) => {
      if (!value || typeof value !== 'object') {
        throw new Error('lastFor must be an object with value and unit');
      }
      if (!value.value || value.value < 1) {
        throw new Error('Duration value must be a positive number');
      }
      if (!value.unit || !['hours', 'days', 'weeks', 'months'].includes(value.unit)) {
        throw new Error('Invalid duration unit');
      }
      return true;
    }),
    validate
  ],
  createAnnouncement
);

// Update announcement
router.put(
  '/:id',
  [
    body('title').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim(),
    body('category').optional().isIn(['HR', 'General', 'Urgent', 'System Update', 'Events', 'Custom']),
    validate
  ],
  updateAnnouncement
);

// Delete announcement
router.delete('/:id', deleteAnnouncement);

// Add comment to announcement
router.post(
  '/:id/comments',
  [
    body('text').trim().notEmpty().withMessage('Comment text is required'),
    validate
  ],
  addComment
);

// Delete comment from announcement
router.delete('/:id/comments/:commentId', deleteComment);

// Add emoji reaction
router.post(
  '/:id/reactions',
  [
    body('emoji').isIn(['👍', '❤️', '🎉', '🔥', '👀']).withMessage('Invalid emoji'),
    validate
  ],
  addReaction
);

// Remove emoji reaction
router.delete('/:id/reactions/:emoji', removeReaction);

// Toggle pin status
router.put(
  '/:id/pin',
  [
    body('pin').isBoolean().withMessage('Pin must be a boolean'),
    validate
  ],
  togglePin
);

// Toggle archive status
router.put(
  '/:id/archive',
  [
    body('archive').isBoolean().withMessage('Archive must be a boolean'),
    validate
  ],
  toggleArchive
);

// Extend expiry
router.put(
  '/:id/extend-expiry',
  [
    body('value').isInt({ min: 1 }).withMessage('Duration value must be positive'),
    body('unit').isIn(['hours', 'days', 'weeks', 'months']).withMessage('Invalid duration unit'),
    validate
  ],
  extendExpiry
);

export default router;
