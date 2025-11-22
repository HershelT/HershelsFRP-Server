# HershelsFRP Server Configuration

This directory contains all the server-side configuration files needed to deploy your own custom FRP tunnel service on Azure (or any VPS).

## 📁 Files in this Directory

| File | Purpose | Deploy To |
|------|---------|-----------|
| **frps.toml** | FRP server configuration | `/etc/frp/frps.toml` on VM |
| **Caddyfile** | Caddy web server + SSL config | `/etc/caddy/Caddyfile` on VM |
| **ask-server.js** | Certificate abuse prevention | `/opt/hershelsfrp/ask-server.js` on VM |
| **AZURE_SETUP.md** | Complete Azure deployment guide | Reference doc |
| **README.md** | This file | Reference doc |

## 🎯 What Does This Do?

This setup gives you a **production-grade tunnel service** comparable to ngrok or DevTunnel, but under YOUR control:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Azure VM                            │
│                                                             │
│  ┌──────────┐      ┌──────────┐      ┌──────────────────┐ │
│  │  Caddy   │──────│   FRP    │      │  Ask Endpoint    │ │
│  │  :80/443 │      │  Server  │      │  (Node.js)       │ │
│  │          │      │  :7000   │      │  :9000           │ │
│  │ (SSL +   │      │  :8080   │      │                  │ │
│  │  Proxy)  │      │          │      │ (Cert Security)  │ │
│  └────┬─────┘      └────┬─────┘      └────┬─────────────┘ │
│       │                 │                  │               │
└───────┼─────────────────┼──────────────────┼───────────────┘
        │                 │                  │
        │ HTTPS           │ Control          │ Check
        │ Requests        │ Connection       │ Whitelist
        ▼                 ▼                  ▼

   User Browser      VS Code Extension   Caddy on-demand TLS
   https://alice-    (frpc client        (before issuing
   myapp.tunnel.     connects here)      SSL cert)
   hershel.dev
```

### How It Works

1. **User creates tunnel** in VS Code extension
2. **frpc (client)** connects to your Azure VM on port 7000
3. **frps (server)** assigns subdomain `alice-myapp-client.tunnel.hershel.dev`
4. **Ask endpoint** whitelists the subdomain for SSL certificates
5. **User visits** `https://alice-myapp-client.tunnel.hershel.dev`
6. **Caddy** automatically gets SSL cert from Let's Encrypt (on-demand TLS)
7. **Caddy** proxies request to **frps** on port 8080
8. **frps** forwards to **frpc** which forwards to user's **localhost:3000**
9. **Response** flows back through the chain

### Key Benefits

✅ **True Persistent URLs** - Same URL every time
✅ **Automatic SSL** - Let's Encrypt certificates automatically generated
✅ **WebSocket Support** - Works with Socket.io, YJS, etc.
✅ **No Rate Limits** - Only limited by your server resources
✅ **Your Domain** - Brand it as `*.tunnel.hershel.dev`
✅ **Cost Effective** - ~$11-34/month vs ngrok Pro $8/month (limited)

## 🚀 Quick Start

**Step 1: Read the deployment guide**
```bash
cat AZURE_SETUP.md
```

**Step 2: Create Azure VM** (see `AZURE_SETUP.md` for detailed instructions)
- Size: B2s (2 vCPU, 4GB RAM) recommended
- OS: Ubuntu 22.04 LTS
- Open ports: 22, 80, 443, 7000

**Step 3: Configure DNS** (at your domain registrar)
```
A     tunnel         YOUR_VM_IP
A     *.tunnel       YOUR_VM_IP
```

**Step 4: Deploy files to VM**
```bash
# From your local machine (in this directory)
scp frps.toml azureuser@YOUR_VM_IP:/tmp/
scp Caddyfile azureuser@YOUR_VM_IP:/tmp/
scp ask-server.js azureuser@YOUR_VM_IP:/tmp/

# On the VM
sudo mv /tmp/frps.toml /etc/frp/
sudo mv /tmp/Caddyfile /etc/caddy/
sudo mv /tmp/ask-server.js /opt/hershelsfrp/
```

**Step 5: Generate secure tokens**
```bash
# Generate auth token for FRP
openssl rand -base64 32

# Generate API token for ask server
openssl rand -base64 32
```

**Step 6: Edit configurations**
```bash
# Edit frps.toml - set auth token
sudo nano /etc/frp/frps.toml

# Edit Caddyfile - set your email
sudo nano /etc/caddy/Caddyfile

# Set API token for ask server (in systemd service)
sudo nano /etc/systemd/system/ask-server.service
```

**Step 7: Start services**
```bash
sudo systemctl enable --now frps
sudo systemctl enable --now ask-server
sudo systemctl reload caddy
```

**Step 8: Test**
```bash
# Check services
sudo systemctl status frps ask-server caddy

# Test SSL
curl -I https://tunnel.hershel.dev
```

**Done!** Your server is ready. Now configure the VS Code extension:
- Provider: `hershelsfrp`
- FRP Server Addr: `tunnel.hershel.dev`
- FRP Auth Token: `YOUR_FRP_AUTH_TOKEN`

## 🔧 Configuration Details

### frps.toml

The FRP server configuration. Key settings:

```toml
# Must match your domain
subDomainHost = "tunnel.hershel.dev"

# CHANGE THIS! Generate with: openssl rand -base64 32
token = "CHANGE-ME-TO-A-SECURE-RANDOM-TOKEN" #Save this for the api token as well!

# Security limits
transport.maxPoolCount = 5       # Max connections per client
maxPortsPerClient = 10           # Max ports per client
```

