class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key. Compound unique indexes in this codebase are
  // conventionally shaped {tenant/scope ObjectId(s)..., meaningful field},
  // e.g. { workspaceId, department, name } — reporting the first key
  // (almost always a scoping ObjectId) produces a confusing message like
  // "WorkspaceId already exists" for what's actually a duplicate name.
  // Prefer whichever key's value is a string (the real business
  // identifier — scope/FK fields are always ObjectIds), falling back to
  // the last key in the pattern.
  if (err.code === 11000) {
    const keys = Object.keys(err.keyPattern || {});
    const stringField = keys.find((key) => typeof err.keyValue?.[key] === 'string');
    const field = stringField || keys[keys.length - 1] || keys[0] || 'value';
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ErrorResponse(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ErrorResponse(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ErrorResponse(message, 401);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    // Optional machine-readable code (e.g. Attendance's OUTSIDE_GEOFENCE,
    // ALREADY_CHECKED_IN) — set via `err.code = '...'` at the throw site;
    // every existing caller that never sets it is unaffected.
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export { ErrorResponse, errorHandler };