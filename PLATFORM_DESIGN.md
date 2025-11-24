# HershelsFRP Platform - Design Document

## 🎯 Vision

Transform tunnel.hershel.dev from a basic info page into a **polished SaaS platform** where users can:
- Create free accounts
- Generate personal auth tokens
- View active tunnels in real-time
- Monitor usage statistics
- Manage their account settings

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     tunnel.hershel.dev                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│  │   Frontend   │───▶│  API Server  │───▶│    Database     │  │
│  │  (Static)    │    │  (Express)   │    │   (SQLite)      │  │
│  │  - Landing   │    │  - Auth      │    │  - Users        │  │
│  │  - Dashboard │    │  - Tokens    │    │  - Tokens       │  │
│  │  - Account   │    │  - Tunnels   │    │  - Tunnels      │  │
│  └──────────────┘    └──────┬───────┘    └─────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────▼────────────────────────────────┐ │
│  │           Ask Server (Modified)                           │ │
│  │  - Validates tokens per user                              │ │
│  │  - Tracks tunnel usage                                    │ │
│  │  - Enforces per-user limits                               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite (easy deployment, sufficient for this scale)
- **Auth**: bcrypt for password hashing, JWT for session tokens
- **Validation**: joi or zod for input validation

### Frontend
- **Framework**: Vanilla JS + Alpine.js (lightweight, no build step)
- **Styling**: Tailwind CSS (modern, responsive)
- **Icons**: Lucide Icons or Heroicons
- **Charts**: Chart.js for usage statistics

### Deployment
- **Hosting**: Same Azure VM (serves static files via Caddy)
- **API**: Runs on port 3000 (internal)
- **SSL**: Caddy handles all HTTPS

## 📊 Database Schema

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,           -- e.g., 'hershelt'
    email TEXT UNIQUE NOT NULL,              -- e.g., 'user@example.com'
    password_hash TEXT NOT NULL,             -- bcrypt hash
    github_username TEXT,                    -- Optional GitHub link
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,             -- Account status
    tunnel_limit INTEGER DEFAULT 10,         -- Max concurrent tunnels

    -- Profile
    display_name TEXT,                       -- Optional display name
    bio TEXT,                                -- Optional bio

    -- Settings
    email_notifications BOOLEAN DEFAULT 1,   -- Email alerts

    CONSTRAINT username_format CHECK (username REGEXP '^[a-z0-9-]{3,20}$')
);
```

### Tokens Table
```sql
CREATE TABLE tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,              -- Base64 token (32 bytes)
    name TEXT,                               -- e.g., "Personal Laptop", "Work PC"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    expires_at DATETIME,                     -- NULL = never expires
    is_active BOOLEAN DEFAULT 1,             -- Can be revoked

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Tunnels Table
```sql
CREATE TABLE tunnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_id INTEGER NOT NULL,               -- Which token created it
    subdomain TEXT NOT NULL,                 -- e.g., 'hershelt-myapp-client'
    local_port INTEGER NOT NULL,             -- e.g., 3000
    tunnel_type TEXT NOT NULL,               -- 'http', 'tcp', 'udp'

    -- Status
    status TEXT DEFAULT 'active',            -- 'active', 'inactive', 'error'
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    disconnected_at DATETIME,
    last_request_at DATETIME,                -- Last HTTP request received

    -- Usage tracking
    request_count INTEGER DEFAULT 0,         -- Total requests
    bytes_transferred INTEGER DEFAULT 0,     -- Total bytes

    -- Metadata
    client_ip TEXT,                          -- Client IP address
    client_version TEXT,                     -- VS Code extension version

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE,
    UNIQUE(subdomain)
);
```

### Usage Stats Table
```sql
CREATE TABLE usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tunnel_id INTEGER NOT NULL,

    -- Time bucket (hourly aggregation)
    bucket_time DATETIME NOT NULL,           -- Rounded to the hour

    -- Metrics
    request_count INTEGER DEFAULT 0,
    bytes_transferred INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE,
    UNIQUE(tunnel_id, bucket_time)
);
```

## 🔌 API Endpoints

