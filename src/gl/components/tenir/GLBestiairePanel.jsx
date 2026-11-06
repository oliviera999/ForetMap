import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Bestiaire des chimères (« Tenir à deux », spec § 13) : page de classe visible dans le carnet ;
 * un élève propose (nom, histoire), le prof valide. Les propositions en attente ne sont vues
 * que de leur auteur et du prof.
 */
export function GLBestiairePanel({ gameId, canPropose = true }) {
  const [chimeres, setChimeres] = useState([]);
  const [form, setForm] = useState({ nom: '', histoire: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/tenir/chimeres`);
      setChimeres(Array.isArray(data?.chimeres) ? data.chimeres : []);
    } catch (err) {
      setError(err.message || 'Bestiaire indisponible');
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  async function proposer(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiGL(`/api/gl/games/${gameId}/tenir/chimeres`, 'POST', form);
      setForm({ nom: '', histoire: '' });
      setMessage('Chimère proposée : ton professeur la relit avant de l’afficher.');
      await load();
    } catch (err) {
      setError(err.message || 'Proposition impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-bestiaire" data-testid="gl-bestiaire">
      <h4>Bestiaire des chimères</h4>
      {chimeres.length ? (
        <ul className="gl-bestiaire__liste">
          {chimeres.map((c) => (
            <li key={c.id} className={`gl-bestiaire__item gl-bestiaire__item--${c.statut}`}>
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="gl-bestiaire__image" /> : null}
              <strong>{c.nom}</strong>
              {c.statut === 'proposee' ? <span className="gl-hint"> · en relecture</span> : null}
              <p>{c.histoire}</p>
              {c.proposeePar ? <p className="gl-hint">proposée par {c.proposeePar}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gl-hint">Le bestiaire est encore vide : propose la première chimère.</p>
      )}
      {canPropose ? (
        <form className="gl-bestiaire__form" onSubmit={proposer}>
          <label>
            Nom
            <input
              type="text"
              maxLength={120}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              required
            />
          </label>
          <label>
            Histoire
            <textarea
              rows={4}
              maxLength={4000}
              value={form.histoire}
              onChange={(e) => setForm({ ...form, histoire: e.target.value })}
              required
            />
          </label>
          <GLButton
            type="submit"
            size="sm"
            disabled={busy || form.nom.length < 2 || form.histoire.length < 10}
          >
            Proposer
          </GLButton>
        </form>
      ) : null}
      {message ? (
        <p className="gl-hint" role="status">
          {message}
        </p>
      ) : null}
      {error ? <p className="gl-error-banner">{error}</p> : null}
    </section>
  );
}
