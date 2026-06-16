import React from 'react';

export function GLDataList({ columns = [], rows = [], emptyLabel = 'Aucune donnée.' }) {
  return (
    <div className="gl-data-list">
      <div className="gl-admin-table-wrap gl-data-list__desktop">
        <table className="gl-admin-table gl-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.key} className={row.rowClassName || ''}>
                  {row.desktopCells}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="gl-data-list__mobile">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.key} className="gl-data-card">
              {row.mobileCells}
            </article>
          ))
        ) : (
          <article className="gl-data-card">
            <p>{emptyLabel}</p>
          </article>
        )}
      </div>
    </div>
  );
}
