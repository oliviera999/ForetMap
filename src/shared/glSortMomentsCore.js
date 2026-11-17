/**
 * « Tenir à deux », lot 2 — moments du tour où un sort se lance, dérivés de sa fenêtre
 * (`gl_spells.fenetre`). L'écran d'équipe range les sorts par moment ; un sort hors fenêtre
 * reste visible, grisé, avec le message de sa fenêtre. Noyau PUR partagé serveur / client
 * (miroir CJS `lib/shared/glSortMomentsCore.js`, `npm run sync:shared-cores`).
 *
 * Les rôles sont un conseil d'organisation de l'équipe, jamais un contrôle : le serveur ne les
 * lit pas.
 */

/**
 * Moments, dans l'ordre de l'écran (ensemble unifié, M6 : cinq moments ; l'écran d'équipe ne
 * montre que les sorts lançables et payables à cet instant).
 */
export const SORT_MOMENTS = Object.freeze([
  Object.freeze({
    key: 'avant',
    label: 'Avant de lancer',
    fenetres: Object.freeze(['avant_jet']),
  }),
  Object.freeze({ key: 'apres', label: 'Après le jet', fenetres: Object.freeze(['apres_jet']) }),
  Object.freeze({
    key: 'pendant',
    label: 'Pendant le tour',
    fenetres: Object.freeze(['jeu', 'jeu_avant_fouille']),
  }),
  Object.freeze({
    key: 'activite',
    label: 'Pendant l’activité',
    fenetres: Object.freeze(['activite', 'fin_seance']),
  }),
  Object.freeze({
    key: 'fin_chapitre',
    label: 'Au camp ou en veillée',
    fenetres: Object.freeze(['seuil', 'seuil_veillee', 'trimestre_3']),
  }),
]);

/**
 * Clé du moment d'une fenêtre ; une fenêtre inconnue ou absente se range dans « Au camp ou en
 * veillée » (L2 : la fin de chapitre s'appelle le camp).
 */
export function momentDeFenetre(fenetre) {
  const f = String(fenetre || '');
  return SORT_MOMENTS.find((m) => m.fenetres.includes(f))?.key || 'fin_chapitre';
}

/** Range des sorts (`{ fenetre }`) par moment, dans l'ordre de l'écran ; moments vides omis. */
export function rangerSortsParMoment(sorts = []) {
  return SORT_MOMENTS.map((m) => ({
    key: m.key,
    label: m.label,
    sorts: sorts.filter((s) => momentDeFenetre(s?.fenetre) === m.key),
  })).filter((m) => m.sorts.length > 0);
}

/**
 * Les cinq rôles (ensemble unifié, M10) : conseillés, jamais bloquants. L'écran appelle le rôle,
 * n'importe quel membre peut agir — aucun contrôle serveur. Libellés à parité.
 *
 * Gestionnaire : lance les dés · Éclaireuse ou Éclaireur : répond à la question de case ·
 * Opératrice ou Opérateur : fouille · Secrétaire : lit et fait tenir · Assistante ou Assistant :
 * jette les sorts (à quatre, fait aussi l'Éclaireur).
 */
export const ROLES_TENIR = Object.freeze({
  lancer: 'Gestionnaire',
  repondre: 'Éclaireuse ou Éclaireur',
  fouiller: 'Opératrice ou Opérateur',
  lire: 'Secrétaire',
  jeter: 'Assistante ou Assistant',
});

/** À quel rôle de l'équipe revient chaque geste, en une phrase (un conseil, jamais un contrôle). */
export const ROLES_EN_CONSEIL = Object.freeze({
  lancer: 'C’est le moment de la ou du Gestionnaire.',
  repondre: 'C’est le moment de l’Éclaireuse ou de l’Éclaireur.',
  fouiller: 'C’est le moment de l’Opératrice ou de l’Opérateur.',
  lire: 'C’est le moment de la ou du Secrétaire.',
  jeter: 'C’est le moment de l’Assistante ou de l’Assistant.',
  marche: 'C’est le moment de la ou du Gestionnaire.',
});

/** Rôle appelé pour un geste ; à quatre, l'Assistante ou l'Assistant répond aussi à la question. */
export function roleDuGeste(geste, effectif = 5) {
  if (geste === 'repondre' && Number(effectif) > 0 && Number(effectif) <= 4) {
    return ROLES_TENIR.jeter;
  }
  return ROLES_TENIR[geste] || null;
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * « Maintenant, vous pouvez… » (ensemble unifié, M8) : le ou les gestes possibles à cet instant,
 * chacun avec l'appel du rôle. Un conseil : rien n'est bloqué par un rôle, et la liste ne montre
 * que ce que les droits servis par le serveur permettent — jamais un geste fermé.
 *
 * @param {object} p
 * @param {Record<string, boolean>} [p.perms] droits servis (`tenir.permissions`)
 * @param {string|null} [p.phase] phase du tour (`null` = aucun tour ouvert)
 * @param {boolean} [p.aLance] l'équipe a déjà lancé les dés ce tour
 * @param {boolean} [p.auCamp] l'équipe est arrivée au camp
 * @param {number} [p.des] nombre de dés du prochain jet (1 après une case Souffle)
 * @param {boolean} [p.questionDue] une question de case attend l'équipe
 * @param {number|null} [p.fouillesRestantes] fouilles encore possibles ce tour (`null` = inconnu)
 * @param {number} [p.pagesATenir] pages trouvées par l'autre peuple qui attendent un lecteur
 * @param {boolean} [p.sortsOuverts] des sorts sont ouverts (escalier du chapitre 1)
 * @param {boolean} [p.defis] les défis de la Trame sont ouverts pour la partie
 * @param {number} [p.effectif] membres de l'équipe
 * @returns {Array<{ geste: string, role: string|null, texte: string }>}
 */
export function maintenantVousPouvez({
  perms = {},
  phase = null,
  aLance = false,
  auCamp = false,
  des = 2,
  questionDue = false,
  fouillesRestantes = null,
  pagesATenir = 0,
  sortsOuverts = true,
  defis = true,
  effectif = 5,
} = {}) {
  const out = [];
  const dire = (geste, texte) => out.push({ geste, role: roleDuGeste(geste, effectif), texte });
  const enJeu = phase === 'jeu';
  if (enJeu && perms.lancer && !aLance && !auCamp) {
    dire('lancer', Number(des) === 1 ? 'lancer le dé (un seul ce tour-ci)' : 'lancer les dés');
  }
  if (enJeu && perms.repondre && questionDue) dire('repondre', 'la question de la case');
  const fouilles = fouillesRestantes == null ? null : Math.max(0, Number(fouillesRestantes) || 0);
  if (enJeu && perms.fouiller && fouilles !== 0) {
    dire('fouiller', fouilles == null ? 'fouiller' : pluriel(fouilles, 'fouille'));
  }
  const pages = Math.max(0, Number(pagesATenir) || 0);
  if (perms.tenir && pages > 0) {
    dire('lire', `${pluriel(pages, 'page')} à lire et à faire tenir`);
  }
  if (enJeu && perms.jeter && sortsOuverts) dire('jeter', 'les sorts');
  // Hors tour : les défis de la Trame, pour toute l'équipe.
  if ((!phase || phase === 'clos') && defis) {
    out.push({ geste: 'trame', role: null, texte: 'les défis de la Trame' });
  }
  return out;
}
