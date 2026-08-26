/**
 * État de conditionnement d'une ressource, en UN endroit pour les deux applications.
 *
 * Jusqu'ici, chaque écran redécidait dans son coin ce qu'il fallait montrer à partir du
 * résumé renvoyé par le serveur : le bouton « Marquer comme lu » avait sa propre lecture,
 * et partout ailleurs il n'y avait rien du tout. Un élève ne pouvait pas distinguer, dans
 * une liste, ce qu'il avait déjà acquis de ce qui l'attendait encore.
 *
 * Quatre états, et rien d'autre :
 *   - `none`     : aucune question ne conditionne cette ressource (rien à afficher) ;
 *   - `acquired` : les questions exigées sont réussies, la validation est ouverte ;
 *   - `pending`  : il reste des questions à réussir ;
 *   - `locked`   : une erreur a posé un verrou, la validation attend l'échéance.
 *
 * Module PUR : aucun React, aucun appel réseau. Il sert au composant d'icône, au texte
 * d'annonce du bouton et aux tests, qui parlent donc tous du même état.
 */

export const GATING_STATE_KINDS = Object.freeze(['none', 'acquired', 'pending', 'locked']);

/**
 * Symboles retenus pour rester lisibles en petit et sans couleur (daltonisme, impression) :
 * la forme seule doit suffire à distinguer les trois cas visibles.
 */
const STATE_ICONS = Object.freeze({
  acquired: '✓',
  pending: '?',
  locked: '🔒',
});

function positiveInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function dayWord(days) {
  const n = Math.max(1, positiveInt(days, 1));
  return n === 1 ? '1 jour' : `${n} jours`;
}

function questionWord(count) {
  const n = Math.max(1, positiveInt(count, 1));
  return n === 1 ? '1 question' : `${n} questions`;
}

/**
 * État d'une ressource d'après le résumé serveur (`/…/gating/summary`) ou d'après un
 * challenge complet (`/…/gating/challenge`) — les deux portent les mêmes champs utiles.
 *
 * @param {object|null} summary
 * @param {{ done?: boolean }} [options] `done` : la ressource est déjà validée par le lecteur.
 * @returns {{ kind: string, icon: string, shortLabel: string, label: string }}
 */
export function gatingState(summary, { done = false } = {}) {
  // Une ressource déjà validée n'a plus rien à conditionner : afficher « ? » sur un
  // tutoriel déjà lu inquiéterait sans raison.
  if (done || !summary || !summary.required) {
    return { kind: 'none', icon: '', shortLabel: '', label: '' };
  }

  if (summary.locked) {
    const days = dayWord(summary.remaining_days);
    return {
      kind: 'locked',
      icon: STATE_ICONS.locked,
      shortLabel: 'Bloqué',
      label: `Validation bloquée encore ${days} après une erreur.`,
    };
  }

  const ask = positiveInt(summary.ask_count, 0);
  const pending = Math.max(ask, positiveInt(summary.pending_count, ask));

  if (summary.satisfied || pending <= 0) {
    return {
      kind: 'acquired',
      icon: STATE_ICONS.acquired,
      shortLabel: 'Acquis',
      label: 'Contrôle de compréhension réussi : la validation est ouverte.',
    };
  }

  const reste =
    pending > ask ? ` (${questionWord(pending)} au total, ${questionWord(ask)} maintenant)` : '';
  return {
    kind: 'pending',
    icon: STATE_ICONS.pending,
    shortLabel: questionWord(ask),
    label: `Contrôle de compréhension : ${questionWord(ask)} à réussir avant de valider${reste}.`,
  };
}

/**
 * Décompte des états sur une liste de ressources — sert aux vues qui résument une liste
 * (« 3 acquis · 2 en attente ») plutôt que de répéter une icône par ligne.
 *
 * @param {Map<string, object>|Iterable<object>} summaries
 * @returns {{ acquired: number, pending: number, locked: number, total: number }}
 */
export function countGatingStates(summaries) {
  const counts = { acquired: 0, pending: 0, locked: 0, total: 0 };
  if (!summaries) return counts;
  const values =
    typeof summaries.values === 'function' ? [...summaries.values()] : [...(summaries || [])];
  for (const summary of values) {
    const { kind } = gatingState(summary);
    if (kind === 'none') continue;
    counts[kind] += 1;
    counts.total += 1;
  }
  return counts;
}
