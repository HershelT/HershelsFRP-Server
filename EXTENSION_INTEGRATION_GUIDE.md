# VS Code Extension Integration Guide for HershelsFRP Platform

## 🎯 Overview

This guide explains how to update the **Localhost Tunnel & Preview** extension to work with the new HershelsFRP user platform, enabling per-user tokens and eliminating the shared admin token.

## 📋 Required Changes

### 1. **Remove Shared Admin Token**

#### Current (Bad - Security Risk):
```typescript
// Old: Hard-coded or shared admin token
const ADMIN_TOKEN = "SHARED-TOKEN-FOR-ALL-USERS";
```

#### New (Good - Per-User Tokens):
```typescript
// New: User provides their own token from platform
const userToken = await getUserToken(); // From settings or keychain
```

---

## 🔧 Extension Settings Updates

### Current Settings Schema (settings.json)

**Remove these:**
```json
{
  "localhostTunnel.frpAuthToken": "shared-admin-token-here"
}
```

**Add these:**
```json
{
  "localhostTunnel.platformUrl": "https://tunnel.hershel.dev",
  "localhostTunnel.frpToken": "",  // User's personal FRP token
  "localhostTunnel.autoLogin": true,
  "localhostTunnel.showTunnelStats": true
}
```

### package.json Configuration

```json
{
  "contributes": {
    "configuration": {
      "title": "Localhost Tunnel & Preview",
      "properties": {
        "localhostTunnel.provider": {
          "type": "string",
          "default": "hershelsfrp",
          "description": "Tunnel provider to use"
        },
        "localhostTunnel.platformUrl": {
          "type": "string",
          "default": "https://tunnel.hershel.dev",
          "description": "HershelsFRP Platform URL"
        },
        "localhostTunnel.frpToken": {
          "type": "string",
          "default": "",
          "description": "Your personal FRP authentication token (get from platform)"
        },
        "localhostTunnel.frpServerAddr": {
          "type": "string",
          "default": "tunnel.hershel.dev",
          "description": "FRP server address"
        },
        "localhostTunnel.frpServerPort": {
          "type": "number",
          "default": 7000,
          "description": "FRP server port"
        },
        "localhostTunnel.autoLogin": {
          "type": "boolean",
          "default": true,
          "description": "Automatically open login page when token is missing"
        },
        "localhostTunnel.showTunnelStats": {
          "type": "boolean",
          "default": true,
          "description": "Show tunnel statistics in sidebar"
        }
      }
    },
    "commands": [
      {
        "command": "localhostTunnel.getToken",
        "title": "Get FRP Token",
        "category": "Tunnel"
      },
      {
        "command": "localhostTunnel.login",
        "title": "Login to HershelsFRP",
        "category": "Tunnel"
      },
      {
        "command": "localhostTunnel.manageTokens",
        "title": "Manage Tokens",
        "category": "Tunnel"
      },
      {
        "command": "localhostTunnel.viewStats",
        "title": "View Tunnel Statistics",
        "category": "Tunnel"
      }
    ]
  }
}
```

---

## 🔐 Token Management Implementation

### 1. **Token Storage (Secure)**

Use VS Code's SecretStorage API for sensitive tokens:

```typescript
// src/services/TokenManager.ts
import * as vscode from 'vscode';

export class TokenManager {
    private static readonly FRP_TOKEN_KEY = 'hershelsfrp.token';
    private static readonly JWT_TOKEN_KEY = 'hershelsfrp.jwt';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Store FRP auth token securely
     */
    async storeFrpToken(token: string): Promise<void> {
        await this.context.secrets.store(TokenManager.FRP_TOKEN_KEY, token);
    }

    /**
     * Get stored FRP token
     */
    async getFrpToken(): Promise<string | undefined> {
        return await this.context.secrets.get(TokenManager.FRP_TOKEN_KEY);
    }

    /**
     * Store JWT session token (for platform API)
     */
    async storeJwtToken(jwt: string): Promise<void> {
        await this.context.secrets.store(TokenManager.JWT_TOKEN_KEY, jwt);
    }

    /**
     * Get JWT session token
     */
    async getJwtToken(): Promise<string | undefined> {
        return await this.context.secrets.get(TokenManager.JWT_TOKEN_KEY);
    }

    /**
     * Clear all tokens (logout)
     */
    async clearTokens(): Promise<void> {
        await this.context.secrets.delete(TokenManager.FRP_TOKEN_KEY);
        await this.context.secrets.delete(TokenManager.JWT_TOKEN_KEY);
    }

    /**
     * Check if user has FRP token configured
     */
    async hasToken(): Promise<boolean> {
        const token = await this.getFrpToken();
        return !!token && token.length > 0;
    }
}
```

