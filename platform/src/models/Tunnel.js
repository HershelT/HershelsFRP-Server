/**
 * Tunnel Model
 * Handles tunnel tracking and statistics
 */

const { query, queryOne, execute } = require('./database');

class Tunnel {
    /**
     * Register a new tunnel connection
     */
    static connect({ userId, tokenId, subdomain, localPort, tunnelType = 'http', clientIp, clientVersion }) {
        // Check if subdomain already exists (should be unique)
        const existing = queryOne(
            `SELECT id FROM tunnels WHERE subdomain = ?`,
            [subdomain]
        );

        if (existing) {
            // Update existing tunnel (reconnection)
            execute(`
                UPDATE tunnels
                SET status = 'active',
                    connected_at = CURRENT_TIMESTAMP,
                    disconnected_at = NULL,
                    client_ip = ?,
                    client_version = ?
                WHERE subdomain = ?
            `, [clientIp, clientVersion, subdomain]);

            return existing.id;
        }

        // Create new tunnel
        const result = execute(`
            INSERT INTO tunnels (user_id, token_id, subdomain, local_port, tunnel_type, client_ip, client_version)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, tokenId, subdomain, localPort, tunnelType, clientIp, clientVersion]);

        return result.lastInsertRowid;
    }

    /**
     * Mark tunnel as disconnected
     */
    static disconnect(subdomain) {
        execute(`
            UPDATE tunnels
            SET status = 'inactive',
                disconnected_at = CURRENT_TIMESTAMP
            WHERE subdomain = ?
        `, [subdomain]);
    }

    /**
     * Record a request to the tunnel
     */
    static logRequest(subdomain, bytesTransferred = 0) {
        execute(`
            UPDATE tunnels
            SET request_count = request_count + 1,
                bytes_transferred = bytes_transferred + ?,
                last_request_at = CURRENT_TIMESTAMP
            WHERE subdomain = ?
        `, [bytesTransferred, subdomain]);
    }

    /**
     * Get tunnel by subdomain
     */
    static findBySubdomain(subdomain) {
        return queryOne(`
            SELECT
                t.id,
                t.user_id as userId,
                t.token_id as tokenId,
                t.subdomain,
                t.local_port as localPort,
                t.tunnel_type as tunnelType,
                t.status,
                t.connected_at as connectedAt,
                t.disconnected_at as disconnectedAt,
                t.last_request_at as lastRequestAt,
                t.request_count as requestCount,
                t.bytes_transferred as bytesTransferred,
                t.client_ip as clientIp,
                t.client_version as clientVersion,
                u.username
            FROM tunnels t
            JOIN users u ON t.user_id = u.id
            WHERE t.subdomain = ?
        `, [subdomain]);
    }

    /**
     * List active tunnels for a user
     */
    static listActiveByUser(userId) {
        return query(`
            SELECT
                id,
                subdomain,
                local_port as localPort,
                tunnel_type as tunnelType,
                status,
                connected_at as connectedAt,
                last_request_at as lastRequestAt,
                request_count as requestCount,
                bytes_transferred as bytesTransferred,
                client_version as clientVersion
            FROM tunnels
            WHERE user_id = ? AND status = 'active'
            ORDER BY connected_at DESC
        `, [userId]);
    }

    /**
     * List all tunnels for a user (including inactive)
     */
    static listByUser(userId, { limit = 50, offset = 0 } = {}) {
        return query(`
            SELECT
                id,
                subdomain,
                local_port as localPort,
                tunnel_type as tunnelType,
                status,
                connected_at as connectedAt,
                disconnected_at as disconnectedAt,
                last_request_at as lastRequestAt,
                request_count as requestCount,
                bytes_transferred as bytesTransferred
            FROM tunnels
            WHERE user_id = ?
            ORDER BY connected_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
    }

    /**
     * Count active tunnels for a user
     */
    static countActiveByUser(userId) {
        const result = queryOne(
            `SELECT COUNT(*) as count FROM tunnels WHERE user_id = ? AND status = 'active'`,
            [userId]
        );
        return result.count;
    }

    /**
     * Get tunnel statistics for a user (last 24 hours)
     */
    static getStats24h(userId) {
        return queryOne(`
            SELECT
                COUNT(*) as totalTunnels,
                COALESCE(SUM(request_count), 0) as totalRequests,
                COALESCE(SUM(bytes_transferred), 0) as totalBytes
            FROM tunnels
            WHERE user_id = ?
            AND connected_at >= datetime('now', '-24 hours')
        `, [userId]);
    }

    /**
     * Get hourly request counts for a tunnel (last 7 days)
     */
    static getHourlyStats(tunnelId, days = 7) {
        return query(`
            SELECT
                bucket_time as time,
                request_count as requests,
                bytes_transferred as bytes,
                error_count as errors
            FROM usage_stats
            WHERE tunnel_id = ?
            AND bucket_time >= datetime('now', '-${days} days')
            ORDER BY bucket_time ASC
        `, [tunnelId]);
    }

    /**
     * Delete tunnel record
     */
    static delete(tunnelId) {
        execute(`DELETE FROM tunnels WHERE id = ?`, [tunnelId]);
    }

    /**
     * Clean up old inactive tunnels (older than 30 days)
     */
    static cleanupOld() {
        const result = execute(`
            DELETE FROM tunnels
            WHERE status = 'inactive'
            AND disconnected_at < datetime('now', '-30 days')
        `);
        return result.changes;
    }

    /**
     * List all active tunnels (admin view)
     */
    static listAllActive({ limit = 100, offset = 0 } = {}) {
        return query(`
            SELECT
                t.id,
                t.subdomain,
                t.local_port as localPort,
                t.tunnel_type as tunnelType,
                t.connected_at as connectedAt,
                t.request_count as requestCount,
                t.bytes_transferred as bytesTransferred,
                u.username
            FROM tunnels t
            JOIN users u ON t.user_id = u.id
            WHERE t.status = 'active'
            ORDER BY t.connected_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }

    /**
     * Get global statistics
     */
    static getGlobalStats() {
        return queryOne(`
            SELECT
                (SELECT COUNT(*) FROM tunnels WHERE status = 'active') as activeTunnels,
                (SELECT COUNT(DISTINCT user_id) FROM tunnels WHERE status = 'active') as activeUsers,
                (SELECT COALESCE(SUM(request_count), 0) FROM tunnels) as totalRequests,
                (SELECT COALESCE(SUM(bytes_transferred), 0) FROM tunnels) as totalBytes
        `);
    }
}

module.exports = Tunnel;
