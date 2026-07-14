// Pulls live data from the PFL API into the working store.
// Used by the "PFL-dən yenilə" buttons and (optionally) before scheduled sends.

import { store } from './store.js';
import {
  fetchPlayers,
  fetchFixtures,
  fetchLineupsForFixtures,
} from './pflClient.js';

// Refresh one or more datasets. `what` ∈ 'players' | 'fixtures' | 'lineups' | 'all'.
// Lineups and players both depend on fixtures (lineups for match targets,
// players for the Premier Liq club whitelist), so refreshing either of them
// (or 'all') will fetch fixtures first.
export async function refresh(what = 'all', opts = {}) {
  const settings = store.get('settings');
  const seasonId = opts.seasonId ?? settings.seasonId;
  const leagueId = settings.protocolLeagueId; // Premier Liq id — restricts every dataset below to this league
  const lineupLimit = opts.lineupLimit ?? settings.lineupLimit ?? 20;

  const summary = {};

  // Fixtures double as the Premier Liq club roster: PFL's /fixtures is the
  // only endpoint that accepts a league_id filter, so players (whose API
  // shape has no league field at all) are kept only if their `club` matches
  // a home/away team name from these (already league-filtered) fixtures.
  // Fetched whenever players, fixtures, or lineups are requested.
  let fixtures = store.get('fixtures');
  if (what === 'players' || what === 'fixtures' || what === 'lineups' || what === 'all') {
    const res = await fetchFixtures({ seasonId, leagueId });
    fixtures = res.fixtures;
    store.set('fixtures', fixtures);
    summary.fixtures = { count: fixtures.length, truncated: res.truncated, seasonId };
  }

  if (what === 'players' || what === 'all') {
    const premierClubs = new Set(fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).filter(Boolean));
    const { players: fetched, truncated } = await fetchPlayers();
    const players = fetched.filter((p) => premierClubs.has(p.club));
    store.set('players', players);
    summary.players = { count: players.length, truncated, totalFetched: fetched.length };
  }

  if (what === 'lineups' || what === 'all') {
    // Prefer upcoming / in-progress matches for lineups (published before kickoff),
    // falling back to the rest so a refresh always returns something useful.
    const ranked = [...fixtures].sort((a, b) => statusRank(a.status) - statusRank(b.status));
    const { lineups, scanned, skipped, capped } = await fetchLineupsForFixtures(ranked, {
      limit: lineupLimit,
    });
    store.set('lineups', lineups);
    summary.lineups = { count: lineups.length, scanned, skipped, capped };
  }

  store.set('lastRefresh', { at: new Date().toISOString(), what, summary });
  return summary;
}

// Lower rank = fetched first.
function statusRank(status) {
  switch (status) {
    case 'started':
    case 'paused':
      return 0;
    case 'pending':
      return 1;
    case 'finished':
      return 2;
    default:
      return 3;
  }
}
