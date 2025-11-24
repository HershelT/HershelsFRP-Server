/**
 * User Management Routes
 * Handles profile, settings, and account management
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// All user routes require authentication
router.use(authenticate);

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', asyncHandler(async (req, res) => {
    const user = User.findById(req.user.id);
    const stats = User.getStats(req.user.id);

    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            githubUsername: user.githubUsername,
            displayName: user.displayName,
            bio: user.bio,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            tunnelLimit: user.tunnelLimit,
            emailNotifications: user.emailNotifications
        },
        stats
    });
}));

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put('/profile', validate('updateProfile'), asyncHandler(async (req, res) => {
    const { displayName, bio, githubUsername } = req.body;

    User.updateProfile(req.user.id, {
        displayName,
        bio,
        githubUsername
    });

    res.json({
        success: true,
        message: 'Profile updated successfully'
    });
}));

/**
 * PUT /api/user/password
 * Change password
 */
router.put('/password', validate('changePassword'), asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Get user with password hash
    const user = User.findById(req.user.id);

    // Verify current password
    const isValid = await User.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
        throw new ApiError(401, 'Current password is incorrect');
    }

    // Update password
    await User.updatePassword(req.user.id, newPassword);

    res.json({
        success: true,
        message: 'Password changed successfully'
    });
}));

/**
 * PUT /api/user/settings
 * Update user settings
 */
router.put('/settings', asyncHandler(async (req, res) => {
    const { emailNotifications } = req.body;

    User.updateSettings(req.user.id, {
        emailNotifications
    });

    res.json({
        success: true,
        message: 'Settings updated successfully'
    });
}));

/**
 * DELETE /api/user/account
 * Delete user account (requires password confirmation)
 */
router.delete('/account', asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
        throw new ApiError(400, 'Password confirmation required');
    }

    // Get user with password hash
    const user = User.findById(req.user.id);

    // Verify password
    const isValid = await User.verifyPassword(password, user.passwordHash);
    if (!isValid) {
        throw new ApiError(401, 'Password is incorrect');
    }

    // Delete account (cascades to tokens, tunnels, etc.)
    User.delete(req.user.id);

    res.json({
        success: true,
        message: 'Account deleted successfully'
    });
}));

module.exports = router;
