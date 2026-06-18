// Pulls live data from the PFL API into the working store.
// Used by the "PFL-dən yenilə" buttons and (optionally) before scheduled sends.

import { store } from './store.js';
import {
  fetchPlayers,
  fetchFixtures,
  fetchLineupsForFixtures,
} from './pflClient.js';

// Refresh one or more datasets. `what` ∈ 'players' | 'fixtures' | 'lineups' | 'all'.
// Lineups depend on fixtures, so refreshing lineups (or 'all') will fetch
// fixtures first when needed.
export async function refresh(what = 'all', opts = {}) {
  const settings = store.get('settings');
  const seasonId = opts.seasonId ?? settings.seasonId;
  const lineupLimit = opts.lineupLimit ?? settings.lineupLimit ?? 20;

  const summary = {};

  if (what === 'players' || what === 'all') {
    const { players, truncated } = await fetchPlayers();
    store.set('players', players);
    summary.players = { count: players.length, truncated };
  }

  let fixtures = store.get('fixtures');
  if (what === 'fixtures' || what === 'lineups' || what === 'all') {
    const res = await fetchFixtures({ seasonId });
    fixtures = res.fixtures;
    store.set('fixtures', fixtures);
    summary.fixtures = { count: fixtures.length, truncated: res.truncated, seasonId };
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
