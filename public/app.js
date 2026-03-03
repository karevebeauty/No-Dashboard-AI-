let statusData = null;
let healthData = null;
let logEntries = [];
let agentsCache = [];
let tiersCache = [];
let usersCache = [];
let securitySettings = null;

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    statusData = await res.json();
    return statusData;
  } catch (e) {
    console.error('Failed to fetch status:', e);
    return null;
  }
}

async function fetchHealth() {
  try {
    const res = await fetch('/health');
    healthData = await res.json();
    return healthData;
  } catch (e) {
    console.error('Failed to fetch health:', e);
    return null;
  }
}

async function apiCall(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour12: false });
}

function formatDate(date) {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateServerStatus() {
  const indicator = document.getElementById('serverStatus');
  const dot = indicator.querySelector('.status-dot');
  const text = indicator.querySelector('.status-text');

  if (!statusData) {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline';
    return;
  }

  const activeCount = Object.values(statusData.services).filter(
    s => s === 'connected' || s === 'configured'
  ).length;

  if (activeCount >= 3) {
    dot.className = 'status-dot online';
    text.textContent = 'Online';
  } else if (activeCount > 0) {
    dot.className = 'status-dot degraded';
    text.textContent = 'Degraded';
  } else {
    dot.className = 'status-dot degraded';
    text.textContent = 'Limited';
  }
}

function updateOverviewStats() {
  if (!statusData) return;

  document.getElementById('uptimeValue').textContent = formatUptime(statusData.uptime);

  const services = statusData.services;
  const active = Object.values(services).filter(s => s === 'connected' || s === 'configured').length;
  const total = Object.keys(services).length;
  document.getElementById('activeServicesValue').textContent = `${active}/${total}`;

  const twilioStatus = services.twilio;
  document.getElementById('smsStatusValue').textContent =
    twilioStatus === 'configured' ? 'Active' : 'Inactive';

  if (healthData) {
    const h = healthData.status;
    document.getElementById('healthValue').textContent =
      h.charAt(0).toUpperCase() + h.slice(1);
  } else {
    document.getElementById('healthValue').textContent = 'Unknown';
  }

  document.getElementById('envBadge').textContent = statusData.environment;
  document.getElementById('envBadge').className =
    'env-badge' + (statusData.environment === 'development' ? ' development' : '');
}

function renderServiceStatus() {
  if (!statusData) return;

  const container = document.getElementById('serviceStatusList');
  const services = [
    { key: 'database', name: 'PostgreSQL', icon: 'DB', color: '#3e6ae1', desc: 'Database storage' },
    { key: 'redis', name: 'Redis', icon: 'R', color: '#e82127', desc: 'Cache & sessions' },
    { key: 'twilio', name: 'Twilio', icon: 'T', color: '#7c3aed', desc: 'SMS messaging' },
    { key: 'claude', name: 'Claude AI', icon: 'C', color: '#f79009', desc: 'AI processing' },
  ];

  container.innerHTML = services.map(s => {
    const status = statusData.services[s.key];
    const statusClass = status.replace(' ', '-');
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    return `
      <div class="service-row">
        <div class="service-info">
          <div class="service-icon" style="background: ${s.color}12; color: ${s.color}">${s.icon}</div>
          <div>
            <div class="service-name">${s.name}</div>
            <div class="service-desc">${s.desc}</div>
          </div>
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
    `;
  }).join('');
}

function renderServicesPage() {
  if (!statusData) return;

  const services = [
    { key: 'database', name: 'PostgreSQL Database', icon: 'DB', color: '#3e6ae1',
      desc: 'Primary data storage for conversations, users, and system state.',
      envVars: ['DATABASE_URL'] },
    { key: 'redis', name: 'Redis Cache', icon: 'R', color: '#e82127',
      desc: 'In-memory caching for sessions, rate limiting, and real-time data.',
      envVars: ['REDIS_URL', 'REDIS_PASSWORD'] },
    { key: 'twilio', name: 'Twilio SMS', icon: 'T', color: '#7c3aed',
      desc: 'SMS messaging service for sending and receiving text messages.',
      envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
    { key: 'claude', name: 'Claude AI (Anthropic)', icon: 'C', color: '#f79009',
      desc: 'AI language model for processing and responding to messages.',
      envVars: ['ANTHROPIC_API_KEY'] },
  ];

  const container = document.getElementById('servicesDetailList');
  container.innerHTML = services.map(s => {
    const status = statusData.services[s.key] || 'not configured';
    const statusClass = status.replace(' ', '-');
    return `
      <div class="service-row">
        <div class="service-info">
          <div class="service-icon" style="background: ${s.color}12; color: ${s.color}">${s.icon}</div>
          <div>
            <div class="service-name">${s.name}</div>
            <div class="service-desc">${s.desc}</div>
            <div style="margin-top: 4px; font-size: 11px; color: var(--text-muted); font-family: monospace;">
              ${s.envVars.join(', ')}
            </div>
          </div>
        </div>
        <span class="status-badge ${statusClass}">${status}</span>
      </div>
    `;
  }).join('');

  const active = Object.values(statusData.services).filter(s => s === 'connected' || s === 'configured').length;
  document.getElementById('serviceSummaryBadge').textContent = `${active} active`;

  renderSetupGuide();
}

function renderSetupGuide() {
  if (!statusData) return;
  const container = document.getElementById('setupGuide');
  const services = statusData.services;

  const steps = [
    { done: services.database === 'connected', title: 'Database Connected',
      desc: 'Set DATABASE_URL to connect PostgreSQL.' },
    { done: services.redis === 'connected', title: 'Redis Connected',
      desc: 'Set REDIS_URL for caching and session management.' },
    { done: services.twilio === 'configured', title: 'Configure Twilio',
      desc: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.' },
    { done: services.claude === 'configured', title: 'Configure Claude AI',
      desc: 'Set ANTHROPIC_API_KEY to enable AI-powered responses.' },
  ];

  container.innerHTML = steps.map((step, i) => `
    <div class="setup-step">
      <div class="step-number ${step.done ? 'done' : ''}">${step.done ? '&#10003;' : i + 1}</div>
      <div class="step-content">
        <div class="step-title">${step.title}</div>
        <div class="step-desc">${step.desc}</div>
      </div>
    </div>
  `).join('');
}

function renderConfigInfo() {
  if (!statusData) return;
  const container = document.getElementById('configInfo');
  const items = [
    { label: 'Environment', value: statusData.environment },
    { label: 'Port', value: statusData.port },
    { label: 'Host', value: statusData.host },
    { label: 'Node.js', value: statusData.nodeVersion },
    { label: 'Memory', value: statusData.memory },
    { label: 'PID', value: statusData.pid },
  ];

  container.innerHTML = `<div class="config-grid">${items.map(item => `
    <div class="config-item">
      <div class="config-label">${item.label}</div>
      <div class="config-value">${item.value}</div>
    </div>
  `).join('')}</div>`;
}

function addLogEntry(level, message) {
  const now = new Date();
  logEntries.push({ time: now, level, message });
  if (logEntries.length > 200) logEntries = logEntries.slice(-200);
  renderLogs();
}

function renderLogs() {
  const container = document.getElementById('logViewer');
  container.innerHTML = logEntries.map(entry => `
    <div class="log-entry log-${entry.level}">
      <span class="log-time">${formatTime(entry.time)}</span>
      <span class="log-level">${entry.level.toUpperCase()}</span>
      <span class="log-message">${entry.message}</span>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function renderEnvVars() {
  if (!statusData) return;
  const container = document.getElementById('envVarsList');
  const vars = [
    { name: 'DATABASE_URL', set: statusData.services.database !== 'not connected' && statusData.services.database !== 'not configured' },
    { name: 'REDIS_URL', set: false },
    { name: 'TWILIO_ACCOUNT_SID', set: statusData.services.twilio === 'configured' },
    { name: 'TWILIO_AUTH_TOKEN', set: statusData.services.twilio === 'configured' },
    { name: 'TWILIO_PHONE_NUMBER', set: statusData.services.twilio === 'configured' },
    { name: 'ANTHROPIC_API_KEY', set: statusData.services.claude === 'configured' },
    { name: 'AUTHORIZED_PHONE_NUMBERS', set: statusData.authorizedNumbers > 0 },
  ];

  container.innerHTML = vars.map(v => `
    <div class="env-var-row">
      <span class="env-var-name">${v.name}</span>
      <span class="env-var-status ${v.set ? 'set' : 'missing'}">${v.set ? 'Set' : 'Missing'}</span>
    </div>
  `).join('');
}

function renderServerInfo() {
  if (!statusData) return;
  const container = document.getElementById('serverInfoCard');
  const items = [
    { label: 'Environment', value: statusData.environment },
    { label: 'Port', value: statusData.port },
    { label: 'Host', value: statusData.host },
    { label: 'Node.js', value: statusData.nodeVersion },
    { label: 'Memory Usage', value: statusData.memory },
    { label: 'Process ID', value: statusData.pid },
    { label: 'Uptime', value: formatUptime(statusData.uptime) },
    { label: 'Platform', value: statusData.platform },
  ];

  container.innerHTML = `<div class="server-info-grid">${items.map(i => `
    <div class="info-item">
      <div class="info-label">${i.label}</div>
      <div class="info-value">${i.value}</div>
    </div>
  `).join('')}</div>`;
}

async function fetchAgents() {
  try {
    agentsCache = await apiCall('GET', '/api/admin/agents');
  } catch (e) {
    agentsCache = [];
    addLogEntry('warn', 'Could not load agents: ' + e.message);
  }
}

async function fetchTiers() {
  try {
    tiersCache = await apiCall('GET', '/api/admin/tiers');
  } catch (e) {
    tiersCache = [];
  }
}

async function fetchUsers() {
  try {
    const search = document.getElementById('userSearch')?.value || '';
    const tier = document.getElementById('userTierFilter')?.value || '';
    let url = '/api/admin/users?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (tier) url += `&tier=${encodeURIComponent(tier)}`;
    usersCache = await apiCall('GET', url);
  } catch (e) {
    usersCache = [];
    addLogEntry('warn', 'Could not load users: ' + e.message);
  }
}

async function fetchSecuritySettings() {
  try {
    securitySettings = await apiCall('GET', '/api/admin/security-settings');
  } catch (e) {
    securitySettings = null;
    addLogEntry('warn', 'Could not load security settings: ' + e.message);
  }
}

function getAgentName(profileId) {
  if (!profileId) return '--';
  const agent = agentsCache.find(a => a.id === profileId);
  return agent ? agent.name : profileId.substring(0, 8) + '...';
}

function renderAgents() {
  const container = document.getElementById('agentsGrid');
  const search = (document.getElementById('agentSearch')?.value || '').toLowerCase();
  const filtered = agentsCache.filter(a =>
    !search || a.name.toLowerCase().includes(search) || (a.description || '').toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <h3>No agents configured</h3>
        <p>Create your first agent to get started. Agents are AI assistants assigned to users based on their needs.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(agent => {
    const caps = agent.capabilities || {};
    const enabledCaps = Object.entries(caps).filter(([_, v]) => v === true).map(([k]) => k);

    return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div>
            <div class="agent-card-title">${agent.name}</div>
            <div class="agent-card-meta">
              <span class="tier-badge ${agent.tier}">${agent.tier}</span>
              <span class="agent-model">${agent.llmModel || 'claude-sonnet-4-20250514'}</span>
            </div>
          </div>
        </div>
        <div class="agent-card-desc">${agent.description || 'No description'}</div>
        ${enabledCaps.length > 0 ? `
          <div class="caps-list">
            ${enabledCaps.slice(0, 6).map(c => `<span class="cap-tag enabled">${c}</span>`).join('')}
            ${enabledCaps.length > 6 ? `<span class="cap-tag">+${enabledCaps.length - 6}</span>` : ''}
          </div>
        ` : ''}
        <div class="agent-card-footer">
          <span style="font-size:11px;color:var(--text-muted);">Limit: ${agent.messageLimit || 100} msgs/mo</span>
          <div class="agent-card-actions">
            <button class="btn btn-sm" onclick="openEditAgentModal('${agent.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteAgent('${agent.id}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openCreateAgentModal() {
  const tierOptions = tiersCache.map(t => `<option value="${t.slug}">${t.name}</option>`).join('');
  const modalHtml = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2>Create New Agent</h2>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Agent Name</label>
            <input type="text" class="form-input" id="agent-name" placeholder="e.g. Sales Assistant">
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-textarea" id="agent-description" placeholder="Describe what this agent does..."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">LLM Model</label>
              <select class="form-select" id="agent-llm">
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Subscription Tier</label>
              <select class="form-select" id="agent-tier">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
                ${tierOptions}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Message Limit (per month)</label>
            <input type="number" class="form-input" id="agent-limit" value="100">
          </div>
          <div class="form-group">
            <label class="form-label">System Prompt</label>
            <textarea class="form-textarea" id="agent-prompt" rows="4" placeholder="Instructions for the AI agent..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Capabilities</label>
            <div class="form-hint" style="margin-bottom:8px;">Select which features this agent can use</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${['basicAssistant','memoryBank','webScraping','salesTools','autonomousActions','noteTaking'].map(cap => `
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                  <input type="checkbox" class="agent-cap" value="${cap}"> ${cap}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createAgent()">Create Agent</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalContainer').innerHTML = modalHtml;
}

async function createAgent() {
  const caps = {};
  document.querySelectorAll('.agent-cap').forEach(cb => {
    caps[cb.value] = cb.checked;
  });

  const data = {
    name: document.getElementById('agent-name').value,
    description: document.getElementById('agent-description').value,
    llmModel: document.getElementById('agent-llm').value,
    tier: document.getElementById('agent-tier').value,
    messageLimit: parseInt(document.getElementById('agent-limit').value) || 100,
    systemPrompt: document.getElementById('agent-prompt').value,
    capabilities: caps,
  };

  if (!data.name) { showToast('Agent name is required', 'error'); return; }

  try {
    await apiCall('POST', '/api/admin/agents', data);
    closeModal();
    showToast('Agent created successfully');
    await fetchAgents();
    renderAgents();
  } catch (e) {
    showToast('Failed to create agent: ' + e.message, 'error');
  }
}

function openEditAgentModal(agentId) {
  const agent = agentsCache.find(a => a.id === agentId);
  if (!agent) return;

  const caps = agent.capabilities || {};
  const tierOptions = tiersCache.map(t => `<option value="${t.slug}" ${t.slug === agent.tier ? 'selected' : ''}>${t.name}</option>`).join('');

  const modalHtml = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2>Edit Agent</h2>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Agent Name</label>
            <input type="text" class="form-input" id="agent-name" value="${agent.name || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-textarea" id="agent-description">${agent.description || ''}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">LLM Model</label>
              <select class="form-select" id="agent-llm">
                <option value="claude-sonnet-4-20250514" ${agent.llmModel === 'claude-sonnet-4-20250514' ? 'selected' : ''}>Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514" ${agent.llmModel === 'claude-opus-4-20250514' ? 'selected' : ''}>Claude Opus 4</option>
                <option value="claude-3-5-haiku-20241022" ${agent.llmModel === 'claude-3-5-haiku-20241022' ? 'selected' : ''}>Claude 3.5 Haiku</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Subscription Tier</label>
              <select class="form-select" id="agent-tier">
                <option value="free" ${agent.tier === 'free' ? 'selected' : ''}>Free</option>
                <option value="pro" ${agent.tier === 'pro' ? 'selected' : ''}>Pro</option>
                <option value="enterprise" ${agent.tier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                ${tierOptions}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Message Limit (per month)</label>
            <input type="number" class="form-input" id="agent-limit" value="${agent.messageLimit || 100}">
          </div>
          <div class="form-group">
            <label class="form-label">System Prompt</label>
            <textarea class="form-textarea" id="agent-prompt" rows="4">${agent.systemPrompt || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Capabilities</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${['basicAssistant','memoryBank','webScraping','salesTools','autonomousActions','noteTaking'].map(cap => `
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                  <input type="checkbox" class="agent-cap" value="${cap}" ${caps[cap] ? 'checked' : ''}> ${cap}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="updateAgent('${agentId}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalContainer').innerHTML = modalHtml;
}

async function updateAgent(agentId) {
  const caps = {};
  document.querySelectorAll('.agent-cap').forEach(cb => {
    caps[cb.value] = cb.checked;
  });

  const data = {
    name: document.getElementById('agent-name').value,
    description: document.getElementById('agent-description').value,
    llmModel: document.getElementById('agent-llm').value,
    tier: document.getElementById('agent-tier').value,
    messageLimit: parseInt(document.getElementById('agent-limit').value) || 100,
    systemPrompt: document.getElementById('agent-prompt').value,
    capabilities: caps,
  };

  try {
    await apiCall('PUT', `/api/admin/agents/${agentId}`, data);
    closeModal();
    showToast('Agent updated successfully');
    await fetchAgents();
    renderAgents();
  } catch (e) {
    showToast('Failed to update agent: ' + e.message, 'error');
  }
}

async function deleteAgent(agentId) {
  if (!confirm('Are you sure you want to delete this agent?')) return;
  try {
    await apiCall('DELETE', `/api/admin/agents/${agentId}`);
    showToast('Agent deleted');
    await fetchAgents();
    renderAgents();
  } catch (e) {
    showToast('Failed to delete agent: ' + e.message, 'error');
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  const badge = document.getElementById('userCountBadge');
  badge.textContent = `${usersCache.length} users`;

  if (usersCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><h3>No users found</h3><p>Users will appear here when they text your agent number.</p></td></tr>`;
    return;
  }

  tbody.innerHTML = usersCache.map(user => {
    let statusClass = 'active';
    let statusText = 'Active';
    if (user.isLocked) { statusClass = 'locked'; statusText = 'Locked'; }
    else if (!user.isActive) { statusClass = 'inactive'; statusText = 'Inactive'; }

    return `
      <tr>
        <td class="mono">${user.phoneNumber || '--'}</td>
        <td>${user.name || '--'}</td>
        <td>${user.email || '--'}</td>
        <td>${getAgentName(user.assistantProfileId)}</td>
        <td><span class="tier-badge ${user.subscriptionTier}">${user.subscriptionTier}</span></td>
        <td>${formatDate(user.lastActivity || user.updatedAt)}</td>
        <td><span class="user-status ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-sm" onclick="openEditUserModal('${user.id}')">Edit</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditUserModal(userId) {
  const user = usersCache.find(u => u.id === userId);
  if (!user) return;

  const agentOptions = agentsCache.map(a =>
    `<option value="${a.id}" ${a.id === user.assistantProfileId ? 'selected' : ''}>${a.name}</option>`
  ).join('');

  const modalHtml = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2>Edit User</h2>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" class="form-input" value="${user.phoneNumber}" disabled style="opacity:0.6;">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" class="form-input" value="${user.name || ''}" disabled style="opacity:0.6;">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="text" class="form-input" value="${user.email || ''}" disabled style="opacity:0.6;">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Assigned Agent</label>
              <select class="form-select" id="user-agent">
                <option value="">-- None --</option>
                ${agentOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Subscription Tier</label>
              <select class="form-select" id="user-tier">
                <option value="free" ${user.subscriptionTier === 'free' ? 'selected' : ''}>Free</option>
                <option value="pro" ${user.subscriptionTier === 'pro' ? 'selected' : ''}>Pro</option>
                <option value="enterprise" ${user.subscriptionTier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Active</label>
              <select class="form-select" id="user-active">
                <option value="true" ${user.isActive ? 'selected' : ''}>Yes</option>
                <option value="false" ${!user.isActive ? 'selected' : ''}>No</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Locked</label>
              <select class="form-select" id="user-locked">
                <option value="false" ${!user.isLocked ? 'selected' : ''}>No</option>
                <option value="true" ${user.isLocked ? 'selected' : ''}>Yes</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:8px;">
            <label class="form-label">Activity Summary</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="config-item">
                <div class="config-label">Messages This Month</div>
                <div class="config-value">${user.usage?.messagesThisMonth || 0}</div>
              </div>
              <div class="config-item">
                <div class="config-label">Security Level</div>
                <div class="config-value">${user.securityLevel || 'standard'}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="updateUser('${userId}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalContainer').innerHTML = modalHtml;
}

async function updateUser(userId) {
  const agentVal = document.getElementById('user-agent').value;
  const data = {
    assistantProfileId: agentVal === '' ? null : agentVal,
    tier: document.getElementById('user-tier').value,
    isActive: document.getElementById('user-active').value === 'true',
    isLocked: document.getElementById('user-locked').value === 'true',
  };

  try {
    await apiCall('PUT', `/api/admin/users/${userId}`, data);
    closeModal();
    showToast('User updated successfully');
    await fetchUsers();
    renderUsers();
  } catch (e) {
    showToast('Failed to update user: ' + e.message, 'error');
  }
}

function renderSecuritySettings() {
  if (!securitySettings) return;
  const s = securitySettings;

  document.getElementById('sec-timeout-standard').value = s.sessionTimeout?.standard || 480;
  document.getElementById('sec-timeout-high').value = s.sessionTimeout?.high || 120;
  document.getElementById('sec-timeout-maximum').value = s.sessionTimeout?.maximum || 30;

  document.getElementById('sec-idle-standard').value = s.inactivityThreshold?.standard || 60;
  document.getElementById('sec-idle-high').value = s.inactivityThreshold?.high || 30;
  document.getElementById('sec-idle-maximum').value = s.inactivityThreshold?.maximum || 15;

  const setToggle = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.className = 'toggle' + (val ? ' active' : '');
  };
  setToggle('sec-reauth-inactivity', s.reauthRequired?.afterInactivity !== false);
  setToggle('sec-reauth-timeout', s.reauthRequired?.afterTimeout !== false);
  setToggle('sec-reauth-daily', s.reauthRequired?.dailyReauth === true);

  document.getElementById('sec-reauth-maxfails').value = s.reauthRequired?.afterFailedAttempts || 3;

  document.getElementById('sec-passcode-length').value = s.passcode?.length || 6;
  document.getElementById('sec-passcode-expiry').value = s.passcode?.expiryMinutes || 10;
  document.getElementById('sec-passcode-maxattempts').value = s.passcode?.maxAttempts || 3;
  document.getElementById('sec-passcode-cooldown').value = s.passcode?.cooldownMinutes || 15;
}

function collectSecuritySettings() {
  return {
    sessionTimeout: {
      standard: parseInt(document.getElementById('sec-timeout-standard').value) || 480,
      high: parseInt(document.getElementById('sec-timeout-high').value) || 120,
      maximum: parseInt(document.getElementById('sec-timeout-maximum').value) || 30,
    },
    inactivityThreshold: {
      standard: parseInt(document.getElementById('sec-idle-standard').value) || 60,
      high: parseInt(document.getElementById('sec-idle-high').value) || 30,
      maximum: parseInt(document.getElementById('sec-idle-maximum').value) || 15,
    },
    reauthRequired: {
      afterInactivity: document.getElementById('sec-reauth-inactivity').classList.contains('active'),
      afterTimeout: document.getElementById('sec-reauth-timeout').classList.contains('active'),
      afterFailedAttempts: parseInt(document.getElementById('sec-reauth-maxfails').value) || 3,
      dailyReauth: document.getElementById('sec-reauth-daily').classList.contains('active'),
    },
    passcode: {
      length: parseInt(document.getElementById('sec-passcode-length').value) || 6,
      expiryMinutes: parseInt(document.getElementById('sec-passcode-expiry').value) || 10,
      maxAttempts: parseInt(document.getElementById('sec-passcode-maxattempts').value) || 3,
      cooldownMinutes: parseInt(document.getElementById('sec-passcode-cooldown').value) || 15,
    },
  };
}

async function saveSecuritySettings() {
  const settings = collectSecuritySettings();
  try {
    await apiCall('PUT', '/api/admin/security-settings', settings);
    showToast('Security settings saved');
    securitySettings = settings;
  } catch (e) {
    showToast('Failed to save settings: ' + e.message, 'error');
  }
}

function closeModal() {
  document.getElementById('modalContainer').innerHTML = '';
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);

  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    overview: 'Overview',
    agents: 'Agents',
    users: 'Users',
    security: 'Security',
    services: 'Services',
    messages: 'Messages',
    logs: 'System Logs',
    settings: 'Settings',
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'agents') { fetchAgents().then(renderAgents); fetchTiers(); }
  if (page === 'users') { fetchAgents().then(() => fetchUsers().then(renderUsers)); }
  if (page === 'security') { fetchSecuritySettings().then(renderSecuritySettings); }
}

window.navigateTo = navigateTo;
window.openCreateAgentModal = openCreateAgentModal;
window.openEditAgentModal = openEditAgentModal;
window.createAgent = createAgent;
window.updateAgent = updateAgent;
window.deleteAgent = deleteAgent;
window.openEditUserModal = openEditUserModal;
window.updateUser = updateUser;
window.closeModal = closeModal;

async function refreshAll() {
  addLogEntry('info', 'Refreshing dashboard data...');
  await Promise.all([fetchStatus(), fetchHealth()]);

  if (statusData) {
    updateServerStatus();
    updateOverviewStats();
    renderServiceStatus();
    renderServicesPage();
    renderConfigInfo();
    renderEnvVars();
    renderServerInfo();
    addLogEntry('info', `Server running - uptime: ${formatUptime(statusData.uptime)}`);
  } else {
    addLogEntry('error', 'Failed to connect to server');
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const page = item.dataset.page;
    if (page) navigateTo(page);
  });
});

document.getElementById('refreshBtn').addEventListener('click', refreshAll);
document.getElementById('clearLogsBtn').addEventListener('click', () => {
  logEntries = [];
  renderLogs();
});

document.getElementById('createAgentBtn').addEventListener('click', openCreateAgentModal);

document.getElementById('saveSecurityBtn').addEventListener('click', saveSecuritySettings);

document.querySelectorAll('.toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
  });
});

let userSearchTimeout;
const userSearchEl = document.getElementById('userSearch');
const userTierEl = document.getElementById('userTierFilter');
if (userSearchEl) {
  userSearchEl.addEventListener('input', () => {
    clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(() => { fetchUsers().then(renderUsers); }, 300);
  });
}
if (userTierEl) {
  userTierEl.addEventListener('change', () => { fetchUsers().then(renderUsers); });
}

let agentSearchTimeout;
const agentSearchEl = document.getElementById('agentSearch');
if (agentSearchEl) {
  agentSearchEl.addEventListener('input', () => {
    clearTimeout(agentSearchTimeout);
    agentSearchTimeout = setTimeout(renderAgents, 200);
  });
}

refreshAll();
setInterval(refreshAll, 15000);
