import asyncHandler from '../middleware/asyncHandler.js';
import { uploadMiddleware } from './attachmentController.js';
import { authorizeProjectResource } from '../services/projectAuthorization.js';
import { attachmentPath } from '../services/attachmentDelivery.js';
import { uploadBudget, uploadRateLimit } from '../middleware/uploadBudget.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import Card from '../models/Card.js';
import Attachment from '../models/Attachment.js';
import { emitToBoard } from '../realtime/index.js';

// POST /api/uploads/image
// Cloudinary-backed enterprise upload (stateless, zero local disk writes)
export const uploadImage = [
  uploadRateLimit, uploadBudget, uploadMiddleware.single('image'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const cardId = req.query.cardId;
    await authorizeProjectResource(req, 'task', cardId, 'attachment.upload');
    const setCover = req.query.setCover === 'true';
    const uploadType = req.query.type || 'general';

    const folder = `flowtask/workspaces/${req.workspaceId || 'default'}/cards/${cardId || 'images'}`;

    // Upload directly from memory buffer to Cloudinary CDN
    const cloudinaryResult = await uploadToCloudinary(file.path || file.buffer, {
      folder,
      resourceType: 'image'
    });

    let secureUrl;

    // If cardId provided, track as an enterprise Attachment record
    if (cardId) {
      const card = await Card.findById(cardId);
      if (card) {
        const attachment = await Attachment.create({
          fileName: file.originalname,
          originalName: file.originalname,
          fileType: 'image',
          mimeType: file.mimetype,
          fileSize: file.size,
          url: cloudinaryResult.url,
          secureUrl: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          deliveryType: 'authenticated', resourceType: 'image', format: cloudinaryResult.format,
          card: card._id,
          board: card.board,
          uploadedBy: req.user ? req.user.id : null,
          contextType: uploadType === 'comment-image' ? 'comment' : 'description',
          contextRef: card._id,
          isCover: !!setCover,
          workspaceId: req.workspaceId
        });
        secureUrl = attachmentPath(attachment._id);

        if (setCover) {
          card.coverImage = attachment._id;
          await card.save();

          // Emit real-time card update for cover image change
          try {
            if (card.board) {
              emitToBoard(card.board.toString(), 'card-updated', {
                cardId: card._id,
                updates: { coverImage: card.coverImage },
                updatedBy: {
                  id: req.user?.id,
                  name: req.user?.name
                }
              });
            }
          } catch (err) {
            console.error('Error emitting card-updated after upload:', err);
          }
        }
      }
    }

    res.status(201).json({
      url: secureUrl,
      secureUrl,
      filename: file.originalname,
      publicId: cloudinaryResult.public_id
    });
  })
];

export default uploadImage;
