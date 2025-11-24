/**
 * Token Management Routes
 * Handles FRP auth token generation, listing, and revocation
 */

const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// All token routes require authentication
router.use(authenticate);

/**
 * GET /api/tokens
 * List all tokens for the authenticated user
 */
router.get('/', asyncHandler(async (req, res) => {
    const tokens = Token.listByUser(req.user.id);

    res.json({
        success: true,
        tokens
    });
}));

/**
 * POST /api/tokens
 * Generate a new FRP auth token
 */
router.post('/', validate('createToken'), asyncHandler(async (req, res) => {
    const { name } = req.body;

    // Check token limit (max 5 active tokens per user)
    const activeCount = Token.countActiveForUser(req.user.id);
    if (activeCount >= 5) {
        throw new ApiError(400, 'Maximum of 5 active tokens allowed. Please revoke an existing token first.');
    }

    // Generate token
    const token = Token.generate(req.user.id, name || null);

    res.status(201).json({
        success: true,
        message: 'Token generated successfully',
        token: {
            id: token.id,
            token: token.token, // Full token shown only once!
            tokenPrefix: token.tokenPrefix,
            name: token.name,
            createdAt: token.createdAt
        },
        warning: 'Save this token! You won\'t be able to see it again.'
    });
}));

/**
 * PUT /api/tokens/:id
 * Update token name
 */
router.put('/:id', validate('updateToken'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    // Verify token belongs to user
    const token = Token.findById(id);
    if (!token || token.userId !== req.user.id) {
        throw new ApiError(404, 'Token not found');
    }

    // Update name
    Token.updateName(id, name);

    res.json({
        success: true,
        message: 'Token updated successfully'
    });
}));

/**
 * DELETE /api/tokens/:id
 * Revoke a token
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify token belongs to user
    const token = Token.findById(id);
    if (!token || token.userId !== req.user.id) {
        throw new ApiError(404, 'Token not found');
    }

    // Revoke token (soft delete)
    Token.revoke(id);

    res.json({
        success: true,
        message: 'Token revoked successfully'
    });
}));

/**
 * POST /api/tokens/revoke-all
 * Revoke all tokens for the user
 */
router.post('/revoke-all', asyncHandler(async (req, res) => {
    Token.revokeAllForUser(req.user.id);

    res.json({
        success: true,
        message: 'All tokens revoked successfully'
    });
}));

module.exports = router;
