/**
 * Résolveur unique du niveau de l'apprenant — miroir ESM du **cœur pur** de
 * `lib/pedago/learnerLevel.js` (parité vérifiée par `tests/pedago-learner-level.test.js`).
 * Règles, ordre des sources et forme du résultat : voir l'en-tête du module serveur.
 *
 * Le navigateur s'en sert pour l'affichage biodiversité, les notions proposées au quiz et
 * au glossaire (`BiodivPedagoContext`) ; le serveur, avec la même règle, décide seul des
 * questions qui verrouillent une fiche.
 */

import {
  resolveBiodivPedagoLevel,
  normalizePedagoLevel,
  minPedagoLevel,
  DEFAULT_SITE_LEVEL,
} from './biodivPedagoLevel.js';
import {
  curriculumPalier,
  curriculumNiveauxForEtape,
  parseNotionNiveauFilter,
  visibleCurriculumNiveaux,
  normalizeLearnerNiveau,
  learnerNiveauPalier,
  etapeForLearnerNiveau,
  highestLearnerNiveau,
} from './pedagoScales.js';

/** Palier maximal d'une étape quand le niveau n'est pas connu. */
export const ETAPE_MAX_PALIER = Object.freeze({ college: 2, lycee: 5, universite: null });

/** Origines possibles d'un niveau, du plus fort au plus faible. */
export const LEARNER_LEVEL_SOURCES = Object.freeze([
  'invite',
  'apercu',
  'vue_complete',
  'seance',
  'classe',
  'groupe',
  'carte',
  'site',
]);

/** Étape + niveaux du programme → palier maximal. */
export function maxPalierForLevel({ etape, curriculumNiveaux } = {}) {
  const lv = normalizePedagoLevel(etape);
  if (!lv || lv === 'universite') return null;
  const paliers = (Array.isArray(curriculumNiveaux) ? curriculumNiveaux : [])
    .map((n) => curriculumPalier(n))
    .filter((p) => p != null);
  if (paliers.length > 0) return Math.max(...paliers);
  return ETAPE_MAX_PALIER[lv] ?? null;
}

/** Niveaux visés par une séance (public `level`, précisé par `notionNiveau` dans l'étape). */
export function sessionLearnerNiveaux(session) {
  if (!session || typeof session !== 'object') return [];
  const etape = normalizePedagoLevel(session.level);
  if (etape === 'universite') return ['universite'];
  const parsed = parseNotionNiveauFilter(session.notionNiveau);
  const notion = parsed && !parsed.error ? parsed.niveaux : [];
  if (!etape) return notion;
  const range = curriculumNiveauxForEtape(etape);
  const inRange = notion.filter((n) => range.includes(n));
  return inRange.length > 0 ? inRange : range;
}

function applyDisplayPreference(etape, userPreference, prefCanRaise) {
  const pref = normalizePedagoLevel(userPreference);
  if (!pref) return etape;
  if (prefCanRaise) return pref;
  return minPedagoLevel([pref, etape], etape);
}

function buildLearnerLevel({ niveau, contentEtape, etape = contentEtape, source, affichage }) {
  const classForVisibility = niveau && niveau !== 'universite' ? [niveau] : [];
  let maxPalier;
  if (niveau) maxPalier = niveau === 'universite' ? null : learnerNiveauPalier(niveau);
  else maxPalier = ETAPE_MAX_PALIER[contentEtape] ?? null;
  return {
    niveau: niveau || null,
    contentEtape,
    etape,
    curriculumNiveaux: visibleCurriculumNiveaux({ level: etape, classNiveaux: classForVisibility }),
    maxPalier,
    sources: { niveau: source, affichage: affichage || source },
  };
}

/** Résout le niveau d'un apprenant à partir de ses entrées (voir le module serveur). */
export function resolveLearnerLevel(input = {}) {
  const {
    isGuest = false,
    teacherPreview = null,
    teacherFullView = false,
    session = null,
    classNiveaux = [],
    groupLevels = [],
    mapLevel = null,
    siteDefault = DEFAULT_SITE_LEVEL,
    userPreference = null,
    prefCanRaise = false,
  } = input || {};

  if (isGuest)
    return buildLearnerLevel({ niveau: null, contentEtape: 'college', source: 'invite' });

  const previewNiveau = normalizeLearnerNiveau(teacherPreview);
  const previewEtape = previewNiveau
    ? etapeForLearnerNiveau(previewNiveau)
    : normalizePedagoLevel(teacherPreview);
  if (previewEtape) {
    return buildLearnerLevel({
      niveau: previewNiveau,
      contentEtape: previewEtape,
      source: 'apercu',
    });
  }
  if (teacherFullView) {
    return buildLearnerLevel({
      niveau: 'universite',
      contentEtape: 'universite',
      source: 'vue_complete',
    });
  }

  const classNiveau = highestLearnerNiveau(classNiveaux);
  const sessionNiveaux = sessionLearnerNiveaux(session);
  let niveau = null;
  let legacyEtape = null;
  let source;
  if (sessionNiveaux.length > 0) {
    niveau =
      classNiveau && sessionNiveaux.includes(classNiveau)
        ? classNiveau
        : highestLearnerNiveau(sessionNiveaux);
    source = 'seance';
  } else if (classNiveau) {
    niveau = classNiveau;
    source = 'classe';
  } else {
    const groups = (Array.isArray(groupLevels) ? groupLevels : [])
      .map(normalizePedagoLevel)
      .filter(Boolean);
    const map = normalizePedagoLevel(mapLevel);
    legacyEtape = resolveBiodivPedagoLevel({ siteDefault, groupLevels: groups, mapLevel: map });
    if (groups.includes(legacyEtape)) source = 'groupe';
    else if (map === legacyEtape) source = 'carte';
    else source = 'site';
    if (legacyEtape === 'universite') niveau = 'universite';
  }

  const contentEtape = niveau ? etapeForLearnerNiveau(niveau) : legacyEtape;
  const etape = applyDisplayPreference(contentEtape, userPreference, prefCanRaise);
  return buildLearnerLevel({
    niveau,
    contentEtape,
    etape,
    source,
    affichage: etape !== contentEtape ? 'preference' : source,
  });
}
