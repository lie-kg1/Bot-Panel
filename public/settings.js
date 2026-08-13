// settings.js — Appearance + Users behavior for the Bot Panel settings page.
//
// Expects backend routes (not yet in this repo's server.js/botController.js):
//   GET    /api/users              -> [{ username, role, lastActive }]
//   POST   /api/users              -> { username, password, role }
//   DELETE /api/users/:username
//   PATCH  /api/users/:username/password -> { password }
//   POST   /api/logout
//
// The panel currently authenticates with a single shared PANEL_PASSWORD
// (see README's security note). Wiring this page up for real means adding
// a small user store + per-user session checks server-side — this file
// only covers the frontend half.

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTheme();
  loadUsers();

  document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
  document.getElementById('user-table-body').addEventListener('click', handleUserTableClick);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      fetch('/api/logout', { method: 'POST' }).finally(() => {
        window.location.href = 'login.html';
      });
    });
  }
});

// ---------- Tabs ----------

function initTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  const panels = document.querySelectorAll('.settings-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach((p) => { p.hidden = true; });

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = document.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`);
      if (target) target.hidden = false;
    });
  });
}

// ---------- Theme ----------

function initTheme() {
  const toggle = document.getElementById('theme-switch');
  const label = document.getElementById('theme-switch-label');
  const stored = localStorage.getItem('bp-theme') || 'dark';

  applyTheme(stored);

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('bp-theme', next);
  });

  function applyTheme(mode) {
    const isLight = mode === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    toggle.setAttribute('data-theme-state', isLight ? 'light' : 'dark');
    toggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    label.textContent = isLight ? 'LIGHT' : 'DARK';
  }
}

// ---------- Toast ----------

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// ---------- Users ----------

async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to load users');
    const users = await res.json();
    renderUsers(users);
  } catch (err) {
    showToast('Could not load users.', 'error');
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('user-table-body');
  const empty = document.getElementById('user-empty');
  tbody.innerHTML = '';

  if (!users || !users.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  users.forEach((user) => {
    const tr = document.createElement('tr');

    const usernameCell = document.createElement('td');
    usernameCell.className = 'username-cell';
    usernameCell.textContent = user.username;

    const roleCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `role-badge ${user.role === 'admin' ? 'admin' : 'user'}`;
    badge.textContent = user.role;
    roleCell.appendChild(badge);

    const lastActiveCell = document.createElement('td');
    lastActiveCell.textContent = user.lastActive ? formatRelative(user.lastActive) : '—';

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'user-row-actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.dataset.action = 'reset';
    resetBtn.dataset.username = user.username;
    resetBtn.textContent = 'Reset password';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'danger';
    removeBtn.dataset.action = 'remove';
    removeBtn.dataset.username = user.username;
    removeBtn.textContent = 'Remove';

    actions.appendChild(resetBtn);
    actions.appendChild(removeBtn);
    actionsCell.appendChild(actions);

    tr.appendChild(usernameCell);
    tr.appendChild(roleCell);
    tr.appendChild(lastActiveCell);
    tr.appendChild(actionsCell);

    tbody.appendChild(tr);
  });
}

function formatRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function handleAddUser(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const role = form.role.value;

  if (!username || !password) return;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to add user');
    }
    form.reset();
    showToast(`User "${username}" added.`);
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleUserTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const { username, action } = btn.dataset;

  if (action === 'remove') {
    if (!window.confirm(`Remove user "${username}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove user');
      showToast(`User "${username}" removed.`);
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (action === 'reset') {
    const newPassword = window.prompt(`New password for "${username}":`);
    if (!newPassword) return;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      showToast(`Password reset for "${username}".`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}
