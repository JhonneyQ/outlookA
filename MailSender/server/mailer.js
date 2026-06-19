// Email sending + HTML email body builder.
// Two transports are supported, chosen automatically:
//   - Microsoft Graph (recommended for @affa.az work accounts) — used when the
//     MS_* app-registration env vars are present. No password stored.
//   - SMTP (nodemailer) — fallback for personal/Outlook.com accounts with an
//     app password.
// Force one with MAIL_PROVIDER=graph|smtp.

import nodemailer from 'nodemailer';
import { graphConfigured, sendViaGraph } from './graphMailer.js';

let transporter = null;

export function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'SMTP_USER / SMTP_PASS are not set. For @affa.az work accounts use Microsoft Graph instead (set MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MAIL_SENDER in .env).'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.office365.com',
    port: Number(SMTP_PORT) || 587,
    secure: false, // 587 uses STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Which transport to use. Defaults to Graph when its env vars exist.
export function mailProvider() {
  const forced = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (forced === 'graph' || forced === 'smtp') return forced;
  return graphConfigured() ? 'graph' : 'smtp';
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function playersTable(players) {
  if (!players?.length) return '';
  const rows = players
    .map(
      (p) => `<tr>
        <td>${esc(p.id)}</td>
        <td>${esc(p.firstName)}</td>
        <td>${esc(p.lastName)}</td>
        <td>${esc(p.position)}</td>
        <td>${esc(p.club)}</td>
        <td style="text-align:center">${esc(p.jerseyNumber)}</td>
      </tr>`
    )
    .join('');
  return section(
    'Futbolçular bazası',
    `<table>${tableHead(['ID', 'Ad', 'Soyad', 'Mövqe', 'Klub', '№'])}<tbody>${rows}</tbody></table>`
  );
}

function lineupsTable(lineups) {
  if (!lineups?.length) return '';
  const blocks = lineups
    .map((m) => {
      const list = (arr) =>
        arr
          .map(
            (p) =>
              `<tr><td style="text-align:center">${esc(p.jerseyNumber)}</td><td>${esc(p.firstName)} ${esc(
                p.lastName
              )}</td><td>${esc(p.position)}</td></tr>`
          )
          .join('');
      return `<h3 style="margin:18px 0 6px">${esc(m.homeTeam)} – ${esc(m.awayTeam)} (Tur ${esc(m.round)})</h3>
        <strong>Start heyət</strong>
        <table>${tableHead(['№', 'Oyunçu', 'Mövqe'])}<tbody>${list(m.startXI)}</tbody></table>
        <strong>Ehtiyat oyunçular</strong>
        <table>${tableHead(['№', 'Oyunçu', 'Mövqe'])}<tbody>${list(m.substitutes)}</tbody></table>`;
    })
    .join('');
  return section('Start heyət və ehtiyat', blocks);
}

function fixturesTable(fixtures) {
  if (!fixtures?.length) return '';
  const rows = fixtures
    .map(
      (f) =>
        `<tr><td style="text-align:center">${esc(f.round)}</td><td>${esc(f.date)}</td><td>${esc(
          f.time
        )}</td><td>${esc(f.homeTeam)}</td><td>${esc(f.awayTeam)}</td></tr>`
    )
    .join('');
  return section(
    'Oyun təqvimi',
    `<table>${tableHead(['Tur', 'Tarix', 'Saat', 'Ev sahibi', 'Qonaq'])}<tbody>${rows}</tbody></table>`
  );
}

const tableHead = (cols) =>
  `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`;

const section = (title, inner) =>
  `<div style="margin-bottom:28px"><h2 style="color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:4px">${esc(
    title
  )}</h2>${inner}</div>`;

// --- Match protocol email --------------------------------------------------

const playerName = (p) =>
  `${esc(p.fullName || `${p.firstName} ${p.lastName}`)}${p.captain ? ' (K)' : ''}${
    p.goalkeeper ? ' (QV)' : ''
  }`;

function protocolPlayerList(arr) {
  if (!arr?.length) return '<p style="color:#94a3b8;margin:4px 0">—</p>';
  const rows = arr
    .map(
      (p) =>
        `<tr><td style="text-align:center;width:42px">${esc(p.shirtNumber)}</td><td>${playerName(
          p
        )}</td><td style="color:#64748b">${esc(p.position)}</td></tr>`
    )
    .join('');
  return `<table>${tableHead(['№', 'Oyunçu', 'Mövqe'])}<tbody>${rows}</tbody></table>`;
}

function protocolTeamBlock(team) {
  return `<div style="margin-bottom:18px">
    <h3 style="margin:14px 0 4px">${esc(team.name)}</h3>
    <div style="color:#475569;margin-bottom:6px"><strong>Baş məşqçi:</strong> ${esc(team.coach) || '—'}</div>
    <strong>Start heyət</strong>
    ${protocolPlayerList(team.startingLineup)}
    <strong>Ehtiyat oyunçular</strong>
    ${protocolPlayerList(team.substitutes)}
  </div>`;
}

function officialsBlock(o) {
  const rows = [
    ['Baş hakim', o.mainReferee],
    ['Köməkçi hakimlər', (o.assistantReferees || []).join(', ')],
    ['Dördüncü hakim', o.fourthReferee],
    ['VAR', o.var],
    ['AVAR', o.avar],
    ['Hakim-inspektor', o.refereeInspector],
    ['AFFA nümayəndəsi', o.affaDelegate],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="white-space:nowrap"><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`)
    .join('');
  if (!rows) return '';
  return section('Hakim heyəti və rəsmilər', `<table><tbody>${rows}</tbody></table>`);
}

// Build the HTML body for a single match protocol notification.
export function buildProtocolEmailHtml(protocol) {
  const m = protocol.match;
  const meta = [
    m.round !== '' && m.round != null ? `Tur ${esc(m.round)}` : '',
    esc(m.date),
    esc(m.kickoffTime),
    esc(m.stadium),
  ]
    .filter(Boolean)
    .join(' • ');

  const pdf = protocol.protocolPdfUrl
    ? `<p style="margin:8px 0"><a href="${esc(protocol.protocolPdfUrl)}" style="color:#1d4ed8">📄 Rəsmi protokol (PDF)</a></p>`
    : '';

  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;max-width:720px;margin:0 auto">
    <style>
      table{border-collapse:collapse;width:100%;margin:6px 0 14px;font-size:14px}
      th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
      th{background:#f1f5f9}
    </style>
    <h1 style="color:#0f172a;margin-bottom:2px">${esc(m.homeTeam.name)} <span style="color:#94a3b8">–</span> ${esc(
      m.awayTeam.name
    )}</h1>
    <p style="color:#64748b;margin-top:0">${meta}</p>
    ${pdf}
    ${section('Heyətlər', protocolTeamBlock(m.homeTeam) + protocolTeamBlock(m.awayTeam))}
    ${officialsBlock(protocol.officials)}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Bu protokol bildirişi AFFA Fantasy MailSender tərəfindən avtomatik göndərilmişdir.</p>
  </body></html>`;
}

export function buildEmailHtml({ players, lineups, fixtures }, include) {
  const parts = [
    include.players && playersTable(players),
    include.lineups && lineupsTable(lineups),
    include.fixtures && fixturesTable(fixtures),
  ].filter(Boolean);

  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;max-width:720px;margin:0 auto">
    <style>
      table{border-collapse:collapse;width:100%;margin:6px 0 14px;font-size:14px}
      th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
      th{background:#f1f5f9}
    </style>
    <h1 style="color:#0f172a">AFFA Fantasy — məlumat yeniləməsi</h1>
    ${parts.join('') || '<p>Göndəriləcək məlumat seçilməyib.</p>'}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Bu məktub AFFA Fantasy MailSender tərəfindən avtomatik göndərilmişdir.</p>
  </body></html>`;
}

export async function sendMail({ to, subject, html }) {
  if (mailProvider() === 'graph') {
    if (!graphConfigured()) {
      throw new Error(
        'Microsoft Graph is selected but not configured. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_SENDER in .env.'
      );
    }
    return sendViaGraph({ to, subject, html });
  }
  const tx = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const info = await tx.sendMail({ from, to: recipients, subject, html });
  return { messageId: info.messageId, accepted: info.accepted };
}
