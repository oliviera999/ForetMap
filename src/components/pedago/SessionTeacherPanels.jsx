import { useEffect, useState } from 'react';

import { api } from '../../services/api.js';
import { Button } from '../../shared/ui/Button.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Lien direct + QR code à imprimer (affiche sur le terrain). */
export function SessionSharePanel({ session, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/api/pedago-sessions/${encodeURIComponent(session.id)}/share`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Lien indisponible');
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  async function copyLink() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="pedago-sessions__panel" data-testid="pedago-session-share">
      <h3 className="pedago-sessions__panel-title">Partager « {session.title} »</h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="section-sub">Préparation du lien…</p>}
      {data && (
        <>
          {!data.isPublished && (
            <p className="section-sub">
              Séance en brouillon : le lien ne fonctionnera pour les élèves qu’une fois publiée.
            </p>
          )}
          <p className="pedago-sessions__link">
            <code>{data.link}</code>
          </p>
          <img
            className="pedago-sessions__qr"
            src={data.qrDataUrl}
            alt={`QR code de la séance ${session.title}`}
            width={200}
            height={200}
          />
          <div className="pedago-sessions__card-actions">
            <Button type="button" variant="primary" onClick={copyLink}>
              {copied ? 'Lien copié' : 'Copier le lien'}
            </Button>
            <a
              className="shared-btn shared-btn--ghost"
              href={data.qrDataUrl}
              download={`seance-${session.slug || session.id}.png`}
            >
              Télécharger le QR code
            </a>
            <Button type="button" variant="ghost" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Suivi nominatif par élève, filtrable par groupe (périmètre du professeur). */
export function SessionRunsPanel({ session, onClose }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/groups/options')
      .then((res) => setGroups(Array.isArray(res?.groups) ? res.groups : []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
    api(`/api/pedago-sessions/${encodeURIComponent(session.id)}/runs${qs}`)
      .then((res) => {
        if (!cancelled) setStudents(Array.isArray(res?.students) ? res.students : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setStudents([]);
          setError(err?.message || 'Suivi indisponible');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, groupId]);

  const done = students.filter((s) => s.completed).length;
  const started = students.filter((s) => s.startCount > 0 || s.completed).length;

  return (
    <section className="pedago-sessions__panel" data-testid="pedago-session-runs">
      <h3 className="pedago-sessions__panel-title">Suivi · {session.title}</h3>
      <label className="form-field">
        <span>Groupe</span>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">— tous ceux qui l’ont ouverte —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="section-sub">Chargement…</p>
      ) : students.length === 0 ? (
        <p className="section-sub">
          {groupId ? 'Aucun élève dans ce groupe.' : 'Personne n’a encore ouvert cette séance.'}
        </p>
      ) : (
        <>
          <p className="section-sub" data-testid="pedago-session-runs-summary">
            {students.length} personne{students.length > 1 ? 's' : ''} · {started} démarrée
            {started > 1 ? 's' : ''} · {done} terminée{done > 1 ? 's' : ''}
          </p>
          <div className="fm-table-wrap">
            <table className="fm-table fm-table--dense">
              <thead>
                <tr>
                  <th scope="col">Élève</th>
                  <th scope="col">État</th>
                  <th scope="col">Dernière fin</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.userId}>
                    <td>{`${s.firstName} ${s.lastName}`.trim() || s.userId}</td>
                    <td>
                      {s.completed
                        ? `Terminée${s.completionCount > 1 ? ` ×${s.completionCount}` : ''}`
                        : s.startCount > 0
                          ? 'En cours'
                          : 'Pas commencée'}
                    </td>
                    <td>{formatDate(s.lastCompletedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="pedago-sessions__card-actions">
        <Button type="button" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </section>
  );
}
