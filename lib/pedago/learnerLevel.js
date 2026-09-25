'use strict';

/**
 * Résolveur de niveau de l'apprenant — **côté serveur**.
 *
 * Le navigateur résout déjà le niveau pour l'affichage (`src/contexts/BiodivPedagoContext.jsx`).
 * Le serveur en a besoin pour une décision qu'il ne peut pas déléguer au client : quelles
 * questions verrouillent une fiche pour cet élève. Il ne se fie donc à aucun paramètre de
 * requête, et applique les **mêmes règles** que le front (audit du 25/09/2026, § 3.2.1) :
 *
 * - étape (`college` / `lycee` / `universite`) : `resolveBiodivPedagoLevel` — le défaut du site
 *   n'est qu'un repli, jamais un plafond (PR #546) ;
 * - niveaux du programme : `curriculumNiveauxForPedagoLevel` — la classe resserre ;
 * - `maxPalier` : le plus haut palier scolaire atteignable (1 = cycle 3 … 5 = terminale),
 *   `null` = aucune borne (université, compte non élève).
 *
 * Seuls les **élèves** sont bornés : un professeur voit et valide tout.
 */

const {
  resolveBiodivPedagoLevel,
  loadUserGroupPedagoProfile,
  curriculumNiveauxForPedagoLevel,
  normalizePedagoLevel,
} = require('../biodivPedagoLevel');
const { curriculumPalier } = require('../pedagoScales');

/** Palier maximal d'une étape quand la classe n'est pas connue. */
const ETAPE_MAX_PALIER = Object.freeze({ college: 2, lycee: 5, universite: null });

/**
 * Cœur pur : étape + niveaux du programme → palier maximal.
 * @param {{ etape: string, curriculumNiveaux: string[]|null }} input
 * @returns {number|null}
 */
function maxPalierForLevel({ etape, curriculumNiveaux } = {}) {
  const lv = normalizePedagoLevel(etape);
  if (!lv || lv === 'universite') return null;
  const paliers = (Array.isArray(curriculumNiveaux) ? curriculumNiveaux : [])
    .map((n) => curriculumPalier(n))
    .filter((p) => p != null);
  if (paliers.length > 0) return Math.max(...paliers);
  return ETAPE_MAX_PALIER[lv] ?? null;
}

/**
 * Cœur pur : résout le niveau d'un élève à partir de ses entrées déjà chargées.
 * @returns {{ etape: string, curriculumNiveaux: string[]|null, maxPalier: number|null }}
 */
function resolveLearnerLevel({
  siteDefault,
  prefCanRaise = false,
  groupLevels = [],
  classNiveaux = [],
  mapLevel = null,
  userPreference = null,
} = {}) {
  const etape = resolveBiodivPedagoLevel({
    siteDefault,
    groupLevels,
    mapLevel,
    userPreference,
    prefCanRaise,
  });
  const curriculumNiveaux = curriculumNiveauxForPedagoLevel(etape, classNiveaux);
  return { etape, curriculumNiveaux, maxPalier: maxPalierForLevel({ etape, curriculumNiveaux }) };
}

/**
 * Charge et résout le niveau d'un compte. `null` pour un compte non élève ou inconnu : aucun
 * filtrage (le professeur voit tout, l'invité ne valide rien).
 *
 * @param {string|number|null} userId
 * @param {{ mapId?: string|null, db?: { queryOne: Function } }} [options]
 */
async function loadLearnerLevel(userId, options = {}) {
  const id = userId != null ? String(userId).trim() : '';
  if (!id) return null;
  const db = options.db || require('../../database');
  const user = await db.queryOne(
    'SELECT user_type, biodiv_pedago_level FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  if (!user || String(user.user_type) !== 'student') return null;

  const { getSettingValue } = require('../settings');
  const [siteDefault, prefCanRaise, profile] = await Promise.all([
    getSettingValue('ui.biodiv.pedago_level_default', 'college'),
    getSettingValue('ui.biodiv.pedago_pref_can_raise', false),
    loadUserGroupPedagoProfile(id),
  ]);

  let mapLevel = null;
  const mapId = options.mapId != null ? String(options.mapId).trim() : '';
  if (mapId) {
    const map = await db.queryOne('SELECT pedago_level FROM maps WHERE id = ? LIMIT 1', [mapId]);
    mapLevel = map ? map.pedago_level : null;
  }

  return resolveLearnerLevel({
    siteDefault,
    prefCanRaise: Boolean(prefCanRaise),
    groupLevels: profile.levels,
    classNiveaux: profile.curriculumNiveaux,
    mapLevel,
    userPreference: user.biodiv_pedago_level,
  });
}

module.exports = {
  ETAPE_MAX_PALIER,
  maxPalierForLevel,
  resolveLearnerLevel,
  loadLearnerLevel,
};
