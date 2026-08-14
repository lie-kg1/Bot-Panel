const statusDot = document.getElementById('status-dot');
const serverCmd = document.getElementById('server-cmd');
const statStatus = document.getElementById('stat-status');
const statPid = document.getElementById('stat-pid');
const statUptime = document.getElementById('stat-uptime');
const statRestarts = document.getElementById('stat-restarts');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const restartBtn = document.getElementById('restart-btn');

const logStream = document.getElementById('log-stream');
const logPauseBtn = document.getElementById('log-pause');
const logClearBtn = document.getElementById('log-clear');

const configTextarea = document.getElementById('config-textarea');
const configSaveBtn = document.getElementById('config-save');
const configStatus = document.getElementById('config-status');

const toast = document.getElementById('toast');
const logoutBtn = document.getElementById('logout-btn');

const navItems = document.querySelectorAll('.nav-item[data-view]');
const views = {
  console: document.getElementById('view-console'),
  startup: document.getElementById('view-startup'),
};

let logsPaused = false;

function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function renderStatus(data) {
  const state = data.status;
  statusDot.dataset.state = state;
  statStatus.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  serverCmd.textContent = data.command;
  statPid.textContent = data.pid ?? '—';
  statUptime.textContent = formatUptime(data.uptimeSeconds);
  statRestarts.textContent = data.restartCount ?? 0;

  startBtn.disabled = state === 'running';
  stopBtn.disabled = state !== 'running';
  restartBtn.disabled = state !== 'running';
}

async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.status === 401) return (window.location.href = '/login.html');
    const data = await res.json();
    renderStatus(data);
  } catch (err) {
    // network hiccup, ignore silently
  }
}

async function callAction(url, successMsg) {
  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(successMsg, 'success');
    } else {
      showToast(data.error || 'Action failed.', 'error');
    }
    refreshStatus();
  } catch (err) {
    showToast('Could not reach server.', 'error');
  }
}

startBtn.addEventListener('click', () => callAction('/api/start', 'Bot started'));
stopBtn.addEventListener('click', () => callAction('/api/stop', 'Bot stopped'));
restartBtn.addEventListener('click', () => callAction('/api/restart', 'Bot restarting'));

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---- Nav switching ----
navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    const target = item.dataset.view;
    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== target;
    });
  });
});

// ---- Log stream (SSE) ----
function appendLogLine(entry) {
  if (logsPaused) return;
  const row = document.createElement('div');
  row.className = 'log-line';
  const time = new Date(entry.ts).toLocaleTimeString();
  row.innerHTML = `<span class="log-ts">${time}</span><span class="log-tag ${entry.stream}">${entry.stream}</span><span class="log-msg"></span>`;
  row.querySelector('.log-msg').textContent = entry.line;
  logStream.appendChild(row);
  logStream.scrollTop = logStream.scrollHeight;

  while (logStream.children.length > 500) {
    logStream.removeChild(logStream.firstChild);
  }
}

function connectLogStream() {
  const source = new EventSource('/api/logs/stream');
  source.onmessage = (e) => {
    try {
      appendLogLine(JSON.parse(e.data));
    } catch (err) {
      /* ignore malformed frame */
    }
  };
  source.onerror = () => {
    source.close();
    setTimeout(connectLogStream, 3000);
  };
}

logPauseBtn.addEventListener('click', () => {
  logsPaused = !logsPaused;
  logPauseBtn.textContent = logsPaused ? 'Resume' : 'Pause';
});

logClearBtn.addEventListener('click', async () => {
  logStream.innerHTML = '';
  await fetch('/api/logs/clear', { method: 'POST' });
});

// ---- Config editor ----
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    configTextarea.value = data.content || '';
    configStatus.textContent = data.exists ? 'Loaded config.json' : 'No config.json yet — saving will create one.';
  } catch (err) {
    configStatus.textContent = 'Could not load config.';
  }
}

configSaveBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: configTextarea.value }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast('Config saved', 'success');
      configStatus.textContent = 'Saved.';
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Could not save config.', 'error');
  }
});

// ---- Init ----
refreshStatus();
setInterval(refreshStatus, 3000);
connectLogStream();
loadConfig();
