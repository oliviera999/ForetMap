import { useState } from 'react';
import { formatDateTime, memberDisplay } from '../../../utils/moodleAdminReport.js';

/**
 * Rapprochements en attente (section 8.1) : un membre Moodle a plusieurs homonymes côté
 * ForetMap, ou aucun candidat sûr. L'administrateur choisit le compte, demande une création ou
 * ignore ; la décision est rejouée à la prochaine exécution.
 */
export function MoodlePendingMatches({ items, onDecide, busyId }) {
  const [chosen, setChosen] = useState({});
  if (!items || !items.length) {
    return <p style={{ color: 'var(--ink-soft)' }}>Aucun rapprochement en attente.</p>;
  }
  return (
    <div className="moodle-table-wrap" data-testid="moodle-pending">
      <table className="moodle-table">
        <thead>
          <tr>
            <th scope="col">Membre Moodle</th>
            <th scope="col">Cohorte</th>
            <th scope="col">Motif</th>
            <th scope="col">Candidats ForetMap</th>
            <th scope="col">Décision</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const candidates = item.candidates || [];
            const selected = chosen[item.id] ?? candidates[0]?.userId ?? '';
            const busy = busyId === item.id;
            return (
              <tr key={item.id}>
                <td>
                  {memberDisplay(item.member)}
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
                    détecté le {formatDateTime(item.detectedAt)}
                  </div>
                </td>
                <td>
                  <code>{item.cohort || '—'}</code>
                </td>
                <td>{item.reason}</td>
                <td>
                  {candidates.length ? (
                    <select
                      aria-label={`Compte pour ${memberDisplay(item.member)}`}
                      value={selected}
                      onChange={(e) =>
                        setChosen((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    >
                      {candidates.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') ||
                            c.pseudo ||
                            c.userId}
                          {c.email ? ` <${c.email}>` : ''}
                          {c.isActive === false ? ' (inactif)' : ''}
                          {c.authProvider ? ` — ${c.authProvider}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: 'var(--ink-soft)' }}>aucun</span>
                  )}
                </td>
                <td>
                  <div className="moodle-actions" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || !selected}
                      onClick={() => onDecide(item.id, { decision: 'link', userId: selected })}
                    >
                      Rapprocher
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => onDecide(item.id, { decision: 'create' })}
                    >
                      Créer un compte
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => onDecide(item.id, { decision: 'ignore' })}
                    >
                      Ignorer
                    </button>
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
