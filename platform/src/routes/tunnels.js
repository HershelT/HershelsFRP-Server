/**
 * Tunnel Management Routes
 * View and manage active tunnels
 */

const express = require('express');
const router = express.Router();
const Tunnel = require('../models/Tunnel');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// All tunnel routes require authentication
router.use(authenticate);

/**
 * GET /api/tunnels
 * List all tunnels for the authenticated user
 */
router.get('/', asyncHandler(async (req, res) => {
    const { active } = req.query;

    let tunnels;
    if (active === 'true') {
        tunnels = Tunnel.listActiveByUser(req.user.id);
    } else {
        tunnels = Tunnel.listByUser(req.user.id, {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0
        });
    }

    res.json({
        success: true,
        tunnels
    });
}));

/**
 * GET /api/tunnels/stats
 * Get usage statistics for user's tunnels
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats24h = Tunnel.getStats24h(req.user.id);
    const activeTunnels = Tunnel.countActiveByUser(req.user.id);

    res.json({
        success: true,
        stats: {
            activeTunnels,
            last24Hours: stats24h
        }
    });
}));

/**
 * GET /api/tunnels/:id
 * Get details for a specific tunnel
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const tunnel = Tunnel.findById(id);
    if (!tunnel || tunnel.userId !== req.user.id) {
        throw new ApiError(404, 'Tunnel not found');
    }

    // Get hourly stats if requested
    const includeStats = req.query.stats === 'true';
    let hourlyStats = null;

    if (includeStats) {
        hourlyStats = Tunnel.getHourlyStats(id, 7); // Last 7 days
    }

    res.json({
        success: true,
        tunnel,
        ...(hourlyStats && { stats: hourlyStats })
    });
}));

/**
 * DELETE /api/tunnels/:id
 * Disconnect and delete a tunnel
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const tunnel = Tunnel.findById(id);
    if (!tunnel || tunnel.userId !== req.user.id) {
        throw new ApiError(404, 'Tunnel not found');
    }

    // Disconnect and delete
    Tunnel.disconnect(tunnel.subdomain);
    Tunnel.delete(id);

    res.json({
        success: true,
        message: 'Tunnel deleted successfully'
    });
}));

module.exports = router;
