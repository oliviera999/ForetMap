import { useCallback, useEffect, useState } from 'react';
import { apiGL, getGlToken } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Console MJ « Tenir à deux » (spec § 11–13) : exports CSV de la classe (Team Spirit, badges),
 * mission réussie (sceau + titre), plumes et chimères à relire. Les badges individuels
 * (vitrine, badge décerné avec un mot) vivent dans `GLTenirRewardsPanel`. Aucun classement,
 * aucune bourse.
 */
export function GLTenirHonneursPanel({ game, teams = [], onReloadGame, showFailure }) {
  const gameId = game?.id;
  const classId = game?.class_id;
  const [missions, setMissions] = useState({ missions: [], reussies: [] });
  const [plumes, setPlumes] = useState([]);
  const [chimeres, setChimeres] = useState([]);
  const [honneurs, setHonneurs] = useState([]);
  const [missionForm, setMissionForm] = useState({ teamId: '', missionCode: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!gameId) return;
    const [m, p, c, h] = await Promise.all([
      apiGL(`/api/gl/games/${gameId}/tenir/missions`).catch(() => ({ missions: [], reussies: [] })),
      apiGL(`/api/gl/games/${gameId}/tenir/plumes`).catch(() => ({ plumes: [] })),
      apiGL(`/api/gl/games/${gameId}/tenir/chimeres`).catch(() => ({ chimeres: [] })),
      apiGL(`/api/gl/games/${gameId}/tenir/honneurs`).catch(() => ({ honneurs: [] })),
    ]);
    setMissions(m);
    setPlumes(p.plumes || []);
    setChimeres(c.chimeres || []);
    setHonneurs(h.honneurs || []);
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, ok) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(ok);
      await load();
      await onReloadGame?.();
    } catch (err) {
      showFailure?.(err.message || 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  async function download(kind) {
    const url = `/api/gl/admin/classes/${classId}/exports/${kind}.csv`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getGlToken()}` } });
    if (!res.ok) {
      showFailure?.('Export impossible');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gl-${kind}-classe-${classId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!gameId) return null;
  const aRelire = plumes.filter((p) => p.statut === 'proposee');
  const chimeresAValider = chimeres.filter((c) => c.statut === 'proposee');

  return (
    <section className="gl-gameplay-block gl-tenir-honneurs" data-testid="gl-tenir-honneurs">
      <h3>Tenir à deux — honneurs, missions, exports</h3>
      {classId ? (
        <div className="gl-inline-actions">
          <GLButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => download('team-spirit')}
          >
            Export Team Spirit (CSV)
          </GLButton>
          <GLButton type="button" variant="secondary" size="sm" onClick={() => download('badges')}>
            Export badges (CSV)
          </GLButton>
        </div>
      ) : null}

      {honneurs.length ? (
        <ul className="gl-tenir-honneurs__liste">
          {honneurs.map((h) => (
            <li key={h.id}>
              <strong>{h.libelle}</strong> — {h.teamName} ({h.honneur})
            </li>
          ))}
        </ul>
      ) : (
        <p className="gl-hint">Les honneurs et sceaux s’attribuent à la clôture du chapitre.</p>
      )}

      <form
        className="gl-tenir-honneurs__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missionForm.teamId || !missionForm.missionCode) return;
          run(
            () =>
              apiGL(`/api/gl/games/${gameId}/tenir/missions`, 'POST', {
                teamId: Number(missionForm.teamId),
                missionCode: missionForm.missionCode,
              }),
            'Mission saisie : sceau et titre attribués.',
          );
        }}
      >
        <h4>Mission réussie</h4>
        <label>
          Équipe
          <select
            value={missionForm.teamId}
            onChange={(e) => setMissionForm({ ...missionForm, teamId: e.target.value })}
          >
            <option value="">—</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mission
          <select
            value={missionForm.missionCode}
            onChange={(e) => setMissionForm({ ...missionForm, missionCode: e.target.value })}
          >
            <option value="">—</option>
            {(missions.missions || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.titreSceau} — {m.texte}
              </option>
            ))}
          </select>
        </label>
        <GLButton
          type="submit"
          size="sm"
          disabled={busy || !missionForm.teamId || !missionForm.missionCode}
        >
          Mission réussie
        </GLButton>
      </form>

      {aRelire.length ? (
        <div className="gl-tenir-honneurs__relecture">
          <h4>Pages à relire ({aRelire.length})</h4>
          <ul>
            {aRelire.map((p) => (
              <li key={p.id}>
                <strong>{p.titre}</strong> <span className="gl-hint">— {p.pseudo}</span>
                <p className="gl-tenir-honneurs__texte">{p.texte}</p>
                <div className="gl-inline-actions">
                  <GLButton
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiGL(`/api/gl/games/${gameId}/tenir/plumes/${p.id}`, 'PUT', {
                            decision: 'valider',
                          }),
                        'Page validée : elle entre au carnet de la classe.',
                      )
                    }
                  >
                    Valider
                  </GLButton>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiGL(`/api/gl/games/${gameId}/tenir/plumes/${p.id}`, 'PUT', {
                            decision: 'refuser',
                          }),
                        'Page renvoyée à son auteur.',
                      )
                    }
                  >
                    Renvoyer
                  </GLButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {chimeresAValider.length ? (
        <div className="gl-tenir-honneurs__relecture">
          <h4>Chimères proposées ({chimeresAValider.length})</h4>
          <ul>
            {chimeresAValider.map((c) => (
              <li key={c.id}>
                <strong>{c.nom}</strong> <span className="gl-hint">— {c.proposeePar}</span>
                <p className="gl-tenir-honneurs__texte">{c.histoire}</p>
                <div className="gl-inline-actions">
                  <GLButton
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiGL(`/api/gl/games/${gameId}/tenir/chimeres/${c.id}`, 'PUT', {
                            decision: 'valider',
                          }),
                        'Chimère au bestiaire.',
                      )
                    }
                  >
                    Valider
                  </GLButton>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiGL(`/api/gl/games/${gameId}/tenir/chimeres/${c.id}`, 'PUT', {
                            decision: 'refuser',
                          }),
                        'Chimère renvoyée.',
                      )
                    }
                  >
                    Renvoyer
                  </GLButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p className="gl-hint" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
