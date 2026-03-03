function adminApp() {
  return {
    // Auth
    authenticated: false,
    token: localStorage.getItem('admin_token') || '',
    loginPassword: '',
    loginError: '',

    // Navigation
    currentTab: 'dashboard',

    // Data
    stats: { totalUsers: 0, activeUsers: 0, totalProfiles: 0, messagesSentToday: 0, revenue: { mrr: 0, arr: 0 } },
    users: [],
    agents: [],
    tiers: [],
    logs: [],

    // Filters
    userSearch: '',
    userTierFilter: '',

    // Modals
    showAgentModal: false,
    showTierModal: false,
    showUserModal: false,
    isCreating: false,
    selectedUser: null,

    // Agent form
    agentForm: {
      id: '', name: '', description: '', systemPrompt: '', llmModel: 'claude-sonnet-4-20250514',
      tier: 'free', messageLimit: 100,
      capabilities: {
        basicAssistant: true, memoryBank: false, noteTaking: false, documentCreation: false,
        documentEditing: false, webScraping: false, salesTools: false, startupIdeas: false,
        autonomousActions: false, messagesPerMonth: 100, storageLimit: '100MB', documentLimit: 10, apiAccess: false
      },
      integrations: {
        googleCalendar: false, gmail: false, googleDrive: false, slack: false, notion: false, linkedin: false, customApis: []
      },
      behavior: {
        responseStyle: 'balanced', proactiveAlerts: false, learningEnabled: true, contextRetention: 'daily', autoSummarization: false
      }
    },

    // Tier form
    tierForm: {
      id: '', name: '', slug: '', description: '', priceMonthly: 0, messageLimit: 100,
      features: { basicAssistant: true, memoryBank: false, webScraping: false, salesTools: false, autonomousActions: false, apiAccess: false },
      agentIds: [], sortOrder: 0
    },

    // Lifecycle
    async init() {
      if (this.token) {
        try {
          await this.api('GET', '/stats');
          this.authenticated = true;
          await this.loadDashboard();
        } catch {
          this.token = '';
          localStorage.removeItem('admin_token');
        }
      }
    },

    // API helper
    async api(method, path, body) {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch('/api/admin' + path, opts);
      if (res.status === 401) { this.logout(); throw new Error('Unauthorized'); }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
      return res.json();
    },

    // Auth
    async login() {
      this.loginError = '';
      try {
        const data = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: this.loginPassword }),
        }).then(r => r.json());
        if (data.success) {
          this.token = data.token;
          localStorage.setItem('admin_token', data.token);
          this.authenticated = true;
          this.loginPassword = '';
          await this.loadDashboard();
        } else {
          this.loginError = data.error || 'Invalid password';
        }
      } catch (e) {
        this.loginError = 'Connection failed';
      }
    },

    logout() {
      this.token = '';
      this.authenticated = false;
      localStorage.removeItem('admin_token');
    },

    // Data loading
    async loadDashboard() {
      try {
        const [stats, agents, tiers] = await Promise.all([
          this.api('GET', '/stats'),
          this.api('GET', '/agents'),
          this.api('GET', '/tiers'),
        ]);
        this.stats = stats;
        this.agents = agents;
        this.tiers = tiers;
      } catch (e) { console.error('Failed to load dashboard:', e); }
    },

    async loadUsers() {
      try {
        let query = '/users?limit=100';
        if (this.userSearch) query += '&search=' + encodeURIComponent(this.userSearch);
        if (this.userTierFilter) query += '&tier=' + this.userTierFilter;
        this.users = await this.api('GET', query);
      } catch (e) { console.error('Failed to load users:', e); }
    },

    async loadAgents() {
      try { this.agents = await this.api('GET', '/agents'); } catch (e) { console.error(e); }
    },

    async loadTiers() {
      try { this.tiers = await this.api('GET', '/tiers'); } catch (e) { console.error(e); }
    },

    async loadLogs() {
      try { this.logs = await this.api('GET', '/logs?limit=50'); } catch (e) { console.error(e); }
    },

    // Tab switching
    async switchTab(tab) {
      this.currentTab = tab;
      if (tab === 'users') await this.loadUsers();
      if (tab === 'agents') await this.loadAgents();
      if (tab === 'tiers') await this.loadTiers();
      if (tab === 'logs') await this.loadLogs();
      if (tab === 'dashboard') await this.loadDashboard();
    },

    // Agent CRUD
    newAgent() {
      this.isCreating = true;
      this.agentForm = {
        id: '', name: '', description: '', systemPrompt: '', llmModel: 'claude-sonnet-4-20250514',
        tier: 'free', messageLimit: 100,
        capabilities: {
          basicAssistant: true, memoryBank: false, noteTaking: false, documentCreation: false,
          documentEditing: false, webScraping: false, salesTools: false, startupIdeas: false,
          autonomousActions: false, messagesPerMonth: 100, storageLimit: '100MB', documentLimit: 10, apiAccess: false
        },
        integrations: {
          googleCalendar: false, gmail: false, googleDrive: false, slack: false, notion: false, linkedin: false, customApis: []
        },
        behavior: {
          responseStyle: 'balanced', proactiveAlerts: false, learningEnabled: true, contextRetention: 'daily', autoSummarization: false
        }
      };
      this.showAgentModal = true;
    },

    editAgent(agent) {
      this.isCreating = false;
      this.agentForm = JSON.parse(JSON.stringify(agent));
      this.showAgentModal = true;
    },

    async saveAgent() {
      try {
        if (this.isCreating) {
          await this.api('POST', '/agents', this.agentForm);
        } else {
          await this.api('PUT', '/agents/' + this.agentForm.id, this.agentForm);
        }
        this.showAgentModal = false;
        await this.loadAgents();
      } catch (e) { alert('Error saving agent: ' + e.message); }
    },

    async deleteAgent(id) {
      if (!confirm('Delete this agent?')) return;
      try {
        await this.api('DELETE', '/agents/' + id);
        await this.loadAgents();
      } catch (e) { alert('Error: ' + e.message); }
    },

    // Tier CRUD
    newTier() {
      this.isCreating = true;
      this.tierForm = {
        id: '', name: '', slug: '', description: '', priceMonthly: 0, messageLimit: 100,
        features: { basicAssistant: true, memoryBank: false, webScraping: false, salesTools: false, autonomousActions: false, apiAccess: false },
        agentIds: [], sortOrder: 0
      };
      this.showTierModal = true;
    },

    editTier(tier) {
      this.isCreating = false;
      this.tierForm = JSON.parse(JSON.stringify(tier));
      this.showTierModal = true;
    },

    async saveTier() {
      try {
        if (this.isCreating) {
          await this.api('POST', '/tiers', this.tierForm);
        } else {
          await this.api('PUT', '/tiers/' + this.tierForm.id, this.tierForm);
        }
        this.showTierModal = false;
        await this.loadTiers();
      } catch (e) { alert('Error saving tier: ' + e.message); }
    },

    async deleteTier(id) {
      if (!confirm('Delete this tier?')) return;
      try {
        await this.api('DELETE', '/tiers/' + id);
        await this.loadTiers();
      } catch (e) { alert('Error: ' + e.message); }
    },

    // User actions
    viewUser(user) {
      this.selectedUser = JSON.parse(JSON.stringify(user));
      this.showUserModal = true;
    },

    async updateUser(userId, updates) {
      try {
        await this.api('PUT', '/users/' + userId, updates);
        this.showUserModal = false;
        await this.loadUsers();
      } catch (e) { alert('Error: ' + e.message); }
    },

    // Helpers
    getAgentName(profileId) {
      const agent = this.agents.find(a => a.id === profileId);
      return agent ? agent.name : 'None';
    },

    tierBadgeClass(tier) {
      return { free: 'badge-free', pro: 'badge-pro', enterprise: 'badge-enterprise' }[tier] || 'badge-free';
    },

    formatDate(d) {
      if (!d) return 'N/A';
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    formatCurrency(amount) {
      return '$' + parseFloat(amount || 0).toFixed(2);
    },

    toggleTierAgent(agentId) {
      const idx = this.tierForm.agentIds.indexOf(agentId);
      if (idx >= 0) {
        this.tierForm.agentIds.splice(idx, 1);
      } else {
        this.tierForm.agentIds.push(agentId);
      }
    },
  };
}
