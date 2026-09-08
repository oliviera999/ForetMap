'use strict';

/**
 * Résolution de la destination d'un lancement LTI (L3, L2, L7, L23).
 *
 * Ordre : paramètres d'activité valides > liaison du cours > refus. Le rapport dit
 * quelle source a gagné. Un n3beur dans un cours G&L voit les deux produits.
 * Un enseignant voit les cibles `instructor_targets` à chaque lancement.
 */

const { LANDING_VALUES, PRODUCT_VALUES } = require('./settingsRegistry');

const CUSTOM_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/custom';
const CONTEXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/context';
const ROLES_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/roles';

function isInstructor(roles) {
  return (roles || []).some((r) => /Instructor|ContentDeveloper|Administrator/i.test(String(r)));
}

function courseIdFromClaims(claims) {
  const context = claims?.[CONTEXT_CLAIM] || {};
  const id =
    context.id ??
    context.contextId ??
    claims?.['https://purl.imsglobal.org/spec/lti/claim/context_id'];
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function customParams(claims) {
  const custom = claims?.[CUSTOM_CLAIM] || {};
  return {
    product: custom.product ? String(custom.product).trim() : null,
    chapter: custom.chapter != null && custom.chapter !== '' ? Number(custom.chapter) : null,
    landing: custom.landing ? String(custom.landing).trim() : null,
  };
}

function bindingForCourse(bindings, courseId) {
  if (!courseId) return null;
  return (bindings || []).find((b) => Number(b.moodle_course_id) === Number(courseId)) || null;
}

function landingAllowed(landing, options) {
  return (options || LANDING_VALUES).includes(landing);
}

/**
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   source: 'custom'|'binding'|null,
 *   product: 'fm'|'gl'|'both'|null,
 *   landing: string,
 *   chapterId: number|null,
 *   courseId: number|null,
 *   instructor: boolean,
 *   destinations: Array<{ id: string, product: 'fm'|'gl', landing: string, label: string }>,
 * }}
 */
function resolveLaunchDestination({ claims, settings, isN3beur = false }) {
  const instructor = isInstructor(claims?.[ROLES_CLAIM] || []);
  const courseId = courseIdFromClaims(claims);
  const custom = customParams(claims);
  const binding = bindingForCourse(settings.launchBindings, courseId);
  const options = settings.landingOptions || LANDING_VALUES;

  let source = null;
  let product = null;
  let landing = 'aiguillage';
  let chapterId = null;

  const customValid =
    custom.product &&
    PRODUCT_VALUES.includes(custom.product) &&
    (!custom.landing || landingAllowed(custom.landing, options)) &&
    !(custom.product === 'both' && custom.landing && custom.landing !== 'aiguillage');

  if (customValid) {
    source = 'custom';
    product = custom.product;
    landing =
      custom.landing && landingAllowed(custom.landing, options) ? custom.landing : 'aiguillage';
    chapterId =
      Number.isInteger(custom.chapter) && custom.chapter > 0
        ? custom.chapter
        : binding?.gl_chapter_id || null;
  } else if (binding) {
    source = 'binding';
    product = binding.product;
    landing = landingAllowed(binding.landing, options) ? binding.landing : 'aiguillage';
    chapterId = binding.gl_chapter_id;
  } else {
    return {
      ok: false,
      error: 'Ce cours Moodle n’est pas lié à ForetMap ni à Gnomes & Licornes',
      source: null,
      product: null,
      landing: null,
      chapterId: null,
      courseId,
      instructor,
      destinations: [],
    };
  }

  if (instructor) {
    const destinations = [];
    for (const t of settings.instructorTargets || []) {
      destinations.push({
        id: t === 'gl' ? 'gl_home' : 'fm_map',
        product: t,
        landing: t === 'gl' ? 'gl_home' : 'fm_map',
        label: t === 'gl' ? 'Gnomes & Licornes (MJ)' : 'ForetMap (prof)',
      });
    }
    return {
      ok: true,
      source,
      product: destinations.length > 1 ? 'both' : destinations[0]?.product || product,
      landing: 'aiguillage',
      chapterId,
      courseId,
      instructor: true,
      destinations,
    };
  }

  const destinations = [];
  const pushFm = (land, label) =>
    destinations.push({ id: land, product: 'fm', landing: land, label });
  const pushGl = (land, label) =>
    destinations.push({ id: land, product: 'gl', landing: land, label });

  if (product === 'both' || (product === 'gl' && isN3beur)) {
    pushFm('fm_map', 'ForetMap — la carte');
    pushGl(chapterId ? 'gl_game' : 'gl_home', 'Gnomes & Licornes');
    landing = 'aiguillage';
    product = 'both';
  } else if (product === 'fm') {
    if (landing === 'aiguillage') {
      pushFm('fm_map', 'La carte');
      pushFm('fm_tasks', 'Les tâches');
    } else {
      pushFm(landing, landing === 'fm_tasks' ? 'Les tâches' : 'La carte');
    }
  } else {
    if (landing === 'aiguillage') {
      pushGl('gl_game', 'La partie');
      pushGl('gl_home', 'L’accueil du jeu');
    } else {
      pushGl(landing, landing === 'gl_game' ? 'La partie' : 'L’accueil du jeu');
    }
  }

  return {
    ok: true,
    source,
    product,
    landing: destinations.length === 1 ? destinations[0].landing : 'aiguillage',
    chapterId,
    courseId,
    instructor: false,
    destinations,
  };
}

module.exports = {
  CUSTOM_CLAIM,
  CONTEXT_CLAIM,
  ROLES_CLAIM,
  isInstructor,
  courseIdFromClaims,
  resolveLaunchDestination,
};
