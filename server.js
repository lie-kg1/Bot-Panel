require('dotenv').config();

const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const bot = require('./botController');
const userStore = require('./userStore');
const auditLog = require('./auditLog');
const { ROLES } = userStore;

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const BOT_DIR = path.resolve(process.env.BOT_CWD || './bot');
const THEME_FILE = path.join(__dirname, 'theme.json');
const CONFIG_PATH = path.join(BOT_DIR, 'config.json');

fs.mkdirSync(BOT_DIR, { recursive: true });
userStore.ensureOwnerExists();

// Body parsers. Theme payloads can include a base64 image/video data URL,
// so the JSON limit is raised - but capped, so someone can't post an
// arbitrarily huge payload and exhaust server memory.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Honor HTTPS termination in front of the app (e.g. behind Caddy/nginx)
    // via COOKIE_SECURE + TRUST_PROXY, instead of always forcing false.
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 24 * 60 * 60 * 1000,
  },
});
app.use(sessionMiddleware);

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ---------------------------------------------------------------------------
// Auth + role helpers
//
// Roles: owner (exactly one, full control) > admin (manage bot + non-owner
// accounts) > member (view-only: status/logs/config, no control actions).
// ---------------------------------------------------------------------------

const ROLE_RANK = { [ROLES.MEMBER]: 0, [ROLES.ADMIN]: 1, [ROLES.OWNER]: 2 };

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const rank = ROLE_RANK[req.session.role] ?? -1;
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions for this action' });
    }
    next();
  };
}

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ---- Auth routes ----
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const user = await userStore.verifyLogin(username, password);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;

  userStore.recordLogin(user.id, clientIp(req), req.headers['user-agent']);
  auditLog.log(user.username, 'auth.login', `Signed in from ${clientIp(req)}`);

  return res.json({ success: true, message: 'Logged in successfully', role: user.role, username: user.username });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = userStore.findById(req.session.userId);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  res.json({ success: true, user: userStore.publicView(user) });
});

// Single logout handler. The frontend calls POST /logout; the old server
// only defined /api/logout, so sign-out silently 404'd and never destroyed
// the session server-side even though the page redirected anyway. Both
// paths are wired up now.
function handleLogout(req, res) {
  const username = req.session && req.session.username;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    if (username) auditLog.log(username, 'auth.logout', 'Signed out');
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully' });
  });
}
app.post('/api/logout', handleLogout);
app.post('/logout', handleLogout);

// ---- Static files ----
// login.html, register.html, and forgot.html must all stay reachable while
// logged out; everything else in /public (including index.html itself) is
// the authenticated dashboard and should not be servable to an
// unauthenticated client as static HTML/JS.
const PUBLIC_PAGES = ['/login.html', '/register.html', '/forgot.html'];
app.use((req, res, next) => {
  if (PUBLIC_PAGES.includes(req.path)) return next();
  if (req.session && req.session.userId) return next();
  return res.redirect('/login.html');
});
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// User management routes (admin + owner only). Members cannot view or
// modify the account list.
// ---------------------------------------------------------------------------

app.get('/api/users', requireRole(ROLES.ADMIN), (req, res) => {
  res.json({ success: true, users: userStore.listUsers() });
});

app.post('/api/users', requireRole(ROLES.ADMIN), async (req, res) => {
  const { username, password, email, role } = req.body;

  // Only the owner can create another admin; admins can only create members.
  // Nobody can create a second owner (userStore also enforces this).
  if (role === ROLES.OWNER) {
    return res.status(403).json({ success: false, message: 'Cannot create another owner account' });
  }
  if (role === ROLES.ADMIN && req.session.role !== ROLES.OWNER) {
    return res.status(403).json({ success: false, message: 'Only the owner can create admin accounts' });
  }

  try {
    const user = await userStore.createUser({ username, password, email, role: role || ROLES.MEMBER });
    auditLog.log(req.session.username, 'user.create', `Created account "${user.username}" (${user.role})`);
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/users/:id', requireRole(ROLES.ADMIN), (req, res) => {
  const target = userStore.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });

  // Admins may only delete members; only the owner may delete admins.
  if (target.role === ROLES.ADMIN && req.session.role !== ROLES.OWNER) {
    return res.status(403).json({ success: false, message: 'Only the owner can delete admin accounts' });
  }
  if (target.id === req.session.userId) {
    return res.status(400).json({ success: false, message: "You can't delete your own account while signed in" });
  }

  try {
    userStore.deleteUser(req.params.id);
    auditLog.log(req.session.username, 'user.delete', `Deleted account "${target.username}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ---- Own-account password change (any signed-in user, for their own account) ----
app.post('/api/settings/update', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
  }

  const user = userStore.findById(req.session.userId);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const verified = await userStore.verifyLogin(user.username, currentPassword || '');
  if (!verified) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  try {
    await userStore.updatePassword(user.id, newPassword);
    return res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// File manager routes (admin + owner only — members are view-only and
// should not be able to read/write/delete arbitrary files in the bot dir)
//
// Every path here is resolved against BOT_DIR and then checked to make sure
// it's still inside BOT_DIR before touching the filesystem. Without this, a
// filename like "../../../etc/passwd" sent to /api/files/read or
// /api/files/save would let a logged-in user read or overwrite files
// anywhere the panel process has permissions for, not just inside the bot's
// own folder.
// ---------------------------------------------------------------------------

function safeBotPath(name) {
  const base = path.basename(String(name || '')); // strip any directory components outright
  const resolved = path.resolve(BOT_DIR, base);
  if (resolved !== BOT_DIR && !resolved.startsWith(BOT_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const entries = await fsp.readdir(BOT_DIR, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => ({ name: e.name }));
    res.json(files);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/files/read', requireAuth, async (req, res) => {
  const target = safeBotPath(req.query.name);
  if (!target) return res.status(400).json({ success: false, message: 'Invalid filename' });
  try {
    const content = await fsp.readFile(target, 'utf8');
    res.json({ success: true, content });
  } catch (err) {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

app.post('/api/files/save', requireRole(ROLES.ADMIN), async (req, res) => {
  const { name, content } = req.body;
  const target = safeBotPath(name);
  if (!target) return res.status(400).json({ success: false, message: 'Invalid filename' });
  try {
    await fsp.writeFile(target, content === undefined || content === null ? '' : content, 'utf8');
    auditLog.log(req.session.username, 'file.save', `Saved file "${path.basename(target)}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save file' });
  }
});

