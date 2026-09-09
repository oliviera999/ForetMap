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
 *
 * Chaque erreur remontée porte un `hint` : un geste de dépannage en clair (table complète dans
 * `docs/EXPLOITATION.md`, section « Lien Moodle »). Cas particulier de `accessexception` sur
 * `core_webservice_get_site_info` : la cause peut être *globale* (compte de service non autorisé
 * sur le service externe, capacité `webservice/rest:use` manquante, REST désactivé) ou limitée à
 * *cette fonction* (absente de la liste du service externe). Une **sonde de repli** — une lecture
 * inoffensive — tranche entre les deux, et permet de poursuivre le contrôle dans le second cas.
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

/**
 * Geste de dépannage par `errorcode` Moodle. Volontairement impératif et situé côté Moodle :
 * ces erreurs arrivent en HTTP 200 et ne sont **jamais** un problème de réseau.
 */
const ERROR_HINTS = Object.freeze({
  invalidtoken:
    'Jeton inconnu, révoqué, expiré ou copié avec une espace : régénérer le jeton côté Moodle, ' +
    'remplacer MOODLE_WS_TOKEN dans .env, redémarrer.',
  invalidiptoken:
    'Le jeton est restreint à d’autres adresses IP : ajouter l’adresse publique du serveur à la ' +
    'restriction du jeton (Moodle → Administration du site → Serveur → Services web → Gérer les jetons).',
  enablewsdescription:
    'Les services web sont désactivés côté Moodle : Administration du site → Fonctions avancées → ' +
    'Activer les services web, puis activer le protocole REST.',
  accessexception:
    'Le compte de service n’a pas accès à cette fonction : l’ajouter au service externe, autoriser ' +
    'le compte dans « Utilisateurs autorisés », et lui donner la capacité webservice/rest:use.',
  nopermissions:
    'Le jeton est valide mais le compte de service n’a pas la capacité Moodle demandée : la donner ' +
    'à son rôle, au bon contexte (système pour les cohortes).',
  requiredcapability:
    'Le service externe exige une capacité que le compte de service n’a pas : la donner à son rôle, ' +
    'ou retirer l’exigence du service.',
  invalidrecord:
    'Objet absent côté Moodle (cohorte, cours, groupe) : vérifier l’identifiant réglé.',
  invalidparameter: 'Paramètre refusé par Moodle : vérifier la version de Moodle (≥ 4.x attendue).',
});

/** Sonde de repli : une lecture inoffensive pour savoir si le jeton ouvre *quelque chose*. */
const PROBE_FUNCTION = 'core_cohort_search_cohorts';

/** Codes qui, sur la sonde, signent un refus **global** et non une fonction manquante. */
const GLOBAL_ACCESS_ERRORCODES = Object.freeze([
  'accessexception',
  'invalidtoken',
  'invalidiptoken',
  'enablewsdescription',
]);

const SITE_INFO_ACCESS_HINTS = Object.freeze({
  // La sonde a répondu : le jeton s'authentifie, seule `site_info` manque au service.
  function:
    `Le jeton fonctionne (${PROBE_FUNCTION} a répondu) : c’est la fonction ` +
    'core_webservice_get_site_info qui manque au service externe. L’ajouter dans Moodle → ' +
    'Administration du site → Serveur → Services web → Services externes → Fonctions. Sans elle, ' +
    'la liste des fonctions autorisées ne peut pas être contrôlée.',
  // La sonde échoue elle aussi : rien n'est accessible. Le jeton, lui, est bien reconnu — Moodle
  // répondrait `invalidtoken` sinon, et le point d'entrée REST a bien répondu (protocole actif).
  // Le refus est donc dans l'autorisation *autour* du jeton ; causes par ordre de fréquence.
  global:
    'Moodle reconnaît le jeton (sinon la réponse serait invalidtoken) et le point d’entrée REST ' +
    'répond, mais aucune fonction n’est autorisée : le refus vient de l’autorisation autour du ' +
    'jeton. Dans l’ordre : (1) la capacité webservice/rest:use manque au rôle du compte de ' +
    'service ; (2) ce compte n’est pas dans « Utilisateurs autorisés » du service externe ; ' +
    '(3) le jeton est restreint à d’autres adresses IP ; (4) le jeton a expiré (champ « valide ' +
    'jusqu’au ») ; (5) le jeton a été créé pour un autre service (app mobile…), qui ne contient ' +
    'pas ces fonctions. Pour trancher sans tâtonner : passer Moodle en mode débogage DÉVELOPPEUR ' +
    '(Administration du site → Développement → Mode de débogage, + « Afficher les messages de ' +
    'débogage ») et relancer — Moodle renvoie alors un debuginfo qui nomme la cause exacte, ' +
    'affiché ici sous « debug Moodle : ». Repasser le débogage à AUCUN ensuite.',
  unknown: ERROR_HINTS.accessexception,
});

