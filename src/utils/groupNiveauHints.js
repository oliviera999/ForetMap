/**
 * Textes du formulaire et de l'écran des groupes autour du **niveau de la classe**
 * (`groups.curriculum_niveau`, décision du mainteneur du 25/09/2026, question 5). Purs, pour
 * être testés sans monter l'écran.
 */

import { AUTO_NIVEAU_GROUP_KINDS, suggestCurriculumNiveauFromName } from './groupNiveauFromName.js';
import { learnerNiveauLabel } from './curriculumNotions.js';

/** Le type de groupe porte-t-il un niveau (classe, unité) ? */
export function groupKindExpectsNiveau(kind) {
  return AUTO_NIVEAU_GROUP_KINDS.includes(
    String(kind || 'class')
      .trim()
      .toLowerCase(),
  );
}

/**
 * Niveau pré-rempli à la création d'une classe ou d'une unité, d'après son nom (`''` sinon).
 * Pré-rempli, pas imposé : le formulaire l'annonce comme une proposition à vérifier.
 */
export function proposedGroupNiveau(name, kind) {
  if (!groupKindExpectsNiveau(kind)) return '';
  return suggestCurriculumNiveauFromName(name).niveau || '';
}

/**
 * Proposition affichée sous le choix du niveau.
 *
 * @param {{ name?: string, kind?: string, current?: string|null }} input
 * @returns {{ proposedNiveau: string|null, text: string, tone: 'proposition'|'info'|'ok' }|null}
 *   `null` : rien à dire (niveau déjà choisi, sans rapport avec le nom).
 */
export function groupNiveauHint({ name, kind, current = null } = {}) {
  if (!groupKindExpectsNiveau(kind)) {
    return current
      ? null
      : {
          proposedNiveau: null,
          tone: 'info',
          text: 'Équipe ou club : laissez vide, chaque élève garde le niveau de sa classe.',
        };
  }
  const { niveau, raison } = suggestCurriculumNiveauFromName(name);
  const label = String(name || '').trim();
  if (niveau) {
    if (current === niveau) {
      return { proposedNiveau: niveau, tone: 'ok', text: 'Correspond au nom du groupe.' };
    }
    return {
      proposedNiveau: niveau,
      tone: 'proposition',
      text: `D’après le nom « ${label} », niveau proposé : ${learnerNiveauLabel(niveau)}. À confirmer.`,
    };
  }
  if (current) return null;
  if (raison === 'plusieurs_niveaux') {
    return {
      proposedNiveau: null,
      tone: 'info',
      text: 'Le nom évoque plusieurs niveaux : choisissez vous-même celui de la classe.',
    };
  }
  if (raison === 'voie_a_preciser') {
    return {
      proposedNiveau: null,
      tone: 'info',
      text: 'Le nom évoque une première ou une terminale : choisissez la voie (spécialité SVT ou enseignement scientifique).',
    };
  }
  return {
    proposedNiveau: null,
    tone: 'info',
    text: 'Le nom ne permet pas de proposer un niveau : choisissez-le dans la liste.',
  };
}

/**
 * Phrase « niveau appliqué aujourd'hui » d'un groupe de la liste (champs ajoutés par
 * `GET /api/groups`).
 */
export function groupNiveauStatus(group) {
  const own = group?.curriculum_niveau || null;
  const effective = group?.curriculum_niveau_effectif || null;
  if (own) return { missing: false, text: `Niveau : ${learnerNiveauLabel(own)}` };
  if (effective) {
    const from = group?.curriculum_niveau_herite_de?.name;
    return {
      missing: false,
      text: `Niveau : ${learnerNiveauLabel(effective)} (hérité${from ? ` de « ${from} »` : ''})`,
    };
  }
  if (group?.curriculum_niveau_manquant) {
    return { missing: true, text: 'Niveau à renseigner' };
  }
  return { missing: false, text: '' };
}

/** Groupes actifs qui devraient porter un niveau et n'en ont pas, même hérité. */
export function countGroupsMissingNiveau(groups = []) {
  return (Array.isArray(groups) ? groups : []).filter(
    (g) => g?.curriculum_niveau_manquant && Number(g?.is_active) !== 0,
  ).length;
}
