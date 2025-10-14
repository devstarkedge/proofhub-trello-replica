import express from 'express';
import List from '../models/List.js';
import Card from '../models/Card.js';

const router = express.Router();

// Get lists for a board
router.get('/board/:boardId', async (req, res) => {
  try {
    const lists = await List.find({ boardId: req.params.boardId }).sort({ position: 1 });
    res.json(lists);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new list
router.post('/', async (req, res) => {
  const list = new List({
    boardId: req.body.boardId,
    title: req.body.title,
    position: req.body.position || 0,
    color: req.body.color
  });

  try {
    const newList = await list.save();
    res.status(201).json(newList);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a list
router.patch('/:id', async (req, res) => {
  try {
    const list = await List.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!list) return res.status(404).json({ message: 'List not found' });
    res.json(list);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a list
router.delete('/:id', async (req, res) => {
  try {
    const list = await List.findById(req.params.id);
    if (!list) return res.status(404).json({ message: 'List not found' });

    // Delete associated cards
    await Card.deleteMany({ listId: req.params.id });

    await List.findByIdAndDelete(req.params.id);
    res.json({ message: 'List deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/move', async (req, res) => {
  try {
    const { newPosition } = req.body;
    const list = await List.findById(req.params.id);
    if (!list) return res.status(404).json({ message: 'List not found' });

    const oldPosition = list.position;
    list.position = newPosition;
    await list.save();

    // Update positions
    if (oldPosition < newPosition) {
      await List.updateMany(
        { boardId: list.boardId, position: { $gt: oldPosition, $lte: newPosition } },
        { $inc: { position: -1 } }
      );
    } else if (oldPosition > newPosition) {
      await List.updateMany(
        { boardId: list.boardId, position: { $gte: newPosition, $lt: oldPosition } },
        { $inc: { position: 1 } }
      );
    }
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;