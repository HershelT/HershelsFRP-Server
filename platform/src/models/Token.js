/**
 * Token Model
 * Handles FRP auth tokens for users
 */

const crypto = require('crypto');
const { query, queryOne, execute } = require('./database');

class Token {
    /**
     * Generate a new token for a user
     */
    static generate(userId, name = null) {
        // Generate random token: 32 bytes = 44 chars base64
        const tokenValue = crypto.randomBytes(32).toString('base64url');

        // Add prefix for easy identification
        const fullToken = `frps_${tokenValue}`;

        // Hash the token for storage (SHA256)
        const tokenHash = crypto.createHash('sha256').update(fullToken).digest('hex');

        // Store only first 8 chars as prefix for display
        const tokenPrefix = `frps_${tokenValue.substring(0, 8)}`;

        // Insert into database
        const result = execute(
            `INSERT INTO tokens (user_id, token_hash, token_prefix, name)
             VALUES (?, ?, ?, ?)`,
            [userId, tokenHash, tokenPrefix, name]
        );

        return {
            id: result.lastInsertRowid,
            token: fullToken, // Only returned once!
            tokenPrefix,
            name,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Validate a token and return associated user
     */
    static validate(tokenValue) {
        // Hash the provided token
        const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');

        // Find token and associated user
        const result = queryOne(`
            SELECT
                t.id as tokenId,
                t.user_id as userId,
                t.name as tokenName,
                t.last_used as lastUsed,
                t.expires_at as expiresAt,
                t.is_active as isActive,
                u.username,
                u.email,
                u.is_active as userIsActive,
                u.tunnel_limit as tunnelLimit
            FROM tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token_hash = ?
        `, [tokenHash]);

        if (!result) {
            return null; // Token not found
        }

        // Check if token is active
        if (!result.isActive || !result.userIsActive) {
            return null; // Token or user is inactive
        }

        // Check if token is expired
        if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
            return null; // Token expired
        }

        // Update last used timestamp
        execute(
            `UPDATE tokens SET last_used = CURRENT_TIMESTAMP WHERE id = ?`,
            [result.tokenId]
        );

        return {
            tokenId: result.tokenId,
            userId: result.userId,
            username: result.username,
            email: result.email,
            tunnelLimit: result.tunnelLimit,
            tokenName: result.tokenName
        };
    }

    /**
     * List all tokens for a user
     */
    static listByUser(userId) {
        return query(`
            SELECT
                id,
                token_prefix as tokenPrefix,
                name,
                created_at as createdAt,
                last_used as lastUsed,
                expires_at as expiresAt,
                is_active as isActive
            FROM tokens
            WHERE user_id = ?
            ORDER BY created_at DESC
        `, [userId]);
    }

    /**
     * Get token by ID
     */
    static findById(tokenId) {
        return queryOne(`
            SELECT
                id,
                user_id as userId,
                token_prefix as tokenPrefix,
                name,
                created_at as createdAt,
                last_used as lastUsed,
                expires_at as expiresAt,
                is_active as isActive
            FROM tokens
            WHERE id = ?
        `, [tokenId]);
    }

    /**
     * Update token name
     */
    static updateName(tokenId, name) {
        execute(
            `UPDATE tokens SET name = ? WHERE id = ?`,
            [name, tokenId]
        );
    }

    /**
     * Revoke a token (soft delete)
     */
    static revoke(tokenId) {
        execute(
            `UPDATE tokens SET is_active = 0 WHERE id = ?`,
            [tokenId]
        );
    }

    /**
     * Delete a token (hard delete)
     */
    static delete(tokenId) {
        execute(`DELETE FROM tokens WHERE id = ?`, [tokenId]);
    }

    /**
     * Revoke all tokens for a user
     */
    static revokeAllForUser(userId) {
        execute(
            `UPDATE tokens SET is_active = 0 WHERE user_id = ?`,
            [userId]
        );
    }

    /**
     * Count active tokens for a user
     */
    static countActiveForUser(userId) {
        const result = queryOne(
            `SELECT COUNT(*) as count FROM tokens WHERE user_id = ? AND is_active = 1`,
            [userId]
        );
        return result.count;
    }

    /**
     * Clean up expired tokens (maintenance task)
     */
    static cleanupExpired() {
        const result = execute(
            `DELETE FROM tokens WHERE expires_at < CURRENT_TIMESTAMP`
        );
        return result.changes;
    }
}

module.exports = Token;