### 2. **Platform API Client**

```typescript
// src/services/PlatformApiClient.ts
import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { TokenManager } from './TokenManager';

export interface User {
    id: number;
    username: string;
    email: string;
    tunnelLimit: number;
}

export interface FrpToken {
    id: number;
    token?: string;  // Only shown once when generated
    tokenPrefix: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
    isActive: boolean;
}

export interface Tunnel {
    id: number;
    subdomain: string;
    localPort: number;
    tunnelType: string;
    status: string;
    connectedAt: string;
    requestCount: number;
    bytesTransferred: number;
    url: string;
}

export class PlatformApiClient {
    private api: AxiosInstance;
    private platformUrl: string;

    constructor(
        private tokenManager: TokenManager
    ) {
        const config = vscode.workspace.getConfiguration('localhostTunnel');
        this.platformUrl = config.get('platformUrl', 'https://tunnel.hershel.dev');

        this.api = axios.create({
            baseURL: `${this.platformUrl}/api`,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add JWT token to all requests
        this.api.interceptors.request.use(async (config) => {
            const jwt = await this.tokenManager.getJwtToken();
            if (jwt) {
                config.headers.Authorization = `Bearer ${jwt}`;
            }
            return config;
        });
    }

    /**
     * Login to platform and get JWT
     */
    async login(emailOrUsername: string, password: string): Promise<{ user: User; token: string }> {
        const response = await this.api.post('/auth/login', {
            emailOrUsername,
            password
        });

        if (response.data.success) {
            // Store JWT token
            await this.tokenManager.storeJwtToken(response.data.token);
            return {
                user: response.data.user,
                token: response.data.token
            };
        }

        throw new Error(response.data.error || 'Login failed');
    }

    /**
     * Register new account
     */
    async register(username: string, email: string, password: string, githubUsername?: string): Promise<{ user: User; frpToken: string }> {
        const response = await this.api.post('/auth/register', {
            username,
            email,
            password,
            githubUsername
        });

        if (response.data.success) {
            // Store JWT and first FRP token
            await this.tokenManager.storeJwtToken(response.data.token);
            await this.tokenManager.storeFrpToken(response.data.frpToken.token);

            return {
                user: response.data.user,
                frpToken: response.data.frpToken.token
            };
        }

        throw new Error(response.data.error || 'Registration failed');
    }

    /**
     * Get user profile
     */
    async getProfile(): Promise<User> {
        const response = await this.api.get('/user/profile');

        if (response.data.success) {
            return response.data.user;
        }

        throw new Error('Failed to get profile');
    }

    /**
     * List user's FRP tokens
     */
    async listTokens(): Promise<FrpToken[]> {
        const response = await this.api.get('/tokens');

        if (response.data.success) {
            return response.data.tokens;
        }

        throw new Error('Failed to list tokens');
    }

    /**
     * Generate new FRP token
     */
    async generateToken(name?: string): Promise<FrpToken> {
        const response = await this.api.post('/tokens', { name });

        if (response.data.success) {
            return response.data.token;
        }

        throw new Error(response.data.error || 'Failed to generate token');
    }

    /**
     * Revoke FRP token
     */
    async revokeToken(tokenId: number): Promise<void> {
        const response = await this.api.delete(`/tokens/${tokenId}`);

        if (!response.data.success) {
            throw new Error('Failed to revoke token');
        }
    }

    /**
     * List active tunnels
     */
    async listTunnels(activeOnly: boolean = true): Promise<Tunnel[]> {
        const response = await this.api.get('/tunnels', {
            params: { active: activeOnly }
        });

        if (response.data.success) {
            // Add full URL to each tunnel
            return response.data.tunnels.map((t: any) => ({
                ...t,
                url: `https://${t.subdomain}.tunnel.hershel.dev`
            }));
        }

        throw new Error('Failed to list tunnels');
    }

    /**
     * Get tunnel statistics
     */
    async getTunnelStats(tunnelId: number): Promise<any> {
        const response = await this.api.get(`/tunnels/${tunnelId}`, {
            params: { stats: true }
        });

        if (response.data.success) {
            return response.data.stats;
        }

        throw new Error('Failed to get tunnel stats');
    }

    /**
     * Open platform in browser (for login/token management)
     */
    openPlatform(path: string = ''): void {
        vscode.env.openExternal(vscode.Uri.parse(`${this.platformUrl}${path}`));
    }
}
```

### 3. **Token Setup Wizard**

```typescript
// src/commands/setupToken.ts
import * as vscode from 'vscode';
import { TokenManager } from '../services/TokenManager';
import { PlatformApiClient } from '../services/PlatformApiClient';

