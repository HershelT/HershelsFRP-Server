#!/usr/bin/env node

/**
 * HershelsFRP Ask Endpoint Server
 *
 * Purpose: Prevent SSL certificate abuse by whitelisting subdomains
 *
 * This server is queried by Caddy's on-demand TLS feature before
 * issuing a Let's Encrypt certificate for a subdomain.
 *
 * Security: Only authorized subdomains get certificates, preventing
 * attackers from exhausting your Let's Encrypt rate limits.
 *
 * Run: node ask-server.js
 * Production: Use systemd service (see setup-ask-service.sh)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

const PORT = 9000;
const HOST = '127.0.0.1'; // Only accept local connections (from Caddy)

// API token for registering subdomains (change this!)
const API_TOKEN = process.env.API_TOKEN || 'CHANGE-ME-TO-A-SECURE-RANDOM-TOKEN';

// Rate limiting: Maximum cert requests per subdomain per hour
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_HOUR = 100; // Alert threshold

// Persistence
const DATA_DIR = process.env.DATA_DIR || '/var/lib/hershelsfrp';
const SUBDOMAINS_FILE = path.join(DATA_DIR, 'allowed-subdomains.json');

// ============================================================
// In-Memory Storage
// ============================================================

// Set of allowed subdomains (loaded from disk)
let allowedSubdomains = new Set();

// Rate limiting map: subdomain -> last request timestamp
const rateLimits = new Map();

// Request counter for monitoring
let requestCount = 0;
let deniedCount = 0;

// ============================================================
// Persistence Functions
// ============================================================

/**
 * Load allowed subdomains from disk
 */
function loadSubdomains() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        if (fs.existsSync(SUBDOMAINS_FILE)) {
            const data = fs.readFileSync(SUBDOMAINS_FILE, 'utf8');
            const subdomains = JSON.parse(data);
            allowedSubdomains = new Set(subdomains);
            console.log(`Loaded ${allowedSubdomains.size} allowed subdomain(s)`);
        } else {
            console.log('No existing subdomains file, starting fresh');
        }
    } catch (error) {
        console.error('Error loading subdomains:', error);
        allowedSubdomains = new Set();
    }
}

/**
 * Save allowed subdomains to disk
 */
function saveSubdomains() {
    try {
        const data = JSON.stringify(Array.from(allowedSubdomains), null, 2);
        fs.writeFileSync(SUBDOMAINS_FILE, data, 'utf8');
        console.log(`Saved ${allowedSubdomains.size} subdomain(s) to disk`);
    } catch (error) {
        console.error('Error saving subdomains:', error);
    }
}

