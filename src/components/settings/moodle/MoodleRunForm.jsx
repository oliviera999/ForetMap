import { useState } from 'react';
import { canApplyAfterDryRun, formatDateTime } from '../../../utils/moodleAdminReport.js';

/**
 * Lancer une exécution : cases à cocher par cohorte de l'année, « Simuler » toujours possible,
 * « Appliquer » grisé tant que la simulation du même périmètre n'a pas réussi (section 12).
 * L'option `force` (seuil dépassé ou simulation trop ancienne) exige un motif écrit.
 */
export function MoodleRunForm({
  cohorts,
  selectedIds,
  onToggleCohort,
  onSelectAll,
  teams,
  onToggleTeams,
  lastDryRun,
  running,
  onSimulate,
  onApply,
  configured,
  enabled,
}) {
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const gate = canApplyAfterDryRun({ lastDryRun, selectedCohortIds: selectedIds, teams });
  const canApply =
    enabled &&
    configured &&
    !running &&
    selectedIds.length > 0 &&
    (gate.ok || (force && forceReason.trim().length >= 3));
  const applyHint = !enabled
    ? 'Activer la synchronisation dans l’état du lien'
    : gate.ok
      ? ''
      : gate.reason;

  return (
    <div data-testid="moodle-run-form">
      <div className="moodle-actions" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          {selectedIds.length} cohorte(s) cochée(s) sur {cohorts.length}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onSelectAll}>
          {selectedIds.length === cohorts.length ? 'Tout décocher' : 'Tout cocher'}
        </button>
      </div>
      <div className="moodle-table-wrap">
        <table className="moodle-table">
          <thead>
            <tr>
              <th scope="col"> </th>
              <th scope="col">Cohorte</th>
              <th scope="col">Nom</th>
              <th scope="col">Politique</th>
              <th scope="col">Membres</th>
              <th scope="col">Groupe ForetMap</th>
              <th scope="col">Dernière sync</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--ink-soft)' }}>
                  Aucune cohorte de l’année visible avec ce jeton.
                </td>
              </tr>
            )}
            {cohorts.map((c) => (
              <tr key={c.id} className={c.policyKey ? '' : 'is-muted'}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Cohorte ${c.idnumber}`}
                    checked={selectedIds.includes(c.id)}
                    disabled={!c.policyKey}
                    onChange={() => onToggleCohort(c.id)}
                  />
                </td>
                <td>
                  <code>{c.idnumber}</code>
                </td>
                <td>{c.name}</td>
                <td>{c.policyKey || <span className="auth-error">aucune</span>}</td>
                <td>{c.memberCount}</td>
                <td>{c.groupId ? 'lié' : '—'}</td>
                <td>{formatDateTime(c.lastSyncedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={teams} onChange={(e) => onToggleTeams(e.target.checked)} />
        Inclure les miroirs d’équipes (parties G&L)
      </label>
      <details style={{ marginTop: 8 }}>
        <summary>Forcer (seuil dépassé ou simulation de plus de 24 h)</summary>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Passer outre les gardes, avec un motif journalisé
        </label>
        <input
          type="text"
          placeholder="Motif (obligatoire pour forcer)"
          value={forceReason}
          disabled={!force}
          onChange={(e) => setForceReason(e.target.value)}
          style={{ marginTop: 6, width: '100%' }}
        />
      </details>
      <div className="moodle-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!configured || running || selectedIds.length === 0}
          onClick={() => onSimulate({ force, forceReason: forceReason.trim() || null })}
        >
          {running ? 'Exécution en cours…' : 'Simuler'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canApply}
          title={applyHint || undefined}
          onClick={() => onApply({ force, forceReason: forceReason.trim() || null })}
        >
          Appliquer
        </button>
        {applyHint && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>{applyHint}</span>
        )}
      </div>
    </div>
  );
}