export async function setupToken(
    tokenManager: TokenManager,
    apiClient: PlatformApiClient
): Promise<boolean> {
    // Check if token already exists
    if (await tokenManager.hasToken()) {
        const choice = await vscode.window.showQuickPick(
            ['Use existing token', 'Get new token', 'Enter token manually'],
            { placeHolder: 'You already have a token configured' }
        );

        if (choice === 'Use existing token') {
            return true;
        }
    }

    const choice = await vscode.window.showQuickPick(
        [
            { label: 'Open Platform', description: 'Get token from web dashboard' },
            { label: 'Login', description: 'Login and get token automatically' },
            { label: 'Enter Manually', description: 'Paste token directly' }
        ],
        { placeHolder: 'How would you like to set up your FRP token?' }
    );

    if (!choice) {
        return false;
    }

    if (choice.label === 'Open Platform') {
        // Open platform dashboard
        apiClient.openPlatform('/dashboard/tokens');

        vscode.window.showInformationMessage(
            'Opening HershelsFRP platform. Copy your FRP token and come back to paste it.',
            'Paste Token'
        ).then(async (action) => {
            if (action === 'Paste Token') {
                return await enterTokenManually(tokenManager);
            }
        });

        return false;
    }

    if (choice.label === 'Login') {
        return await loginAndGetToken(tokenManager, apiClient);
    }

    if (choice.label === 'Enter Manually') {
        return await enterTokenManually(tokenManager);
    }

    return false;
}