app.post('/api/files/delete', requireRole(ROLES.ADMIN), async (req, res) => {
  const { name } = req.body;
  const target = safeBotPath(name);
  if (!target) return res.status(400).json({ success: false, message: 'Invalid filename' });
  try {
    await fsp.unlink(target);
    auditLog.log(req.session.username, 'file.delete', `Deleted file "${path.basename(target)}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete file' });
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BOT_DIR),
    // path.basename strips any directory traversal attempt embedded in the
    // uploaded filename before it's used to build a disk path.
    filename: (req, file, cb) => cb(null, path.basename(file.originalname)),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap per uploaded file
});

app.post('/api/files/upload', requireRole(ROLES.ADMIN), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  auditLog.log(req.session.username, 'file.upload', `Uploaded file "${req.file.filename}"`);
  res.json({ success: true, name: req.file.filename });
});

// ---- Bot config.json editor ----
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const content = await fsp.readFile(CONFIG_PATH, 'utf8');
    res.json({ exists: true, content });
  } catch (err) {
    res.json({ exists: false, content: '' });
  }
});

app.post('/api/config', requireRole(ROLES.ADMIN), async (req, res) => {
  const { content } = req.body;
  try {
    JSON.parse(content); // validate before writing to disk
    await fsp.writeFile(CONFIG_PATH, content, 'utf8');
    auditLog.log(req.session.username, 'config.save', 'Updated config.json');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: `Invalid JSON: ${err.message}` });
  }
});

// ---- Theme settings (persisted to disk so it survives a server restart) ----
app.get('/api/theme', requireAuth, async (req, res) => {
  try {
    const content = await fsp.readFile(THEME_FILE, 'utf8');
    res.json(JSON.parse(content));
  } catch (err) {
    res.json({});
  }
});

app.post('/api/theme', requireAuth, async (req, res) => {
  try {
    await fsp.writeFile(THEME_FILE, JSON.stringify(req.body || {}), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save theme' });
  }
});

// ---------------------------------------------------------------------------
// Socket.IO - powers the live status dot, log stream, and start/stop/restart
// buttons in index.html. The session cookie is shared with the socket
// handshake via io.engine.use(), so any connection without a valid
// authenticated session is rejected before it can send bot control commands.
// Member-role sessions can still receive status/log broadcasts (view-only)
// but their start/stop/restart commands are ignored server-side.
// ---------------------------------------------------------------------------

const io = new Server(server);
io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const req = socket.request;
  if (req.session && req.session.userId) {
    return next();
  }
  return next(new Error('unauthorized'));
});

function socketRole(socket) {
  return (socket.request.session && socket.request.session.role) || ROLES.MEMBER;
}

function socketUsername(socket) {
  return (socket.request.session && socket.request.session.username) || 'unknown';
}

io.on('connection', (socket) => {
  socket.emit('status', bot.getStatus());
  bot.logs.slice(-100).forEach((entry) => socket.emit('log', entry));
  bot.metrics.forEach((point) => socket.emit('metrics', point));

  socket.on('start', () => {
    if (ROLE_RANK[socketRole(socket)] < ROLE_RANK[ROLES.ADMIN]) return;
    bot.start();
    auditLog.log(socketUsername(socket), 'bot.start', 'Started the bot');
  });
  socket.on('stop', () => {
    if (ROLE_RANK[socketRole(socket)] < ROLE_RANK[ROLES.ADMIN]) return;
    bot.stop();
    auditLog.log(socketUsername(socket), 'bot.stop', 'Stopped the bot');
  });
  socket.on('restart', () => {
    if (ROLE_RANK[socketRole(socket)] < ROLE_RANK[ROLES.ADMIN]) return;
    bot.restart();
    auditLog.log(socketUsername(socket), 'bot.restart', 'Restarted the bot');
  });
});

bot.on('status', (status) => io.emit('status', status));
bot.on('log', (entry) => io.emit('log', entry));
bot.on('metrics', (point) => io.emit('metrics', point));

// ---- Activity/audit log (admin + owner only) ----
app.get('/api/audit', requireRole(ROLES.ADMIN), (req, res) => {
  res.json({ success: true, entries: auditLog.list(200) });
});

server.listen(PORT, () => {
  console.log(`[botpanel] Server running on http://localhost:${PORT}`);
});
