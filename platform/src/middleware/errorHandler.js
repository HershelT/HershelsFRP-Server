/**
 * Error Handling Middleware
 * Centralized error handling for the API
 */

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
    constructor(statusCode, message, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true; // Distinguishes from programming errors
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    let { statusCode, message, errors } = err;

    // Default to 500 if no status code
    statusCode = statusCode || 500;

    // Log error for debugging
    if (statusCode === 500) {
        console.error('💥 Server Error:', err);
    } else {
        console.log(`⚠️  API Error (${statusCode}):`, message);
    }

    // Send error response
    res.status(statusCode).json({
        success: false,
        error: message || 'Internal server error',
        ...(errors && { errors }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

/**
 * 404 handler for undefined routes
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`
    });
}

/**
 * Async handler wrapper (catches async errors)
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    ApiError,
    errorHandler,
    notFoundHandler,
    asyncHandler
};
