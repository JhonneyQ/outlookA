// Live PFL Partners API client.
// Handles the required auth (Bearer + X-Timestamp + Psign HMAC), pagination,
// and maps PFL responses into the internal shapes the UI / email templates use.
//
// Auth per the PFL docs:
//   Authorization: Bearer {accessToken}
//   X-Timestamp:   {unix_seconds}
//   Psign:         HMAC_SHA256( timestamp + "." + canonicalBody , psignSecret )
//   (canonicalBody is "" for GET requests)

import crypto from 'node:crypto';

const cfg = () => ({
  baseUrl: process.env.PFL_BASE_URL || 'https://pfl.az/api/v1/partners',
  token: process.env.PFL_ACCESS_TOKEN,
  secret: process.env.PFL_PSIGN_SECRET || process.env.PFL_ACCESS_TOKEN,
});

function assertConfigured() {
  const { token, secret } = cfg();
  if (!token || !secret) {
    throw new Error(
      'PFL_ACCESS_TOKEN / PFL_PSIGN_SECRET are not set. Add them to .env to load live PFL data.'
    );
  }
}

// The API rejects a (timestamp, signature) pair it has already seen. Because
// the GET signature is HMAC(timestamp + ".") with an empty body, two requests
// in the same wall-clock second would collide. We hand out a unique, strictly
// increasing unix-second per request instead. The replay window tolerates being
// a couple of minutes ahead, which comfortably covers any single refresh burst.
let lastTs = 0;
function nextUnixSeconds() {
  let t = Math.floor(Date.now() / 1000);
  if (t <= lastTs) t = lastTs + 1;
  lastTs = t;
  return t;
}

function signedHeaders(canonicalBody = '') {
  const { token, secret } = cfg();
  const ts = nextUnixSeconds();
  const psign = crypto.createHmac('sha256', secret).update(`${ts}.${canonicalBody}`).digest('hex');
  return {
    Authorization: `Bearer ${token}`,
    'X-Timestamp': String(ts),
    Psign: psign,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Single signed GET.
async function get(path, params = {}) {
  assertConfigured();
  const { baseUrl } = cfg();
  const url = new URL(baseUrl + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: signedHeaders('') });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`PFL ${path}: non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error?.code || `HTTP ${res.status}`;
    throw new Error(`PFL ${path}: ${msg}`);
  }
  return body;
}

// GET every page of a paginated list endpoint (whose payload is { data, meta }).
// `maxPages` is a safety cap so we never accidentally pull tens of thousands.
async function getAllPages(path, params = {}, { maxPages = 60, perPage = 100 } = {}) {
  const all = [];
  let page = 1;
  let lastPage = 1;
  do {
    const body = await get(path, { ...params, page, per_page: perPage });
    if (Array.isArray(body?.data)) all.push(...body.data);
    lastPage = body?.meta?.pagination?.last_page ?? 1;
    page += 1;
  } while (page <= lastPage && page <= maxPages);
  return { items: all, truncated: lastPage > maxPages };
}

// --- Field mapping: PFL -> internal app shapes -----------------------------

const mapPlayer = (p) => ({
  id: p.id,
  firstName: (p.firstName || '').trim(),
  lastName: (p.lastName || '').trim(),
  position: p.position || '',
  club: p.club || '',
  jerseyNumber: p.shirtNumber ?? 0,
  photo: p.photo || '',
});

const mapLineupPlayer = (p) => ({
  id: p.id,
  firstName: (p.firstName || '').trim(),
  lastName: (p.lastName || '').trim(),
  position: p.position || '',
  jerseyNumber: p.shirtNumber ?? 0,
  photo: p.photo || '',
});

const mapFixture = (f) => ({
  matchId: f.matchId,
  round: f.round ?? '',
  date: f.matchDate || '',
  time: f.kickoffTime || '',
  homeTeam: f.homeTeam || '',
  awayTeam: f.awayTeam || '',
  stadium: f.stadium || '',
  status: f.status || '',
  season: f.season || '',
});

// --- Public fetchers -------------------------------------------------------

export async function fetchSeasons() {
  const { items } = await getAllPages('/seasons', {}, { maxPages: 5 });
  return items; // [{ id, title, status, leaguesCount }]
}

export async function fetchPlayers({ search } = {}) {
  const { items, truncated } = await getAllPages('/players', { search });
  return { players: items.map(mapPlayer), truncated };
}

export async function fetchFixtures({ seasonId, leagueId, search } = {}) {
  const { items, truncated } = await getAllPages(
    '/fixtures',
    { season_id: seasonId, league_id: leagueId, search },
    { maxPages: 40 }
  );
  return { fixtures: items.map(mapFixture), truncated };
}

export async function fetchMatchLineup(matchId) {
  const body = await get(`/matches/${matchId}/lineups`, { per_page: 100 });
  return {
    startXI: (body?.startingLineup || []).map(mapLineupPlayer),
    substitutes: (body?.substitutes || []).map(mapLineupPlayer),
  };
}

// Build the Lineups dataset for a set of fixtures (each becomes one match block).
// Runs with limited concurrency and keeps only matches that actually have a
// published lineup. `limit` caps how many matches we touch in one refresh.
export async function fetchLineupsForFixtures(fixtures, { limit = 20, concurrency = 4 } = {}) {
  const targets = fixtures.filter((f) => f.matchId).slice(0, limit);
  const out = [];
  let skipped = 0;
  let i = 0;

  async function worker() {
    while (i < targets.length) {
      const f = targets[i++];
      try {
        const { startXI, substitutes } = await fetchMatchLineup(f.matchId);
        if (startXI.length || substitutes.length) {
          out.push({
            matchId: f.matchId,
            round: f.round,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            startXI,
            substitutes,
          });
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  // keep stable order by matchId
  out.sort((a, b) => a.matchId - b.matchId);
  return { lineups: out, scanned: targets.length, skipped, capped: fixtures.length > limit };
}

export const pflConfigured = () => {
  const { token, secret } = cfg();
  return !!(token && secret);
};
