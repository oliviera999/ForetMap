import { gatingState } from '../utils/learningGatingState.js';
import { IconCheck, IconLock, IconQuiz } from '../icons.jsx';

/** Icône SVG par état (chrome lucide) — le module pur, lui, continue d'exposer `state.icon` texte. */
const STATE_ICON_COMPONENTS = {
  acquired: IconCheck,
  pending: IconQuiz,
  locked: IconLock,
};

/**
 * Pastille d'état du conditionnement — COMMUNE aux deux applications.
 *
 * Le problème qu'elle règle : dans une liste de tutoriels ou de fiches, rien ne
 * distinguait ce qui était déjà acquis de ce qui attendait encore une question, ni de ce
 * qui était bloqué après une erreur. L'élève ne l'apprenait qu'en cliquant.
 *
 * Trois partis pris :
 *   - **discrète** : un seul caractère, pas de bloc coloré qui concurrencerait le titre ;
 *   - **lisible sans couleur** : la forme (coche, point d'interrogation, cadenas) porte l'information à elle
 *     seule — la couleur ne fait que la renforcer ;
 *   - **muette quand il n'y a rien à dire** : une ressource non conditionnée, ou déjà
 *     validée, n'affiche rien du tout. Une icône partout ne signalerait plus rien.
 *
 * L'état vient d'un module pur (`learningGatingState`) partagé avec le texte d'annonce du
 * bouton : les deux ne peuvent donc pas se contredire.
 *
 * @param {object|null} summary  résumé renvoyé par `/…/gating/summary` (ou un challenge).
 * @param {boolean} [done]       la ressource est déjà validée par le lecteur.
 * @param {boolean} [withLabel]  ajoute le libellé court en clair à côté de l'icône.
 * @param {string}  [className]  classe supplémentaire.
 */
export function LearningGatingStateIcon({
  summary,
  done = false,
  withLabel = false,
  className = '',
}) {
  // `show_icon` vient du réglage prof « Afficher les pastilles d'état », résolu côté
  // serveur et recopié sur chaque ligne de résumé (le front ne lit pas les réglages prof).
  if (summary?.show_icon === false) return null;
  const state = gatingState(summary, { done });
  if (state.kind === 'none') return null;

  const classes = ['learning-gating-state', `learning-gating-state--${state.kind}`, className]
    .filter(Boolean)
    .join(' ');

  const StateIcon = STATE_ICON_COMPONENTS[state.kind] || null;

  return (
    <span className={classes} title={state.label}>
      <span className="learning-gating-state__icon" aria-hidden="true">
        {StateIcon ? <StateIcon size={12} /> : state.icon}
      </span>
      {withLabel ? (
        <span className="learning-gating-state__label" aria-hidden="true">
          {state.shortLabel}
        </span>
      ) : null}
      {/* Le titre HTML n'est pas lu par tous les lecteurs d'écran ni atteignable au
          clavier sur un `span` : la phrase complète est donc aussi rendue en texte. */}
      <span className="sr-only">{state.label}</span>
    </span>
  );
}
