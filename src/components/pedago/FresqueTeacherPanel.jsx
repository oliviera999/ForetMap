import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, getAuthToken } from '../../services/api.js';
import { FresqueBoard } from '../../shared/fresque/FresqueBoard.jsx';

const STATUS_LABELS = Object.freeze({
  in_progress: 'En cours',
  completed: 'Terminée',
  archived: 'Archivée',
});

const STEP_LABELS = Object.freeze({
  decouvrir: 'Découvrir',
  comprendre: 'Comprendre',
});

function stepLabel(step) {
  if (STEP_LABELS[step]) return STEP_LABELS[step];
  const m = /^lot(\d+)$/.exec(String(step || ''));
  return m ? `Lot ${m[1]}` : step || '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * Panneau « Fresques » côté prof : une ligne par plateau (élève ou équipe), filtrable par
 * groupe (périmètre du prof), **sans classement** (tri par nom), et ouverture d'un plateau en
 * lecture seule dans le même composant que l'élève.
 */
export function FresqueTeacherPanel({ deckId, model, publicBase, levels = null }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openBoard, setOpenBoard] = useState(null);

  useEffect(() => {
    api('/api/groups/options')
      .then((res) => setGroups(Array.isArray(res?.groups) ? res.groups : []))
      .catch(() => setGroups([]));
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (deckId) params.set('deckId', deckId);
    if (groupId) params.set('groupId', groupId);
    const qs = params.toString();
    api(`/api/fresques/overview${qs ? `?${qs}` : ''}`)
      .then((res) => {
        if (!cancelled) setBoards(Array.isArray(res?.boards) ? res.boards : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setBoards([]);
          setError(err?.message || 'Suivi indisponible');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, groupId]);

  useEffect(() => load(), [load]);

  const open = useCallback(async (row) => {
    try {
      const res = await api(`/api/fresques/boards/${encodeURIComponent(row.id)}`);
      setOpenBoard(res.board);
    } catch (err) {
      setError(err?.message || 'Plateau indisponible');
    }
  }, []);

  const sorted = useMemo(
    () =>
      [...boards].sort((a, b) => String(a.ownerLabel).localeCompare(String(b.ownerLabel), 'fr')),
    [boards],
  );
  const totalCards = model?.cardIds?.length || 21;
  const totalLinks = model?.totalExpected || 30;

  if (openBoard && model) {
    return (
      <div data-testid="fm-fresque-teacher-board">
        <div className="fm-fresque-hand__actions" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="fm-fresque-btn"
            onClick={() => setOpenBoard(null)}
            data-testid="fm-fresque-teacher-back"
          >
            ← Retour au suivi
          </button>
          <span className="section-sub">
            {openBoard.ownerLabel} · {levels?.[openBoard.level]?.label || openBoard.level} · lecture
            seule
          </span>
        </div>
        <FresqueBoard
          key={openBoard.id}
          model={model}
          publicBase={publicBase}
          board={openBoard}
          api={api}
          getAuthToken={getAuthToken}
          readOnly
        />
      </div>
    );
  }

  return (
    <section className="fm-panel pedago-sessions__panel" data-testid="fm-fresque-teacher-panel">
      <h2 style={{ marginTop: 0 }}>Suivi des fresques</h2>
      <label className="form-field">
        <span>Groupe</span>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          data-testid="fm-fresque-teacher-group"
        >
          <option value="">— tout mon périmètre —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="section-sub">Chargement…</p>
      ) : sorted.length === 0 ? (
        <p className="section-sub">
          Aucune fresque commencée {groupId ? 'dans ce groupe' : 'dans votre périmètre'}.
        </p>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table fm-table--dense" data-testid="fm-fresque-teacher-table">
            <thead>
              <tr>
                <th scope="col">Élève ou équipe</th>
                <th scope="col">Niveau</th>
                <th scope="col">Étape</th>
                <th scope="col">Cartes</th>
                <th scope="col">Flèches trouvées</th>
                <th scope="col">Indices</th>
                <th scope="col">Dernière activité</th>
                <th scope="col">État</th>
                <th scope="col">
                  <span className="fm-fresque-sr">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} data-testid={`fm-fresque-teacher-row-${b.id}`}>
                  <td>
                    {b.ownerType === 'team' ? '👥 ' : ''}
                    {b.ownerLabel}
                  </td>
                  <td>{levels?.[b.level]?.label || b.level}</td>
                  <td>{stepLabel(b.step)}</td>
                  <td>
                    {b.cardsPlaced} / {totalCards}
                  </td>
                  <td>
                    {b.linksFound} / {totalLinks}
                  </td>
                  <td>{b.hintsUsed}</td>
                  <td>{formatDate(b.updatedAt)}</td>
                  <td>{STATUS_LABELS[b.status] || b.status}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => open(b)}
                      disabled={!model}
                    >
                      Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="section-sub">
        Lecture seule : vous voyez la fresque telle que l’élève l’a laissée. Aucun classement.
      </p>
    </section>
  );
}
