# AFFA Fantasy — MailSender

A small web app that pulls the PFL / AFFA Fantasy datasets (players, lineups,
fixtures), lets you **review and edit** them, and emails them via **Outlook**
either **manually** or on an **automatic schedule** you can toggle on/off.

- **Frontend:** React + Vite (`src/`)
- **Backend:** Express API + node-cron scheduler + nodemailer (`server/`)
- **Data:** pulled **live from the PFL Partners API** (`server/pflClient.js`),
  then editable in the UI and persisted to `server/data.json`. The working store
  starts empty until the first PFL refresh populates it.

## How it works

```
PFL API ──"PFL-dən yenilə"──► editable in the UI ──► saved to server/data.json
                                          │
                       ┌──────────────────┴───────────────────┐
                  "Send now" (manual)            Scheduler (cron, toggleable)
                  uses current edits             optionally re-pulls from PFL first
                                          │
                                  nodemailer → smtp.office365.com (Outlook)
```

The UI has four tabs (in Azerbaijani):
- **Futbolçular** — players database (ID, Ad, Soyad, Mövqe, Klub, №, Foto)
- **Heyətlər** — per-match Start XI + substitutes
- **Təqvim** — season fixtures (Tur, Tarix, Saat, Ev sahibi, Qonaq)
- **Parametrlər** — auto-send toggle, schedule, recipients, API token, "Send now", status

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your config from the template:
   ```bash
   cp .env.example .env
   ```
   - **Mail (work accounts like @affa.az):** use **Microsoft Graph**. Fill in
     `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `MAIL_SENDER`.
     See **[GRAPH_SETUP.md](GRAPH_SETUP.md)** for the one-time admin steps
     (and a ready-to-send message for your IT/admin).
   - **Mail (personal/Outlook.com):** alternatively set `MAIL_PROVIDER=smtp`
     and the `SMTP_*` vars with an app password.
   - `PFL_*` are already wired for the live data source.
   - `API_TOKEN` is optional for local dev.

## Running

**Development (frontend + backend with live reload):**
```bash
npm run dev:all
```
- Frontend: http://localhost:5173 (proxies `/api` → backend)
- Backend:  http://localhost:3001

You can also run them separately: `npm run dev` and `npm run server:watch`.

**Production (single server serving the built UI):**
```bash
npm start          # builds the frontend, then serves UI + API on :3001
```
Open http://localhost:3001.

## Using the app

1. (Optional) Open **Parametrlər**, paste your `API_TOKEN` into **API Token**
   and save. If `API_TOKEN` is blank in `.env`, skip this.
2. In **Parametrlər → PFL məlumat mənbəyi**, pick the **season** (default is the
   active 2025-2026 season) and the max number of matches to fetch lineups for.
3. Click **⬇ PFL-dən yenilə** (top right) to pull live data. It refreshes the
   active tab's dataset, or everything from the Parametrlər tab.
4. Add **recipients** (one email per line) and pick a **schedule**.
5. Edit any data in the Futbolçular / Heyətlər / Təqvim tabs and **save**.
6. Click **İndi göndər** to send the current (edited) data immediately, or flip
   **Avtomatik göndərmə** on to let the scheduler send on the chosen cron.
   - **Göndərmədən əvvəl PFL-dən avtomatik yenilə** (on by default): scheduled
     sends re-pull fresh PFL data first. Turn it **off** if you want scheduled
     sends to use your manual edits instead of overwriting them.
   - Protocol notifications send once when published, then check for PFL corrections
     every 4 hours by default and send again only when the protocol changed. The
     interval can be changed in the protocol watcher settings.

> Manual "İndi göndər" never auto-refreshes, so it always sends exactly what you
> see and edited. Only the scheduler re-pulls (when the toggle above is on).

## Security notes (per the AFFA spec)

- The API is protected with a **Bearer token** (`API_TOKEN`). If unset, the
  server runs open and logs a warning — set it before deploying.
- Run behind **HTTPS** in production (e.g. a reverse proxy like Nginx/Caddy).
- Secrets live only in `.env` (git-ignored). `server/data.json` is also
  git-ignored.

## PFL Partners API integration

Live data is fetched in `server/pflClient.js`. Each request is signed exactly
as the PFL docs require:

```
Authorization: Bearer {PFL_ACCESS_TOKEN}
X-Timestamp:   {unix_seconds}
Psign:         HMAC_SHA256( timestamp + "." + canonicalBody , PFL_PSIGN_SECRET )
Content-Type:  application/json
```

`canonicalBody` is empty for GET. Endpoints used:

| PFL endpoint                     | Used for                                |
| -------------------------------- | --------------------------------------- |
| `GET /seasons`                   | Season selector                         |
| `GET /players`                   | Players database (paginated, all pages) |
| `GET /fixtures?season_id=`       | Season fixtures                         |
| `GET /matches/{matchId}/lineups` | Start XI + substitutes per match        |

**Replay protection:** the API rejects a reused `(timestamp, signature)` pair.
Since the GET signature only depends on the timestamp, the client hands each
request a unique, strictly-increasing unix second (`nextUnixSeconds`) so bursts
of paginated requests never collide — no artificial delays needed.

**Field mapping (PFL → app):** `shirtNumber → jerseyNumber`,
`matchDate → date`, `kickoffTime → time`; lineups are grouped per match into
`{ matchId, round, homeTeam, awayTeam, startXI[], substitutes[] }`.

## API reference

All routes are under `/api` and (when `API_TOKEN` is set) require
`Authorization: Bearer <token>`.

| Method | Path             | Purpose                                  |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/api/health`    | Health check (public)                    |
| GET    | `/api/players`   | List players                             |
| PUT    | `/api/players`   | Replace players array                    |
| GET    | `/api/lineups`   | List lineups                             |
| PUT    | `/api/lineups`   | Replace lineups array                    |
| GET    | `/api/fixtures`  | List fixtures                            |
| PUT    | `/api/fixtures`  | Replace fixtures array                   |
| GET    | `/api/settings`  | Get settings (toggle, cron, recipients…) |
| PUT    | `/api/settings`  | Update settings + reschedule job         |
| GET    | `/api/status`    | Last send + last refresh + scheduler     |
| GET    | `/api/seasons`   | Available PFL seasons (live)             |
| POST   | `/api/refresh`   | Pull from PFL (`{what,seasonId,lineupLimit}`) |
| POST   | `/api/send`      | Send now (optional `{recipients,include}`)|
| POST   | `/api/reset`     | Reset working store to empty             |