async function loginAndGetToken(
    tokenManager: TokenManager,
    apiClient: PlatformApiClient
): Promise<boolean> {
    const emailOrUsername = await vscode.window.showInputBox({
        prompt: 'Enter your email or username',
        placeHolder: 'username or email@example.com'
    });

    if (!emailOrUsername) {
        return false;
    }

    const password = await vscode.window.showInputBox({
        prompt: 'Enter your password',
        password: true
    });

    if (!password) {
        return false;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Logging in to HershelsFRP...',
                cancellable: false
            },
            async () => {
                await apiClient.login(emailOrUsername, password);
            }
        );

        // Get user's tokens
        const tokens = await apiClient.listTokens();

        if (tokens.length === 0) {
            // Generate first token
            const newToken = await apiClient.generateToken('VS Code');
            await tokenManager.storeFrpToken(newToken.token!);

            vscode.window.showInformationMessage(
                `✅ Token generated successfully! Name: ${newToken.name}`
            );
        } else {
            // Let user choose existing token
            const tokenChoice = await vscode.window.showQuickPick(
                [
                    { label: '+ Generate New Token', description: 'Create a new FRP token' },
                    ...tokens.map(t => ({
                        label: t.name || 'Unnamed Token',
                        description: t.tokenPrefix,
                        detail: `Last used: ${t.lastUsed || 'Never'}`,
                        token: t
                    }))
                ],
                { placeHolder: 'Select an FRP token to use' }
            );

            if (!tokenChoice) {
                return false;
            }

            if (tokenChoice.label === '+ Generate New Token') {
                const name = await vscode.window.showInputBox({
                    prompt: 'Name this token (optional)',
                    placeHolder: 'e.g., VS Code, Work Laptop'
                });

                const newToken = await apiClient.generateToken(name);
                await tokenManager.storeFrpToken(newToken.token!);

                vscode.window.showInformationMessage(
                    `✅ Token "${newToken.name}" generated successfully!`
                );
            } else {
                // Can't retrieve existing token (only hash stored)
                vscode.window.showWarningMessage(
                    'Cannot retrieve existing token value. Please enter it manually or generate a new one.'
                );
                return false;
            }
        }

        return true;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Login failed: ${error.message}`);
        return false;
    }
}

async function enterTokenManually(tokenManager: TokenManager): Promise<boolean> {
    const token = await vscode.window.showInputBox({
        prompt: 'Paste your FRP token',
        placeHolder: 'frps_xxxxxxxxxxxxx...',
        password: true,
        validateInput: (value) => {
            if (!value.startsWith('frps_')) {
                return 'Token must start with "frps_"';
            }
            if (value.length < 20) {
                return 'Token is too short';
            }
            return undefined;
        }
    });

    if (!token) {
        return false;
    }

    await tokenManager.storeFrpToken(token);
    vscode.window.showInformationMessage('✅ Token saved successfully!');
    return true;
}
```

---

## 🔌 Tunnel Creation Integration

### Updated Tunnel Manager

```typescript
// src/services/HershelsFrpTunnelManager.ts
import * as vscode from 'vscode';
import { TokenManager } from './TokenManager';
import { PlatformApiClient } from './PlatformApiClient';

export class HershelsFrpTunnelManager {
    constructor(
        private tokenManager: TokenManager,
        private apiClient: PlatformApiClient
    ) {}

    /**
     * Create a new tunnel
     */
    async createTunnel(
        localPort: number,
        projectName: string,
        roleName: string
    ): Promise<string> {
        // 1. Check if user has token
        const frpToken = await this.tokenManager.getFrpToken();
        if (!frpToken) {
            throw new Error('No FRP token configured. Please run "Get FRP Token" command first.');
        }

        // 2. Get user profile to construct subdomain
        const profile = await this.apiClient.getProfile();
        const subdomain = `${profile.username}-${projectName}-${roleName}`;

        // 3. Start FRP client with token
        await this.startFrpClient(frpToken, subdomain, localPort);

        // 4. Register tunnel with platform API
        // Note: This could also be done by FRP server automatically
        const tunnelUrl = `https://${subdomain}.tunnel.hershel.dev`;

        vscode.window.showInformationMessage(
            `✅ Tunnel created: ${tunnelUrl}`,
            'Copy URL',
            'Open in Browser'
        ).then(action => {
            if (action === 'Copy URL') {
                vscode.env.clipboard.writeText(tunnelUrl);
            } else if (action === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(tunnelUrl));
            }
        });

        return tunnelUrl;
    }

    /**
     * Start FRP client process
     */
    private async startFrpClient(
        token: string,
        subdomain: string,
        localPort: number
    ): Promise<void> {
        // Your existing FRP client startup logic
        // But now using user's personal token instead of shared admin token

        const config = vscode.workspace.getConfiguration('localhostTunnel');
        const serverAddr = config.get('frpServerAddr', 'tunnel.hershel.dev');
        const serverPort = config.get('frpServerPort', 7000);

        // Generate TOML config with user's token
        const frpConfig = this.generateFrpConfig(token, subdomain, localPort, serverAddr, serverPort);

        // Start frpc client...
        // (Your existing implementation)
    }

    private generateFrpConfig(
        token: string,
        subdomain: string,
        localPort: number,
        serverAddr: string,
        serverPort: number
    ): string {
        return `
serverAddr = "${serverAddr}"
serverPort = ${serverPort}
auth.method = "token"
auth.token = "${token}"

[[proxies]]
name = "${subdomain}"
type = "http"
localPort = ${localPort}
subdomain = "${subdomain}"
`;
    }
}
```

---

## 📊 Tunnel Stats Display

### Sidebar View for Active Tunnels

```typescript
// src/views/TunnelTreeDataProvider.ts
import * as vscode from 'vscode';
import { PlatformApiClient, Tunnel } from '../services/PlatformApiClient';

