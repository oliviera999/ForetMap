import {
  formatDateTime,
  runModeLabel,
  runStatusLabel,
  scopeSummary,
} from '../../../utils/moodleAdminReport.js';

/** Historique des exécutions (`GET /runs`) ; un clic ouvre le rapport complet. */
export function MoodleRunHistory({ runs, total, onOpen, selectedId }) {
  if (!runs || !runs.length) {
    return <p style={{ color: 'var(--ink-soft)' }}>Aucune exécution enregistrée.</p>;
  }
  return (
    <div className="moodle-table-wrap" data-testid="moodle-history">
      <table className="moodle-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Mode</th>
            <th scope="col">État</th>
            <th scope="col">Périmètre</th>
            <th scope="col">Début</th>
            <th scope="col">Créations</th>
            <th scope="col">Désactivations</th>
            <th scope="col">Conflits</th>
            <th scope="col"> </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className={selectedId === run.id ? 'is-selected' : ''}>
              <td>{run.id}</td>
              <td>{runModeLabel(run.mode)}</td>
              <td>{runStatusLabel(run.status)}</td>
              <td style={{ fontSize: 'var(--text-sm)' }}>{scopeSummary(run.scope)}</td>
              <td>{formatDateTime(run.startedAt)}</td>
              <td>{run.totals?.creations ?? 0}</td>
              <td>{run.totals?.deactivations ?? 0}</td>
              <td>{run.totals?.conflicts ?? 0}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpen(run.id)}
                >
                  Rapport
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {typeof total === 'number' && total > runs.length && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          {runs.length} exécution(s) affichée(s) sur {total}.
        </p>
      )}
    </div>
  );
}
