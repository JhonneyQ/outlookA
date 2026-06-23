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
import {
  rescheduleProtocolWatch,
  protocolWatchStatus,
  runProtocolWatch,
} from './protocolWatcher.js';
import { refresh } from './refresh.js';
import { fetchSeasons, fetchMatchProtocol, pflConfigured } from './pflClient.js';
import { sendMatchProtocol } from './service.js';
import { mailProvider } from './mailer.js';
import { graphConfigured } from './graphMailer.js';
import { smtp2goConfigured } from './smtp2goMailer.js';

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
  rescheduleProtocolWatch(); // protocol-watch toggle / cron may have changed
  res.json({ settings, scheduler: schedulerStatus(), protocolWatch: protocolWatchStatus() });
});

// --- Status (last send result + scheduler + refresh state) -----------------
app.get('/api/status', (_req, res) =>
  res.json({
    lastSend: store.get('lastSend'),
    lastProtocolSend: store.get('lastProtocolSend'),
    lastRefresh: store.get('lastRefresh'),
    scheduler: schedulerStatus(),
    protocolWatch: protocolWatchStatus(),
    pflConfigured: pflConfigured(),
    mailProvider: mailProvider(),
    mailReady:
      mailProvider() === 'graph'
        ? graphConfigured()
        : mailProvider() === 'smtp2go'
          ? smtp2goConfigured()
          : !!(process.env.SMTP_USER && process.env.SMTP_PASS),
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

// --- Match protocol --------------------------------------------------------
// Fetch a single match protocol live from PFL (raw, mapped). Used to seed the
// editor with the original; does not touch the store.
app.get('/api/matches/:matchId/protocol', async (req, res) => {
  try {
    const minute = req.query.minute ? Number(req.query.minute) : undefined;
    const result = await fetchMatchProtocol(Number(req.params.matchId), { minute });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Stored (editable) protocol JSON, keyed by matchId. GET returns null when none
// is saved yet; PUT saves/replaces it; DELETE reverts to the live PFL version.
app.get('/api/protocols/:matchId', (req, res) => {
  res.json(store.getProtocol(req.params.matchId));
});
app.put('/api/protocols/:matchId', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'protocol must be a JSON object' });
  }
  res.json(store.setProtocol(req.params.matchId, req.body));
});
app.delete('/api/protocols/:matchId', (req, res) => {
  store.deleteProtocol(req.params.matchId);
  res.json({ ok: true });
});

// Manually e-mail a match protocol now (useful to test recipients/formatting).
// Body: { matchId, minute?, recipients? }. Prefers the saved (edited) protocol
// when one exists, otherwise fetches live from PFL. Bypasses the published/lead
// checks and the dedup list — it always sends.
app.post('/api/protocol/send', async (req, res) => {
  try {
    const { matchId, minute, recipients } = req.body || {};
    if (!matchId) return res.status(400).json({ error: 'matchId is required' });
    const s = store.get('settings');
    let protocol = store.getProtocol(matchId);
    if (!protocol) {
      ({ protocol } = await fetchMatchProtocol(Number(matchId), { minute: minute ?? s.protocolMinute }));
    }
    const to = recipients || (s.protocolRecipients?.length ? s.protocolRecipients : s.recipients);
    const result = await sendMatchProtocol({ protocol, recipients: to, subjectPrefix: s.subjectPrefix });
    res.json(result);
  } catch (err) {
    res.status(500).json(err.result || { ok: false, error: err.message });
  }
});

// Run one protocol-watch poll immediately (force = ignore the enabled toggle).
app.post('/api/protocol/run', async (_req, res) => {
  try {
    res.json(await runProtocolWatch({ force: true }));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
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
  reschedule(); // start digest scheduler according to persisted settings
  rescheduleProtocolWatch(); // start protocol watcher according to persisted settings
});