export class TunnelTreeItem extends vscode.TreeItem {
    constructor(
        public readonly tunnel: Tunnel,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(tunnel.subdomain, collapsibleState);

        this.tooltip = `${tunnel.url}\nRequests: ${tunnel.requestCount}\nData: ${this.formatBytes(tunnel.bytesTransferred)}`;
        this.description = `localhost:${tunnel.localPort}`;
        this.contextValue = 'tunnel';

        // Icon based on status
        this.iconPath = new vscode.ThemeIcon(
            tunnel.status === 'active' ? 'vm-running' : 'vm-outline'
        );
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
}

export class TunnelTreeDataProvider implements vscode.TreeDataProvider<TunnelTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TunnelTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private apiClient: PlatformApiClient) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TunnelTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TunnelTreeItem): Promise<TunnelTreeItem[]> {
        if (element) {
            // Show tunnel details
            return [];
        }

        try {
            const tunnels = await this.apiClient.listTunnels(true);
            return tunnels.map(t => new TunnelTreeItem(t, vscode.TreeItemCollapsibleState.None));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load tunnels: ${error}`);
            return [];
        }
    }
}
```

---

## 🎨 UI Updates

### Welcome View (No Token)

```typescript
// Show welcome view when no token configured
{
  "contributes": {
    "viewsWelcome": [
      {
        "view": "localhostTunnelExplorer",
        "contents": "Welcome to HershelsFRP!\n\nTo create tunnels, you need an FRP authentication token.\n\n[Get FRP Token](command:localhostTunnel.getToken)\n\nAlready have a token?\n\n[Enter Token Manually](command:localhostTunnel.enterToken)\n\nNew to HershelsFRP?\n\n[Create Free Account](command:localhostTunnel.createAccount)"
      }
    ]
  }
}
```

### Commands Implementation

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
    const tokenManager = new TokenManager(context);
    const apiClient = new PlatformApiClient(tokenManager);
    const tunnelManager = new HershelsFrpTunnelManager(tokenManager, apiClient);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('localhostTunnel.getToken', async () => {
            await setupToken(tokenManager, apiClient);
        }),

        vscode.commands.registerCommand('localhostTunnel.enterToken', async () => {
            await enterTokenManually(tokenManager);
        }),

        vscode.commands.registerCommand('localhostTunnel.createAccount', () => {
            apiClient.openPlatform('/register');
        }),

        vscode.commands.registerCommand('localhostTunnel.login', async () => {
            await loginAndGetToken(tokenManager, apiClient);
        }),

        vscode.commands.registerCommand('localhostTunnel.manageTokens', () => {
            apiClient.openPlatform('/dashboard/tokens');
        }),

        vscode.commands.registerCommand('localhostTunnel.viewStats', () => {
            apiClient.openPlatform('/dashboard');
        }),

        vscode.commands.registerCommand('localhostTunnel.createTunnel', async (port?: number) => {
            // Your existing tunnel creation logic, but with new token system
            if (!await tokenManager.hasToken()) {
                const setup = await vscode.window.showWarningMessage(
                    'No FRP token configured. Set up now?',
                    'Yes',
                    'No'
                );

                if (setup === 'Yes') {
                    await setupToken(tokenManager, apiClient);
                } else {
                    return;
                }
            }

            // Continue with tunnel creation...
        })
    );

    // Register tree view
    const tunnelTreeProvider = new TunnelTreeDataProvider(apiClient);
    vscode.window.registerTreeDataProvider('localhostTunnelExplorer', tunnelTreeProvider);

