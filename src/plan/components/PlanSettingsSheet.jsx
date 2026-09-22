import { useState } from 'react';

import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { Button } from '../../shared/ui/Button.jsx';

/**
 * Réglages du plan, en feuille basse — ce que le **lecteur** règle sur son appareil, par
 * opposition aux réglages d'établissement de la console ForetMap.
 *
 * Deux choses aujourd'hui, et elles répondent au même besoin : reprendre la main sur un
 * appareil. Choisir le plan affiché quand l'établissement en publie plusieurs
 * (`ui.<surface>.selectable_map_ids`), et se déconnecter — sur un poste partagé de salle des
 * professeurs ou une borne d'accueil, l'onglet resté ouvert est le vrai risque.
 *
 * Les filtres de catégories gardent leur propre feuille : ce sont des gestes de navigation,
 * répétés à chaque visite, pas des réglages qu'on pose une fois.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, label: string }>} [props.maps] plans proposés au changement ;
 *   moins de deux entrées = pas de sélecteur (`lib/planContent.js`).
 * @param {string} [props.currentMapId] plan réellement affiché.
 * @param {(mapId: string) => void} [props.onSelectMap]
 * @param {boolean} [props.canLogout] une session est à rendre (compte ou laissez-passer).
 * @param {() => Promise<void>} [props.onLogout] lève si la déconnexion n'aboutit pas.
 * @param {string} [props.sessionHint] ce que la déconnexion va faire, en une phrase.
 */
export function PlanSettingsSheet({
  open,
  onClose,
  maps = [],
  currentMapId = '',
  onSelectMap = null,
  canLogout = false,
  onLogout = null,
  sessionHint = '',
}) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const hasMapChoice = (maps || []).length > 1 && typeof onSelectMap === 'function';

  const logout = async () => {
    if (!onLogout || loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await onLogout();
    } catch (err) {
      // La déconnexion échoue → on le dit, plutôt que de laisser croire que l'appareil est
      // rendu. Le bouton redevient actionnable : c'est souvent un réseau coupé.
      setLogoutError(err?.message || 'La déconnexion n’a pas abouti. Réessayez.');
      setLoggingOut(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Réglages"
      snapPoints={['half', 'full']}
      initialSnap="half"
      blockBackground={false}
      className="plan-sheet plan-settings-sheet"
      testId="plan-settings-sheet"
      closeLabel="Fermer les réglages"
      wideAsDialog
    >
      {hasMapChoice ? (
        <section className="plan-settings-sheet__section">
          <h3 className="plan-settings-sheet__title">Plan affiché</h3>
          <ul className="plan-settings-sheet__list">
            {maps.map((entry) => {
              const id = String(entry.id);
              const active = id === String(currentMapId);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`plan-settings-sheet__map${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      if (!active) onSelectMap(id);
                    }}
                  >
                    <span className="plan-settings-sheet__map-label">{entry.label || id}</span>
                    {active ? (
                      <span className="plan-settings-sheet__map-state" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="plan-settings-sheet__note">
            Changer de plan remet les filtres au réglage de l’établissement : les catégories ne sont
            pas les mêmes d’un plan à l’autre.
          </p>
        </section>
      ) : null}

      {canLogout ? (
        <section className="plan-settings-sheet__section">
          <h3 className="plan-settings-sheet__title">Session</h3>
          {sessionHint ? <p className="plan-settings-sheet__note">{sessionHint}</p> : null}
          {logoutError ? (
            <p className="plan-settings-sheet__error" role="alert">
              {logoutError}
            </p>
          ) : null}
          <Button
            variant="secondary"
            block
            loading={loggingOut}
            loadingLabel="Déconnexion…"
            data-testid="plan-logout"
            onClick={logout}
          >
            Se déconnecter
          </Button>
        </section>
      ) : null}

      {!hasMapChoice && !canLogout ? (
        <p className="plan-settings-sheet__note">
          Rien à régler ici pour l’instant : ce plan est ouvert et l’établissement n’en publie qu’un
          seul.
        </p>
      ) : null}
    </BottomSheet>
  );
}
