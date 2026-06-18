import { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';
import EditableTable from './components/EditableTable.jsx';
import LineupsEditor from './components/LineupsEditor.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import './App.css';

const TABS = [
  { id: 'players', label: 'Futbolçular' },
  { id: 'lineups', label: 'Heyətlər' },
  { id: 'fixtures', label: 'Təqvim' },
  { id: 'settings', label: 'Parametrlər' },
];

const PLAYER_COLS = [
  { key: 'id', label: 'ID', type: 'number', width: '70px' },
  { key: 'firstName', label: 'Ad' },
  { key: 'lastName', label: 'Soyad' },
  { key: 'position', label: 'Mövqe' },
  { key: 'club', label: 'Klub' },
  { key: 'jerseyNumber', label: '№', type: 'number', width: '70px' },
  { key: 'photo', label: 'Foto (URL)' },
];

const FIXTURE_COLS = [
  { key: 'round', label: 'Tur', type: 'number', width: '80px' },
  { key: 'date', label: 'Tarix' },
  { key: 'time', label: 'Saat', width: '90px' },
  { key: 'homeTeam', label: 'Ev sahibi' },
  { key: 'awayTeam', label: 'Qonaq' },
];

const newPlayer = (rows) => ({
  id: Math.max(0, ...rows.map((r) => r.id || 0)) + 1,
  firstName: '', lastName: '', position: '', club: '', jerseyNumber: 0, photo: '',
});
const newFixture = () => ({ round: 1, date: '', time: '', homeTeam: '', awayTeam: '' });

export default function App() {
  const [tab, setTab] = useState('players');
  const [players, setPlayers] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [token, setTok] = useState(getToken());
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState({});

  const flash = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [p, l, f, s, st] = await Promise.all([
        api.getPlayers(), api.getLineups(), api.getFixtures(), api.getSettings(), api.getStatus(),
      ]);
      setPlayers(p); setLineups(l); setFixtures(f); setSettings(s); setStatus(st);
      setDirty({});
    } catch (err) {
      flash(err.message, 'err');
    }
  }, [flash]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const markDirty = (key) => setDirty((d) => ({ ...d, [key]: true }));

  const saveData = async (key) => {
    setBusy(true);
    try {
      if (key === 'players') await api.savePlayers(players);
      if (key === 'lineups') await api.saveLineups(lineups);
      if (key === 'fixtures') await api.saveFixtures(fixtures);
      setDirty((d) => ({ ...d, [key]: false }));
      flash('Yadda saxlanıldı');
    } catch (err) {
      flash(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (patch) => {
    setBusy(true);
    try {
      const res = await api.saveSettings(patch);
      setSettings(res.settings);
      setStatus((s) => ({ ...s, scheduler: res.scheduler }));
      flash('Parametrlər yadda saxlanıldı');
    } catch (err) {
      flash(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await api.sendNow();
      flash(`Göndərildi → ${r.to.join(', ')}`);
      setStatus((s) => ({ ...s, lastSend: r }));
    } catch (err) {
      flash(`Göndərmə xətası: ${err.message}`, 'err');
      api.getStatus().then(setStatus).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const saveTokenVal = (t) => {
    setToken(t);
    setTok(t);
    flash('Token yadda saxlanıldı');
    loadAll();
  };

  // Pull fresh data from the PFL API. Refreshes the dataset for the active tab
  // (or everything from the Settings tab), then reloads it into the UI.
  const refreshFromPfl = async () => {
    const what = ['players', 'fixtures', 'lineups'].includes(tab) ? tab : 'all';
    setBusy(true);
    flash(`PFL-dən yüklənir (${what})…`);
    try {
      const { summary } = await api.refresh({ what });
      await loadAll();
      const parts = Object.entries(summary).map(([k, v]) => `${k}: ${v.count}`);
      flash(`PFL-dən yeniləndi — ${parts.join(', ')}`);
    } catch (err) {
      flash(`PFL xətası: ${err.message}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚽</span>
          <div>
            <h1>AFFA Fantasy — MailSender</h1>
            <p>PFL məlumatlarını redaktə et və Outlook ilə göndər</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className={`pill ${settings?.autoSend ? 'on' : 'off'}`}>
            Avto: {settings?.autoSend ? 'AÇIQ' : 'BAĞLI'}
          </span>
          <button className="btn primary" onClick={refreshFromPfl} disabled={busy}>
            ⬇ PFL-dən yenilə
          </button>
          <button className="btn ghost" onClick={loadAll} disabled={busy}>↻ Yenilə</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {dirty[t.id] && <span className="dot" title="Yadda saxlanmamış dəyişikliklər" />}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'players' && (
          <Pane title="Futbolçular bazası" dirty={dirty.players} busy={busy} onSave={() => saveData('players')}>
            <EditableTable
              columns={PLAYER_COLS}
              rows={players}
              onChange={(r) => { setPlayers(r); markDirty('players'); }}
              makeRow={newPlayer}
            />
          </Pane>
        )}

        {tab === 'lineups' && (
          <Pane title="Start heyət və ehtiyat oyunçular" dirty={dirty.lineups} busy={busy} onSave={() => saveData('lineups')}>
            <LineupsEditor
              lineups={lineups}
              onChange={(l) => { setLineups(l); markDirty('lineups'); }}
            />
          </Pane>
        )}

        {tab === 'fixtures' && (
          <Pane title="Mövsüm üzrə oyun təqvimi" dirty={dirty.fixtures} busy={busy} onSave={() => saveData('fixtures')}>
            <EditableTable
              columns={FIXTURE_COLS}
              rows={fixtures}
              onChange={(r) => { setFixtures(r); markDirty('fixtures'); }}
              makeRow={newFixture}
            />
          </Pane>
        )}

        {tab === 'settings' && settings && (
          <SettingsPanel
            settings={settings}
            onSaveSettings={saveSettings}
            token={token}
            onSaveToken={saveTokenVal}
            status={status}
            onSendNow={sendNow}
            busy={busy}
          />
        )}
      </main>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function Pane({ title, dirty, busy, onSave, children }) {
  return (
    <section className="pane">
      <div className="pane-head">
        <h2>{title}</h2>
        <button className="btn primary" onClick={onSave} disabled={busy || !dirty}>
          {dirty ? 'Dəyişiklikləri yadda saxla' : 'Yadda saxlanılıb'}
        </button>
      </div>
      {children}
    </section>
  );
}
