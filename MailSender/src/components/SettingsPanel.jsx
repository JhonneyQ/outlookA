// Settings + send controls: API token, auto-send toggle, schedule (cron),
// recipients, which datasets to include, manual "Send now", and last-send status.

import { useEffect, useState } from 'react';
import { api } from '../api.js';

const CRON_PRESETS = [
  { label: 'Hər gün 09:00', value: '0 9 * * *' },
  { label: 'Hər gün 18:00', value: '0 18 * * *' },
  { label: 'Hər saat', value: '0 * * * *' },
  { label: 'Bazar ertəsi 10:00', value: '0 10 * * 1' },
  { label: 'Hər 15 dəqiqə', value: '*/15 * * * *' },
];

export default function SettingsPanel({
  settings,
  onSaveSettings,
  token,
  onSaveToken,
  status,
  onSendNow,
  busy,
}) {
  const [local, setLocal] = useState(settings);
  const [tokenInput, setTokenInput] = useState(token);
  const [recipientsText, setRecipientsText] = useState((settings.recipients || []).join('\n'));
  const [seasons, setSeasons] = useState([]);

  useEffect(() => {
    api.getSeasons().then(setSeasons).catch(() => setSeasons([]));
  }, []);

  const patch = (p) => setLocal((s) => ({ ...s, ...p }));
  const toggleInclude = (k) => patch({ include: { ...local.include, [k]: !local.include[k] } });

  const save = () => {
    const recipients = recipientsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSaveSettings({ ...local, recipients });
  };

  const last = status?.lastSend;

  return (
    <div className="settings-grid">
      <section className="card">
        <h3>Avtomatik göndərmə</h3>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={!!local.autoSend}
            onChange={(e) => patch({ autoSend: e.target.checked })}
          />
          <span>Avtomatik göndərmə {local.autoSend ? 'AKTİV' : 'SÖNDÜRÜLÜB'}</span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={!!local.autoRefresh}
            onChange={(e) => patch({ autoRefresh: e.target.checked })}
          />
          <span>Göndərmədən əvvəl PFL-dən avtomatik yenilə</span>
        </label>

        <label className="field">
          Cədvəl (cron)
          <select value={local.cron} onChange={(e) => patch({ cron: e.target.value })}>
            {CRON_PRESETS.some((p) => p.value === local.cron) ? null : (
              <option value={local.cron}>{local.cron} (xüsusi)</option>
            )}
            {CRON_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Xüsusi cron ifadəsi
          <input value={local.cron} onChange={(e) => patch({ cron: e.target.value })} />
        </label>

        <fieldset className="includes">
          <legend>Məktuba daxil et</legend>
          {[
            ['players', 'Futbolçular'],
            ['lineups', 'Heyətlər'],
            ['fixtures', 'Təqvim'],
          ].map(([k, lbl]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={!!local.include?.[k]}
                onChange={() => toggleInclude(k)}
              />
              {lbl}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card">
        <h3>PFL məlumat mənbəyi</h3>
        <label className="field">
          Mövsüm (season)
          <select
            value={local.seasonId ?? ''}
            onChange={(e) => patch({ seasonId: Number(e.target.value) })}
          >
            {seasons.length === 0 && <option value={local.seasonId}>#{local.seasonId}</option>}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} {s.status === 'active' ? '• aktiv' : ''} (#{s.id})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Heyət yüklənəcək maks. oyun sayı
          <input
            type="number"
            min={1}
            max={100}
            value={local.lineupLimit ?? 20}
            onChange={(e) => patch({ lineupLimit: Number(e.target.value) })}
          />
        </label>
        <p className="hint">
          “PFL-dən yenilə” düyməsi futbolçuları, təqvimi və yuxarıdakı sayda oyun üçün heyətləri yükləyir.
        </p>
      </section>

      <section className="card">
        <h3>Alıcılar və mövzu</h3>
        <label className="field">
          Alıcılar (hər sətirdə bir e-poçt)
          <textarea
            rows={5}
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="ad@nümunə.az"
          />
        </label>
        <label className="field">
          Mövzu prefiksi
          <input
            value={local.subjectPrefix ?? ''}
            onChange={(e) => patch({ subjectPrefix: e.target.value })}
          />
        </label>
        <button className="btn primary" onClick={save} disabled={busy}>
          Parametrləri yadda saxla
        </button>
      </section>

      <section className="card">
        <h3>API Token</h3>
        <p className="hint">Backend Bearer token (API_TOKEN ilə eyni olmalıdır).</p>
        <div className="token-row">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Bearer token"
          />
          <button className="btn ghost" onClick={() => onSaveToken(tokenInput)}>
            Yadda saxla
          </button>
        </div>
      </section>

      <section className="card">
        <h3>İndi göndər</h3>
        <p className="hint">Cari (redaktə edilmiş) məlumatı dərhal göndərir.</p>
        <button className="btn send" onClick={onSendNow} disabled={busy}>
          {busy ? 'Göndərilir…' : '✉ İndi göndər'}
        </button>

        <div className="status">
          <div>
            <strong>Poçt kanalı:</strong>{' '}
            <span className={status?.mailReady ? 'ok' : 'err'}>
              {status?.mailProvider === 'graph' ? 'Microsoft Graph' : 'SMTP'} —{' '}
              {status?.mailReady ? `hazırdır (${status?.mailSender || ''})` : 'konfiqurasiya tələb olunur'}
            </span>
          </div>
          <div>
            <strong>Planlayıcı:</strong>{' '}
            {status?.scheduler?.active ? (
              <span className="ok">aktiv ({status.scheduler.cron})</span>
            ) : (
              <span className="muted">söndürülüb</span>
            )}
          </div>
          <div>
            <strong>Son PFL yeniləmə:</strong>{' '}
            {status?.lastRefresh ? (
              <span className="ok">{new Date(status.lastRefresh.at).toLocaleString('az-AZ')}</span>
            ) : (
              <span className="muted">hələ yoxdur</span>
            )}
          </div>
          <div>
            <strong>Son göndərmə:</strong>{' '}
            {last ? (
              <span className={last.ok ? 'ok' : 'err'}>
                {new Date(last.at).toLocaleString('az-AZ')} —{' '}
                {last.ok ? `OK → ${last.to.join(', ')}` : `Xəta: ${last.error}`}
              </span>
            ) : (
              <span className="muted">hələ yoxdur</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
