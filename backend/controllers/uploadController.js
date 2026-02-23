import asyncHandler from '../middleware/asyncHandler.js';
import upload, { getFileUrl } from '../middleware/upload.js';
import Card from '../models/Card.js';
import { emitToBoard } from '../realtime/index.js';

// POST /api/uploads/image
export const uploadImage = [
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const url = getFileUrl(file, req);

    // If cardId provided, attach to card attachments and optionally set as cover
    const cardId = req.query.cardId;
    const setCover = req.query.setCover === 'true';

    if (cardId) {
      const card = await Card.findById(cardId);
      if (card) {
        const attachment = {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url,
          uploadedBy: req.user ? req.user.id : null,
          isCover: !!setCover
        };

        card.attachments = card.attachments || [];
        card.attachments.push(attachment);

        if (setCover) {
          // unset previous cover
          card.attachments.forEach(a => { if (a.isCover && a._id.toString() !== attachment._id?.toString()) a.isCover = false; });
          card.coverImage = card.attachments[card.attachments.length - 1]._id;
        }

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

    res.status(201).json({ url, filename: file.filename });
  })
];
