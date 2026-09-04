/**
 * Noyau des **registres de parcours guidés** — partagé ForetMap / G&L.
 *
 * Un parcours est une liste d'étapes `{ key, title, body, target, placement, role?,
 * expression?, bodyTeacher? }`. Ce module ne connaît **aucun** contenu : il porte les
 * règles communes aux deux produits — filtrage par rôle, clés de surcharge éditoriale,
 * application des surcharges — et chaque produit fournit son propre registre.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §6ter.2 pour l'arbitrage sur l'édition des
 * parcours depuis l'application (ForetMap, lot 4).
 */

import { resolveMascotExpression } from '../mascot/mascotExpressionsBase.js';
import { resolveRoleTextFrom } from '../help/roleText.js';

/** Champs de parcours ouverts à l'édition depuis l'application. */
export const TOUR_EDITABLE_FIELDS = Object.freeze(['title', 'body', 'bodyTeacher']);

/**
 * Parcours fictif sous lequel se rangent les étapes partagées par tous les parcours
 * d'un produit (l'étape de relance, typiquement) : une seule clé, un seul texte.
 */
export const SHARED_TOUR_KEY = 'commun';

/** Texte d'une étape selon le rôle (variante de service si disponible). */
export function resolveDiscoveryBodyFrom(step, isStaff) {
  return resolveRoleTextFrom(step, isStaff, { base: 'body', staff: 'bodyTeacher' });
}

/**
 * Expression du narrateur pour une étape. Une étape sans `expression` — ou portant une
 * valeur inconnue — retombe sur `neutre` : le portrait n'est jamais une dépendance.
 */
export function resolveDiscoveryExpressionFrom(step) {
  return resolveMascotExpression(step?.expression);
}

/**
 * Clé plate de surcharge d'un champ d'étape (`<parcours>.<étape>.<champ>`).
 * `sharedStepKeys` liste les étapes rangées sous `SHARED_TOUR_KEY`.
 */
export function tourOverrideKeyFrom(tabKey, step, field, sharedStepKeys = []) {
  const scope = sharedStepKeys.includes(step?.key) ? SHARED_TOUR_KEY : tabKey;
  return `${scope}.${step?.key || ''}.${field}`;
}

/**
 * Applique les surcharges éditoriales à une liste d'étapes.
 *
 * Ne recopie que les champs de texte : la structure (`target`, `placement`, `role`,
 * `expression`) reste celle du code, de sorte qu'une saisie malheureuse ne puisse ni
 * faire disparaître une étape ni déplacer une bulle. Une valeur vide ou blanche est
 * ignorée — vider un champ revient à **revenir au défaut**, seule interprétation sûre
 * pour un parcours (une bulle sans texte n'a pas de sens).
 *
 * Les étapes ne sont jamais mutées : une étape partagée entre parcours, écrite en
 * place, contaminerait tous les autres pour la durée de la session.
 */
export function applyTourOverridesFrom(steps, tabKey, overrides, sharedStepKeys = []) {
  if (!overrides || typeof overrides !== 'object') return steps;
  return steps.map((step) => {
    let patched = null;
    for (const field of TOUR_EDITABLE_FIELDS) {
      const value = overrides[tourOverrideKeyFrom(tabKey, step, field, sharedStepKeys)];
      if (typeof value !== 'string' || !value.trim()) continue;
      // Un `bodyTeacher` absent du défaut reste absent : le surcharger créerait un
      // texte de service là où le parcours n'en prévoit pas, sans décision de personne.
      if (field === 'bodyTeacher' && step.bodyTeacher === undefined) continue;
      if (!patched) patched = { ...step };
      patched[field] = value.trim();
    }
    return patched || step;
  });
}

/** Étapes d'un parcours, filtrées par rôle puis surchargées. */
export function getDiscoveryStepsFrom(
  registry,
  tabKey,
  isStaff = false,
  overrides = null,
  sharedStepKeys = [],
) {
  const tour = registry?.[tabKey];
  if (!tour || !Array.isArray(tour.steps)) return [];
  const steps = tour.steps.filter((step) => {
    if (!step.role) return true;
    return step.role === (isStaff ? 'teacher' : 'student');
  });
  return applyTourOverridesFrom(steps, tabKey, overrides, sharedStepKeys);
}

/**
 * Construit l'API d'un registre produit : chaque produit expose les mêmes fonctions,
 * fermées sur son propre contenu.
 *
 * @param {object} registry            parcours du produit, indexés par clé d'onglet
 * @param {object} [options]
 * @param {string[]} [options.sharedStepKeys] étapes rangées sous `SHARED_TOUR_KEY`
 */
export function createTourRegistryApi(registry, { sharedStepKeys = [] } = {}) {
  const getSteps = (tabKey, isStaff = false, overrides = null) =>
    getDiscoveryStepsFrom(registry, tabKey, isStaff, overrides, sharedStepKeys);
  return {
    registry,
    getSteps,
    hasTour: (tabKey, isStaff = false) => getSteps(tabKey, isStaff).length > 0,
    overrideKey: (tabKey, step, field) => tourOverrideKeyFrom(tabKey, step, field, sharedStepKeys),
    applyOverrides: (steps, tabKey, overrides) =>
      applyTourOverridesFrom(steps, tabKey, overrides, sharedStepKeys),
  };
}
