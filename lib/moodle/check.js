'use strict';

/**
 * Contrôle de configuration Moodle (section 7.3 du chantier) : un compte rendu structuré,
 * partagé par `npm run moodle:check` et `POST /api/admin/integrations/moodle/check`.
 *
 * Il ne modifie rien, ni côté Moodle ni côté ForetMap. Il répond à quatre questions :
 *  1. le jeton fonctionne-t-il (`core_webservice_get_site_info`) ?
 *  2. chaque fonction de la section 7.2 est-elle autorisée pour ce service ?
 *  3. quelles cohortes sont visibles, et quelle politique s'appliquerait à chacune ?
 *  4. la table chapitre → cours pointe-t-elle vers des cours qui existent (avec leur nom) ?
 */

const { MoodleApiError } = require('./client');
const { resolvePolicyForIdnumber, isCohortOfYear } = require('./policies');

/** Fonctions requises et le lot qui les consomme (section 7.2). */
const REQUIRED_FUNCTIONS = Object.freeze([
  { name: 'core_webservice_get_site_info', use: 'contrôle', lot: 'M1' },
  { name: 'core_cohort_get_cohorts', use: 'lecture des cohortes', lot: 'M1' },
  { name: 'core_cohort_search_cohorts', use: 'liste des cohortes visibles', lot: 'M1' },
  { name: 'core_cohort_get_cohort_members', use: 'membres des cohortes', lot: 'M1' },
  { name: 'core_user_get_users_by_field', use: 'détails des comptes', lot: 'M1' },
  { name: 'core_course_get_courses_by_field', use: 'noms des cours', lot: 'M1' },
  { name: 'core_group_get_course_groups', use: 'groupes de cours (lecture)', lot: 'M3' },
  { name: 'core_group_get_group_members', use: 'membres des groupes de cours', lot: 'M3' },
  { name: 'core_enrol_get_enrolled_users', use: 'inscrits d’un cours', lot: 'M4' },
  { name: 'core_cohort_add_cohort_members', use: 'push_membership (n3)', lot: 'M2' },
  { name: 'core_cohort_delete_cohort_members', use: 'push_membership (n3)', lot: 'M2' },
  { name: 'core_group_create_groups', use: 'miroirs d’équipes', lot: 'M4' },
  { name: 'core_group_update_groups', use: 'miroirs d’équipes', lot: 'M4' },
  { name: 'core_group_delete_groups', use: 'miroirs d’équipes', lot: 'M4' },
  { name: 'core_group_add_group_members', use: 'miroirs d’équipes', lot: 'M4' },
  { name: 'core_group_delete_group_members', use: 'miroirs d’équipes', lot: 'M4' },
]);

function summarizeError(error) {
  if (error instanceof MoodleApiError) {
    return {
      kind: 'api',
      errorcode: error.errorcode,
      message: error.moodleMessage || error.message,
    };
  }
  return {
    kind: 'transport',
    errorcode: null,
    status: error?.upstreamStatus ?? null,
    message: String(error?.message || error),
  };
}

/**
 * @param {object} deps
 * @param {import('./client').createMoodleClient extends (...a:any)=>infer R ? R : never} deps.client
 * @param {Awaited<ReturnType<import('./settings').loadMoodleSettings>>} deps.settings
 * @param {Array<{ id: number, title?: string, name?: string }>} [deps.chapters] chapitres G&L connus
 */
async function runMoodleCheck({ client, settings, chapters = [] }) {
  const report = {
    ok: false,
    checkedAt: new Date().toISOString(),
    site: null,
    functions: [],
    missingFunctions: [],
    cohorts: [],
    cohortsOfYearWithoutPolicy: [],
    chapterCourses: [],
    errors: [],
  };

  // 1. Jeton et site.
  let siteInfo;
  try {
    siteInfo = await client.siteInfo();
  } catch (error) {
    report.errors.push({ step: 'site_info', ...summarizeError(error) });
    return report;
  }
  report.site = {
    sitename: siteInfo?.sitename ?? null,
    siteurl: siteInfo?.siteurl ?? null,
    release: siteInfo?.release ?? null,
    username: siteInfo?.username ?? null,
    userid: siteInfo?.userid ?? null,
  };

  // 2. Fonctions autorisées : `site_info` les liste ; on les contrôle une à une.
  const allowed = new Set(
    (Array.isArray(siteInfo?.functions) ? siteInfo.functions : []).map((f) => String(f?.name)),
  );
  for (const fn of REQUIRED_FUNCTIONS) {
    const present = allowed.has(fn.name);
    report.functions.push({ ...fn, allowed: present });
    if (!present) report.missingFunctions.push(fn.name);
  }

  // 3. Cohortes visibles et politique retenue.
  if (allowed.has('core_cohort_search_cohorts')) {
    try {
      const found = await client.searchCohorts('');
      const cohorts = Array.isArray(found?.cohorts) ? found.cohorts : [];
      for (const cohort of cohorts) {
        const idnumber = String(cohort?.idnumber || '');
        const policy = resolvePolicyForIdnumber(idnumber, settings.compiledPolicies);
        const ofYear = isCohortOfYear(idnumber, settings.yearPrefix);
        report.cohorts.push({
          id: Number(cohort.id),
          name: String(cohort.name || ''),
          idnumber,
          visible: cohort.visible == null ? null : Boolean(Number(cohort.visible)),
          ofYear,
          policyKey: policy ? policy.key : null,
        });
        if (ofYear && !policy) report.cohortsOfYearWithoutPolicy.push(idnumber);
      }
    } catch (error) {
      report.errors.push({ step: 'cohorts', ...summarizeError(error) });
    }
  }

  // 4. Table chapitre → cours avec noms.
  const courseIds = Object.values(settings.chapterCourses || {});
  let coursesById = new Map();
  if (courseIds.length && allowed.has('core_course_get_courses_by_field')) {
    try {
      const courses = await client.getCoursesByIds(courseIds);
      coursesById = new Map(courses.map((c) => [Number(c.id), c]));
    } catch (error) {
      report.errors.push({ step: 'courses', ...summarizeError(error) });
    }
  }
  const chapterTitles = new Map(
    (chapters || []).map((c) => [Number(c.id), String(c.title || c.name || `Chapitre ${c.id}`)]),
  );
  for (const [chapterId, courseId] of Object.entries(settings.chapterCourses || {})) {
    const course = coursesById.get(Number(courseId)) || null;
    report.chapterCourses.push({
      chapterId: Number(chapterId),
      chapterTitle: chapterTitles.get(Number(chapterId)) || null,
      chapterKnown: chapterTitles.has(Number(chapterId)),
      courseId: Number(courseId),
      courseName: course ? String(course.fullname || course.shortname || '') : null,
      courseShortname: course ? String(course.shortname || '') : null,
      courseFound: Boolean(course),
    });
  }

  report.ok =
    report.errors.length === 0 &&
    report.missingFunctions.filter((name) => isM1Function(name)).length === 0;
  return report;
}

function isM1Function(name) {
  const fn = REQUIRED_FUNCTIONS.find((f) => f.name === name);
  return fn ? fn.lot === 'M1' : false;
}

module.exports = { REQUIRED_FUNCTIONS, runMoodleCheck, summarizeError };
