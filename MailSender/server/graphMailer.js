// Microsoft Graph email sending (app-only / client-credentials flow).
// Recommended for work accounts (@affa.az) where SMTP basic auth and app
// passwords are disabled. No mailbox password is ever stored — the server
// fetches a short-lived OAuth token and calls Graph's sendMail.
//
// Requires (from an Entra ID app registration with the Mail.Send APPLICATION
// permission + admin consent):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
//   MAIL_SENDER  -> the mailbox to send from (e.g. noreply@affa.az)

const TOKEN_HOST = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';

let cached = null; // { token, expiresAt }

export function graphConfigured() {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  return !!(MS_TENANT_ID && MS_CLIENT_ID && MS_CLIENT_SECRET);
}

function senderMailbox() {
  const s = process.env.MAIL_SENDER || process.env.MAIL_FROM;
  if (!s) throw new Error('MAIL_SENDER is not set (the mailbox to send from, e.g. noreply@affa.az).');
  return s;
}

async function getToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(`${TOKEN_HOST}/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Graph token error: ${data.error_description || data.error || res.status}`);
  }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function sendViaGraph({ to, subject, html }) {
  const token = await getToken();
  const sender = senderMailbox();
  const recipients = (Array.isArray(to) ? to : String(to).split(/[,;]+/))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  const payload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: recipients,
    },
    saveToSentItems: true,
  };

  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 202) {
    return { messageId: `graph:${Date.now()}`, accepted: recipients.map((r) => r.emailAddress.address) };
  }
  const err = await res.json().catch(() => ({}));
  throw new Error(`Graph sendMail failed (${res.status}): ${err?.error?.message || 'unknown error'}`);
}
