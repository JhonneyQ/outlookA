// SMTP2GO email sending via its HTTP API (https://api.smtp2go.com/v3).
// Chosen when SMTP2GO_API_KEY is set — no SMTP username/password is needed,
// just the API key and a verified sender address.
//
// Requires:
//   SMTP2GO_API_KEY  -> the "api-..." key from the SMTP2GO dashboard
//   MAIL_SENDER      -> the From address (its domain must be verified in SMTP2GO)
//   SMTP2GO_API_URL  -> optional, defaults to https://api.smtp2go.com/v3

const DEFAULT_API = 'https://api.smtp2go.com/v3';

export function smtp2goConfigured() {
  return !!process.env.SMTP2GO_API_KEY;
}

function senderAddress() {
  const s = process.env.MAIL_SENDER || process.env.MAIL_FROM;
  if (!s) throw new Error('MAIL_SENDER is not set (the From address for SMTP2GO).');
  return s;
}

export async function sendViaSmtp2go({ to, subject, html }) {
  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) throw new Error('SMTP2GO_API_KEY is not set.');

  const base = (process.env.SMTP2GO_API_URL || DEFAULT_API).replace(/\/+$/, '');
  const recipients = (Array.isArray(to) ? to : String(to).split(/[,;]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) throw new Error('No recipients given.');

  const res = await fetch(`${base}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Smtp2go-Api-Key': apiKey,
    },
    body: JSON.stringify({
      sender: senderAddress(),
      to: recipients,
      subject,
      html_body: html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const result = data?.data || {};

  // SMTP2GO returns 200 even for partial/total failures — inspect the body.
  const failed = result.failed ?? 0;
  const succeeded = result.succeeded ?? 0;
  if (!res.ok || result.error || (succeeded === 0 && failed > 0) || result.error_code) {
    const msg =
      result.error ||
      (Array.isArray(result.failures) && result.failures.join(', ')) ||
      data?.error ||
      `HTTP ${res.status}`;
    throw new Error(`SMTP2GO send failed: ${msg}`);
  }

  return { messageId: result.email_id || `smtp2go:sent`, accepted: recipients };
}
