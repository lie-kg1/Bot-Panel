const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const pidusage = require('pidusage');

const MAX_LOG_LINES = 500;
const MAX_METRIC_POINTS = 60; // ~2 minutes of history at a 2s poll interval
const METRICS_POLL_MS = 2000;

class BotController extends EventEmitter {
  constructor() {
    super();
    this.command = process.env.BOT_COMMAND || 'python3';
    this.args = (process.env.BOT_ARGS || 'bot.py').split(' ').filter(Boolean);
    this.cwd = path.resolve(process.env.BOT_CWD || './bot');

    this.proc = null;
    this.status = 'STOPPED'; // STOPPED | RUNNING | CRASHED
    this.startedAt = null;
    this.restarts = 0;
    this.logs = [];
    this.metrics = []; // rolling history of { cpu, memory, ts }
    this._metricsTimer = null;
  }

  _pushLog(message, type = 'stdout') {
    const entry = { message, type, ts: Date.now() };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
    this.emit('log', entry);
  }

  _formatUptime() {
    if (!this.startedAt) return '—';
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  getStatus() {
    return {
      status: this.status,
      pid: this.proc ? this.proc.pid : '—',
      uptime: this._formatUptime(),
      restarts: this.restarts,
    };
  }

  _emitStatus() {
    this.emit('status', this.getStatus());
  }

  _startMetricsPolling() {
    this._stopMetricsPolling();
    this._metricsTimer = setInterval(async () => {
      if (!this.proc) return;
      try {
        const stats = await pidusage(this.proc.pid);
        const point = {
          cpu: Math.round(stats.cpu * 10) / 10, // percent, one decimal
          memoryMb: Math.round((stats.memory / (1024 * 1024)) * 10) / 10,
          ts: Date.now(),
        };
        this.metrics.push(point);
        if (this.metrics.length > MAX_METRIC_POINTS) this.metrics.shift();
        this.emit('metrics', point);
      } catch (err) {
        // Process likely just exited between the tick and the pidusage call;
        // the 'close' handler will clean up state, so just skip this tick.
      }
    }, METRICS_POLL_MS);
  }

  _stopMetricsPolling() {
    if (this._metricsTimer) {
      clearInterval(this._metricsTimer);
      this._metricsTimer = null;
    }
  }

  start() {
    if (this.proc) {
      return { success: false, message: 'Bot already running' };
    }

    try {
      this.proc = spawn(this.command, this.args, { cwd: this.cwd, env: process.env });
    } catch (err) {
      this._pushLog(`Failed to start: ${err.message}`, 'system');
      this.status = 'CRASHED';
      this._emitStatus();
      return { success: false, message: err.message };
    }

    this.status = 'RUNNING';
    this.startedAt = Date.now();
    this._pushLog(`Started (${this.command} ${this.args.join(' ')}) with PID ${this.proc.pid}`, 'system');

    this.proc.stdout.on('data', (data) => {
      data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => this._pushLog(line, 'stdout'));
    });
    this.proc.stderr.on('data', (data) => {
      data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => this._pushLog(line, 'stderr'));
    });

    this.proc.on('error', (err) => {
      this._pushLog(`Process error: ${err.message}`, 'system');
    });

    this.proc.on('close', (code, signal) => {
      this._pushLog(`Process exited (code ${code}, signal ${signal})`, 'system');
      this.status = code === 0 || signal === 'SIGTERM' ? 'STOPPED' : 'CRASHED';
      this.proc = null;
      this.startedAt = null;
      this._stopMetricsPolling();
      this.metrics = [];
      this._emitStatus();
    });

    this._emitStatus();
    this._startMetricsPolling();
    return { success: true, message: 'Bot started' };
  }

  stop() {
    if (!this.proc) {
      return { success: false, message: 'Bot is not running' };
    }
    this._pushLog('Stopping bot...', 'system');
    this.proc.kill('SIGTERM');
    return { success: true, message: 'Bot stopped' };
  }

  restart() {
    this.restarts += 1;
    if (this.proc) {
      this._pushLog('Restarting bot...', 'system');
      const p = this.proc;
      const onClose = () => this.start();
      p.once('close', onClose);
      p.kill('SIGTERM');
      return { success: true, message: 'Bot restarting' };
    }
    return this.start();
  }

  clearLogs() {
    this.logs = [];
  }
}

// Singleton — one bot process managed for the lifetime of the panel server.
module.exports = new BotController();