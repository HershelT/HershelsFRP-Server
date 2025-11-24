#!/usr/bin/env node

/**
 * HershelsFRP Platform Server
 * Express.js API server for user management and tunnel tracking
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/tokens');
const userRoutes = require('./routes/user');
const tunnelRoutes = require('./routes/tunnels');
const internalRoutes = require('./routes/internal');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // localhost only by default

console.log('');
console.log('🚀 HershelsFRP Platform Server');
console.log('================================');

// ============================================================
// Middleware
// ============================================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for frontend
    crossOriginEmbedderPolicy: false
}));

// CORS - Allow frontend to access API
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'https://tunnel.hershel.dev',
    credentials: true
}));

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parser
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per window
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'Too many login attempts, please try again later'
    }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
// Static Files
// ============================================================

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================
// API Routes
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Token management routes
app.use('/api/tokens', tokenRoutes);

// User management routes
app.use('/api/user', userRoutes);

// Tunnel management routes
app.use('/api/tunnels', tunnelRoutes);

// Internal API routes (ask-server, FRP)
app.use('/api/internal', internalRoutes);

// ============================================================
// Frontend Routes (SPA)
// ============================================================

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================================
// Error Handling
// ============================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================================
// Server Startup
// ============================================================

const server = app.listen(PORT, HOST, () => {
    console.log('');
    console.log(`✅ Server listening on http://${HOST}:${PORT}`);
    console.log('');
    console.log('API Endpoints:');
    console.log('  POST   /api/auth/register       - Create account');
    console.log('  POST   /api/auth/login          - Login');
    console.log('  GET    /api/tokens              - List tokens');
    console.log('  POST   /api/tokens              - Generate token');
    console.log('  GET    /api/tunnels             - List tunnels');
    console.log('  GET    /api/user/profile        - Get profile');
    console.log('');
    console.log('Frontend:');
    console.log(`  https://tunnel.hershel.dev`);
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
});

// ============================================================
// Graceful Shutdown
// ============================================================

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
    process.exit(1);
});

module.exports = app;
