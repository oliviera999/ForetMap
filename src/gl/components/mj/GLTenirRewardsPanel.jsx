import { useCallback, useEffect, useState } from 'react';
import '../../styles/gl-rewards.css';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

const NOTE_MAX = 280;

/**
 * Vitrine des badges d'une partie « Tenir à deux » (console MJ, `gl.game.manage`) : membres ×
 * familles (nombre de paliers), « à un pas du palier suivant », et le formulaire « décerner
 * un badge » (mot obligatoire). Données de `GET /api/gl/rewards/games/:id` ; **aucun
 * classement** : ordre alphabétique tel que servi, aucun total comparé. Aucune ressource.
 */
export function GLTenirRewardsPanel({ game, roster = [], showFailure }) {
  const gameId = game?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ playerId: '', type: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!gameId) return;
    setError('');
    try {
      const payload = await apiGL(`/api/gl/rewards/games/${gameId}`);
      const ok = payload && typeof payload === 'object' && Array.isArray(payload.players);
      setData(ok ? payload : null);
      if (ok && !form.type && payload.manualTypes?.[0]) {
        setForm((f) => ({ ...f, type: f.type || payload.manualTypes[0].key.split('.').pop() }));
      }
    } catch (err) {
      setData(null);
      // Module éteint (503) : la vitrine se tait sans alarme.
      setError(err?.status === 503 ? '' : err?.message || 'Vitrine indisponible');
    }
    // `form.type` n'est lu que pour poser une valeur par défaut : pas une dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!gameId || (!data && !error)) return null;

  const families = (data?.families || []).filter((f) =>
    (data?.players || []).some((p) => (p.families?.[f.key] || 0) > 0),
  );
  const noteText = form.note.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!form.playerId || !form.type) return;
    if (!noteText) {
      setError('Écrivez un mot pour l’élève : il accompagne le badge.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await apiGL(`/api/gl/rewards/games/${gameId}/award`, 'POST', {
        playerId: Number(form.playerId),
        type: form.type,
        note: noteText,
      });
      setMessage(`Badge décerné : ${res?.reward?.emoji || ''} ${res?.reward?.title || ''}`.trim());
      setForm((f) => ({ ...f, note: '' }));
      await load();
    } catch (err) {
      showFailure?.(err?.message || 'Badge non décerné');
      setError(err?.message || 'Badge non décerné');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gl-gameplay-block gl-tenir-rewards" data-testid="gl-tenir-rewards">
      <h3>Badges individuels</h3>
      <p className="gl-hint">
        Paliers obtenus par élève et par famille, par ordre alphabétique. Aucun classement : un
        badge dit ce qu’un élève a fait, jamais sa place.
      </p>
      {error ? (
        <p className="gl-error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {data && data.players.length === 0 ? (
        <p className="gl-hint">Aucun membre dans cette partie.</p>
      ) : null}
      {data && data.players.length > 0 ? (
        <div className="fm-table-wrap">
          <table className="fm-table fm-table--zebra">
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
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="gl-tenir-rewards__name"
                      onClick={() => setForm((f) => ({ ...f, playerId: String(p.id) }))}
                      title="Choisir cet élève pour décerner un badge"
                    >
                      {p.name}
                    </button>
                  </th>
                  {families.map((f) => (
                    <td key={f.key}>{p.families?.[f.key] || 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? (
        <div className="gl-tenir-rewards__near" data-testid="gl-tenir-rewards-near">
          <h4>À un pas du palier suivant</h4>
          {data.near.length === 0 ? (
            <p className="gl-hint">Personne n’est à un pas d’un palier pour l’instant.</p>
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
      ) : null}
      {data ? (
        <form className="gl-tenir-rewards__award" onSubmit={submit}>
          <h4>Décerner un badge</h4>
          <GLField label="Élève" htmlFor="gl-reward-player">
            <GLSelect
              id="gl-reward-player"
              value={form.playerId}
              onChange={(e) => setForm({ ...form, playerId: e.target.value })}
            >
              <option value="">—</option>
              {(data.players.length ? data.players : roster).map((p) => {
                const id = p.id ?? p.playerId;
                const name = p.name ?? p.pseudo ?? `${p.firstName || ''} ${p.lastName || ''}`;
                return (
                  <option key={id} value={id}>
                    {String(name).trim()}
                  </option>
                );
              })}
            </GLSelect>
          </GLField>
          <GLField label="Badge" htmlFor="gl-reward-type">
            <GLSelect
              id="gl-reward-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {(data.manualTypes || []).map((t) => (
                <option key={t.key} value={t.key.split('.').pop()}>
                  {t.emoji} {t.title}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField
            label="Mot pour l’élève *"
            htmlFor="gl-reward-note"
            hint={`${form.note.length}/${NOTE_MAX} — obligatoire : c’est lui que l’élève garde.`}
          >
            <GLTextarea
              id="gl-reward-note"
              value={form.note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ex. : Tu as laissé ta place à un camarade pour la question de lecture."
            />
          </GLField>
          <div className="gl-inline-actions">
            <GLButton type="submit" size="sm" disabled={busy || !form.playerId || !form.type}>
              {busy ? 'Envoi…' : 'Décerner'}
            </GLButton>
          </div>
          {message ? (
            <p className="gl-hint" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
