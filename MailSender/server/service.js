// Shared "compose the current data and email it" action, used by both the
// manual "Send now" route and the scheduled job — so they always behave alike.

import { store } from './store.js';
import { buildEmailHtml, sendMail } from './mailer.js';
import { refresh } from './refresh.js';
import { pflConfigured } from './pflClient.js';

export async function composeAndSend({ recipients, include, autoRefresh } = {}) {
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

  const html = buildEmailHtml(
    { players: state.players, lineups: state.lineups, fixtures: state.fixtures },
    inc
  );
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
