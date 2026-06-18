// Bearer-token guard for the API (per the AFFA spec: Bearer-token protected,
// HTTPS in production). The token is read from API_TOKEN in .env.

export function bearerAuth(req, res, next) {
  const expected = process.env.API_TOKEN;
  // If no token is configured, run open (dev convenience) but warn loudly once.
  if (!expected) {
    if (!bearerAuth._warned) {
      console.warn('[auth] API_TOKEN not set — API is UNPROTECTED. Set it in .env before deploying.');
      bearerAuth._warned = true;
    }
    return next();
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token && token === expected) return next();

  return res.status(401).json({ error: 'Unauthorized — valid Bearer token required' });
}
