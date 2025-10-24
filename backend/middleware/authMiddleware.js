import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database with populated fields
      req.user = await User.findById(decoded.id)
        .select('-password')
        .populate('department', 'name')
        .populate('team', 'name');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      // Check if user needs to be verified (except admin)
      if (!req.user.isVerified && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Account not verified. Please contact an administrator.',
          verified: false
        });
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Role-based authorization middleware with detailed logging
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    // Normalize roles to lowercase for comparison
    const normalizedUserRole = req.user.role.toLowerCase();
    const normalizedRoles = roles.map(role => role.toLowerCase());

    if (!normalizedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This resource requires ${roles.join(' or ')} role.`,
        currentRole: req.user.role
      });
    }

    next();
  };
};

// Check if user is verified
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Please verify your account to access this resource'
    });
  }
  next();
};

// Check if user has access to specific board
export const checkBoardAccess = async (req, res, next) => {
  try {
    const boardId = req.params.id || req.params.boardId || req.body.board;
    
    if (!boardId) {
      return next();
    }

    const Board = (await import('../models/Board.js')).default;
    const board = await Board.findById(boardId);

    if (!board) {
      return res.status(404).json({
        success: false,
        message: 'Board not found'
      });
    }

    // Admin has access to everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user is owner, member, or board is public
    const hasAccess = 
      board.owner.toString() === req.user.id ||
      board.members.some(m => m.toString() === req.user.id) ||
      board.visibility === 'public' ||
      (req.user.department && board.department && 
       req.user.department._id.toString() === board.department.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this board'
      });
    }

    next();
  } catch (error) {
    console.error('Board access check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking board access'
    });
  }
};