### Caddyfile

The web server configuration. Key features:

- **Wildcard SSL**: Automatic HTTPS for all `*.tunnel.hershel.dev`
- **On-demand TLS**: Certificates generated when first accessed
- **Ask endpoint**: Prevents certificate abuse via whitelist
- **Reverse proxy**: Forwards requests to FRP on port 8080

Change email for Let's Encrypt notifications:
```caddyfile
{
    email your-email@example.com
}
```

### ask-server.js

Security endpoint that prevents SSL certificate abuse. Features:

- **Whitelist**: Only authorized subdomains get SSL certs
- **Rate limiting**: Prevents excessive certificate requests
- **Persistence**: Saves allowed subdomains to disk
- **API**: Allows VS Code extension to register new subdomains

Set API token via environment variable:
#Make sure it is the same as the frp token
```bash
export API_TOKEN="your-secure-token" 
```

## 🔒 Security Checklist

Before going to production:

- [ ] Change `token` in `frps.toml`
- [ ] Change `password` in `frps.toml`
- [ ] Set `email` in `Caddyfile` to your real email
- [ ] Set `API_TOKEN` in ask-server systemd service (should match FRP token)
- [ ] Enable UFW firewall (`sudo ufw enable`)
- [ ] Disable password auth for SSH
- [ ] Setup fail2ban for brute-force protection
- [ ] Enable automatic security updates
- [ ] Set up monitoring (UptimeRobot, etc.)
- [ ] Configure backups for `/var/lib/hershelsfrp/`

## 📊 Monitoring

### View Logs

```bash
# FRP server logs
sudo journalctl -u frps -f

# Ask server logs
sudo journalctl -u ask-server -f

# Caddy logs
sudo journalctl -u caddy -f
sudo tail -f /var/log/caddy/tunnel-access.log
```

### Check Stats

```bash
# Ask server health
curl http://localhost:9000/health

# Ask server stats (all registered subdomains)
curl http://localhost:9000/stats | jq

# FRP dashboard (via SSH tunnel)
ssh -L 7500:localhost:7500 azureuser@YOUR_VM_IP
# Visit: http://localhost:7500
```

### Resource Usage

```bash
# CPU and memory
htop

# Disk space
df -h

# Active tunnels
sudo netstat -tlnp | grep 8080
```

## 🐛 Troubleshooting

### "Tunnel Not Working"

**Check FRP server is running:**
```bash
sudo systemctl status frps
sudo journalctl -u frps -n 50
```

**Check if port 7000 is listening:**
```bash
sudo netstat -tlnp | grep 7000
```

**Check firewall:**
```bash
sudo ufw status
# Should show: 7000/tcp ALLOW
```

### "SSL Certificate Not Working"

**Check ask server:**
```bash
curl http://localhost:9000/health
# Should return: {"status":"healthy",...}
```

**Check Caddy logs:**
```bash
sudo journalctl -u caddy -n 50
```

**Manually test certificate:**
```bash
curl -I https://test.tunnel.hershel.dev
# Should return HTTP/2 200 with valid SSL
```

### "Can't Connect to Server"

**From VS Code extension:**
- Check `frpServerAddr` in settings
- Check `frpAuthToken` matches `frps.toml`
- Check Azure network security group allows port 7000

**Test connection manually:**
```bash
# From your local machine
telnet tunnel.hershel.dev 7000
# Should connect (press Ctrl+] then quit to exit)
```

## 💡 Tips & Best Practices

### Performance

- **Use B2s VM** (2 vCPU, 4GB RAM) for production
- **Enable compression** in frps.toml: `transport.useCompression = true`
- **Use CDN** for static content (if serving websites)
- **Monitor bandwidth** to avoid Azure overage charges

### Security

- **Rotate tokens** every 3-6 months
- **Limit ports** via `allowPorts` in frps.toml
- **Monitor logs** for suspicious activity
- **Set up alerts** for excessive certificate requests
- **Use strong passwords** for FRP dashboard

### Cost Optimization

- **Start with B1s** ($7.59/month) and upgrade if needed
- **Use Azure reserved instances** for 1-year commit discount
- **Monitor bandwidth** usage (first 100GB free, then $0.05/GB)
- **Clean up old logs** to save disk space

### Scaling

- **Vertical scaling**: Upgrade to B4ms (4 vCPU, 16GB RAM)
- **Horizontal scaling**: Use load balancer with multiple VMs
- **Database**: Move allowed-subdomains.json to Redis for multi-server
- **Monitoring**: Add Prometheus + Grafana for metrics

## 📚 Resources

- **FRP Documentation**: https://github.com/fatedier/frp
- **Caddy Documentation**: https://caddyserver.com/docs/
- **Let's Encrypt Rate Limits**: https://letsencrypt.org/docs/rate-limits/
- **Azure VM Pricing**: https://azure.microsoft.com/en-us/pricing/details/virtual-machines/
- **Azure Free Credits**: https://azure.microsoft.com/en-us/free/

## 🤝 Contributing

If you improve this setup:
1. Test thoroughly
2. Update relevant documentation
3. Submit a pull request

## 📜 License

MIT License - See main extension LICENSE file

---

**Need help?** Open an issue on GitHub or check the troubleshooting section above.

**Ready to deploy?** Follow `AZURE_SETUP.md` for complete step-by-step instructions!