### Public Endpoints (No Auth)
```
POST   /api/auth/register          - Create new account
POST   /api/auth/login             - Login and get session JWT
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password with token
GET    /api/health                 - Health check
```

### Authenticated Endpoints (Requires JWT)
```
# User Management
GET    /api/user/profile           - Get user profile
PUT    /api/user/profile           - Update profile
DELETE /api/user/account           - Delete account

# Token Management
GET    /api/tokens                 - List all user tokens
POST   /api/tokens                 - Generate new token
PUT    /api/tokens/:id             - Update token (rename)
DELETE /api/tokens/:id             - Revoke token

# Tunnel Management
GET    /api/tunnels                - List active tunnels
GET    /api/tunnels/:id            - Get tunnel details
GET    /api/tunnels/:id/stats      - Get tunnel usage stats

# Analytics
GET    /api/analytics/overview     - Usage overview (last 30 days)
GET    /api/analytics/tunnels      - Per-tunnel analytics
```

### Internal Endpoints (For ask-server & FRP)
```
POST   /api/internal/validate-token    - Validate token and check limits
POST   /api/internal/tunnel-connect    - Register new tunnel
POST   /api/internal/tunnel-disconnect - Mark tunnel as disconnected
POST   /api/internal/log-request       - Log tunnel request for analytics
```

## 🎨 Frontend Pages

### 1. Landing Page (`/`)
**URL**: `https://tunnel.hershel.dev`

**Sections**:
- Hero section with animated tunnel demo
- Features grid (Persistent URLs, Auto SSL, WebSocket Support, etc.)
- Pricing (FREE for now with reasonable limits)
- How it works (3 simple steps)
- GitHub link (prominent link to @hershelt profile)
- VS Code extension download link
- CTA: "Get Started Free" → Register

**Design**:
- Dark theme (matches current style)
- Gradient accents (blue/cyan)
- Smooth animations
- Responsive (mobile-first)

### 2. Registration Page (`/register`)
**URL**: `https://tunnel.hershel.dev/register`

**Form Fields**:
- Username (3-20 chars, lowercase, numbers, hyphens)
- Email
- Password (min 8 chars, strength indicator)
- GitHub username (optional)
- Terms of service checkbox

**Validation**:
- Real-time username availability check
- Password strength meter
- Email format validation

### 3. Login Page (`/login`)
**URL**: `https://tunnel.hershel.dev/login`

**Features**:
- Email/username + password
- "Remember me" checkbox
- Forgot password link
- Register link

### 4. Dashboard (`/dashboard`)
**URL**: `https://tunnel.hershel.dev/dashboard`

**Components**:
- **Active Tunnels Card**: Live list of connected tunnels
  - Subdomain URL (click to copy)
  - Local port
  - Status indicator (green = active)
  - Request count
  - Connected time
  - Actions: Copy URL, View Stats, Disconnect

- **Quick Stats Card**:
  - Total tunnels today
  - Total requests (last 24h)
  - Data transferred
  - Active tunnels count

- **Recent Activity Timeline**:
  - Tunnel connected/disconnected
  - Token generated/revoked
  - High traffic alerts

- **Usage Chart**:
  - Requests over time (last 7 days)
  - Line chart with Chart.js

### 5. Tokens Page (`/dashboard/tokens`)
**URL**: `https://tunnel.hershel.dev/dashboard/tokens`

**Features**:
- **Token List**:
  - Token name (editable)
  - Token value (masked: `frps_••••••••••••••`, click to reveal)
  - Created date
  - Last used date
  - Status (active/revoked)
  - Actions: Copy, Rename, Revoke

- **Generate New Token**:
  - Button: "Generate New Token"
  - Modal: Name your token (optional)
  - Show token ONCE with copy button
  - Warning: "Save this token, you won't see it again!"

- **VS Code Setup Instructions**:
  - Code snippet showing how to configure extension
  - Copy button for quick setup

### 6. Account Settings (`/dashboard/settings`)
**URL**: `https://tunnel.hershel.dev/dashboard/settings`

**Sections**:
- **Profile**:
  - Display name
  - Bio
  - GitHub username
  - Avatar (Gravatar from email)

