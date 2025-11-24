# HershelsFRP Platform - Deployment Guide

## 📋 Overview

This guide walks you through deploying the HershelsFRP platform with user accounts, token management, and a polished web interface.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Azure VM (tunnel.hershel.dev)               │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────────┐   ┌───────┐ │
│  │  Caddy   │──▶│   Platform   │──▶│  Ask       │──▶│  FRP  │ │
│  │  :80/443 │   │   API :3000  │   │  Server    │   │ :7000 │ │
│  │  (SSL +  │   │  (Express +  │   │  :9000     │   │ :8080 │ │
│  │   Proxy) │   │   SQLite)    │   │            │   │       │ │
│  └──────────┘   └──────────────┘   └────────────┘   └───────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 What's Included

### Backend (Node.js + Express)
- ✅ User authentication (register, login, JWT)
- ✅ Token management (generate, revoke, list)
- ✅ Tunnel tracking (active tunnels, usage stats)
- ✅ SQLite database (easy deployment, no external DB needed)
- ✅ Rate limiting and security middleware
- ✅ Internal API for ask-server integration

### Frontend (Tailwind CSS + Alpine.js)
- ✅ Modern landing page with features
- ✅ User registration and login
- ✅ Dashboard showing active tunnels
- ✅ Token management page
- ✅ Account settings
- ✅ Fully responsive design
- ✅ Link to your GitHub profile (@hershelt)

### Integration
- ✅ Ask-server validates tokens via platform API
- ✅ Caddy serves both platform and tunnels
- ✅ FRP integration (coming in VS Code extension update)

## 🚀 Deployment Steps

### Step 1: Install Dependencies on Azure VM

SSH into your Azure VM:

```bash
ssh azureuser@YOUR_VM_IP
```

Install Node.js 18+ (if not already installed):

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v18+
npm --version
```

### Step 2: Deploy Platform Files

From your local machine, deploy the platform directory:

```bash
# From the HershelsFRP-Server directory on your local machine
cd platform

# Create tarball
tar -czf platform.tar.gz --exclude=node_modules --exclude=data .

# Copy to server
scp platform.tar.gz azureuser@YOUR_VM_IP:/tmp/

# SSH into server and extract
ssh azureuser@YOUR_VM_IP

# Extract platform
sudo mkdir -p /opt/hershelsfrp/platform
cd /opt/hershelsfrp/platform
sudo tar -xzf /tmp/platform.tar.gz
sudo chown -R azureuser:azureuser /opt/hershelsfrp/platform
```

### Step 3: Install Platform Dependencies

```bash
cd /opt/hershelsfrp/platform
npm install --production
```

### Step 4: Initialize Database

```bash
cd /opt/hershelsfrp/platform
npm run init-db
```

You should see:
```
✅ Database connection established
✅ Users table created
✅ Tokens table created
✅ Tunnels table created
✅ Usage stats table created
✅ Database initialization complete!
```

### Step 5: Create Platform Systemd Service

Create the service file:

```bash
sudo nano /etc/systemd/system/hershelsfrp-platform.service
```

Add the following content:

```ini
[Unit]
Description=HershelsFRP Platform API Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=azureuser
WorkingDirectory=/opt/hershelsfrp/platform
ExecStart=/usr/bin/node src/server.js

# Environment variables
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="HOST=127.0.0.1"
Environment="JWT_SECRET=CHANGE-ME-TO-A-LONG-RANDOM-STRING"
Environment="DB_DIR=/var/lib/hershelsfrp"
Environment="CORS_ORIGIN=https://tunnel.hershel.dev"

# Restart policy
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hershelsfrp-platform

