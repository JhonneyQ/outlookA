// Shared "compose the current data and email it" action, used by both the
// manual "Send now" route and the scheduled job — so they always behave alike.

import { store } from './store.js';
import { buildEmailHtml, buildProtocolEmailHtml, sendMail } from './mailer.js';
import { refresh } from './refresh.js';
import { pflConfigured } from './pflClient.js';

export async function composeAndSend({ recipients, include, autoRefresh, premierOnly } = {}) {
  let settings = store.get('settings');

  // For unattended (scheduled) sends, optionally pull fresh PFL data first so
  // the email reflects the latest source data rather than a stale working copy.
  const shouldRefresh = autoRefresh ?? settings.autoRefresh;
  if (shouldRefresh && pflConfigured()) {
    try {
      await refresh('all');
    } catch (err) {
      console.warn('[send] pre-send PFL refresh failed, sending current data:', err.message);
    }
    settings = store.get('settings');
  }

  const state = store.getAll();

  const to = (recipients ?? settings.recipients) || [];
  const inc = include ?? settings.include;

  if (!to.length) {
    const result = { at: new Date().toISOString(), ok: false, to: [], error: 'No recipients configured' };
    store.recordSend(result);
    throw Object.assign(new Error(result.error), { result });
  }

  // Safety net for manual edits: a normal PFL refresh already scopes fixtures
  // (via league_id) and players (via club whitelist) to Premier Liq only, but
  // rows added/edited by hand in the tables aren't re-checked. When requested,
  // re-apply that same club whitelist here so a stray non-Premier-Liq row
  // can't slip into a manual send.
  let { players, fixtures } = state;
  if (premierOnly) {
    const premierClubs = new Set(fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).filter(Boolean));
    players = players.filter((p) => premierClubs.has(p.club));
  }

  const html = buildEmailHtml({ players, lineups: state.lineups, fixtures }, inc);
  const subject = `${settings.subjectPrefix || ''} Məlumat yeniləməsi — ${new Date().toLocaleDateString('az-AZ')}`.trim();

  try {
    const info = await sendMail({ to, subject, html });
    const result = { at: new Date().toISOString(), ok: true, to, messageId: info.messageId };
    store.recordSend(result);
    return result;
  } catch (err) {
    const result = { at: new Date().toISOString(), ok: false, to, error: err.message };
    store.recordSend(result);
    throw Object.assign(err, { result });
  }
}

// Send a single match-protocol notification (used by the protocol watcher and
// the manual test route). Recorded separately from the digest send so each
// channel keeps its own last-send status.
export async function sendMatchProtocol({ protocol, recipients, subjectPrefix }) {
  const to = recipients || [];
  if (!to.length) {
    const result = { at: new Date().toISOString(), ok: false, to: [], error: 'No recipients configured' };
    store.recordProtocolSend(result);
    throw Object.assign(new Error(result.error), { result });
  }

  const m = protocol.match;
  const html = buildProtocolEmailHtml(protocol);
  const subject = `${subjectPrefix || ''} Protokol: ${m.homeTeam.name} – ${m.awayTeam.name}${
    m.kickoffTime ? ` (${m.kickoffTime})` : ''
  }`.trim();

  try {
    const info = await sendMail({ to, subject, html });
    const result = {
      at: new Date().toISOString(),
      ok: true,
      to,
      matchId: protocol.matchId,
      match: `${m.homeTeam.name} – ${m.awayTeam.name}`,
      messageId: info.messageId,
    };
    store.recordProtocolSend(result);
    return result;
  } catch (err) {
    const result = {
      at: new Date().toISOString(),
      ok: false,
      to,
      matchId: protocol.matchId,
      error: err.message,
    };
    store.recordProtocolSend(result);
    throw Object.assign(err, { result });
  }
}
