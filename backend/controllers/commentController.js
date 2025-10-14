import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Notification from '../models/Notification.js';
import { emitNotification, emitToBoard } from '../server.js';

export const createComment = async (req, res) => {
  const { text, cardId } = req.body;
  try {
    const card = await Card.findById(cardId).populate('assignee', 'name');
    if (!card) return res.status(404).json({ msg: 'Card not found' });

    const comment = new Comment({
      text,
      user: req.user.id,
      card: cardId,
    });
    await comment.save();

    card.comments.push(comment._id);
    await card.save();

    const populatedComment = await Comment.findById(comment._id).populate('user', 'name avatar');

    // Emit real-time comment added to board
    if (card.board) {
      emitToBoard(card.board.toString(), 'comment-added', { 
        cardId, 
        comment: populatedComment 
      });
    }

    // Notify assignee if different from commenter
    if (card.assignee && card.assignee._id.toString() !== req.user.id) {
      const notification = new Notification({
        type: 'comment_added',
        message: `${req.user.name || 'Someone'} commented on "${card.title}"`,
        user: card.assignee._id,
        relatedCard: cardId,
      });
      await notification.save();

      // Emit real-time notification
      emitNotification(card.assignee._id.toString(), notification);
    }

    res.status(201).json(populatedComment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getCommentsByCard = async (req, res) => {
  const { cardId } = req.params;
  try {
    const comments = await Comment.find({ card: cardId }).populate('user', 'name avatar').sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const updateComment = async (req, res) => {
  const { text } = req.body;
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ msg: 'Comment not found' });
    if (comment.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    comment.text = text;
    await comment.save();
    res.json(comment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ msg: 'Comment not found' });
    if (comment.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    await Comment.findByIdAndDelete(req.params.id);
    await Card.findByIdAndUpdate(comment.card, { $pull: { comments: req.params.id } });
    res.json({ msg: 'Comment deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
