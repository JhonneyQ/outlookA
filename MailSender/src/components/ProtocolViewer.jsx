// Protocol browser + editor — pick a (usually past) match from the fixtures
// list and view its full protocol: both teams' coach + lineups, officials, and
// match events. The first time a match is opened it is seeded live from PFL;
// you can save that JSON, edit it, and re-send it by e-mail. A saved (edited)
// copy is always preferred over the live PFL version.

import { useMemo, useState } from 'react';
import { api } from '../api.js';

const STATUS_LABEL = {
  pending: 'Gözləyir',
  started: 'Başladı',
  paused: 'Fasilə',
  finished: 'Bitdi',
  unknown: '—',
};

const EVENT_ICON = {
  goal: '⚽',
  yellow_card: '🟨',
  second_yellow_card: '🟨🟥',
  red_card: '🟥',
  substitution: '🔁',
};

export default function ProtocolViewer({ fixtures, flash }) {
  const [search, setSearch] = useState('');
  const [onlyFinished, setOnlyFinished] = useState(true);
  const [selected, setSelected] = useState(null);
  const [protocol, setProtocol] = useState(null);
  const [source, setSource] = useState('live'); // 'live' | 'stored'
  const [published, setPublished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonErr, setJsonErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (fixtures || [])
      .filter((f) => f.matchId)
      .filter((f) => (onlyFinished ? f.status === 'finished' : true))
      .filter(
        (f) =>
          !q ||
          `${f.homeTeam} ${f.awayTeam}`.toLowerCase().includes(q) ||
          String(f.round).includes(q)
      )
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [fixtures, search, onlyFinished]);

  const open = async (f) => {
    setSelected(f.matchId);
    setProtocol(null);
    setEditing(false);
    setJsonErr(null);
    setLoading(true);
    try {
      const stored = await api.getStoredProtocol(f.matchId);
      if (stored) {
        setProtocol(stored);
        setSource('stored');
        setPublished(true);
      } else {
        const { protocol: p, published: pub } = await api.getProtocol(f.matchId);
        setProtocol(p);
        setPublished(pub);
        setSource('live');
      }
    } catch (err) {
      flash(`Protokol yüklənmədi: ${err.message}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch the original from PFL, discarding what's shown (does not delete a
  // saved copy until you save over it).
  const reloadLive = async () => {
    setLoading(true);
    setEditing(false);
    try {
      const { protocol: p, published: pub } = await api.getProtocol(selected);
      setProtocol(p);
      setPublished(pub);
      setSource('live');
    } catch (err) {
      flash(`PFL-dən yüklənmədi: ${err.message}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  // Save the currently-shown protocol as the initial editable JSON.
  const saveAsInitial = async () => {
    setSaving(true);
    try {
      const saved = await api.saveProtocol(selected, protocol);
      setProtocol(saved);
      setSource('stored');
      flash('İlkin JSON saxlanıldı — artıq redaktə edilə bilər');
    } catch (err) {
      flash(`Saxlanmadı: ${err.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setJsonText(JSON.stringify(protocol, null, 2));
    setJsonErr(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      return setJsonErr(`JSON xətası: ${err.message}`);
    }
    setSaving(true);
    try {
      const saved = await api.saveProtocol(selected, parsed);
      setProtocol(saved);
      setSource('stored');
      setEditing(false);
      flash('Redaktə yadda saxlanıldı');
    } catch (err) {
      flash(`Saxlanmadı: ${err.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const removeStored = async () => {
    setSaving(true);
    try {
      await api.deleteStoredProtocol(selected);
      flash('Saxlanmış nüsxə silindi — PFL versiyası yükləndi');
      await reloadLive();
    } catch (err) {
      flash(`Silinmədi: ${err.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const sendMail = async () => {
    setSending(true);
    try {
      const r = await api.sendProtocol({ matchId: selected });
      flash(`Göndərildi → ${r.to.join(', ')}`);
    } catch (err) {
      flash(`Göndərmə xətası: ${err.message}`, 'err');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="protocol-view">
      <aside className="protocol-list card">
        <div className="protocol-filters">
          <input
            className="cell search"
            placeholder="Komanda / tur axtar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={onlyFinished}
              onChange={(e) => setOnlyFinished(e.target.checked)}
            />
            Yalnız bitmiş
          </label>
        </div>
        <div className="protocol-rows">
          {list.length === 0 && (
            <p className="empty">Oyun tapılmadı. Əvvəlcə “PFL-dən yenilə” edin.</p>
          )}
          {list.map((f) => (
            <button
              key={f.matchId}
              className={`protocol-row ${selected === f.matchId ? 'active' : ''}`}
              onClick={() => open(f)}
            >
              <span className="pr-teams">
                {f.homeTeam} – {f.awayTeam}
              </span>
              <span className="pr-meta">
                {[f.date, f.time, f.round !== '' && f.round != null ? `Tur ${f.round}` : '']
                  .filter(Boolean)
                  .join(' · ')}
                <span className={`pr-status s-${f.status}`}>
                  {STATUS_LABEL[f.status] || f.status}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="protocol-detail card">
        {!selected && <p className="empty">Soldan oyun seçin.</p>}
        {selected && loading && <p className="empty">Yüklənir…</p>}
        {selected && !loading && !protocol && <p className="empty">Protokol mövcud deyil.</p>}
        {protocol && !loading && (
          <>
            <Header
              protocol={protocol}
              source={source}
              published={published}
              editing={editing}
              saving={saving}
              sending={sending}
              onSaveAsInitial={saveAsInitial}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => {
                setEditing(false);
                setJsonErr(null);
              }}
              onReloadLive={reloadLive}
              onRemoveStored={removeStored}
              onSend={sendMail}
            />
            {editing ? (
              <div className="json-edit">
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                />
                {jsonErr && <p className="warn">{jsonErr}</p>}
              </div>
            ) : (
              <Body protocol={protocol} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Header({
  protocol,
  source,
  published,
  editing,
  saving,
  sending,
  onSaveAsInitial,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onReloadLive,
  onRemoveStored,
  onSend,
}) {
  const m = protocol.match;
  const meta = [
    m.round !== '' && m.round != null ? `Tur ${m.round}` : '',
    m.date,
    m.kickoffTime,
    m.stadium,
  ]
    .filter(Boolean)
    .join(' · ');
  const hasScore = m.score && (m.score.home != null || m.score.away != null);
  const score = hasScore
    ? `${m.score.home ?? '-'} : ${m.score.away ?? '-'}${
        m.score.penalty ? ` (pen. ${m.score.penalty})` : ''
      }`
    : null;

  return (
    <>
      <div className="pd-head">
        <div>
          <h3>
            {m.homeTeam.name} <span className="muted">–</span> {m.awayTeam.name}
            {score && <span className="pd-score">{score}</span>}
            <span className={`src-badge ${source}`}>
              {source === 'stored' ? 'Redaktə edilmiş (saxlanmış)' : 'PFL canlı'}
            </span>
          </h3>
          <p className="hint">{meta}</p>
        </div>
        <div className="pd-actions">
          {protocol.protocolPdfUrl && (
            <a className="btn ghost" href={protocol.protocolPdfUrl} target="_blank" rel="noreferrer">
              📄 PDF
            </a>
          )}
          {editing ? (
            <>
              <button className="btn primary" onClick={onSaveEdit} disabled={saving}>
                {saving ? 'Saxlanılır…' : '💾 Yadda saxla'}
              </button>
              <button className="btn ghost" onClick={onCancelEdit} disabled={saving}>
                Ləğv et
              </button>
            </>
          ) : (
            <>
              {source === 'live' && (
                <button className="btn ghost" onClick={onSaveAsInitial} disabled={saving}>
                  💾 İlk JSON kimi saxla
                </button>
              )}
              <button className="btn primary" onClick={onStartEdit}>
                ✎ Redaktə et
              </button>
              {source === 'stored' && (
                <button className="btn ghost" onClick={onReloadLive}>
                  ↻ PFL versiyası
                </button>
              )}
              {source === 'stored' && (
                <button className="icon-btn danger" onClick={onRemoveStored} disabled={saving}>
                  🗑 Saxlanmışı sil
                </button>
              )}
              <button className="btn send" onClick={onSend} disabled={sending}>
                {sending ? 'Göndərilir…' : '✉ Mailə göndər'}
              </button>
            </>
          )}
        </div>
      </div>
      {!published && source === 'live' && (
        <p className="warn">⚠ Bu oyun üçün protokol hələ tam yayımlanmayıb.</p>
      )}
    </>
  );
}

function Body({ protocol }) {
  const m = protocol.match;
  return (
    <>
      <div className="pd-teams">
        <TeamCard team={m.homeTeam} />
        <TeamCard team={m.awayTeam} />
      </div>
      <Officials o={protocol.officials} />
      <Events events={protocol.events} />
    </>
  );
}

function TeamCard({ team }) {
  const row = (p) => (
    <li key={p.id}>
      <span className="num">{p.shirtNumber || ''}</span>
      <span className="nm">
        {p.fullName || `${p.firstName} ${p.lastName}`}
        {p.captain && <em className="badge cap">K</em>}
        {p.goalkeeper && <em className="badge gk">QV</em>}
      </span>
      <span className="pos">{p.position}</span>
    </li>
  );
  return (
    <div className="team-card">
      <h4>{team.name}</h4>
      <p className="coach">
        <strong>Baş məşqçi:</strong> {team.coach || '—'}
      </p>
      <h5>Start heyət</h5>
      <ul className="pl">
        {team.startingLineup?.length ? (
          team.startingLineup.map(row)
        ) : (
          <li className="muted">—</li>
        )}
      </ul>
      <h5>Ehtiyat oyunçular</h5>
      <ul className="pl">
        {team.substitutes?.length ? team.substitutes.map(row) : <li className="muted">—</li>}
      </ul>
    </div>
  );
}

function Officials({ o }) {
  if (!o) return null;
  const rows = [
    ['Baş hakim', o.mainReferee],
    ['Köməkçi hakimlər', (o.assistantReferees || []).join(', ')],
    ['Dördüncü hakim', o.fourthReferee],
    ['VAR', o.var],
    ['AVAR', o.avar],
    ['Hakim-inspektor', o.refereeInspector],
    ['AFFA nümayəndəsi', o.affaDelegate],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <div className="pd-section">
      <h4>Hakim heyəti və rəsmilər</h4>
      <table className="officials">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Events({ events }) {
  if (!events) return null;
  const all = [
    ...(events.goals || []),
    ...(events.yellowCards || []),
    ...(events.secondYellowCards || []),
    ...(events.redCards || []),
    ...(events.substitutions || []),
  ];
  if (!all.length) return null;
  all.sort((a, b) => (parseInt(a.minute, 10) || 0) - (parseInt(b.minute, 10) || 0));

  const goalSuffix = (g) =>
    g === 'own_goal' ? ' (avtoqol)' : g === 'penalty' ? ' (penalti)' : '';

  return (
    <div className="pd-section">
      <h4>Oyun hadisələri</h4>
      <ul className="events">
        {all.map((e) => (
          <li key={`${e.type}-${e.id}`}>
            <span className="ev-min">{e.minute ? `${e.minute}'` : ''}</span>
            <span className="ev-ico">{EVENT_ICON[e.type] || ''}</span>
            <span className="ev-txt">
              {e.player?.fullName || ''}
              {e.type === 'substitution' && e.secondPlayer?.fullName
                ? ` → ${e.secondPlayer.fullName}`
                : ''}
              {e.type === 'goal' ? goalSuffix(e.goalType) : ''}
              <span className="ev-team"> · {e.teamName}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