[Install]
WantedBy=multi-user.target
```

**IMPORTANT:** Generate a secure JWT secret:

```bash
openssl rand -base64 64
```

Replace `CHANGE-ME-TO-A-LONG-RANDOM-STRING` in the service file with the generated value.

### Step 6: Create Database Directory

```bash
sudo mkdir -p /var/lib/hershelsfrp
sudo chown azureuser:azureuser /var/lib/hershelsfrp
sudo chmod 755 /var/lib/hershelsfrp
```

### Step 7: Update Caddyfile

Update your Caddyfile on the server:

```bash
# Backup current Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup

# Copy new Caddyfile
sudo cp /tmp/Caddyfile /etc/caddy/Caddyfile

# Or if you have the file locally:
scp Caddyfile azureuser@YOUR_VM_IP:/tmp/
ssh azureuser@YOUR_VM_IP "sudo mv /tmp/Caddyfile /etc/caddy/Caddyfile"

# Validate Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy
```

### Step 8: Update ask-server.js

```bash
# Copy updated ask-server.js
scp ask-server.js azureuser@YOUR_VM_IP:/tmp/
ssh azureuser@YOUR_VM_IP "sudo cp /tmp/ask-server.js /opt/hershelsfrp/ask-server.js"

# Restart ask-server
sudo systemctl restart hershelsfrp-ask
```

### Step 9: Start Platform Service

```bash
# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable platform service to start on boot
sudo systemctl enable hershelsfrp-platform

# Start the platform service
sudo systemctl start hershelsfrp-platform

# Check status
sudo systemctl status hershelsfrp-platform
```

You should see:
```
● hershelsfrp-platform.service - HershelsFRP Platform API Server
     Loaded: loaded (/etc/systemd/system/hershelsfrp-platform.service; enabled)
     Active: active (running) since...
```

### Step 10: Verify Services

Check all services are running:

```bash
sudo systemctl status frps
sudo systemctl status hershelsfrp-ask
sudo systemctl status hershelsfrp-platform
sudo systemctl status caddy
```

### Step 11: Test the Platform

Visit in your browser:

```
https://tunnel.hershel.dev
```

You should see the modern landing page!

Test API health:

```bash
curl https://tunnel.hershel.dev/api/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-..."
}
```

### Step 12: Create Your First User

1. Visit https://tunnel.hershel.dev
2. Click "Get Started" or "Register"
3. Fill in:
   - Username: `hershelt` (your username)
   - Email: your email
   - Password: secure password
   - GitHub Username: `hershelt`
4. Click "Create Account"
5. Save your FRP token (shown only once!)

## 🔧 Configuration

### Environment Variables

Edit the platform service to customize:

```bash
sudo nano /etc/systemd/system/hershelsfrp-platform.service
```

Available variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Platform API port |
| `HOST` | `127.0.0.1` | Listen address (localhost only) |
| `JWT_SECRET` | (required) | Secret for JWT tokens |
| `DB_DIR` | `/var/lib/hershelsfrp` | Database directory |
| `CORS_ORIGIN` | `https://tunnel.hershel.dev` | CORS allowed origin |

After editing, reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart hershelsfrp-platform
```

### User Limits

Default limits per user:

```javascript
{
    maxConcurrentTunnels: 10,      // Max active tunnels
    maxTokens: 5,                   // Max auth tokens
    maxRequestsPerHour: 10000,      // Rate limit
    maxBandwidthPerDay: 10 GB       // Bandwidth limit
}
```

To adjust limits for a user, edit the database:

```bash
sqlite3 /var/lib/hershelsfrp/hershelsfrp.db
```

```sql
-- Increase tunnel limit for a user
UPDATE users SET tunnel_limit = 50 WHERE username = 'hershelt';

-- View all users
SELECT id, username, email, tunnel_limit, is_active FROM users;
```

## 📊 Monitoring

### View Logs

```bash
# Platform logs
sudo journalctl -u hershelsfrp-platform -f

# Ask-server logs
sudo journalctl -u hershelsfrp-ask -f

# Caddy logs
sudo journalctl -u caddy -f
sudo tail -f /var/log/caddy/platform-access.log