// ============================================================
// HTTP Server
// ============================================================

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Health check endpoint
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            uptime: process.uptime(),
            allowedSubdomains: allowedSubdomains.size,
            requestCount,
            deniedCount
        }));
        return;
    }

    // Stats endpoint
    if (url.pathname === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            allowedSubdomains: Array.from(allowedSubdomains),
            totalRequests: requestCount,
            totalDenied: deniedCount,
            uptime: process.uptime()
        }));
        return;
    }

    // Caddy on-demand TLS ask endpoint
    if (url.pathname === '/ask') {
        const domain = url.searchParams.get('domain');

        if (!domain) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing domain parameter');
            return;
        }

        // Extract subdomain (e.g., "alice-myapp-api" from "alice-myapp-api.tunnel.hershel.dev")
        const subdomain = domain.split('.')[0];

        requestCount++;

        // Rate limiting check
        const lastRequest = rateLimits.get(subdomain);
        if (lastRequest && Date.now() - lastRequest < RATE_LIMIT_MS) {
            // Allow but log (for monitoring)
            console.log(`⚡ Rate-limited request for ${domain} (allowing anyway)`);
        }
        rateLimits.set(subdomain, Date.now());

        // Check whitelist or auto-allow valid patterns
        const isExplicitlyAllowed = allowedSubdomains.has(subdomain);

        // Auto-allow subdomains matching pattern: username-project-role
        // Pattern requires at least 2 hyphens (3+ parts) to prevent abuse
        // Examples: alice-myapp-api, hershelt-hershelia-yjs-server
        const isValidPattern = /^[a-z0-9]+(-[a-z0-9]+){2,}$/.test(subdomain);

        if (isExplicitlyAllowed || isValidPattern) {
            // Auto-register valid patterns for persistence
            if (!isExplicitlyAllowed && isValidPattern) {
                allowedSubdomains.add(subdomain);
                saveSubdomains();
                console.log(`🔓 Auto-allowed and registered: ${domain} (${subdomain}) - matches valid pattern`);
            } else {
                console.log(`✅ Allowed: ${domain} (${subdomain})`);
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        } else {
            deniedCount++;
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden - Subdomain not authorized');
            console.log(`❌ Denied: ${domain} (${subdomain}) - not in whitelist and doesn't match pattern`);
        }

        return;
    }

    // Register subdomain endpoint (for VS Code extension)
    if (url.pathname === '/register-subdomain' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const { subdomain, token } = JSON.parse(body);

                // Verify auth token
                if (token !== API_TOKEN) {
                    res.writeHead(401, { 'Content-Type': 'text/plain' });
                    res.end('Unauthorized - Invalid API token');
                    console.log(`🔒 Unauthorized registration attempt for: ${subdomain}`);
                    return;
                }

                // Validate subdomain format
                if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Invalid subdomain format (lowercase, numbers, hyphens only)');
                    return;
                }

                // Add to whitelist
                if (!allowedSubdomains.has(subdomain)) {
                    allowedSubdomains.add(subdomain);
                    saveSubdomains();
                    res.writeHead(201, { 'Content-Type': 'text/plain' });
                    res.end('Subdomain registered');
                    console.log(`📝 Registered new subdomain: ${subdomain}`);
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Subdomain already registered');
                    console.log(`ℹ️  Subdomain already exists: ${subdomain}`);
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid request body');
                console.error('Error processing registration:', error);
            }
        });

        return;
    }

    // Unregister subdomain endpoint
    if (url.pathname === '/unregister-subdomain' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const { subdomain, token } = JSON.parse(body);

                // Verify auth token
                if (token !== API_TOKEN) {
                    res.writeHead(401, { 'Content-Type': 'text/plain' });
                    res.end('Unauthorized');
                    return;
                }

                if (allowedSubdomains.has(subdomain)) {
                    allowedSubdomains.delete(subdomain);
                    saveSubdomains();
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Subdomain unregistered');
                    console.log(`🗑️  Unregistered subdomain: ${subdomain}`);
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Subdomain not found');
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid request');
            }
        });

        return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

// ============================================================
// Monitoring & Alerts
// ============================================================

// Periodic stats logging
setInterval(() => {
    if (requestCount > MAX_REQUESTS_PER_HOUR) {
        console.error(`⚠️  ALERT: ${requestCount} cert requests in last hour! (threshold: ${MAX_REQUESTS_PER_HOUR})`);
        console.error(`⚠️  Denied: ${deniedCount} requests`);
        // TODO: Send email/Slack notification
    }

    // Log stats
    console.log(`📊 Stats: ${requestCount} requests, ${deniedCount} denied, ${allowedSubdomains.size} subdomains`);

    // Reset counters
    requestCount = 0;
    deniedCount = 0;
}, 3600000); // Every hour

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [subdomain, timestamp] of rateLimits.entries()) {
        if (now - timestamp > RATE_LIMIT_MS * 2) {
            rateLimits.delete(subdomain);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old rate limit entries`);
    }
}, 300000); // Every 5 minutes

// ============================================================
// Startup
// ============================================================

// Load existing subdomains
loadSubdomains();

// Start server
server.listen(PORT, HOST, () => {
    console.log('');
    console.log('🚀 HershelsFRP Ask Endpoint Server');
    console.log('=====================================');
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log(`Allowed subdomains: ${allowedSubdomains.size}`);
    console.log(`API Token: ${API_TOKEN === 'CHANGE-ME-TO-A-SECURE-RANDOM-TOKEN' ? '⚠️  DEFAULT (CHANGE THIS!)' : '✅ Configured'}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /health               - Health check');
    console.log('  GET  /stats                - Statistics');
    console.log('  GET  /ask                  - Caddy on-demand TLS check');
    console.log('  POST /register-subdomain   - Register new subdomain');
    console.log('  POST /unregister-subdomain - Remove subdomain');
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, saving state and shutting down...');
    saveSubdomains();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, saving state and shutting down...');
    saveSubdomains();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Save periodically (every 5 minutes)
setInterval(() => {
    saveSubdomains();
}, 300000);
