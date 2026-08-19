// Protocol watcher: e-mails each match's protocol as soon as it is published
// (the PFL lineup/officials snapshot that appears ~75 min before kickoff).
//
// Unlike the digest scheduler (which fires at a fixed clock time), this polls
// on an interval, finds matches whose kickoff is approaching, checks whether
// their protocol is out yet, and sends a notification the first time it is —
// recording each matchId so a match is never e-mailed twice.

import cron from 'node-cron';
import crypto from 'node:crypto';
import { store } from './store.js';
import { fetchFixtures, fetchMatchProtocol, pflConfigured } from './pflClient.js';
import { sendMatchProtocol } from './service.js';

let task = null;
let running = false; // guards against overlapping polls on slow networks

// Fingerprints the live PFL protocol content so later polls can tell whether
// PFL itself changed the data (mapProtocolPlayer/mapProtocolEvent output is
// built in a fixed key order, so a plain stringify is a stable fingerprint).
const hashProtocol = (p) => crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');

// PFL kickoff times are Azerbaijan local time (UTC+4). Build an absolute
// instant from the fixture's date + time so the math is server-timezone-proof.
const BAKU_OFFSET = '+04:00';
function kickoffInstant(fixture) {
  if (!fixture.date || !fixture.time) return null;
  const t = /^\d{2}:\d{2}$/.test(fixture.time) ? `${fixture.time}:00` : fixture.time;
  const d = new Date(`${fixture.date}T${t}${BAKU_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const recipientsFor = (s) =>
  (s.protocolRecipients?.length ? s.protocolRecipients : s.recipients) || [];

// One polling pass. `force` ignores the enabled toggle (used by the manual
// "run now" route). Returns a summary; never throws for per-match failures.
export async function runProtocolWatch({ force = false } = {}) {
  const s = store.get('settings');
  if (!force && !s.protocolWatch) return { skipped: 'disabled' };
  if (!pflConfigured()) return { skipped: 'pfl-not-configured' };
  if (!recipientsFor(s).length) return { skipped: 'no-recipients' };
  if (running) return { skipped: 'already-running' };

  running = true;
  try {
    // Fixtures drive the timing; fall back to the stored copy if the live
    // fetch fails so a transient PFL outage doesn't stop the watcher.
    let fixtures;
    try {
      // league_id restricts the candidate matches to Premier Liq — PFL fixtures
      // carry no league field, so this filter param is the only way to exclude
      // the reserve/lower-division matches from protocol notifications.
      ({ fixtures } = await fetchFixtures({ seasonId: s.seasonId, leagueId: s.protocolLeagueId }));
    } catch (err) {
      console.warn('[protocol-watch] fixtures fetch failed, using stored copy:', err.message);
      fixtures = store.get('fixtures') || [];
    }

    const now = Date.now();
    const leadMs = (s.protocolLeadMin ?? 90) * 60_000;
    const graceMs = 15 * 60_000; // keep checking up to 15 min past kickoff

    const candidates = fixtures.filter((f) => {
      if (!f.matchId) return false;
      if (f.status === 'finished') return false;
      if (store.isProtocolNotified(f.matchId)) return false;
      const ko = kickoffInstant(f);
      if (!ko) return false;
      const diff = ko.getTime() - now; // ms until kickoff
      return diff <= leadMs && diff > -graceMs;
    });

    const sent = [];
    for (const f of candidates) {
      try {
        // Prefer a saved (edited) copy; otherwise fetch live and seed the
        // editable store so the protocol can be reviewed/edited afterwards.
        let protocol = store.getProtocol(f.matchId);
        if (!protocol) {
          const live = await fetchMatchProtocol(f.matchId, { minute: s.protocolMinute ?? 75 });
          if (!live.published) continue;
          protocol = live.protocol;
          store.setProtocol(f.matchId, protocol);
          // Baseline fingerprint so later polls can detect PFL editing this
          // match's data (see the re-check pass below).
          store.setProtocolHash(f.matchId, hashProtocol(live.protocol));
        }
        await sendMatchProtocol({
          protocol,
          recipients: recipientsFor(s),
          subjectPrefix: s.subjectPrefix,
        });
        store.markProtocolNotified(f.matchId);
        sent.push(f.matchId);
      } catch (err) {
        console.warn(`[protocol-watch] match ${f.matchId}:`, err.message);
      }
    }

    // --- Re-check already-sent matches for PFL-side corrections ------------
    // The federation sometimes edits a protocol after the fact (a card, an
    // official, a lineup fix). Re-fetch live PFL data for recently-sent
    // matches and resend automatically if its content actually changed.
    const recheckMs = (s.protocolRecheckHours ?? 24) * 3_600_000;
    const recheckLimit = s.protocolRecheckLimit ?? 20;
    const recheckCandidates = fixtures
      .filter((f) => f.matchId && store.isProtocolNotified(f.matchId))
      .map((f) => ({ f, ko: kickoffInstant(f) }))
      .filter(({ ko }) => ko && now - ko.getTime() > -graceMs && now - ko.getTime() <= recheckMs)
      .sort((a, b) => b.ko.getTime() - a.ko.getTime()) // most recently finished first
      .slice(0, recheckLimit)
      .map(({ f }) => f);

    const resent = [];
    for (const f of recheckCandidates) {
      try {
        const live = await fetchMatchProtocol(f.matchId, { minute: s.protocolMinute ?? 75 });
        if (!live.published) continue;
        const hash = hashProtocol(live.protocol);
        const prevHash = store.getProtocolHash(f.matchId);
        if (!prevHash) {
          store.setProtocolHash(f.matchId, hash); // no baseline yet — just record one
          continue;
        }
        if (hash === prevHash) continue; // unchanged since last check

        store.setProtocol(f.matchId, live.protocol);
        store.setProtocolHash(f.matchId, hash);
        await sendMatchProtocol({
          protocol: live.protocol,
          recipients: recipientsFor(s),
          subjectPrefix: s.subjectPrefix,
        });
        resent.push(f.matchId);
      } catch (err) {
        console.warn(`[protocol-watch] recheck ${f.matchId}:`, err.message);
      }
    }

    const summary = {
      at: new Date().toISOString(),
      checked: candidates.length,
      sent,
      rechecked: recheckCandidates.length,
      resent,
    };
    store.set('lastProtocolWatch', summary);
    return summary;
  } finally {
    running = false;
  }
}

// (Re)schedule the polling job from current settings. Called on boot and after
// any settings change.
export function rescheduleProtocolWatch() {
  if (task) {
    task.stop();
    task = null;
  }

  const s = store.get('settings');
  if (!s.protocolWatch) {
    console.log('[protocol-watch] disabled — no job scheduled');
    return { active: false };
  }

  const expr = s.protocolPollCron || '*/5 * * * *';
  if (!cron.validate(expr)) {
    console.warn(`[protocol-watch] invalid cron expression "${expr}" — job not scheduled`);
    return { active: false, error: 'invalid cron' };
  }

  task = cron.schedule(expr, () => {
    runProtocolWatch()
      .then((r) => {
        if (r?.sent?.length) console.log('[protocol-watch] sent protocol for matches', r.sent.join(', '));
        if (r?.resent?.length)
          console.log('[protocol-watch] PFL edited & resent protocol for matches', r.resent.join(', '));
      })
      .catch((err) => console.error('[protocol-watch] poll failed:', err.message));
  });
  console.log(`[protocol-watch] active, polling with cron "${expr}"`);
  return { active: true, cron: expr };
}

export function protocolWatchStatus() {
  const s = store.get('settings');
  return {
    active: !!task && s.protocolWatch,
    cron: s.protocolPollCron,
    leadMin: s.protocolLeadMin,
    lastRun: store.get('lastProtocolWatch'),
  };
}
