// Cron-driven auto-send. A single job is (re)scheduled whenever settings change.
// When settings.autoSend is false, no job runs at all.

import cron from 'node-cron';
import { store } from './store.js';
import { composeAndSend } from './service.js';

let task = null;

export function reschedule() {
  if (task) {
    task.stop();
    task = null;
  }

  const { autoSend, cron: expr } = store.get('settings');
  if (!autoSend) {
    console.log('[scheduler] auto-send disabled — no job scheduled');
    return { active: false };
  }
  if (!cron.validate(expr)) {
    console.warn(`[scheduler] invalid cron expression "${expr}" — job not scheduled`);
    return { active: false, error: 'invalid cron' };
  }

  task = cron.schedule(expr, async () => {
    console.log(`[scheduler] firing scheduled send (${expr})`);
    try {
      const r = await composeAndSend();
      console.log('[scheduler] sent to', r.to.join(', '));
    } catch (err) {
      console.error('[scheduler] send failed:', err.message);
    }
  });
  console.log(`[scheduler] auto-send active with cron "${expr}"`);
  return { active: true, cron: expr };
}

export function schedulerStatus() {
  const { autoSend, cron: expr } = store.get('settings');
  return { active: !!task && autoSend, cron: expr };
}
