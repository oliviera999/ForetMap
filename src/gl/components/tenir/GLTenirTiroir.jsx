import { useEffect, useRef, useState } from 'react';
import { useOverlayHistoryBack } from '../../../shared/platform/useOverlayHistoryBack.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLRewardsPanel } from '../GLRewardsPanel.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';
import { GLBestiairePanel } from './GLBestiairePanel.jsx';
import { GLPresencePanel } from './GLPresencePanel.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLEquipeAppareils } from './GLEquipeAppareils.jsx';
import { ROLES_EN_CONSEIL } from '../../../shared/glSortMomentsCore.js';
import { boursesDeLEquipe, casesEnPastilles } from '../../utils/glTenirMoment.js';

/**
 * Tiroir « L'équipe » de l'écran d'équipe (« Tenir à deux », écrans de séance) : fermé par
 * défaut, il s'ouvre en panneau par-dessus la carte (plein écran sur un téléphone) et garde
 * tout ce qui n'est pas « à faire maintenant » — les cases à venir, la réserve de la caravane,
 * le défi à préparer, le carnet de la classe et le Bestiaire, les présences, « Changer
 * d'équipe » (tablette) ou « Mes badges » (compte d'un élève).
 *
 * Rien n'est rendu tant qu'il est fermé : ses panneaux ne lisent le serveur qu'à l'ouverture.
 * « Fermer », Échap ou le retour du navigateur le referment ; le focus revient d'où il venait.
 * `section="carnet"` (geste « Lire ») l'ouvre sur le carnet de la classe.
 */
