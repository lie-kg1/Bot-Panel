const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const BOT_DIR = path.join(__dirname, 'bot');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- File Manager Endpoints ---
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(BOT_DIR);
    const fileList = files.map(filename => ({
      name: filename,
      isDir: fs.statSync(path.join(BOT_DIR, filename)).isDirectory()
    }));
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

app.get('/api/files/read', (req, res) => {
  const filename = req.query.name;
  const filePath = path.join(BOT_DIR, filename);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

app.post('/api/files/save', (req, res) => {
  const { name, content } = req.body;
  const filePath = path.join(BOT_DIR, name);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save file' });
  }
});

app.post('/api/files/delete', (req, res) => {
  const { name } = req.body;
  const filePath = path.join(BOT_DIR, name);
  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// --- Config Endpoints ---
app.get('/api/config', (req, res) => {
  const configPath = path.join(BOT_DIR, 'config.json');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    res.json({ exists: true, content });
  } else {
    res.json({ exists: false, content: '' });
  }
});

app.post('/api/config', (req, res) => {
  const configPath = path.join(BOT_DIR, 'config.json');
  try {
    fs.writeFileSync(configPath, req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
