// Lineups editor — one block per match, each with an editable Start XI and
// substitutes grid. Matches the spec fields: ID, Ad, Soyad, Mövqe, № (forma), Foto.

import EditableTable from './EditableTable.jsx';

const PLAYER_COLS = [
  { key: 'id', label: 'ID', type: 'number', width: '70px' },
  { key: 'firstName', label: 'Ad' },
  { key: 'lastName', label: 'Soyad' },
  { key: 'position', label: 'Mövqe' },
  { key: 'jerseyNumber', label: '№', type: 'number', width: '70px' },
  { key: 'photo', label: 'Foto (URL)' },
];

const newPlayer = (rows) => ({
  id: Math.max(0, ...rows.map((r) => r.id || 0)) + 1,
  firstName: '',
  lastName: '',
  position: '',
  jerseyNumber: 0,
  photo: '',
});

export default function LineupsEditor({ lineups, onChange }) {
  const updateMatch = (mi, patch) =>
    onChange(lineups.map((m, idx) => (idx === mi ? { ...m, ...patch } : m)));

  return (
    <div className="lineups">
      {lineups.map((m, mi) => (
        <div key={m.matchId ?? mi} className="card match">
          <div className="match-head">
            <input
              className="cell team"
              value={m.homeTeam ?? ''}
              onChange={(e) => updateMatch(mi, { homeTeam: e.target.value })}
            />
            <span className="vs">–</span>
            <input
              className="cell team"
              value={m.awayTeam ?? ''}
              onChange={(e) => updateMatch(mi, { awayTeam: e.target.value })}
            />
            <label className="round-lbl">
              Tur
              <input
                className="cell round"
                type="number"
                value={m.round ?? ''}
                onChange={(e) => updateMatch(mi, { round: Number(e.target.value) })}
              />
            </label>
          </div>

          <h4>Start heyət</h4>
          <EditableTable
            columns={PLAYER_COLS}
            rows={m.startXI || []}
            onChange={(startXI) => updateMatch(mi, { startXI })}
            makeRow={newPlayer}
          />

          <h4>Ehtiyat oyunçular</h4>
          <EditableTable
            columns={PLAYER_COLS}
            rows={m.substitutes || []}
            onChange={(substitutes) => updateMatch(mi, { substitutes })}
            makeRow={newPlayer}
          />
        </div>
      ))}
    </div>
  );
}