export function GLTenirTiroir({
  ouvert = false,
  section = 'equipe',
  id = undefined,
  onFermer = null,
  gameId,
  /** Cases à venir de l'équipe (`GET /tenir/tour`, avant le jet) ; vide sinon. */
  casesAVenir = [],
  /** Réserve de la caravane (`{ power }`), ou `null` quand le réglage l'éteint. */
  reserve = null,
  /** Résultat de `useGlChasse` : le carnet de la classe. */
  chasse = null,
  /**
   * Droit servi `perms.lire` : sans lui (défaut), le carnet se consulte sans bouton « Lire » ni
   * appel du rôle. Le tiroir cache un geste fermé, il ne l'ouvre jamais.
   */
  peutLire = false,
  /** Tablette d'équipe : pas de badges ni de proposition de chimère ; « Changer d'équipe ». */
  tablette = false,
  onChangerEquipe = null,
  /** Modules G&L (`rewardsEnabled` conditionne « Mes badges ») ; `null` = tout allumé. */
  modules = null,
  presence = null,
  /** Membres de l'équipe (roster déjà filtré sur elle). */
  membres = [],
  /** L'élève regarde ce tour sans jouer (absent ou en retrait). */
  spectateur = false,
  occupe = false,
  onPresences = null,
  onArrivee = null,
  /** Change à chaque évènement du tour : le défi à préparer se relit. */
  cleDeRelecture = '',
}) {
  const fermerRef = useRef(null);
  const carnetRef = useRef(null);
  const [badgesOuverts, setBadgesOuverts] = useState(false);
  // Par référence : un `onFermer` recréé à chaque rendu ne doit pas déplacer le focus.
  const onFermerRef = useRef(onFermer);
  onFermerRef.current = onFermer;
  useOverlayHistoryBack(ouvert, () => onFermerRef.current?.());

  useEffect(() => {
    if (!ouvert) return undefined;
    const avant = typeof document !== 'undefined' ? document.activeElement : null;
    if (section === 'carnet' && carnetRef.current) {
      carnetRef.current.scrollIntoView?.({ block: 'start' });
      carnetRef.current.focus?.();
    } else {
      fermerRef.current?.focus?.();
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onFermerRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      avant?.focus?.();
    };
  }, [ouvert, section]);

  if (!ouvert) return null;
  const cases = casesEnPastilles(casesAVenir);
  const bourses = boursesDeLEquipe(membres);
  return (
    <aside
      id={id}
      className="gl-tenir-tiroir"
      role="dialog"
      aria-label="L’équipe"
      data-testid="gl-tenir-tiroir"
      data-section={section}
    >
      <header className="gl-tenir-tiroir__tete">
        <h2>L’équipe</h2>
        <GLButton
          ref={fermerRef}
          type="button"
          variant="ghost"
          onClick={() => onFermer?.()}
          data-testid="gl-tenir-tiroir-fermer"
        >
          Fermer
        </GLButton>
      </header>
      <div className="gl-tenir-tiroir__corps">
        {/* Sur un téléphone, le bandeau n'a pas la place : les bourses sont ici. */}
        {bourses.length ? (
          <section className="gl-tenir-tiroir__bourses" data-testid="gl-tenir-tiroir-bourses">
            <h3>Les bourses</h3>
            <ul className="gl-tenir-tiroir__pastilles">
              {bourses.map((b) => (
                <li key={b.id} className="gl-tenir-bourse" title={b.complet}>
                  <span className="gl-tenir-bourse__nom">{b.nom}</span>
                  {b.gemmes != null ? (
                    <span className="gl-tenir-bourse__gemmes">💎 {b.gemmes}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {cases.length ? (
          <section data-testid="gl-tenir-cases-a-venir">
            <h3>Les {cases.length} cases à venir</h3>
            <ol className="gl-tenir-tiroir__pastilles">
              {cases.map((c) => (
                <li key={c.cle} className="gl-tenir-case" title={c.complet}>
                  <span className="gl-tenir-case__numero">{c.numero ?? '?'}</span>
                  <span className="gl-tenir-case__icone" aria-hidden="true">
                    {c.icone}
                  </span>
                  <span className="gl-tenir-case__libelle">{c.libelle}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {reserve ? (
          <p className="gl-tenir-tiroir__reserve" data-testid="gl-tenir-reserve">
            Réserve de la caravane : 💎 {reserve.power}
            <span className="fm-visually-hidden">
              {' '}
              (les gains au-dessus du plafond y vont ; elle paie d’abord les sorts de l’équipe)
            </span>
          </p>
        ) : null}
        {/* Rappel du défi à préparer : il vit aussi dans la carte du moment, tour terminé. */}
        <GLDefisCasePanel gameId={gameId} refreshKey={cleDeRelecture} />
        <GLPresencePanel
          presence={presence}
          mates={membres}
          busy={occupe}
          onConfirmer={(absents) => onPresences?.(absents)}
          onArrivee={(playerId) => onArrivee?.(playerId)}
        />
        {/* Les demandes d'appareil se règlent dans la carte du moment : ici, seul le mot dit à
            l'élève qui regarde ce tour. */}
        <GLEquipeAppareils gameId={gameId} equipe={null} spectateur={spectateur} />
        {chasse?.carnet ? (
          <section
            ref={carnetRef}
            className="gl-tenir-tiroir__carnet"
            tabIndex={-1}
            aria-label="Carnet de la classe"
            data-testid="gl-tenir-tiroir-carnet"
          >
            {peutLire ? <p className="gl-hint gl-role-conseil">{ROLES_EN_CONSEIL.lire}</p> : null}
            <GLCarnetClasseView chasse={chasse} readOnly={!peutLire} />
            <GLBestiairePanel gameId={gameId} canPropose={!tablette} />
          </section>
        ) : null}
        {tablette ? null : (
          <section className="gl-tenir-tiroir__badges">
            <GLButton
              type="button"
              variant="ghost"
              size="sm"
              className="gl-rewards__toggle"
              aria-expanded={badgesOuverts}
              onClick={() => setBadgesOuverts((v) => !v)}
            >
              {badgesOuverts ? 'Fermer mes badges' : 'Mes badges'}
            </GLButton>
            {badgesOuverts ? (
              <GLRewardsPanel modules={modules} title="Mes badges" headingLevel={3} />
            ) : null}
          </section>
        )}
        {tablette && onChangerEquipe ? (
          <GLButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChangerEquipe}
            data-testid="gl-tenir-changer-equipe"
          >
            Changer d’équipe
          </GLButton>
        ) : null}
      </div>
    </aside>
  );
}
