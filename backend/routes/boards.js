import express from 'express';
import Board from '../models/Board.js';
import List from '../models/List.js';
import Card from '../models/Card.js';

const router = express.Router();

// Get all boards
router.get('/', async (req, res) => {
  try {
    const boards = await Board.find();
    res.json(boards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new board
router.post('/', async (req, res) => {
  const board = new Board({
    name: req.body.name
  });

  try {
    const newBoard = await board.save();
    res.status(201).json(newBoard);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get a specific board
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ message: 'Board not found' });
    res.json(board);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a board
router.patch('/:id', async (req, res) => {
  try {
    const board = await Board.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!board) return res.status(404).json({ message: 'Board not found' });
    res.json(board);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a board
router.delete('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ message: 'Board not found' });

    // Delete associated lists and cards
    await List.deleteMany({ boardId: req.params.id });
    await Card.deleteMany({ listId: { $in: await List.find({ boardId: req.params.id }).distinct('_id') } });

    await Board.findByIdAndDelete(req.params.id);
    res.json({ message: 'Board deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;