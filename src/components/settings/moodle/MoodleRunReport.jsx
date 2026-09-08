import {
  conflictKindLabel,
  formatDateTime,
  memberDisplay,
  runModeLabel,
  runStatusLabel,
  scopeSummary,
  summarizeTotals,
  userDisplay,
} from '../../../utils/moodleAdminReport.js';

function ListBlock({ title, items, render, testId }) {
  if (!items || !items.length) return null;
  return (
    <details className="moodle-report-list" data-testid={testId} open={items.length <= 10}>
      <summary>
        {title} ({items.length})
      </summary>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Rapport d'une exécution (section 14, point 4) : totaux d'abord, puis les listes qui comptent
 * (comptes créés, rapprochés par le nom à relire, doublons probables, désactivations, attentes,
 * conflits, alertes, cohortes sans politique). Même forme en simulation et en réel.
 */
export function MoodleRunReport({ run, onUndo, undoing }) {
  if (!run) return null;
  const report = run.report || {};
  const totals = summarizeTotals(report.totals || run.totals);
  const lists = report.lists || {};
  const canUndo = run.mode === 'apply' && run.status === 'succeeded';
  return (
    <div className="settings-admin-card" data-testid="moodle-run-report">
      <div className="moodle-status-row" style={{ justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0 }}>
          Exécution #{run.id} — {runModeLabel(run.mode)} — {runStatusLabel(run.status)}
        </h4>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          {formatDateTime(run.startedAt)}
        </span>
      </div>
      <p style={{ marginTop: 4, fontSize: 'var(--text-sm)' }}>
        Périmètre : {scopeSummary(report.scope || run.scope)}
      </p>
      {run.error && <p className="auth-error">{run.error}</p>}
      {report.thresholds?.blocked && (
        <div className="auth-error">
          Seuil de sécurité dépassé — rien n’est écrit sans « forcer » :
          <ul>
            {(report.thresholds.breaches || []).map((b) => (
              <li key={b.key}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(report.upstreamErrors) && report.upstreamErrors.length > 0 && (
        <div className="auth-error">
          Contrôles amont bloquants ({report.upstreamErrors.length}) :
          <ul>
            {report.upstreamErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.code} — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="moodle-totals" data-testid="moodle-totals">
        {totals.map((row) => (
          <div key={row.key} className={row.attention ? 'is-attention' : ''}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {report.applied && (
        <p data-testid="moodle-applied">
          Appliqué : {report.applied.actionsApplied} action(s), {report.applied.createdUsers}{' '}
          compte(s) créé(s)
          {report.applied.failedCohorts?.length
            ? ` — ${report.applied.failedCohorts.length} cohorte(s) en échec`
            : ''}
          .
        </p>
      )}
      <ListBlock
        title="Comptes à créer"
        items={lists.creations}
        testId="moodle-list-creations"
        render={(x) => `${x.cohort} — ${memberDisplay(x.member)}`}
      />
      <ListBlock
        title="Rapprochés par le nom (à relire)"
        items={lists.nameMatches}
        render={(x) => `${x.cohort} — ${memberDisplay(x.member)} → ${userDisplay(x.user)}`}
      />
      <ListBlock
        title="Doublons probables"
        items={lists.probableDuplicates}
        render={(x) => `${memberDisplay(x.member)} ↔ ${userDisplay(x.duplicate)}`}
      />
      <ListBlock
        title="Désactivations"
        items={lists.deactivations}
        render={(x) => `${userDisplay(x.user)} — ${x.reason}`}
      />
      <ListBlock
        title="Rapprochements en attente"
        items={lists.pendingMatches}
        render={(x) =>
          `${x.cohort} — ${memberDisplay(x.member)} : ${x.candidates?.length || 0} candidat(s)`
        }
      />
      <ListBlock
        title="Conflits d’e-mail"
        items={lists.emailConflicts}
        render={(x) => `${x.cohort} — ${memberDisplay(x.member)} : ${x.reason}`}
      />
      <ListBlock
        title="Conflits de comparaison"
        items={report.conflicts}
        render={(x) =>
          `${x.cohort} — ${conflictKindLabel(x.kind)}${x.user ? ` — ${userDisplay(x.user)}` : ''}`
        }
      />
      <ListBlock
        title="Alertes"
        items={lists.alerts}
        render={(x) => `${x.cohort ? `${x.cohort} — ` : ''}${x.message}`}
      />
      <ListBlock
        title="Cohortes de l’année sans politique"
        items={lists.unmatchedCohorts}
        render={(x) => `${x.idnumber} — ${x.name}`}
      />
      <ListBlock
        title="Joueurs G&L sans identité Moodle"
        items={lists.playersWithoutIdentity}
        render={(x) => userDisplay(x.user)}
      />
      {canUndo && onUndo && (
        <div className="moodle-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={undoing}
            onClick={() => onUndo(run.id)}
          >
            {undoing ? 'Annulation…' : 'Annuler cette exécution'}
          </button>
        </div>
      )}
    </div>
  );
}
