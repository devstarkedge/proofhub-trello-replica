import express from 'express';
import { body } from 'express-validator';
import {
  getCategoriesByDepartment,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/department/:departmentId', cacheMiddleware('categories', 300), getCategoriesByDepartment);
router.get('/:id', cacheMiddleware('categories', 300), getCategory);

router.post('/', [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('department').isMongoId().withMessage('Valid department ID is required'),
  validate
], createCategory);

router.put('/:id', [
  body('name').optional().trim().notEmpty().withMessage('Category name cannot be empty'),
  validate
], updateCategory);

router.delete('/:id', deleteCategory);

export default router;
