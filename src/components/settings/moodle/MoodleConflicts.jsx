import {
  CONFLICT_RESOLUTION_LABELS,
  conflictKindLabel,
  formatDateTime,
  userDisplay,
} from '../../../utils/moodleAdminReport.js';

/**
 * Conflits ouverts par la comparaison à trois (section 9) : le reflet a bougé alors que le
 * maître n'a pas changé. Trois issues : garder Moodle (le maître), appliquer le côté ForetMap
 * vers Moodle, ou ignorer (la divergence devient le dernier état commun).
 */
export function MoodleConflicts({ items, onResolve, busyId }) {
  if (!items || !items.length) {
    return <p style={{ color: 'var(--ink-soft)' }}>Aucun conflit ouvert.</p>;
  }
  return (
    <div className="moodle-table-wrap" data-testid="moodle-conflicts">
      <table className="moodle-table">
        <thead>
          <tr>
            <th scope="col">Groupe</th>
            <th scope="col">Nature</th>
            <th scope="col">Personne</th>
            <th scope="col">Côté Moodle</th>
            <th scope="col">Côté ForetMap</th>
            <th scope="col">Décision</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const busy = busyId === c.id;
            return (
              <tr key={c.id}>
                <td>
                  <code>{c.externalIdnumber || c.externalId}</code>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
                    {c.groupName || '—'} · {formatDateTime(c.detectedAt)}
                  </div>
                </td>
                <td>{conflictKindLabel(c.kind)}</td>
                <td>{c.user ? userDisplay(c.user) : '—'}</td>
                <td>{c.moodleState || '—'}</td>
                <td>{c.foretmapState || '—'}</td>
                <td>
                  <div className="moodle-actions" style={{ marginTop: 0 }}>
                    {Object.entries(CONFLICT_RESOLUTION_LABELS).map(([resolution, label]) => (
                      <button
                        key={resolution}
                        type="button"
                        className={`btn btn-sm ${resolution === 'keep_master' ? 'btn-primary' : 'btn-secondary'}`}
                        disabled={busy}
                        onClick={() => onResolve(c.id, resolution)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
