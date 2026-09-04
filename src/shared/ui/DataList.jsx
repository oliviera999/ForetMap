function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Classes neutres (feuille `src/shared/styles/data-list.css`, chargée par les deux entrées). */
export const DATA_LIST_CLASS_NAMES = Object.freeze({
  root: 'fm-data-list',
  desktop: 'fm-data-list__desktop fm-data-table-wrap',
  table: 'fm-data-table',
  mobile: 'fm-data-list__mobile',
  card: 'fm-data-card',
});

/**
 * Liste de données responsive (kit d'interface, lot 3 — issue de `GLDataList`) : tableau sur
 * écran large, cartes en dessous de 640 px. Chaque ligne fournit ses cellules « bureau »
 * (`<td>…`) et « mobile » (contenu de carte) : le composant ne connaît pas les données.
 *
 * @param {object} props
 * @param {Array<{ key: string, label: import('react').ReactNode }>} props.columns
 * @param {Array<{ key: string|number, desktopCells: import('react').ReactNode, mobileCells: import('react').ReactNode, rowClassName?: string }>} props.rows
 * @param {string} [props.emptyLabel='Aucune donnée.']
 * @param {string} [props.caption] légende accessible du tableau.
 * @param {object} [props.classNames] classes produit additionnelles (`root`, `desktop`, `table`, `mobile`, `card`).
 */
export function DataList({
  columns = [],
  rows = [],
  emptyLabel = 'Aucune donnée.',
  caption = null,
  classNames = null,
}) {
  const base = DATA_LIST_CLASS_NAMES;
  return (
    <div className={joinClassNames(base.root, classNames?.root)}>
      <div className={joinClassNames(base.desktop, classNames?.desktop)}>
        <table className={joinClassNames(base.table, classNames?.table)}>
          {caption ? <caption className="fm-visually-hidden">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
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
                <td colSpan={Math.max(1, columns.length)}>{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={joinClassNames(base.mobile, classNames?.mobile)}>
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.key} className={joinClassNames(base.card, classNames?.card)}>
              {row.mobileCells}
            </article>
          ))
        ) : (
          <article className={joinClassNames(base.card, classNames?.card)}>
            <p>{emptyLabel}</p>
          </article>
        )}
      </div>
    </div>
  );
}
