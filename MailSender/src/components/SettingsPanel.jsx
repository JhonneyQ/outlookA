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
  onReloadStatus,
  busy,
}) {
  const [local, setLocal] = useState(settings);
  const [tokenInput, setTokenInput] = useState(token);
  const [recipientsText, setRecipientsText] = useState((settings.recipients || []).join('\n'));
  const [protocolRecipientsText, setProtocolRecipientsText] = useState(
    (settings.protocolRecipients || []).join('\n')
  );
  const [testMatchId, setTestMatchId] = useState('');
  const [protoMsg, setProtoMsg] = useState(null);
  const [seasons, setSeasons] = useState([]);

  useEffect(() => {
    api.getSeasons().then(setSeasons).catch(() => setSeasons([]));
  }, []);

  const patch = (p) => setLocal((s) => ({ ...s, ...p }));
  const toggleInclude = (k) => patch({ include: { ...local.include, [k]: !local.include[k] } });

  const parseEmails = (text) =>
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = () => {
    onSaveSettings({
      ...local,
      recipients: parseEmails(recipientsText),
      protocolRecipients: parseEmails(protocolRecipientsText),
    });
  };

  const sendTestProtocol = async () => {
    setProtoMsg(null);
    const id = Number(testMatchId);
    if (!id) return setProtoMsg({ kind: 'err', text: 'Düzgün matchId daxil edin' });
    try {
      const r = await api.sendProtocol({ matchId: id });
      setProtoMsg({ kind: 'ok', text: `Göndərildi → ${r.to.join(', ')}` });
      onReloadStatus?.();
    } catch (err) {
      setProtoMsg({ kind: 'err', text: err.message });
    }
  };

  const runWatchNow = async () => {
    setProtoMsg(null);
    try {
      const r = await api.runProtocolWatch();
      if (r.skipped) setProtoMsg({ kind: 'err', text: `Ötürüldü: ${r.skipped}` });
      else {
        setProtoMsg({
          kind: 'ok',
          text: `Yoxlanıldı: ${r.checked} oyun, göndərildi: ${r.sent.length}`,
        });
        onReloadStatus?.();
      }
    } catch (err) {
      setProtoMsg({ kind: 'err', text: err.message });
    }
  };

  const last = status?.lastSend;
  const lastProtocol = status?.lastProtocolSend;

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
        <h3>Protokol bildirişləri (75 dəq əvvəl)</h3>
        <p className="hint">
          Oyundan əvvəl protokol (start heyət, ehtiyat, məşqçilər, hakimlər) yayımlanan kimi
          avtomatik Outlook məktubu göndərir. Hər oyun üçün yalnız bir dəfə göndərilir.
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={!!local.protocolWatch}
            onChange={(e) => patch({ protocolWatch: e.target.checked })}
          />
          <span>Protokol izləyici {local.protocolWatch ? 'AKTİV' : 'SÖNDÜRÜLÜB'}</span>
        </label>

        <label className="field">
          Yoxlama tezliyi (cron)
          <select
            value={local.protocolPollCron}
            onChange={(e) => patch({ protocolPollCron: e.target.value })}
          >
            {[
              { label: 'Hər 5 dəqiqə', value: '*/5 * * * *' },
              { label: 'Hər 10 dəqiqə', value: '*/10 * * * *' },
              { label: 'Hər 15 dəqiqə', value: '*/15 * * * *' },
              { label: 'Hər dəqiqə', value: '* * * * *' },
            ].map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.value}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Oyundan neçə dəqiqə əvvəl izləməyə başlasın
          <input
            type="number"
            min={15}
            max={240}
            value={local.protocolLeadMin ?? 90}
            onChange={(e) => patch({ protocolLeadMin: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          Alıcılar (boş buraxsanız əsas alıcılara göndərilir)
          <textarea
            rows={3}
            value={protocolRecipientsText}
            onChange={(e) => setProtocolRecipientsText(e.target.value)}
            placeholder="ad@nümunə.az"
          />
        </label>

        <button className="btn primary" onClick={save} disabled={busy}>
          Parametrləri yadda saxla
        </button>

        <div className="token-row" style={{ marginTop: 12 }}>
          <input
            type="number"
            value={testMatchId}
            onChange={(e) => setTestMatchId(e.target.value)}
            placeholder="Test: matchId"
          />
          <button className="btn ghost" onClick={sendTestProtocol}>
            Test göndər
          </button>
          <button className="btn ghost" onClick={runWatchNow}>
            İndi yoxla
          </button>
        </div>
        {protoMsg && (
          <p className={protoMsg.kind === 'ok' ? 'ok' : 'err'} style={{ marginTop: 8 }}>
            {protoMsg.text}
          </p>
        )}

        <div className="status" style={{ marginTop: 12 }}>
          <div>
            <strong>İzləyici:</strong>{' '}
            {status?.protocolWatch?.active ? (
              <span className="ok">aktiv ({status.protocolWatch.cron})</span>
            ) : (
              <span className="muted">söndürülüb</span>
            )}
          </div>
          <div>
            <strong>Son protokol göndərmə:</strong>{' '}
            {lastProtocol ? (
              <span className={lastProtocol.ok ? 'ok' : 'err'}>
                {new Date(lastProtocol.at).toLocaleString('az-AZ')} —{' '}
                {lastProtocol.ok
                  ? `${lastProtocol.match || lastProtocol.matchId} → ${lastProtocol.to.join(', ')}`
                  : `Xəta: ${lastProtocol.error}`}
              </span>
            ) : (
              <span className="muted">hələ yoxdur</span>
            )}
          </div>
        </div>
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
              {{ graph: 'Microsoft Graph', smtp2go: 'SMTP2GO', smtp: 'SMTP' }[
                status?.mailProvider
              ] || 'SMTP'}{' '}
              —{' '}
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
