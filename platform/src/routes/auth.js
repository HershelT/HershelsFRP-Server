/**
 * Authentication Routes
 * Handles user registration, login, and password reset
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Token = require('../models/Token');
const { generateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post('/register', validate('register'), asyncHandler(async (req, res) => {
    const { username, email, password, githubUsername } = req.body;

    // Check if username is available
    if (!User.isUsernameAvailable(username)) {
        throw new ApiError(400, 'Username already taken');
    }

    // Check if email is available
    if (!User.isEmailAvailable(email)) {
        throw new ApiError(400, 'Email already registered');
    }

    // Create user
    const user = await User.create({
        username,
        email,
        password,
        githubUsername: githubUsername || null
    });

    // Generate first auth token automatically
    const authToken = Token.generate(user.id, 'Default Token');

    // Generate JWT for session
    const jwt = generateToken(user);

    res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            githubUsername: user.githubUsername
        },
        token: jwt,
        // Show the FRP auth token only once!
        frpToken: {
            token: authToken.token,
            prefix: authToken.tokenPrefix,
            name: authToken.name,
            warning: 'Save this token! You won\'t be able to see it again.'
        }
    });
}));

/**
 * POST /api/auth/login
 * Login with email/username and password
 */
router.post('/login', validate('login'), asyncHandler(async (req, res) => {
    const { emailOrUsername, password } = req.body;

    // Find user by email or username
    let user = User.findByEmail(emailOrUsername);
    if (!user) {
        user = User.findByUsername(emailOrUsername);
    }

    if (!user) {
        throw new ApiError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
        throw new ApiError(401, 'Account is inactive');
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
        throw new ApiError(401, 'Invalid credentials');
    }

    // Update last login
    User.updateLastLogin(user.id);

    // Generate JWT
    const jwt = generateToken(user);

    res.json({
        success: true,
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            githubUsername: user.githubUsername,
            displayName: user.displayName,
            tunnelLimit: user.tunnelLimit
        },
        token: jwt
    });
}));

/**
 * GET /api/auth/check-username/:username
 * Check if username is available
 */
router.get('/check-username/:username', (req, res) => {
    const { username } = req.params;
    const isAvailable = User.isUsernameAvailable(username);

    res.json({
        success: true,
        available: isAvailable
    });
});

/**
 * GET /api/auth/check-email/:email
 * Check if email is available
 */
router.get('/check-email/:email', (req, res) => {
    const { email } = req.params;
    const isAvailable = User.isEmailAvailable(email);

    res.json({
        success: true,
        available: isAvailable
    });
});

/**
 * POST /api/auth/logout
 * Logout (client-side token deletion, but we can track sessions if needed)
 */
router.post('/logout', (req, res) => {
    // In a stateless JWT system, logout is typically handled client-side
    // by removing the token. We could implement session tracking if needed.

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;
