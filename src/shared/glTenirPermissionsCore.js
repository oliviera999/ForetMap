/**
 * Permissions par surface de la mouture « Tenir à deux » (docs/GL_TENIR_A_DEUX_REGLES.md § 3).
 *
 * Noyau PUR, partagé serveur / client (miroir CJS `lib/shared/glTenirPermissionsCore.js`,
 * régénéré par `npm run sync:shared-cores`). Le serveur rejoue ce calcul sur chaque route
 * d'action (403 `TENIR_PERMISSION`) ; le client ne fait que griser.
 *
 * | Geste          | tableau                      | hybride                               | tablette              |
 * | Jeter (un sort)| prof (équipe active)         | membre, pendant `jeu`                 | membre, pendant `jeu` |
 * | Lancer         | prof                         | prof                                  | membre, pendant `jeu` |
 * | Répondre       | prof                         | prof                                  | membre                |
 * | Fouiller       | prof                         | membre, pendant la fenêtre du prof    | membre                |
 * | Lire / Tenir   | prof                         | membre                                | membre                |
 * | Souffle        | prof                         | prof                                  | prof                  |
 * | Retrait, avance libre, absences, validation des dés : prof partout.
 *
 * Le prof peut toujours tout faire. Une projection ne peut rien faire.
 *
 * Sorts : `isSortPermisSurSurface` (au tableau, un élève ne crée ni ne lance un sort dont la
 * fenêtre exige la phase `jeu` ; seuil, veillée, activité et fin de séance restent ouverts).
 */

export const TENIR_SURFACES = Object.freeze(['tableau', 'hybride', 'tablette']);
export const TENIR_PHASES = Object.freeze(['ouverture', 'jeu', 'souffle', 'clos']);
export const TENIR_GESTES = Object.freeze([
  'jeter',
  'lancer',
  'repondre',
  'fouiller',
  'lire',
  'marche',
  'souffle',
  'retrait',
  'avanceLibre',
  'absences',
  'validerDes',
]);

export function normalizeTenirSurface(value, fallback = 'tableau') {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return TENIR_SURFACES.includes(s) ? s : fallback;
}

export function normalizeTenirPhase(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return TENIR_PHASES.includes(s) ? s : null;
}

const ALL_TRUE = Object.freeze(Object.fromEntries(TENIR_GESTES.map((g) => [g, true])));
const ALL_FALSE = Object.freeze(Object.fromEntries(TENIR_GESTES.map((g) => [g, false])));

/**
 * @param {object} input
 * @param {string} input.surface `tableau` | `hybride` | `tablette`
 * @param {string|null} input.phase phase du tour courant (`null` = aucun tour ouvert)
 * @param {'mj'|'player'|'projection'} input.actorKind
 * @param {boolean} [input.isActiveTeam] en `tableau`, l'équipe est-elle l'équipe active ?
 * @param {boolean} [input.isMember] l'acteur est-il membre de l'équipe visée ? (défaut vrai)
 * @param {boolean} [input.fouilleFenetreOuverte] hybride : fenêtre de fouille ouverte par le prof
 * @param {boolean} [input.enRetrait] l'élève est en retrait (jamais de Marché)
 * @param {object} [input.settings] réglages résolus (`marche`, `marche_pendant_tour`,
 *   `lecture_pendant_tour`)
 * @returns {Record<string, boolean>}
 */
export function resolveTenirPermissions(input = {}) {
  const actorKind = String(input.actorKind || 'player');
  if (actorKind === 'projection') return { ...ALL_FALSE };
  const settings = input.settings || {};
  const marcheActif = settings.marche !== false;
  if (actorKind === 'mj') {
    return { ...ALL_TRUE, marche: marcheActif };
  }
  const surface = normalizeTenirSurface(input.surface);
  const phase = normalizeTenirPhase(input.phase);
  const isMember = input.isMember !== false;
  const enJeu = phase === 'jeu';
  const enRetrait = input.enRetrait === true;
  const marchePendantTour = settings.marche_pendant_tour !== false;
  // Lot 2 (profil `court`) : pendant le tour, la lecture attend la veillée.
  const tourOuvert = !!phase && phase !== 'clos';
  const lecture = settings.lecture_pendant_tour !== false || !tourOuvert;

  const out = { ...ALL_FALSE };
  if (!isMember) {
    out.marche = marcheActif && !enRetrait && (!phase || phase === 'clos' || marchePendantTour);
    return out;
  }
  if (surface === 'tableau') {
    // Rien pour un élève : le prof porte les cinq gestes pour l'équipe active.
    // Le Marché reste accessible en veillée (aucun tour ouvert ou tour clos).
    out.marche = marcheActif && !enRetrait && (!phase || phase === 'clos');
    return out;
  }
  if (surface === 'hybride') {
    out.jeter = enJeu;
    out.fouiller = enJeu && input.fouilleFenetreOuverte === true;
    out.lire = lecture;
    out.marche =
      marcheActif && !enRetrait && (!phase || phase === 'clos' || (enJeu && marchePendantTour));
    return out;
  }
  // tablette
  out.jeter = enJeu;
  out.lancer = enJeu;
  out.repondre = enJeu;
  out.fouiller = enJeu;
  out.lire = lecture;
  out.marche =
    marcheActif && !enRetrait && (!phase || phase === 'clos' || (enJeu && marchePendantTour));
  return out;
}

/**
 * Fenêtres de sort qui exigent la phase `jeu`. Les autres (`activite`, `seuil`,
 * `seuil_veillee`, `fin_seance`, `trimestre_3`) se jouent hors du tour.
 */
export const FENETRES_SORT_PHASE_JEU = Object.freeze([
  'avant_jet',
  'apres_jet',
  'jeu',
  'jeu_avant_fouille',
  'avant_jets_pacte',
]);

/**
 * Un acteur peut-il créer ou lancer un sort de cette fenêtre sur cette surface ? Au tableau, le
 * prof porte les gestes du tour : un sort dont la fenêtre exige la phase `jeu` lui est réservé
 * (403 `TENIR_PERMISSION` côté serveur). Les sorts de seuil, de veillée, d'activité et de fin de
 * séance restent ouverts aux élèves. La fenêtre elle-même (phase, jet déjà fait…) est contrôlée
 * à part (`lib/glSpellFenetres.js`).
 *
 * @param {object} input
 * @param {string} input.surface `tableau` | `hybride` | `tablette`
 * @param {'mj'|'player'|'projection'} input.actorKind
 * @param {string|null} input.fenetre fenêtre du sort (`gl_spells.fenetre`)
 */
export function isSortPermisSurSurface(input = {}) {
  const actorKind = String(input.actorKind || 'player');
  if (actorKind === 'projection') return false;
  if (actorKind === 'mj') return true;
  if (normalizeTenirSurface(input.surface) !== 'tableau') return true;
  return !FENETRES_SORT_PHASE_JEU.includes(String(input.fenetre || ''));
}

/** Vrai si `geste` est permis pour l'acteur décrit par `input` (cf. `resolveTenirPermissions`). */
export function isTenirGesteAllowed(geste, input) {
  const perms = resolveTenirPermissions(input);
  return perms[geste] === true;
}
