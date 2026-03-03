let statusData = null;
let healthData = null;
let logEntries = [];

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
    { key: 'database', name: 'PostgreSQL', icon: 'DB', color: 'var(--accent-blue)', desc: 'Database storage' },
    { key: 'redis', name: 'Redis', icon: 'R', color: 'var(--accent-red)', desc: 'Cache & sessions' },
    { key: 'twilio', name: 'Twilio', icon: 'T', color: 'var(--accent-purple)', desc: 'SMS messaging' },
    { key: 'claude', name: 'Claude AI', icon: 'C', color: 'var(--accent-orange)', desc: 'AI processing' },
  ];

  container.innerHTML = services.map(s => {
    const status = statusData.services[s.key];
    const statusClass = status.replace(' ', '-');
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    return `
      <div class="service-row">
        <div class="service-info">
          <div class="service-icon" style="background: ${s.color}20; color: ${s.color}">${s.icon}</div>
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
    { key: 'database', name: 'PostgreSQL Database', icon: 'DB', color: 'var(--accent-blue)',
      desc: 'Primary data storage for conversations, users, and system state.',
      envVars: ['DATABASE_URL'] },
    { key: 'redis', name: 'Redis Cache', icon: 'R', color: 'var(--accent-red)',
      desc: 'In-memory caching for sessions, rate limiting, and real-time data.',
      envVars: ['REDIS_URL', 'REDIS_PASSWORD'] },
    { key: 'twilio', name: 'Twilio SMS', icon: 'T', color: 'var(--accent-purple)',
      desc: 'SMS messaging service for sending and receiving text messages.',
      envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'TWILIO_WEBHOOK_URL'] },
    { key: 'claude', name: 'Claude AI (Anthropic)', icon: 'C', color: 'var(--accent-orange)',
      desc: 'AI language model for processing and responding to messages.',
      envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_MODEL'] },
    { key: 'notifications', name: 'Notification Service', icon: 'N', color: 'var(--accent-green)',
      desc: 'Automated notifications and alerts via SMS.',
      envVars: ['ENABLE_NOTIFICATIONS'] },
    { key: 'security', name: 'Security & Auth', icon: 'S', color: 'var(--accent-yellow)',
      desc: 'Phone number authorization and encryption.',
      envVars: ['AUTHORIZED_PHONE_NUMBERS', 'ENCRYPTION_KEY'] },
  ];

  const container = document.getElementById('servicesDetailList');
  container.innerHTML = services.map(s => {
    const status = statusData.services[s.key] || (s.key === 'notifications' ? 'configured' : 'not configured');
    const statusClass = status.replace(' ', '-');
    return `
      <div class="service-row">
        <div class="service-info">
          <div class="service-icon" style="background: ${s.color}20; color: ${s.color}">${s.icon}</div>
          <div>
            <div class="service-name">${s.name}</div>
            <div class="service-desc">${s.desc}</div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); font-family: monospace;">
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
    { done: statusData.authorizedNumbers > 0, title: 'Add Authorized Numbers',
      desc: 'Set AUTHORIZED_PHONE_NUMBERS with allowed phone numbers.' },
    { done: false, title: 'Set Encryption Key',
      desc: 'Set ENCRYPTION_KEY (32 characters) for data encryption.' },
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

function renderIntegrations() {
  if (!statusData) return;
  const container = document.getElementById('integrationsGrid');
  const integrations = [
    { name: 'Google Workspace', icon: 'G', color: 'var(--accent-blue)',
      configured: statusData.integrations.google,
      desc: 'Calendar, Gmail, and Drive integration for productivity.',
      env: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN' },
    { name: 'Notion', icon: 'N', color: 'var(--text-primary)',
      configured: statusData.integrations.notion,
      desc: 'Connect to Notion for notes, databases, and knowledge base.',
      env: 'NOTION_API_KEY' },
    { name: 'Slack', icon: 'S', color: 'var(--accent-purple)',
      configured: statusData.integrations.slack,
      desc: 'Send and receive messages through Slack channels.',
      env: 'SLACK_BOT_TOKEN' },
    { name: 'ERP System', icon: 'E', color: 'var(--accent-green)',
      configured: statusData.integrations.erp,
      desc: 'Enterprise resource planning for inventory and orders.',
      env: 'ERP_API_URL, ERP_API_KEY' },
  ];

  container.innerHTML = integrations.map(i => `
    <div class="integration-card">
      <div class="integration-header">
        <div class="integration-title">
          <div class="integration-icon" style="background: ${i.color}20; color: ${i.color}">${i.icon}</div>
          <span class="integration-name">${i.name}</span>
        </div>
        <span class="status-badge ${i.configured ? 'configured' : 'not-configured'}">
          ${i.configured ? 'Configured' : 'Not Configured'}
        </span>
      </div>
      <div class="integration-desc">${i.desc}</div>
      <div class="integration-env">${i.env}</div>
    </div>
  `).join('');
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
    { name: 'ENCRYPTION_KEY', set: false },
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

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);

  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    overview: 'Overview',
    services: 'Services',
    messages: 'Messages',
    integrations: 'Integrations',
    logs: 'System Logs',
    settings: 'Settings',
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
}

window.navigateTo = navigateTo;

async function refreshAll() {
  addLogEntry('info', 'Refreshing dashboard data...');
  await Promise.all([fetchStatus(), fetchHealth()]);

  if (statusData) {
    updateServerStatus();
    updateOverviewStats();
    renderServiceStatus();
    renderServicesPage();
    renderConfigInfo();
    renderIntegrations();
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

refreshAll();
setInterval(refreshAll, 15000);
