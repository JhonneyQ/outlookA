// Tiny JSON-file persistence layer.
// Holds the (editable) working copy of the API data plus app settings, so user
// edits and the auto-send toggle survive restarts. Not a real DB — fine for a
// single-instance internal tool.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data.json');

const DEFAULT_SETTINGS = {
  autoSend: false, // master toggle for the scheduled job
  cron: '0 9 * * *', // default: every day at 09:00 (server time)
  recipients: [], // ["a@x.com", "b@y.com"]
  subjectPrefix: '[AFFA Fantasy]',
  // which datasets to include in the scheduled mail
  include: { players: true, lineups: true, fixtures: true },
  // PFL live-data options
  seasonId: 72, // active season "2025-2026" (see GET /seasons)
  lineupLimit: 20, // max matches to pull lineups for per refresh
  autoRefresh: true, // pull fresh PFL data before each scheduled send

  // --- Protocol watcher: e-mail each match's protocol once it's published ---
  protocolWatch: false, // master toggle for the protocol watcher
  protocolPollCron: '*/5 * * * *', // how often to poll for new protocols
  protocolLeadMin: 90, // start watching a match this many minutes before kickoff
  protocolMinute: 75, // snapshot `minute` query param sent to the protocol endpoint
  protocolRecipients: [], // optional override; falls back to `recipients` when empty
  // How long after kickoff to keep re-checking PFL for corrections to a match
  // already e-mailed (federation edits lineups/officials/cards after review),
  // and how many such matches to re-fetch from PFL per poll.
  protocolRecheckHours: 24,
  protocolRecheckLimit: 20,
  // PFL /fixtures has no league name in its response — the only way to isolate
  // Premier Liq is the `league_id` filter param. For season 72 (2025-2026) that
  // id is 47; re-check it (via league_id sample fixtures) whenever the season changes.
  // Used to scope EVERY refreshed dataset to Premier Liq — fixtures/lineups via
  // this param directly, players by cross-referencing club names against the
  // filtered fixtures (see refresh.js) — so the digest + protocol e-mails only
  // ever cover Premier Liq.
  protocolLeagueId: 47,
};

function defaultState() {
  return {
    // Empty until the first PFL refresh populates the working store.
    players: [],
    lineups: [],
    fixtures: [],
    // Editable protocol snapshots, keyed by matchId. Seeded from PFL the first
    // time a protocol is fetched/saved, then editable & persisted like the rest.
    protocols: {},
    settings: { ...DEFAULT_SETTINGS },
    lastSend: null, // { at, ok, to, error }
    lastProtocolSend: null, // { at, ok, to, matchId, error }
    lastProtocolWatch: null, // { at, checked, sent: [matchId] }
    notifiedProtocols: [], // matchIds already e-mailed, so we never double-send
    // Content hash of the live PFL protocol as of the last send/check, keyed by
    // matchId — lets the watcher notice PFL editing a match's data afterwards
    // (e.g. a disciplinary correction) so it can automatically resend.
    protocolHashes: {},
  };
}

let state = load();

function load() {
  if (existsSync(DB_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(DB_PATH, 'utf8'));
      // merge so new default settings keys appear after upgrades
      return {
        ...defaultState(),
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      };
    } catch {
      // corrupt file — fall back to fresh seed
      return defaultState();
    }
  }
  const fresh = defaultState();
  persist(fresh);
  return fresh;
}

function persist(s = state) {
  writeFileSync(DB_PATH, JSON.stringify(s, null, 2), 'utf8');
}

export const store = {
  getAll: () => state,
  get: (key) => state[key],
  set(key, value) {
    state[key] = value;
    persist();
    return state[key];
  },
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist();
    return state.settings;
  },
  recordSend(result) {
    state.lastSend = result;
    persist();
    return state.lastSend;
  },
  recordProtocolSend(result) {
    state.lastProtocolSend = result;
    persist();
    return state.lastProtocolSend;
  },
  // --- Editable protocol snapshots (keyed by matchId, persisted) -----------
  getProtocol(matchId) {
    return state.protocols?.[String(matchId)] || null;
  },
  setProtocol(matchId, data) {
    if (!state.protocols) state.protocols = {};
    state.protocols[String(matchId)] = data;
    persist();
    return state.protocols[String(matchId)];
  },
  deleteProtocol(matchId) {
    if (state.protocols) {
      delete state.protocols[String(matchId)];
      persist();
    }
    return true;
  },
  isProtocolNotified(matchId) {
    return (state.notifiedProtocols || []).some((id) => String(id) === String(matchId));
  },
  markProtocolNotified(matchId) {
    if (!state.notifiedProtocols) state.notifiedProtocols = [];
    if (!state.notifiedProtocols.some((id) => String(id) === String(matchId))) {
      state.notifiedProtocols.push(matchId);
      persist();
    }
    return state.notifiedProtocols;
  },
  getProtocolHash(matchId) {
    return state.protocolHashes?.[String(matchId)] || null;
  },
  setProtocolHash(matchId, hash) {
    if (!state.protocolHashes) state.protocolHashes = {};
    state.protocolHashes[String(matchId)] = hash;
    persist();
    return hash;
  },
  reset() {
    state = defaultState();
    persist();
    return state;
  },
};
