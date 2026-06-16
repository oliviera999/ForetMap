/**
 * Panneau repliable « Observations des élèves » de TeacherStats :
 * chargement à la demande (bouton), erreurs et liste déroulante (max 100).
 * Présentation pure : l'état (observations, chargement, erreur) et l'appel
 * API restent dans le parent.
 */
export function TeacherObservationsPanel({
  roleTerms,
  observations = [],
  obsLoading = false,
  obsError = '',
  onLoad,
}) {
  return (
    <details className="plant-more" style={{ marginBottom: 14 }}>
      <summary>📓 Observations des {roleTerms.studentPlural} (max 100)</summary>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onLoad}
            disabled={obsLoading}
          >
            {obsLoading ? 'Chargement…' : 'Charger les observations'}
          </button>
        </div>
        {obsError && <div className="auth-error">⚠️ {obsError}</div>}
        {!obsError && !obsLoading && observations.length === 0 && (
          <p style={{ margin: 0, fontSize: '.84rem', color: '#6b7280' }}>
            Aucune observation chargée (clique sur le bouton pour rafraîchir).
          </p>
        )}
        {observations.length > 0 && (
          <div
            style={{
              maxHeight: 280,
              overflow: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 8,
              background: '#f8fafc',
            }}
          >
            {observations.map((entry) => {
              const studentName =
                `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || 'n3beur';
              const zoneLabel = String(entry.zone_name || '').trim();
              const dateLabel = entry.created_at
                ? new Date(entry.created_at).toLocaleString('fr-FR')
                : '';
              return (
                <div
                  key={entry.id}
                  style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}
                >
                  <div style={{ fontSize: '.82rem', color: '#374151' }}>
                    <strong>{studentName}</strong>
                    {zoneLabel ? ` · ${zoneLabel}` : ''}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                  </div>
                  <div
                    style={{
                      fontSize: '.82rem',
                      color: '#4b5563',
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {String(entry.content || '').trim() || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
