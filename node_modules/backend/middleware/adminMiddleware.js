import asyncHandler from './asyncHandler.js';

const adminMiddleware = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized. Admin access required.');
  }
});

export default adminMiddleware;
