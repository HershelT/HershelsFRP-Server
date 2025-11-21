# HershelsFRP Azure VM Setup Guide

Complete step-by-step guide to deploy your custom FRP tunnel server on Microsoft Azure.

## 📋 Prerequisites

- Microsoft Azure account with $200 credits
- Domain name: `hershel.dev` (configured in your DNS provider)
- SSH client installed on your local machine
- Basic knowledge of Linux command line

---

## 🚀 Part 1: Create Azure Virtual Machine

### Step 1: Create VM via Azure Portal

1. **Login to Azure Portal**: https://portal.azure.com

2. **Create Virtual Machine**:
   - Click **"Create a resource"** → **"Virtual Machine"**
   - **Basics Tab**:
     - **Subscription**: Your Azure subscription
     - **Resource Group**: Create new → `hershelsfrp-rg`
     - **VM Name**: `hershelsfrp-server`
     - **Region**: Choose closest to your users (e.g., `East US`, `West Europe`)
     - **Image**: **Ubuntu Server 22.04 LTS**
     - **Size**: **Standard B1s** ($7.59/month) or **Standard B2s** ($30.37/month) for better performance

3. **Administrator Account**:
   - **Authentication type**: SSH public key (recommended) or Password
   - **Username**: `azureuser`
   - **SSH public key**: Paste your public key (generate with `ssh-keygen` if needed)

4. **Inbound Port Rules**:
   - Select: **HTTP (80)**, **HTTPS (443)**, **SSH (22)**
   - We'll add port 7000 later

5. **Disks Tab**:
   - **OS disk type**: Standard SSD (cheaper) or Premium SSD (faster)
   - **Delete with VM**: Yes

6. **Networking Tab**:
   - **Public IP**: Create new → **Static** assignment
   - **NIC network security group**: Basic
   - **Public inbound ports**: Allow SSH, HTTP, HTTPS

7. **Review + Create**: Review settings and click **Create**

8. **Wait for Deployment**: Takes 2-3 minutes

### Step 2: Configure Network Security Group

After VM is created:

1. Go to **Virtual Machines** → `hershelsfrp-server`
2. Click **Networking** → **Network settings**
3. Click **Create port rule** → **Inbound port rule**
4. Add port **7000**:
   - **Source**: Any
   - **Destination port ranges**: 7000
   - **Protocol**: TCP
   - **Action**: Allow
   - **Priority**: 310
   - **Name**: `AllowFRP`
   - Click **Add**

### Step 3: Note Your Public IP Address

1. In VM overview, find **Public IP address**
2. **Copy this IP** - you'll need it for DNS configuration

Example: `20.185.123.45`

---

## 🌐 Part 2: Configure DNS

Go to your DNS provider (Namecheap, Cloudflare, GoDaddy, etc.) and add these records:

### DNS Records for `hershel.dev`

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `tunnel` | `YOUR_VM_IP` | 300 |
| A | `*.tunnel` | `YOUR_VM_IP` | 300 |

**Example**:
```
A     tunnel         20.185.123.45    300
A     *.tunnel       20.185.123.45    300
```

**What this does**:
- `tunnel.hershel.dev` → Your VM
- `alice-myapp.tunnel.hershel.dev` → Your VM (wildcard)
- `bob-api.tunnel.hershel.dev` → Your VM (wildcard)

### Verify DNS Propagation

Wait 5-10 minutes, then test:

```bash
# On your local machine
dig tunnel.hershel.dev
dig alice-test.tunnel.hershel.dev

# Should return your VM's IP address
```

---

## 🔧 Part 3: Connect to VM and Install Software

### Step 1: SSH into VM

```bash
# Get SSH command from Azure Portal (Overview → Connect → SSH)
ssh azureuser@YOUR_VM_IP

# Or if you set a password:
ssh azureuser@tunnel.hershel.dev
```

### Step 2: Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 3: Install Required Software

#### Install Node.js (for ask-server)

```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should show v20.x
npm --version
```

#### Install Caddy (Web Server)

```bash
# Add Caddy repository
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Install
sudo apt update
sudo apt install caddy

# Verify
caddy version  # Should show Caddy v2.8+
```

#### Install FRP Server

```bash
# Download FRP (check for latest version at https://github.com/fatedier/frp/releases)
cd /tmp
wget https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz

# Extract
tar -xzf frp_0.61.0_linux_amd64.tar.gz
cd frp_0.61.0_linux_amd64

# Install frps binary
sudo cp frps /usr/local/bin/
sudo chmod +x /usr/local/bin/frps

# Verify
frps --version
```

