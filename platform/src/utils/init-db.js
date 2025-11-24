#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates all tables for HershelsFRP platform
 * Run: node src/utils/init-db.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file location
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'hershelsfrp.db');

console.log('🗄️  Initializing HershelsFRP Database');
console.log('=====================================');
console.log(`Database location: ${DB_PATH}`);

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`✅ Created data directory: ${DB_DIR}`);
}

// Open database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance

console.log('✅ Database connection established');

// Enable foreign keys
db.pragma('foreign_keys = ON');

try {
    // ==================================================
    // Users Table
    // ==================================================
    console.log('\n📝 Creating users table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            github_username TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active BOOLEAN DEFAULT 1,
            tunnel_limit INTEGER DEFAULT 10,

            -- Profile
            display_name TEXT,
            bio TEXT,

            -- Settings
            email_notifications BOOLEAN DEFAULT 1,

            -- Indexes
            CHECK (length(username) >= 3 AND length(username) <= 20)
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    `);
    console.log('✅ Users table created');

    // ==================================================
    // Tokens Table
    // ==================================================
    console.log('\n📝 Creating tokens table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            token_prefix TEXT NOT NULL,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used DATETIME,
            expires_at DATETIME,
            is_active BOOLEAN DEFAULT 1,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_tokens_active ON tokens(is_active);
    `);
    console.log('✅ Tokens table created');

    // ==================================================
    // Tunnels Table
    // ==================================================
    console.log('\n📝 Creating tunnels table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS tunnels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_id INTEGER NOT NULL,
            subdomain TEXT NOT NULL UNIQUE,
            local_port INTEGER NOT NULL,
            tunnel_type TEXT NOT NULL DEFAULT 'http',

            -- Status
            status TEXT DEFAULT 'active',
            connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            disconnected_at DATETIME,
            last_request_at DATETIME,

            -- Usage tracking
            request_count INTEGER DEFAULT 0,
            bytes_transferred INTEGER DEFAULT 0,

            -- Metadata
            client_ip TEXT,
            client_version TEXT,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE,
            CHECK (tunnel_type IN ('http', 'tcp', 'udp'))
        );

        CREATE INDEX IF NOT EXISTS idx_tunnels_subdomain ON tunnels(subdomain);
        CREATE INDEX IF NOT EXISTS idx_tunnels_user ON tunnels(user_id);
        CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);
        CREATE INDEX IF NOT EXISTS idx_tunnels_connected ON tunnels(connected_at);
    `);
    console.log('✅ Tunnels table created');

    // ==================================================
    // Usage Stats Table
    // ==================================================
    console.log('\n📝 Creating usage_stats table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS usage_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tunnel_id INTEGER NOT NULL,
            bucket_time DATETIME NOT NULL,

            -- Metrics
            request_count INTEGER DEFAULT 0,
            bytes_transferred INTEGER DEFAULT 0,
            avg_response_time_ms INTEGER,
            error_count INTEGER DEFAULT 0,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE,
            UNIQUE(tunnel_id, bucket_time)
        );

        CREATE INDEX IF NOT EXISTS idx_stats_user ON usage_stats(user_id);
        CREATE INDEX IF NOT EXISTS idx_stats_tunnel ON usage_stats(tunnel_id);
        CREATE INDEX IF NOT EXISTS idx_stats_time ON usage_stats(bucket_time);
    `);
    console.log('✅ Usage stats table created');

    // ==================================================
    // Password Reset Tokens Table
    // ==================================================
    console.log('\n📝 Creating password_reset_tokens table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT 0,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);
    `);
    console.log('✅ Password reset tokens table created');

    // ==================================================
    // Session Tokens Table (for JWT management)
    // ==================================================
    console.log('\n📝 Creating sessions table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            jti TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT,
            ip_address TEXT,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(jti);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);
    console.log('✅ Sessions table created');

    console.log('\n✨ Database initialization complete!');
    console.log('\nDatabase statistics:');

    // Show table counts
    const tables = ['users', 'tokens', 'tunnels', 'usage_stats', 'password_reset_tokens', 'sessions'];
    tables.forEach(table => {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        console.log(`  ${table}: ${count.count} rows`);
    });

} catch (error) {
    console.error('\n❌ Error initializing database:', error.message);
    process.exit(1);
} finally {
    db.close();
    console.log('\n✅ Database connection closed');
}
