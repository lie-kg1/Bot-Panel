const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, 'audit.json');
const MAX_ENTRIES = 1000;

function load() {
  try {
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function save(entries) {
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Records an audit event.
 * @param {string} actor - username of who performed the action ('system' for automated events)
 * @param {string} action - short machine-readable action name, e.g. 'bot.start', 'user.create'
 * @param {string} detail - human-readable one-line description
 */
function log(actor, action, detail) {
  const entries = load();
  entries.push({
    actor,
    action,
    detail,
    ts: Date.now(),
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  save(entries);
}

function list(limit = 200) {
  const entries = load();
  return entries.slice(-limit).reverse(); // newest first
}

module.exports = { log, list };
