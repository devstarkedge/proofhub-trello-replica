import { validationResult, body, param } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  
  next();
};

// Board validation rules
export const boardValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Board name is required')
      .isLength({ min: 3, max: 100 }).withMessage('Board name must be between 3 and 100 characters'),
    body('department')
      .notEmpty().withMessage('Department is required')
      .isMongoId().withMessage('Invalid department ID'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
    body('members')
      .optional()
      .isArray().withMessage('Members must be an array'),
    body('startDate')
      .optional()
      .isISO8601().withMessage('Invalid start date format'),
    body('dueDate')
      .optional()
      .isISO8601().withMessage('Invalid due date format')
      .custom((dueDate, { req }) => {
        if (req.body.startDate && new Date(dueDate) <= new Date(req.body.startDate)) {
          throw new Error('Due date must be after start date');
        }
        return true;
      }),
    validate
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid board ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 }).withMessage('Board name must be between 3 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
    validate
  ]
};

// Card validation rules
export const cardValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty().withMessage('Card title is required')
      .isLength({ min: 1, max: 200 }).withMessage('Card title must be between 1 and 200 characters'),
    body('list')
      .notEmpty().withMessage('List ID is required')
      .isMongoId().withMessage('Invalid list ID'),
    body('board')
      .notEmpty().withMessage('Board ID is required')
      .isMongoId().withMessage('Invalid board ID'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority value'),
    body('dueDate')
      .optional()
      .isISO8601().withMessage('Invalid due date format'),
    validate
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid card ID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 }).withMessage('Card title must be between 1 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority value'),
    body('status')
      .optional()
      .isIn(['todo', 'in-progress', 'review', 'done']).withMessage('Invalid status value'),
    validate
  ]
};

// User validation rules
export const userValidation = {
  register: [
    body('name')
      .trim()
      .notEmpty().withMessage('Name is required')
      .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('department')
      .optional()
      .isMongoId().withMessage('Invalid department ID'),
    validate
  ],
  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password is required'),
    validate
  ],
  verify: [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('role')
      .notEmpty().withMessage('Role is required')
      .isIn(['admin', 'manager', 'hr', 'employee']).withMessage('Invalid role'),
    body('department')
      .optional()
      .custom((value) => {
        if (value === null || value === undefined || value === '') return true;
        if (!/^[a-f\d]{24}$/i.test(value)) {
          throw new Error('Invalid department ID');
        }
        return true;
      }),
    validate
  ]
};

// Department validation rules
export const departmentValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Department name is required')
      .isLength({ min: 2, max: 50 }).withMessage('Department name must be between 2 and 50 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
    body('manager')
      .optional()
      .isMongoId().withMessage('Invalid manager ID'),
    validate
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid department ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 }).withMessage('Department name must be between 2 and 50 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
    validate
  ]
};

// Comment validation rules
export const commentValidation = {
  create: [
    body('text')
      .trim()
      .notEmpty().withMessage('Comment text is required')
      .isLength({ min: 1, max: 2000 }).withMessage('Comment must be between 1 and 2000 characters'),
    body('card')
      .notEmpty().withMessage('Card ID is required')
      .isMongoId().withMessage('Invalid card ID'),
    validate
  ]
};

// Team validation rules
export const teamValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Team name is required')
      .isLength({ min: 2, max: 50 }).withMessage('Team name must be between 2 and 50 characters'),
    body('department')
      .notEmpty().withMessage('Department is required')
      .isMongoId().withMessage('Invalid department ID'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
    validate
  ]
};