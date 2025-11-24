/**
 * User Model
 * Handles all user-related database operations
 */

const bcrypt = require('bcrypt');
const { query, queryOne, execute } = require('./database');

const SALT_ROUNDS = 12;

class User {
    /**
     * Create a new user
     */
    static async create({ username, email, password, githubUsername = null }) {
        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Insert user
        const result = execute(
            `INSERT INTO users (username, email, password_hash, github_username)
             VALUES (?, ?, ?, ?)`,
            [username.toLowerCase(), email.toLowerCase(), passwordHash, githubUsername]
        );

        return {
            id: result.lastInsertRowid,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            githubUsername
        };
    }

    /**
     * Find user by ID
     */
    static findById(id) {
        return queryOne(
            `SELECT id, username, email, github_username as githubUsername,
                    display_name as displayName, bio, created_at as createdAt,
                    last_login as lastLogin, is_active as isActive,
                    tunnel_limit as tunnelLimit, email_notifications as emailNotifications
             FROM users WHERE id = ?`,
            [id]
        );
    }

    /**
     * Find user by username
     */
    static findByUsername(username) {
        return queryOne(
            `SELECT id, username, email, password_hash as passwordHash,
                    github_username as githubUsername, display_name as displayName,
                    bio, created_at as createdAt, last_login as lastLogin,
                    is_active as isActive, tunnel_limit as tunnelLimit,
                    email_notifications as emailNotifications
             FROM users WHERE username = ?`,
            [username.toLowerCase()]
        );
    }

    /**
     * Find user by email
     */
    static findByEmail(email) {
        return queryOne(
            `SELECT id, username, email, password_hash as passwordHash,
                    github_username as githubUsername, display_name as displayName,
                    bio, created_at as createdAt, last_login as lastLogin,
                    is_active as isActive, tunnel_limit as tunnelLimit,
                    email_notifications as emailNotifications
             FROM users WHERE email = ?`,
            [email.toLowerCase()]
        );
    }

    /**
     * Verify password
     */
    static async verifyPassword(plainPassword, passwordHash) {
        return await bcrypt.compare(plainPassword, passwordHash);
    }

    /**
     * Update last login timestamp
     */
    static updateLastLogin(userId) {
        execute(
            `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
            [userId]
        );
    }

    /**
     * Update user profile
     */
    static updateProfile(userId, { displayName, bio, githubUsername }) {
        const updates = [];
        const params = [];

        if (displayName !== undefined) {
            updates.push('display_name = ?');
            params.push(displayName);
        }
        if (bio !== undefined) {
            updates.push('bio = ?');
            params.push(bio);
        }
        if (githubUsername !== undefined) {
            updates.push('github_username = ?');
            params.push(githubUsername);
        }

        if (updates.length === 0) return;

        params.push(userId);
        execute(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }

    /**
     * Update password
     */
    static async updatePassword(userId, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        execute(
            `UPDATE users SET password_hash = ? WHERE id = ?`,
            [passwordHash, userId]
        );
    }

    /**
     * Update settings
     */
    static updateSettings(userId, { emailNotifications }) {
        if (emailNotifications !== undefined) {
            execute(
                `UPDATE users SET email_notifications = ? WHERE id = ?`,
                [emailNotifications ? 1 : 0, userId]
            );
        }
    }

    /**
     * Deactivate user account
     */
    static deactivate(userId) {
        execute(
            `UPDATE users SET is_active = 0 WHERE id = ?`,
            [userId]
        );
    }

    /**
     * Delete user account (cascades to tokens, tunnels, etc.)
     */
    static delete(userId) {
        execute(`DELETE FROM users WHERE id = ?`, [userId]);
    }

    /**
     * Check if username is available
     */
    static isUsernameAvailable(username) {
        const user = queryOne(
            `SELECT id FROM users WHERE username = ?`,
            [username.toLowerCase()]
        );
        return !user;
    }

    /**
     * Check if email is available
     */
    static isEmailAvailable(email) {
        const user = queryOne(
            `SELECT id FROM users WHERE email = ?`,
            [email.toLowerCase()]
        );
        return !user;
    }

    /**
     * Get user statistics
     */
    static getStats(userId) {
        const stats = queryOne(`
            SELECT
                (SELECT COUNT(*) FROM tokens WHERE user_id = ? AND is_active = 1) as activeTokens,
                (SELECT COUNT(*) FROM tunnels WHERE user_id = ? AND status = 'active') as activeTunnels,
                (SELECT COALESCE(SUM(request_count), 0) FROM tunnels WHERE user_id = ?) as totalRequests,
                (SELECT COALESCE(SUM(bytes_transferred), 0) FROM tunnels WHERE user_id = ?) as totalBytes
        `, [userId, userId, userId, userId]);

        return stats;
    }

    /**
     * List all users (admin only)
     */
    static listAll({ limit = 50, offset = 0 } = {}) {
        return query(
            `SELECT id, username, email, github_username as githubUsername,
                    created_at as createdAt, last_login as lastLogin,
                    is_active as isActive, tunnel_limit as tunnelLimit
             FROM users
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    /**
     * Get total user count
     */
    static count() {
        const result = queryOne(`SELECT COUNT(*) as count FROM users`);
        return result.count;
    }
}

module.exports = User;
