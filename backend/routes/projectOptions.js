import express from 'express';
import {
  getProjectDropdownOptions,
  addProjectDropdownOption,
  deleteProjectDropdownOption
} from '../controllers/projectOptionsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/:type', getProjectDropdownOptions);
router.post('/:type', addProjectDropdownOption);
router.delete('/:type/:id', deleteProjectDropdownOption);

export default router;
