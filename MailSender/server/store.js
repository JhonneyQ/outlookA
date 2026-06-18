// Tiny JSON-file persistence layer.
// Holds the (editable) working copy of the API data plus app settings, so user
// edits and the auto-send toggle survive restarts. Not a real DB — fine for a
// single-instance internal tool.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seedData } from './mockData.js';

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
};

function defaultState() {
  return {
    players: seedData.players,
    lineups: seedData.lineups,
    fixtures: seedData.fixtures,
    settings: { ...DEFAULT_SETTINGS },
    lastSend: null, // { at, ok, to, error }
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
  reset() {
    state = defaultState();
    persist();
    return state;
  },
};