    // Refresh tunnels every 30 seconds
    setInterval(() => tunnelTreeProvider.refresh(), 30000);
}
```

---

## ✅ Migration Checklist

- [ ] Remove all hard-coded/shared admin tokens
- [ ] Implement `TokenManager` with SecretStorage API
- [ ] Create `PlatformApiClient` for API integration
- [ ] Add login/registration flows
- [ ] Implement token setup wizard
- [ ] Update tunnel creation to use per-user tokens
- [ ] Add tunnel statistics view
- [ ] Update settings schema in package.json
- [ ] Add "Get Token" and "Manage Tokens" commands
- [ ] Create welcome view for first-time users
- [ ] Test with platform API locally
- [ ] Update documentation and README
- [ ] Add error handling for token expiration
- [ ] Implement token refresh logic
- [ ] Add telemetry (optional, with user consent)

---

## 🚀 Testing

### Local Testing

1. Deploy platform to Azure VM
2. Create test account
3. Generate FRP token
4. Update extension settings
5. Test tunnel creation end-to-end

### Test Cases

- [ ] New user: Create account → Get token → Create tunnel
- [ ] Existing user: Login → Select existing token → Create tunnel
- [ ] Token expired: Show error → Prompt to generate new token
- [ ] Tunnel limit reached: Show error with current usage
- [ ] Invalid token: Clear error message → Redirect to setup
- [ ] Network offline: Graceful degradation → Retry logic
- [ ] Multiple tunnels: All show in sidebar with stats

---

## 📚 User Documentation Updates

### README.md

Update your extension README with:

```markdown
## Setup

### 1. Create HershelsFRP Account

1. Visit [https://tunnel.hershel.dev](https://tunnel.hershel.dev)
2. Click "Get Started" and create a free account
3. You'll receive your first FRP token automatically

### 2. Configure VS Code Extension

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run: `Tunnel: Get FRP Token`
3. Choose:
   - **Login**: Enter your credentials to get token automatically
   - **Open Platform**: Get token from web dashboard
   - **Enter Manually**: Paste token directly

### 3. Create Your First Tunnel

1. Open the port you want to tunnel (e.g., `localhost:3000`)
2. Right-click the port in the sidebar
3. Select "Create Tunnel"
4. Your tunnel URL: `https://username-project-role.tunnel.hershel.dev`

## Features

- ✅ **Personal Tokens**: Each user gets their own secure tokens
- ✅ **Dashboard**: View all active tunnels and usage stats
- ✅ **No Rate Limits**: Free tier includes 10 concurrent tunnels
- ✅ **Persistent URLs**: Same URL every time
- ✅ **WebSocket Support**: Works with Socket.io, Y.js, etc.
- ✅ **Automatic SSL**: HTTPS certificates automatically generated

## Token Management

### View Tokens
Command: `Tunnel: Manage Tokens`
Opens web dashboard showing all your tokens

### Generate New Token
1. Run `Tunnel: Get FRP Token`
2. Choose "Generate New Token"
3. Optionally name it (e.g., "Work Laptop")

### Revoke Token
Visit [https://tunnel.hershel.dev/dashboard/tokens](https://tunnel.hershel.dev/dashboard/tokens)
```

---

## 🎯 Summary

The key changes are:

1. **Remove shared admin token** → Use per-user tokens
2. **Add Platform API client** → For authentication and tunnel management
3. **Implement secure token storage** → VS Code SecretStorage
4. **Add setup wizard** → Easy onboarding for new users
5. **Display tunnel stats** → Show usage in sidebar
6. **Link to platform** → "Get Token" opens web dashboard

This gives users:
- ✅ Secure, personal FRP tokens
- ✅ Easy setup via login or manual entry
- ✅ Token management through web dashboard
- ✅ Real-time tunnel statistics
- ✅ Better error messages and guidance

---

**Need the actual extension code?** If you can provide access to the repository or share the key files, I can make these specific updates directly in the codebase!
