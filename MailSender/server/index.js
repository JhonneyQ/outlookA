// AFFA Fantasy MailSender — Express API + scheduler bootstrap.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { store } from './store.js';
import { bearerAuth } from './auth.js';
import { composeAndSend } from './service.js';
import { reschedule, schedulerStatus } from './scheduler.js';
import { refresh } from './refresh.js';
import { fetchSeasons, pflConfigured } from './pflClient.js';
import { mailProvider } from './mailer.js';
import { graphConfigured } from './graphMailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health check is public; everything else under /api requires the Bearer token.
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', bearerAuth);

// --- Data: read + edit -----------------------------------------------------
for (const key of ['players', 'lineups', 'fixtures']) {
  app.get(`/api/${key}`, (_req, res) => res.json(store.get(key)));
  app.put(`/api/${key}`, (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: `${key} must be an array` });
    res.json(store.set(key, req.body));
  });
}

// --- Settings (auto-send toggle, cron, recipients) -------------------------
app.get('/api/settings', (_req, res) => res.json(store.get('settings')));
app.put('/api/settings', (req, res) => {
  const settings = store.updateSettings(req.body || {});
  reschedule(); // toggle / cron / recipients may have changed
  res.json({ settings, scheduler: schedulerStatus() });
});

// --- Status (last send result + scheduler + refresh state) -----------------
app.get('/api/status', (_req, res) =>
  res.json({
    lastSend: store.get('lastSend'),
    lastRefresh: store.get('lastRefresh'),
    scheduler: schedulerStatus(),
    pflConfigured: pflConfigured(),
    mailProvider: mailProvider(),
    mailReady: mailProvider() === 'graph' ? graphConfigured() : !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    mailSender: process.env.MAIL_SENDER || process.env.MAIL_FROM || process.env.SMTP_USER || null,
  })
);

// --- Live PFL data ---------------------------------------------------------
app.get('/api/seasons', async (_req, res) => {
  try {
    res.json(await fetchSeasons());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Pull fresh data from PFL into the working store.
// Body: { what?: 'players'|'fixtures'|'lineups'|'all', seasonId?, lineupLimit? }
app.post('/api/refresh', async (req, res) => {
  try {
    const { what = 'all', seasonId, lineupLimit } = req.body || {};
    const summary = await refresh(what, { seasonId, lineupLimit });
    res.json({ ok: true, summary, lastRefresh: store.get('lastRefresh') });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// --- Manual send now -------------------------------------------------------
// Manual sends use the current (possibly edited) working data and do NOT
// auto-refresh from PFL, so user edits are never silently overwritten.
app.post('/api/send', async (req, res) => {
  try {
    const result = await composeAndSend({ autoRefresh: false, ...(req.body || {}) });
    res.json(result);
  } catch (err) {
    res.status(500).json(err.result || { ok: false, error: err.message });
  }
});

// --- Reset to seed data (dev helper) ---------------------------------------
app.post('/api/reset', (_req, res) => res.json(store.reset()));

// --- Serve built frontend in production ------------------------------------
const dist = join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[server] AFFA Fantasy MailSender API on http://localhost:${PORT}`);
  reschedule(); // start scheduler according to persisted settings
});
