import express from 'express';
import Card from '../models/Card.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { managerOrAdmin } from '../middleware/rbacMiddleware.js';
import multer from 'multer';
import path from 'path';
import { emitToBoard } from '../server.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get cards for a list
router.get('/list/:listId', authMiddleware, async (req, res) => {
  try {
    const cards = await Card.find({ listId: req.params.listId }).sort({ position: 1 }).populate('assignee', 'name avatar');
    res.json(cards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new card
router.post('/', authMiddleware, async (req, res) => {
  const card = new Card({
    listId: req.body.listId,
    title: req.body.title,
    description: req.body.description || '',
    position: req.body.position || 0,
    labels: req.body.labels || [],
    members: req.body.members || [],
    priority: req.body.priority || 'Medium',
    subtasks: req.body.subtasks || [],
    attachments: req.body.attachments || [],
    dueDate: req.body.dueDate,
    assignee: req.body.assignee,
    status: req.body.status || 'To-Do',
    reminders: req.body.reminders || [],
  });

  try {
    const newCard = await card.save();
    res.status(201).json(newCard);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a card
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const card = await Card.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('assignee', 'name avatar');
    if (!card) return res.status(404).json({ message: 'Card not found' });

    // Emit real-time update to board
    if (card.board) {
      emitToBoard(card.board.toString(), 'card-updated', { cardId: card._id, updates: req.body });
    }

    res.json(card);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a card
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const card = await Card.findByIdAndDelete(req.params.id);
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json({ message: 'Card deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Move a card
router.patch('/:id/move', authMiddleware, async (req, res) => {
  try {
    const { newListId, newPosition } = req.body;
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const oldListId = card.listId;

    // Update positions in old list
    await Card.updateMany(
      { listId: oldListId, position: { $gt: card.position } },
      { $inc: { position: -1 } }
    );

    // Update positions in new list
    await Card.updateMany(
      { listId: newListId, position: { $gte: newPosition } },
      { $inc: { position: 1 } }
    );

    // Move the card
    card.listId = newListId;
    card.position = newPosition;
    await card.save();

    res.json(card);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload attachment
router.post('/:id/attachment', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const attachment = {
      filename: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      uploadedBy: req.user.id,
    };
    card.attachments.push(attachment);
    await card.save();
    res.json(card);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;