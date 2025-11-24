/**
 * HershelsFRP Platform - Frontend Application
 * Handles authentication, API calls, and UI state
 */

// API Base URL
const API_BASE = window.location.origin + '/api';

// Main Alpine.js app
function app() {
    return {
        // State
        currentView: 'landing',
        user: null,
        token: null,
        showLogin: false,
        showRegister: false,
        loading: false,
        error: null,
        success: null,

        // Dashboard data
        tunnels: [],
        tokens: [],
        stats: {},

        // Initialize
        init() {
            this.checkAuth();
            this.loadFromHash();
        },

        // Check if user is logged in
        checkAuth() {
            const token = localStorage.getItem('token');
            if (token) {
                this.token = token;
                this.loadUser();
            }
        },

        // Load user profile
        async loadUser() {
            try {
                const response = await this.apiCall('/user/profile', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });

                if (response.success) {
                    this.user = response.user;
                    this.stats = response.stats;
                }
            } catch (error) {
                console.error('Failed to load user:', error);
                this.logout();
            }
        },

        // Register new user
        async register(formData) {
            this.loading = true;
            this.error = null;

            try {
                const response = await this.apiCall('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify(formData)
                });

                if (response.success) {
                    this.token = response.token;
                    this.user = response.user;
                    localStorage.setItem('token', response.token);

                    // Show FRP token
                    this.success = `Account created! Your FRP token: ${response.frpToken.token}`;
                    this.showRegister = false;
                    this.currentView = 'dashboard';
                    await this.loadDashboard();
                } else {
                    this.error = response.error;
                }
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },

        // Login existing user
        async login(formData) {
            this.loading = true;
            this.error = null;

            try {
                const response = await this.apiCall('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(formData)
                });

                if (response.success) {
                    this.token = response.token;
                    this.user = response.user;
                    localStorage.setItem('token', response.token);
                    this.showLogin = false;
                    this.currentView = 'dashboard';
                    await this.loadDashboard();
                } else {
                    this.error = response.error;
                }
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },

        // Logout
        logout() {
            this.user = null;
            this.token = null;
            this.tunnels = [];
            this.tokens = [];
            this.stats = {};
            localStorage.removeItem('token');
            this.currentView = 'landing';
        },

        // Load dashboard data
        async loadDashboard() {
            if (!this.token) return;

            try {
                // Load tunnels
                const tunnelsRes = await this.apiCall('/tunnels?active=true', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (tunnelsRes.success) {
                    this.tunnels = tunnelsRes.tunnels;
                }

                // Load tokens
                const tokensRes = await this.apiCall('/tokens', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (tokensRes.success) {
                    this.tokens = tokensRes.tokens;
                }

                // Load stats
                const statsRes = await this.apiCall('/tunnels/stats', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (statsRes.success) {
                    this.stats = statsRes.stats;
                }
            } catch (error) {
                console.error('Failed to load dashboard:', error);
            }
        },

        // Generate new token
        async generateToken(name) {
            this.loading = true;
            this.error = null;

            try {
                const response = await this.apiCall('/tokens', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}` },
                    body: JSON.stringify({ name })
                });

                if (response.success) {
                    this.success = `Token generated: ${response.token.token}`;
                    await this.loadDashboard();
                    return response.token;
                } else {
                    this.error = response.error;
                }
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },

        // Revoke token
        async revokeToken(tokenId) {
            if (!confirm('Are you sure you want to revoke this token?')) return;

            try {
                const response = await this.apiCall(`/tokens/${tokenId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                if (response.success) {
                    this.success = 'Token revoked successfully';
                    await this.loadDashboard();
                } else {
                    this.error = response.error;
                }
            } catch (error) {
                this.error = error.message;
            }
        },

        // Copy to clipboard
        copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            this.success = 'Copied to clipboard!';
            setTimeout(() => this.success = null, 2000);
        },

        // API call helper
        async apiCall(endpoint, options = {}) {
            const url = API_BASE + endpoint;
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const response = await fetch(url, { ...defaultOptions, ...options });
            return await response.json();
        },

        // Load view from URL hash
        loadFromHash() {
            const hash = window.location.hash.substring(1);
            if (hash === 'login') {
                this.showLogin = true;
            } else if (hash === 'register') {
                this.showRegister = true;
            } else if (hash === 'dashboard' && this.token) {
                this.currentView = 'dashboard';
                this.loadDashboard();
            }
        },

        // Format bytes
        formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        // Format date
        formatDate(dateString) {
            if (!dateString) return 'Never';
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 7) {
                return date.toLocaleDateString();
            } else if (days > 0) {
                return `${days}d ago`;
            } else if (hours > 0) {
                return `${hours}h ago`;
            } else if (minutes > 0) {
                return `${minutes}m ago`;
            } else {
                return 'Just now';
            }
        }
    };
}
