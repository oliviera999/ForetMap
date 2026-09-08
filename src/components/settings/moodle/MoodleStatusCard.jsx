import { formatDateTime, runModeLabel, runStatusLabel } from '../../../utils/moodleAdminReport.js';

/**
 * État du lien Moodle : configuré (URL + jeton dans `.env`, jamais affiché), activé (réglage),
 * dernier contrôle, dernière exécution, compteurs de conflits et d'attentes.
 */
export function MoodleStatusCard({ status, checking, onCheck, onToggleEnabled, savingEnabled }) {
  if (!status) return null;
  const configured = Boolean(status.configured);
  return (
    <div className="settings-admin-card moodle-status-card" data-testid="moodle-status">
      <div className="moodle-status-row">
        <span className={`moodle-badge ${configured ? 'is-ok' : 'is-off'}`}>
          {configured ? 'Configuré' : status.killSwitchOff ? 'Interrupteur coupé' : 'Non configuré'}
        </span>
        <span className="moodle-status-url">
          {status.baseUrl ? status.baseUrl : 'MOODLE_BASE_URL et MOODLE_WS_TOKEN absents de .env'}
        </span>
      </div>
      <label
        className="moodle-status-row"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <input
          type="checkbox"
          checked={Boolean(status.enabled)}
          disabled={savingEnabled}
          onChange={(e) => onToggleEnabled?.(e.target.checked)}
        />
        Synchronisation activée (les exécutions réelles sont refusées sinon)
      </label>
      <dl className="moodle-status-grid">
        <dt>Préfixe d’année</dt>
        <dd>{status.yearPrefix || '—'}</dd>
        <dt>Dernier contrôle</dt>
        <dd>
          {status.lastCheck
            ? `${status.lastCheck.ok ? 'OK' : 'Problèmes'} · ${formatDateTime(status.lastCheck.checkedAt)}`
            : 'jamais (dans ce processus)'}
        </dd>
        <dt>Dernière exécution</dt>
        <dd>
          {status.lastRun
            ? `#${status.lastRun.id} · ${runModeLabel(status.lastRun.mode)} · ${runStatusLabel(status.lastRun.status)} · ${formatDateTime(status.lastRun.startedAt)}`
            : 'aucune'}
        </dd>
        <dt>Conflits ouverts</dt>
        <dd>{status.openConflicts ?? 0}</dd>
        <dt>Rapprochements en attente</dt>
        <dd>{status.openPendingMatches ?? 0}</dd>
      </dl>
      <div className="moodle-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!configured || checking}
          onClick={onCheck}
        >
          {checking ? 'Contrôle en cours…' : 'Contrôler la connexion'}
        </button>
      </div>
    </div>
  );
}

/** Rapport de `POST /check` : fonctions autorisées, cohortes de l'année, erreurs. */
export function MoodleCheckReport({ report }) {
  if (!report) return null;
  const missing = report.functions?.filter((f) => !f.allowed) || [];
  return (
    <div className="settings-admin-card" data-testid="moodle-check-report">
      <h4 style={{ marginTop: 0 }}>
        Contrôle {report.ok ? 'réussi' : 'en échec'}
        {report.site?.sitename ? ` — ${report.site.sitename}` : ''}
        {report.site?.release ? ` (${report.site.release})` : ''}
      </h4>
      {missing.length > 0 && (
        <p className="auth-error">
          Fonctions Web Services manquantes : {missing.map((f) => f.name).join(', ')}
        </p>
      )}
      {(report.errors || []).map((e, i) => (
        <p key={i} className="auth-error">
          [{e.step}] {e.message}
        </p>
      ))}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        {report.functions?.length || 0} fonction(s) contrôlée(s) ·{' '}
        {(report.cohorts || []).filter((c) => c.ofYear).length} cohorte(s) de l’année ·{' '}
        {(report.cohorts || []).filter((c) => c.ofYear && !c.policyKey).length} sans politique
      </p>
    </div>
  );
}
