import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTenirHonneursPanel } from './GLTenirHonneursPanel.jsx';
import { GLSablier } from '../tenir/GLSablier.jsx';

/**
 * Panneau « Demandes » de « Jouer le tour » (« Tenir à deux », lot 2) : la file UNIQUE de ce qui
 * attend le prof — dés à valider, jets en suspens, sorts à appliquer ou à refuser, Nommer, pages
 * et chimères à relire, présences à confirmer, défis à juger. Une ligne par demande, la plus
 * ancienne en haut, un bouton principal par ligne. Rien n'y reste indéfiniment : le serveur
 * ferme seul ce qui n'a plus d'objet (changement de phase, tour suivant, Seuil).
 *
 * `tourApi` : actions du tour (`useGlTenirTour`) ; `onChanged` : rafraîchit l'écran du tour.
 */
export function GLDemandesPanel({
  game,
  teams = [],
  tourApi,
  refreshKey = 0,
  total = null,
  onChanged = null,
  showFailure = null,
  /** Tour courant : un défi reçu à un tour précédent est mis en avant (à juger d'abord). */
  roundNumber = 0,
}) {
  const gameId = game?.id;
  const [demandes, setDemandes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [relecture, setRelecture] = useState(false);
  // Sablier d'un défi (durée du catalogue), affiché à la demande.
  const [sablierDe, setSablierDe] = useState(null);

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/tenir/demandes`);
      setDemandes(Array.isArray(data?.demandes) ? data.demandes : []);
    } catch (_) {
      // La file est relue à chaque évènement : un échec ponctuel ne gêne pas le tour.
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load, refreshKey, total]);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        showFailure?.(err.message || 'Action impossible');
      } finally {
        setBusy(false);
        await load();
        await onChanged?.();
      }
    },
    [load, onChanged, showFailure],
  );

  /** Défi de case : une seule décision, « Relevé » (le voile recule) ou « Pas encore ». */
  const jugerDefi = (defiId, releve) =>
    apiGL(`/api/gl/games/${gameId}/defis-case/${defiId}/decider`, 'POST', { releve });

  const sort = (draftId, path, body) =>
    apiGL(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/${path}`, 'POST', body);

  /** Bouton principal et, s'il y a lieu, bouton secondaire d'une demande. */
  function actions(d) {
    switch (d.kind) {
      case 'des_a_valider':
        return [
          [d.action, () => tourApi.validerSaisie(d.refId)],
          ['Refuser', () => tourApi.refuserSaisie(d.refId)],
        ];
      case 'jet_en_suspens':
        return [[d.action, () => tourApi.garderJet(d.teamId)]];
      case 'presence_a_confirmer':
        return [[d.action, () => tourApi.presences([], d.teamId)]];
      case 'sort_a_appliquer':
        return [
          [d.action, () => sort(d.refId, 'effect-applied')],
          ['Refuser et rembourser', () => sort(d.refId, 'refuser', {})],
        ];
      case 'nommer':
        return [
          [d.action, () => sort(d.refId, 'effect-applied', { zoneKey: d.payload?.zoneKey || '' })],
          ['Refuser et rembourser', () => sort(d.refId, 'refuser', {})],
        ];
      case 'defi_case':
        return [
          ['Relevé', () => jugerDefi(d.refId, true)],
          ['Pas encore', () => jugerDefi(d.refId, false)],
        ];
      default:
        return [];
    }
  }

  const aRelire = demandes.some((d) => d.kind === 'plume' || d.kind === 'chimere');
  const nombre = demandes.length;
  return (
    <section className="gl-gameplay-block gl-demandes" data-testid="gl-demandes">
      <h3>
        Demandes{' '}
        <span className="gl-demandes__compteur" data-testid="gl-demandes-total">
          {nombre}
        </span>
      </h3>
      {nombre === 0 ? (
        <p className="gl-hint">Rien n’attend votre geste.</p>
      ) : (
        <ol className="gl-demandes__liste">
          {demandes.map((d) => {
            const [principale, secondaire] = actions(d);
            const relire = d.kind === 'plume' || d.kind === 'chimere';
            return (
              <li
                key={d.id}
                className={`gl-demandes__ligne${
                  d.kind === 'defi_case' && Number(d.roundNumber) < Number(roundNumber)
                    ? ' is-en-avant'
                    : ''
                }`}
                data-kind={d.kind}
              >
                <div className="gl-demandes__texte">
                  <strong>{d.titre}</strong>
                  {d.teamName ? <span className="gl-hint"> · {d.teamName}</span> : null}
                  {d.detail ? <div className="gl-hint">{d.detail}</div> : null}
                  {d.kind === 'defi_case' && d.payload?.consigne ? (
                    <div className="gl-hint">{d.payload.consigne}</div>
                  ) : null}
                  {d.kind === 'defi_case' && d.payload?.critere ? (
                    <div className="gl-demandes__critere" data-testid="gl-defi-critere">
                      Critère (pour vous seul) : {d.payload.critere}
                    </div>
                  ) : null}
                  {d.kind === 'defi_case' && sablierDe === d.id ? (
                    <GLSablier
                      secondes={Number(d.payload?.dureeS) || 60}
                      resetKey={d.id}
                      doneHint="le sablier a sonné : à vous de juger"
                      testId="gl-defi-sablier"
                    />
                  ) : null}
                </div>
                <div className="gl-inline-actions">
                  {principale ? (
                    <GLButton
                      type="button"
                      size="sm"
                      disabled={busy || tourApi?.busy}
                      onClick={() => run(principale[1])}
                    >
                      {principale[0]}
                    </GLButton>
                  ) : null}
                  {relire ? (
                    <GLButton
                      type="button"
                      size="sm"
                      disabled={busy}
                      aria-expanded={relecture}
                      onClick={() => setRelecture((v) => !v)}
                    >
                      {d.action}
                    </GLButton>
                  ) : null}
                  {secondaire ? (
                    <GLButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || tourApi?.busy}
                      onClick={() => run(secondaire[1])}
                    >
                      {secondaire[0]}
                    </GLButton>
                  ) : null}
                  {d.kind === 'defi_case' ? (
                    <GLButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-expanded={sablierDe === d.id}
                      onClick={() => setSablierDe((v) => (v === d.id ? null : d.id))}
                    >
                      Sablier
                    </GLButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {relecture && aRelire ? (
        <GLTenirHonneursPanel
          game={game}
          teams={teams}
          onReloadGame={async () => {
            await load();
            await onChanged?.();
          }}
          showFailure={showFailure}
        />
      ) : null}
    </section>
  );
}
