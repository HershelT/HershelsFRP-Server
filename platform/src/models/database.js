/**
 * Database Connection Module
 * Provides singleton database connection and common utilities
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database configuration
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'hershelsfrp.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`Created data directory: ${DB_DIR}`);
}

// Create database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log(`✅ Database connected: ${DB_PATH}`);

/**
 * Helper function to run queries with error handling
 */
function query(sql, params = []) {
    try {
        return db.prepare(sql).all(params);
    } catch (error) {
        console.error('Database query error:', error.message);
        throw error;
    }
}

/**
 * Helper function to get single row
 */
function queryOne(sql, params = []) {
    try {
        return db.prepare(sql).get(params);
    } catch (error) {
        console.error('Database queryOne error:', error.message);
        throw error;
    }
}

/**
 * Helper function to execute insert/update/delete
 */
function execute(sql, params = []) {
    try {
        return db.prepare(sql).run(params);
    } catch (error) {
        console.error('Database execute error:', error.message);
        throw error;
    }
}

/**
 * Transaction helper
 */
function transaction(fn) {
    return db.transaction(fn);
}

/**
 * Close database connection (for graceful shutdown)
 */
function close() {
    db.close();
    console.log('Database connection closed');
}

module.exports = {
    db,
    query,
    queryOne,
    execute,
    transaction,
    close
};
