/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT secret (should be in environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE-ME-IN-PRODUCTION-USE-LONG-RANDOM-STRING';
const JWT_EXPIRES_IN = '7d'; // 7 days

/**
 * Generate JWT for user
 */
function generateToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            email: user.email
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Middleware: Verify JWT and attach user to request
 */
function authenticate(req, res, next) {
    // Get token from Authorization header or cookie
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.cookies?.token;

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database
        const user = User.findById(decoded.userId);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or inactive user'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
}

/**
 * Optional authentication (doesn't fail if no token)
 */
function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.cookies?.token;

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = User.findById(decoded.userId);

        if (user && user.isActive) {
            req.user = user;
        } else {
            req.user = null;
        }
    } catch (error) {
        req.user = null;
    }

    next();
}

module.exports = {
    authenticate,
    optionalAuthenticate,
    generateToken,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