### Step 4: Configure Firewall

```bash
# Install UFW (Uncomplicated Firewall)
sudo apt install -y ufw

# Set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow required ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Caddy)
sudo ufw allow 443/tcp   # HTTPS (Caddy)
sudo ufw allow 7000/tcp  # FRP control port

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

---

## ⚙️ Part 4: Deploy Server Configuration Files

### Step 1: Create Directories

```bash
# Create config directories
sudo mkdir -p /etc/frp
sudo mkdir -p /etc/caddy
sudo mkdir -p /opt/hershelsfrp
sudo mkdir -p /var/log/frp
sudo mkdir -p /var/log/caddy
sudo mkdir -p /var/lib/hershelsfrp

# Set permissions
sudo chown caddy:caddy /var/log/caddy
sudo chmod 755 /opt/hershelsfrp
```

### Step 2: Upload Configuration Files

**Option A: Copy files from your local machine**

On your **local machine** (in the `hershels-frp-server` directory):

```bash
# Copy frps.toml
scp frps.toml azureuser@YOUR_VM_IP:/tmp/

# Copy Caddyfile
scp Caddyfile azureuser@YOUR_VM_IP:/tmp/

# Copy ask-server.js
scp ask-server.js azureuser@YOUR_VM_IP:/tmp/
```

Then on the **VM**:

```bash
# Move files to correct locations
sudo mv /tmp/frps.toml /etc/frp/
sudo mv /tmp/Caddyfile /etc/caddy/
sudo mv /tmp/ask-server.js /opt/hershelsfrp/
sudo chmod +x /opt/hershelsfrp/ask-server.js
```

**Option B: Create files directly on VM**

Or copy-paste the contents from the files in this directory.

### Step 3: Generate Secure Tokens

```bash
# Generate auth token for FRP
echo "FRP Auth Token:"
openssl rand -base64 32

# Generate API token for ask server
echo "API Token:"
openssl rand -base64 32

# Save these tokens! You'll need them.
```

### Step 4: Edit Configuration Files

#### Edit frps.toml

```bash
sudo nano /etc/frp/frps.toml

# Change these values:
# 1. auth.token = "YOUR_GENERATED_FRP_TOKEN"
# 2. webServer.password = "YOUR_DASHBOARD_PASSWORD"
```

#### Edit Caddyfile

```bash
sudo nano /etc/caddy/Caddyfile

# Change:
# email your-email@example.com  → your real email for Let's Encrypt
```

---

## 🎯 Part 5: Setup Services

### Step 1: Create FRP Systemd Service

```bash
sudo nano /etc/systemd/system/frps.service
```

Paste this content:

```ini
[Unit]
Description=FRP Server Service
After=network.target

[Service]
Type=simple
User=nobody
Restart=on-failure
RestartSec=5s
ExecStart=/usr/local/bin/frps -c /etc/frp/frps.toml
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

Save and exit (Ctrl+X, Y, Enter).

### Step 2: Create Ask Server Systemd Service

```bash
sudo nano /etc/systemd/system/ask-server.service
```

Paste this content (replace `YOUR_API_TOKEN`):

```ini
[Unit]
Description=HershelsFRP Ask Endpoint Server
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/hershelsfrp
Environment="NODE_ENV=production"
Environment="API_TOKEN=YOUR_GENERATED_API_TOKEN"
Environment="DATA_DIR=/var/lib/hershelsfrp"
ExecStart=/usr/bin/node /opt/hershelsfrp/ask-server.js
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Save and exit.

### Step 3: Start All Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable frps
sudo systemctl enable ask-server
sudo systemctl enable caddy

# Start services
sudo systemctl start ask-server  # Start this first
sudo systemctl start frps
sudo systemctl restart caddy

# Check status
sudo systemctl status ask-server
sudo systemctl status frps
sudo systemctl status caddy
```

---

## ✅ Part 6: Verify Installation

### Step 1: Check Services

```bash
# Check if services are running
sudo systemctl status ask-server --no-pager
sudo systemctl status frps --no-pager
sudo systemctl status caddy --no-pager

# Should all show "active (running)"
```

### Step 2: Check Logs

```bash
# FRP logs
sudo journalctl -u frps -f

# Ask server logs
sudo journalctl -u ask-server -f

# Caddy logs
sudo journalctl -u caddy -f

# Press Ctrl+C to exit
```

### Step 3: Test DNS and SSL

```bash
# On your local machine
curl -I https://tunnel.hershel.dev

# Should return HTTP/2 200 with valid SSL
```

