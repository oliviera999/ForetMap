import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { RewardAwardButton } from './RewardAwardDialog.jsx';
import { RewardsSheetButton } from './RewardsStudentSheet.jsx';

/**
 * Vitrine des badges d'un groupe (personnel) : élèves × familles (nombre de paliers obtenus)
 * et « Qui est proche d'un palier ? » (à 1 du seuil), pour proposer les bonnes tâches aux bons
 * élèves. **Aucun classement** : ordre alphabétique, tel que renvoyé par
 * `GET /api/rewards/groups/:id` (même périmètre que les inscrits). Le nom d'un élève ouvre sa
 * fiche de badges (`RewardsStudentSheet`).
 */
export function RewardsShowcase({ groupId, canAward = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!groupId) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setError('');
    api(`/api/rewards/groups/${encodeURIComponent(groupId)}`)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err?.message || 'Vitrine indisponible');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, version]);

  if (!groupId) return null;
  const families = (data?.families || []).filter((f) =>
    (data?.students || []).some((s) => (s.families?.[f.key] || 0) > 0),
  );
  return (
    <section
      className="rewards-showcase"
      aria-label="Vitrine des badges"
      data-testid="rewards-showcase"
    >
      <h3>Vitrine des badges{data?.group?.name ? ` — ${data.group.name}` : ''}</h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {data && data.students.length === 0 && (
        <p className="section-sub">Aucun élève dans ce groupe.</p>
      )}
      {data && data.students.length > 0 && (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <caption className="fm-visually-hidden">
              Paliers de badges obtenus par élève et par famille, par ordre alphabétique
            </caption>
            <thead>
              <tr>
                <th scope="col">Élève</th>
                {families.map((f) => (
                  <th key={f.key} scope="col">
                    {f.label}
                  </th>
                ))}
                {canAward && <th scope="col">Badge manuel</th>}
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    <RewardsSheetButton
                      studentId={s.id}
                      studentName={s.name}
                      enabled
                      className="btn btn-ghost btn-sm rewards-showcase__name"
                    >
                      {s.name}
                    </RewardsSheetButton>
                  </th>
                  {families.map((f) => (
                    <td key={f.key}>{s.families?.[f.key] || 0}</td>
                  ))}
                  {canAward && (
                    <td>
                      <RewardAwardButton
                        studentId={s.id}
                        studentName={s.name}
                        enabled
                        onAwarded={() => setVersion((v) => v + 1)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="rewards-showcase__near" data-testid="rewards-near">
          <h4>Qui est proche d’un palier ?</h4>
          {data.near.length === 0 ? (
            <p className="section-sub">Personne n’est à une tâche d’un palier pour l’instant.</p>
          ) : (
            <ul>
              {data.near.map((n) => (
                <li key={`${n.studentId}-${n.key}`}>
                  <strong>{n.name}</strong> : <span aria-hidden="true">{n.emoji}</span> {n.title} —
                  encore {n.remaining} ({n.value}/{n.nextThreshold})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
