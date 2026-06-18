// Generic editable grid: edit cells inline, add/remove rows.
// `columns` = [{ key, label, type? ('text'|'number'), width? }]

export default function EditableTable({ columns, rows, onChange, makeRow }) {
  const update = (i, key, value) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    onChange(next);
  };

  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...rows, makeRow(rows)]);

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            <th className="act-col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((c) => (
                <td key={c.key}>
                  <input
                    className="cell"
                    type={c.type === 'number' ? 'number' : 'text'}
                    value={row[c.key] ?? ''}
                    onChange={(e) =>
                      update(
                        i,
                        c.key,
                        c.type === 'number' ? Number(e.target.value) : e.target.value
                      )
                    }
                  />
                </td>
              ))}
              <td className="act-col">
                <button className="icon-btn danger" title="Sil" onClick={() => removeRow(i)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="empty">
                Məlumat yoxdur
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {makeRow && (
        <button className="btn ghost" onClick={addRow}>
          + Sətir əlavə et
        </button>
      )}
    </div>
  );
}