# FRP server logs
sudo journalctl -u frps -f
```

### Check Database

```bash
# Open database
sqlite3 /var/lib/hershelsfrp/hershelsfrp.db

# View tables
.tables

# Count users
SELECT COUNT(*) FROM users;

# Count active tunnels
SELECT COUNT(*) FROM tunnels WHERE status = 'active';

# View recent tunnels
SELECT subdomain, username, connected_at
FROM tunnels
JOIN users ON tunnels.user_id = users.id
ORDER BY connected_at DESC
LIMIT 10;
```

### Check Service Status

```bash
# Quick status check
sudo systemctl is-active hershelsfrp-platform
sudo systemctl is-active hershelsfrp-ask
sudo systemctl is-active frps
sudo systemctl is-active caddy

# Detailed status
sudo systemctl status hershelsfrp-platform --no-pager -l
```

## 🔒 Security Checklist

- [x] JWT_SECRET is set to a secure random value
- [x] Database directory has correct permissions (755, owned by azureuser)
- [x] Platform API only listens on localhost (not exposed directly)
- [x] Caddy handles all external HTTPS traffic
- [x] Rate limiting enabled on API endpoints
- [x] Ask-server validates with platform API
- [ ] Enable firewall (UFW)
- [ ] Disable password SSH auth
- [ ] Setup fail2ban
- [ ] Configure automatic backups
- [ ] Set up monitoring alerts

## 🆙 Updating the Platform

When you make changes to the platform:

```bash
# 1. On your local machine, create updated tarball
cd platform
tar -czf platform.tar.gz --exclude=node_modules --exclude=data src public package.json

# 2. Copy to server
scp platform.tar.gz azureuser@YOUR_VM_IP:/tmp/

# 3. SSH to server and extract
ssh azureuser@YOUR_VM_IP
cd /opt/hershelsfrp/platform
sudo systemctl stop hershelsfrp-platform
tar -xzf /tmp/platform.tar.gz
npm install --production  # If dependencies changed
sudo systemctl start hershelsfrp-platform

# 4. Verify
sudo systemctl status hershelsfrp-platform
```

## 🐛 Troubleshooting

### Platform Won't Start

Check logs:
```bash
sudo journalctl -u hershelsfrp-platform -n 50
```

Common issues:
- **Port 3000 in use**: Check with `sudo netstat -tlnp | grep 3000`
- **Database permissions**: Check `/var/lib/hershelsfrp` permissions
- **Missing JWT_SECRET**: Check service file has JWT_SECRET set

### Users Can't Register

Check:
1. Platform is running: `curl http://localhost:3000/api/health`
2. Caddy is proxying correctly: `curl https://tunnel.hershel.dev/api/health`
3. Browser console for errors

### SSL Certificates Not Working

Check Caddy:
```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 50
```

Verify ask-server is running:
```bash
curl http://localhost:9000/health
```

### Ask-Server Can't Connect to Platform

Check platform is listening:
```bash
curl http://localhost:3000/api/internal/tunnel/test-subdomain
```

If it fails, platform might not be running:
```bash
sudo systemctl restart hershelsfrp-platform
```

## 📚 Next Steps

1. **Create your account** at https://tunnel.hershel.dev
2. **Generate tokens** for testing
3. **Update VS Code extension** to use new token (coming soon)
4. **Monitor usage** via dashboard
5. **Backup database** regularly:
   ```bash
   sqlite3 /var/lib/hershelsfrp/hershelsfrp.db ".backup /path/to/backup.db"
   ```

## 🎉 You're Done!

Your HershelsFRP platform is now live with:
- ✅ Beautiful landing page
- ✅ User registration and authentication
- ✅ Personal token management
- ✅ Dashboard with tunnel stats
- ✅ Automatic SSL for all tunnels
- ✅ Integration with FRP and ask-server

Share it with the world: **https://tunnel.hershel.dev**

---

**Questions?** Check the main README.md or open an issue on GitHub.
