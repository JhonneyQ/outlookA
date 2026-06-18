// Thin API client for the MailSender backend.
// The Bearer token is kept in localStorage so it survives reloads and is sent
// with every request (matches the backend's API_TOKEN guard).

const TOKEN_KEY = 'affa_api_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  getPlayers: () => request('/players'),
  savePlayers: (players) => request('/players', { method: 'PUT', body: players }),
  getLineups: () => request('/lineups'),
  saveLineups: (lineups) => request('/lineups', { method: 'PUT', body: lineups }),
  getFixtures: () => request('/fixtures'),
  saveFixtures: (fixtures) => request('/fixtures', { method: 'PUT', body: fixtures }),
  getSettings: () => request('/settings'),
  saveSettings: (patch) => request('/settings', { method: 'PUT', body: patch }),
  getStatus: () => request('/status'),
  sendNow: (payload) => request('/send', { method: 'POST', body: payload || {} }),
  reset: () => request('/reset', { method: 'POST' }),
  getSeasons: () => request('/seasons'),
  refresh: (payload) => request('/refresh', { method: 'POST', body: payload || { what: 'all' } }),
};