### Step 4: Test Ask Endpoint

```bash
# On the VM
curl http://localhost:9000/health

# Should return JSON with status: "healthy"
```

### Step 5: Test FRP Dashboard (Optional)

```bash
# On your local machine, create SSH tunnel
ssh -L 7500:localhost:7500 azureuser@YOUR_VM_IP

# Open browser to: http://localhost:7500
# Login with credentials from frps.toml
```

---

## 🔐 Part 7: Security Hardening

### Step 1: Setup SSH Key-Only Authentication

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Change these lines:
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart sshd
```

### Step 2: Setup Fail2Ban

```bash
# Install fail2ban
sudo apt install -y fail2ban

# Create local config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Step 3: Enable Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 🎉 Part 8: Test End-to-End

### Step 1: Configure VS Code Extension

On your **local machine**:

1. Open VS Code
2. Install **Localhost Tunnel & Preview** extension
3. Open Settings (Ctrl+,)
4. Search for "Localhost Tunnel"
5. Set:
   - **Provider**: `hershelsfrp`
   - **FRP Server Addr**: `tunnel.hershel.dev`
   - **FRP Server Port**: `7000`
   - **FRP Auth Token**: `YOUR_FRP_AUTH_TOKEN` (from Step 3)
   - **Username**: Your name (e.g., `alice`)

### Step 2: Create Test Tunnel

```bash
# Start a simple web server on localhost
python3 -m http.server 3000

# Or use Node.js
npx http-server -p 3000
```

In VS Code:
1. Click globe icon in status bar
2. Enter: `http://localhost:3000`
3. Project: `myapp`
4. Role: `client`
5. Click "Create Tunnel"

Expected URL: `https://alice-myapp-client.tunnel.hershel.dev`

### Step 3: Test the Tunnel

Open the URL in your browser. You should see your local web server!

---

## 📊 Monitoring & Maintenance

### View Logs

```bash
# Real-time FRP logs
sudo journalctl -u frps -f

# Real-time ask server logs
sudo journalctl -u ask-server -f

# Real-time Caddy logs
sudo tail -f /var/log/caddy/tunnel-access.log
```

### Check Stats

```bash
# Ask server stats
curl http://localhost:9000/stats | jq

# FRP dashboard (via SSH tunnel)
ssh -L 7500:localhost:7500 azureuser@YOUR_VM_IP
# Visit: http://localhost:7500
```

### Disk Usage

```bash
# Check disk space
df -h

# Clean old logs
sudo journalctl --vacuum-time=7d
```

---

## 🐛 Troubleshooting

### Tunnel Not Working?

```bash
# 1. Check FRP server is running
sudo systemctl status frps

# 2. Check if port 7000 is listening
sudo netstat -tlnp | grep 7000

# 3. Check firewall
sudo ufw status

# 4. Check FRP logs for errors
sudo journalctl -u frps -n 50
```

### SSL Certificate Issues?

```bash
# 1. Check ask server is running
curl http://localhost:9000/health

# 2. Check Caddy logs
sudo journalctl -u caddy -n 50

# 3. Test certificate manually
curl -I https://test.tunnel.hershel.dev

# 4. Force certificate renewal
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Can't Connect to VM?

```bash
# Check VM is running in Azure Portal
# Check network security group allows port 7000
# Check DNS is resolving correctly:
dig tunnel.hershel.dev
```

---

## 💰 Cost Estimate

**Monthly Azure Costs**:
- **B1s VM** (1 vCPU, 1GB RAM): ~$7.59/month
- **B2s VM** (2 vCPU, 4GB RAM): ~$30.37/month (recommended)
- **Public IP**: ~$3.50/month
- **Bandwidth**: ~$0.05/GB (first 100GB free)

**Total**: ~$11-34/month (much cheaper than ngrok Pro at $8/month with only 3 domains!)

**Your $200 credits**: Should last 6-18 months depending on VM size!

---

## 🎓 Next Steps

1. **Share your auth tokens** with trusted users
2. **Monitor usage** via dashboard
3. **Set up backups** for `/var/lib/hershelsfrp/allowed-subdomains.json`
4. **Add monitoring** (UptimeRobot, Pingdom, etc.)
5. **Consider adding**: Rate limiting, user authentication, usage analytics

---

## 📞 Support

- **FRP Issues**: https://github.com/fatedier/frp/issues
- **Caddy Issues**: https://caddy.community
- **Azure Issues**: Azure Support Portal

**Congratulations! Your HershelsFRP tunnel server is live!** 🎉