- **Security**:
  - Change password
  - Email verification status
  - Two-factor auth (future)

- **Preferences**:
  - Email notifications toggle
  - Tunnel limit (display only)

- **Danger Zone**:
  - Delete account button (with confirmation)

## 🔒 Security Considerations

### Password Security
- Minimum 8 characters
- bcrypt with salt rounds = 12
- Password reset tokens expire in 1 hour
- Rate limit: 5 login attempts per 15 minutes per IP

### Token Security
- Tokens are 32-byte random values (base64 encoded)
- Stored hashed in database (SHA256)
- Prefix: `frps_` for easy identification
- Never logged in plaintext

### API Security
- JWT for session management (expires in 7 days)
- HTTP-only cookies for JWT storage
- CORS enabled only for tunnel.hershel.dev
- Rate limiting: 100 requests per 15 minutes per IP
- Input validation on all endpoints

### Tunnel Security
- Subdomain must match username-* pattern
- Users can only see/manage their own tunnels
- Token validation on every tunnel creation
- Enforce per-user tunnel limits

## 📈 User Limits (Free Tier)

```javascript
const FREE_TIER_LIMITS = {
    maxConcurrentTunnels: 10,      // Max active tunnels
    maxTokens: 5,                   // Max auth tokens
    maxRequestsPerHour: 10000,      // Rate limit per tunnel
    maxBandwidthPerDay: 10 * 1024 * 1024 * 1024, // 10 GB/day
};
```

## 🚀 Implementation Plan

### Phase 1: Backend Foundation (Day 1)
1. Set up Express.js server
2. Create SQLite database and schema
3. Implement auth endpoints (register, login)
4. Implement token generation API
5. Test with Postman

### Phase 2: Frontend Core (Day 2)
1. Create landing page with Tailwind CSS
2. Build registration/login forms
3. Implement JWT authentication flow
4. Create dashboard shell

### Phase 3: Dashboard Features (Day 3)
1. Build active tunnels display
2. Add token management page
3. Implement usage statistics
4. Create account settings page

### Phase 4: Integration (Day 4)
1. Update ask-server.js to validate per-user tokens
2. Connect tunnel tracking to database
3. Implement real-time updates
4. Test end-to-end flow

### Phase 5: Polish & Deploy (Day 5)
1. Add animations and transitions
2. Responsive design testing
3. Error handling and user feedback
4. Documentation updates
5. Deploy to Azure VM

## 🔄 Migration from Current System

### For Existing Users
- No breaking changes to FRP server
- Legacy API token still works (admin token)
- New users must create accounts
- VS Code extension updated to support both old and new auth

### Deployment Strategy
1. Deploy new platform alongside existing ask-server
2. Run both systems in parallel for 1 week
3. Announce migration to users
4. Deprecate shared token after migration period

## 📊 Success Metrics

- User registrations
- Active tunnels per day
- Token generations
- Page views and engagement
- API response times
- Error rates

## 🎁 Future Enhancements

### Paid Tiers (Optional)
```
Pro Tier ($5/month):
- 50 concurrent tunnels
- Custom subdomains (without username prefix)
- Priority support
- 100 GB bandwidth/day
- Team collaboration

Enterprise ($50/month):
- Unlimited tunnels
- Custom domain support
- SLA guarantee
- Dedicated support
```

### Features
- [ ] Real-time tunnel status via WebSockets
- [ ] Tunnel logs viewer
- [ ] Custom domains (bring your own domain)
- [ ] Team collaboration (share tunnels)
- [ ] API webhooks for events
- [ ] 2FA authentication
- [ ] OAuth login (GitHub, Google)
- [ ] Mobile app for tunnel management
- [ ] Tunnel replay (record and replay requests)
- [ ] Request inspector (see HTTP headers, body)

## 📝 Notes

- **No credit card required** for free tier
- **Simple onboarding** - register and get token in 30 seconds
- **Professional appearance** - builds trust for users
- **GitHub prominence** - links to @hershelt profile on landing page
- **VS Code integration** - seamless setup with extension
- **Self-service** - users manage their own tokens

---

**Ready to build?** Start with Phase 1 - Backend Foundation!
