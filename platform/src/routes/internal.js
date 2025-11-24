/**
 * Internal API Routes
 * Used by ask-server and FRP server to validate tokens and track tunnels
 * These endpoints should only be accessible from localhost
 */

const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Tunnel = require('../models/Tunnel');
const { validate } = require('../middleware/validation');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Middleware: Only allow localhost access
 */
function localhostOnly(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;

    // Check if request is from localhost
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
        return res.status(403).json({
            success: false,
            error: 'Access denied - Internal API'
        });
    }

    next();
}

// Apply localhost-only middleware to all routes
router.use(localhostOnly);

/**
 * POST /api/internal/validate-token
 * Validate an FRP auth token and check user limits
 */
router.post('/validate-token', asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.json({
            valid: false,
            error: 'Token is required'
        });
    }

    // Validate token
    const result = Token.validate(token);

    if (!result) {
        return res.json({
            valid: false,
            error: 'Invalid or inactive token'
        });
    }

    // Check user's active tunnel count
    const activeTunnels = Tunnel.countActiveByUser(result.userId);

    if (activeTunnels >= result.tunnelLimit) {
        return res.json({
            valid: false,
            error: `Tunnel limit reached (${result.tunnelLimit} max)`
        });
    }

    // Token is valid and user has capacity
    res.json({
        valid: true,
        user: {
            id: result.userId,
            username: result.username,
            email: result.email,
            tunnelLimit: result.tunnelLimit,
            activeTunnels
        },
        token: {
            id: result.tokenId,
            name: result.tokenName
        }
    });
}));

/**
 * POST /api/internal/tunnel-connect
 * Register a new tunnel connection
 */
router.post('/tunnel-connect', validate('tunnelConnect'), asyncHandler(async (req, res) => {
    const { subdomain, localPort, tunnelType, clientIp, clientVersion, token } = req.body;

    // Validate token first
    const tokenResult = Token.validate(token);

    if (!tokenResult) {
        throw new ApiError(401, 'Invalid token');
    }

    // Check if user has reached tunnel limit
    const activeTunnels = Tunnel.countActiveByUser(tokenResult.userId);
    if (activeTunnels >= tokenResult.tunnelLimit) {
        throw new ApiError(400, 'Tunnel limit reached');
    }

    // Validate subdomain matches username pattern
    if (!subdomain.startsWith(tokenResult.username + '-')) {
        throw new ApiError(400, 'Subdomain must start with your username');
    }

    // Register tunnel
    const tunnelId = Tunnel.connect({
        userId: tokenResult.userId,
        tokenId: tokenResult.tokenId,
        subdomain,
        localPort,
        tunnelType,
        clientIp,
        clientVersion
    });

    res.json({
        success: true,
        message: 'Tunnel registered',
        tunnel: {
            id: tunnelId,
            subdomain,
            url: `https://${subdomain}.tunnel.hershel.dev`
        }
    });
}));

/**
 * POST /api/internal/tunnel-disconnect
 * Mark a tunnel as disconnected
 */
router.post('/tunnel-disconnect', asyncHandler(async (req, res) => {
    const { subdomain } = req.body;

    if (!subdomain) {
        throw new ApiError(400, 'Subdomain is required');
    }

    Tunnel.disconnect(subdomain);

    res.json({
        success: true,
        message: 'Tunnel disconnected'
    });
}));

/**
 * POST /api/internal/log-request
 * Log a request to a tunnel (for analytics)
 */
router.post('/log-request', asyncHandler(async (req, res) => {
    const { subdomain, bytesTransferred = 0 } = req.body;

    if (!subdomain) {
        throw new ApiError(400, 'Subdomain is required');
    }

    Tunnel.logRequest(subdomain, bytesTransferred);

    res.json({
        success: true,
        message: 'Request logged'
    });
}));

/**
 * GET /api/internal/tunnel/:subdomain
 * Get tunnel info by subdomain (for ask-server)
 */
router.get('/tunnel/:subdomain', asyncHandler(async (req, res) => {
    const { subdomain } = req.params;

    const tunnel = Tunnel.findBySubdomain(subdomain);

    if (!tunnel) {
        return res.status(404).json({
            success: false,
            error: 'Tunnel not found'
        });
    }

    res.json({
        success: true,
        tunnel: {
            id: tunnel.id,
            subdomain: tunnel.subdomain,
            username: tunnel.username,
            status: tunnel.status
        }
    });
}));

module.exports = router;