function summarizeError(error) {
  if (error instanceof MoodleApiError) {
    return {
      kind: 'api',
      errorcode: error.errorcode,
      exception: error.exception || null,
      debuginfo: error.debuginfo || null,
      message: error.moodleMessage || error.message,
      hint: ERROR_HINTS[error.errorcode] || null,
    };
  }
  return {
    kind: 'transport',
    errorcode: null,
    status: error?.upstreamStatus ?? null,
    message: String(error?.message || error),
    hint:
      'Erreur de transport (réseau, délai, 5xx) : vérifier MOODLE_BASE_URL, la joignabilité du ' +
      'site et MOODLE_WS_TIMEOUT_MS. Les erreurs de configuration Moodle, elles, arrivent en HTTP 200.',
  };
}

/**
 * Rejoue une lecture inoffensive après un échec de `site_info`, pour distinguer un refus global
 * d'une fonction absente du service. Ne lève jamais.
 * @returns {Promise<{ wsfunction: string, ok: boolean, scope: 'function'|'global'|'unknown',
 *   errorcode: string|null, message: string|null }>}
 */
async function probeReadAccess(client) {
  try {
    await client.searchCohorts('', { limitnum: 1 });
    return {
      wsfunction: PROBE_FUNCTION,
      ok: true,
      scope: 'function',
      errorcode: null,
      message: null,
    };
  } catch (error) {
    const summary = summarizeError(error);
    let scope = 'unknown';
    if (summary.kind === 'api') {
      // Un code métier (capacité manquante, objet absent…) prouve que l'appel a été *dispatché* :
      // le jeton s'authentifie, le refus de `site_info` est donc propre à cette fonction.
      scope = GLOBAL_ACCESS_ERRORCODES.includes(summary.errorcode) ? 'global' : 'function';
    }
    return {
      wsfunction: PROBE_FUNCTION,
      ok: false,
      scope,
      errorcode: summary.errorcode,
      message: summary.message,
    };
  }
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
    /** `true` quand `site_info` a échoué : la liste des fonctions autorisées est indéterminée. */
    functionsUnknown: false,
    missingFunctions: [],
    /** Résultat de la sonde de repli, seulement si `site_info` a échoué en `accessexception`. */
    tokenProbe: null,
    cohorts: [],
    cohortsOfYearWithoutPolicy: [],
    chapterCourses: [],
    errors: [],
  };

  // 1. Jeton et site.
  let siteInfo = null;
  try {
    siteInfo = await client.siteInfo();
  } catch (error) {
    const summary = summarizeError(error);
    if (summary.errorcode === 'accessexception') {
      const probe = await probeReadAccess(client);
      report.tokenProbe = probe;
      summary.hint = SITE_INFO_ACCESS_HINTS[probe.scope];
      report.errors.push({ step: 'site_info', ...summary });
      // Seule `site_info` manque : on poursuit, liste des fonctions en moins.
      if (probe.scope !== 'function') return report;
      report.functionsUnknown = true;
    } else {
      report.errors.push({ step: 'site_info', ...summary });
      return report;
    }
  }
  if (siteInfo) {
    report.site = {
      sitename: siteInfo?.sitename ?? null,
      siteurl: siteInfo?.siteurl ?? null,
      release: siteInfo?.release ?? null,
      username: siteInfo?.username ?? null,
      userid: siteInfo?.userid ?? null,
    };
  }

  // 2. Fonctions autorisées : `site_info` les liste ; on les contrôle une à une. Sans elle,
  //    `allowed: null` (indéterminé) — surtout pas `false`, qui ferait croire à un service vide.
  const allowed = new Set(
    (Array.isArray(siteInfo?.functions) ? siteInfo.functions : []).map((f) => String(f?.name)),
  );
  for (const fn of REQUIRED_FUNCTIONS) {
    const present = report.functionsUnknown ? null : allowed.has(fn.name);
    report.functions.push({ ...fn, allowed: present });
    if (present === false) report.missingFunctions.push(fn.name);
  }
  /** Tenter l'appel : autorisé, ou liste indéterminée (on laisse Moodle trancher). */
  const mayCall = (name) => report.functionsUnknown || allowed.has(name);

  // 3. Cohortes visibles et politique retenue.
  if (mayCall('core_cohort_search_cohorts')) {
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
  if (courseIds.length && mayCall('core_course_get_courses_by_field')) {
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

module.exports = {
  REQUIRED_FUNCTIONS,
  ERROR_HINTS,
  SITE_INFO_ACCESS_HINTS,
  PROBE_FUNCTION,
  runMoodleCheck,
  summarizeError,
  probeReadAccess,
};
