const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, 'users.json');
const SALT_ROUNDS = 10;

const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
};

// ---------------------------------------------------------------------------
// Simple JSON-file-backed user store. Fine for a single-process panel with a
// handful of accounts; if you outgrow that, swap this module for a real DB
// without touching server.js (the exported function contract stays the same).
// ---------------------------------------------------------------------------

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function save(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function findByUsername(username) {
  const users = load();
  const needle = String(username || '').toLowerCase();
  return users.find((u) => u.username.toLowerCase() === needle) || null;
}

function findById(id) {
  const users = load();
  return users.find((u) => u.id === id) || null;
}

// Very light device classification from the User-Agent string, purely for
// display on the login-history list — not a security control.
function classifyDevice(userAgent) {
  const ua = String(userAgent || '');
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Mobile';
  if (!ua) return 'Unknown';
  return 'Desktop';
}

function publicView(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Bootstrap: create the single owner account on first run, from env vars.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bootstrap: create the single owner account on first run, from env vars.
//
// This refuses to start rather than silently creating a guessable default
// account. Auto-provisioning a well-known username/password pair (like
// "owner" / "change-me-immediately") is exactly the kind of thing that gets
// found and exploited if the panel is ever exposed to the internet before
// someone remembers to set real credentials — so if OWNER_USERNAME/
// OWNER_PASSWORD aren't set, the process exits with a clear error instead.
// ---------------------------------------------------------------------------

function ensureOwnerExists() {
  const users = load();
  const hasOwner = users.some((u) => u.role === ROLES.OWNER);
  if (hasOwner) return;

  const username = process.env.OWNER_USERNAME;
  const password = process.env.OWNER_PASSWORD;

  if (!username || !password) {
    console.error(
      '[userStore] No owner account exists yet, and OWNER_USERNAME/OWNER_PASSWORD ' +
      'are not set in .env.\n' +
      '            Set both in .env and restart the server to bootstrap the first ' +
      '(owner) account. Refusing to start with a guessable default account.'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[userStore] OWNER_PASSWORD in .env must be at least 8 characters. Refusing to start.');
    process.exit(1);
  }

  const owner = {
    id: crypto.randomUUID(),
    username,
    passwordHash: bcrypt.hashSync(password, SALT_ROUNDS),
    email: process.env.OWNER_EMAIL || '',
    role: ROLES.OWNER,
    createdAt: Date.now(),
    lastLogin: null,
  };

  users.push(owner);
  save(users);
}

async function verifyLogin(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  return ok ? user : null;
}

function recordLogin(id, ip, userAgent) {
  const users = load();
  const user = users.find((u) => u.id === id);
  if (!user) return;
  user.lastLogin = { ip, device: classifyDevice(userAgent), ts: Date.now() };
  save(users);
}

function listUsers() {
  return load().map(publicView);
}

async function createUser({ username, password, email, role }) {
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (![ROLES.ADMIN, ROLES.MEMBER].includes(role)) {
    throw new Error('Invalid role');
  }

  const users = load();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('That username is already taken');
  }

  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    email: email || '',
    role,
    createdAt: Date.now(),
    lastLogin: null,
  };

  users.push(user);
  save(users);
  return publicView(user);
}

function deleteUser(id) {
  const users = load();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error('User not found');
  if (target.role === ROLES.OWNER) {
    throw new Error('The owner account cannot be deleted');
  }
  save(users.filter((u) => u.id !== id));
}

async function updatePassword(id, newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  const users = load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error('User not found');
  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  save(users);
}

module.exports = {
  ROLES,
  ensureOwnerExists,
  verifyLogin,
  findById,
  recordLogin,
  publicView,
  listUsers,
  createUser,
  deleteUser,
  updatePassword,
};
