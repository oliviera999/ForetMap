'use strict';

/**
 * Résolveur **unique** du niveau de l'apprenant (audit du 25/09/2026, § 3.2.1 ; décisions du
 * mainteneur, questions 4 et 5). Miroir ESM du cœur pur : `src/utils/learnerLevel.js` (parité
 * vérifiée par `tests/pedago-learner-level.test.js`).
 *
 * **Une seule échelle** : les niveaux du programme (`cycle3` … `es_terminale`) plus
 * `universite` (lib/pedagoScales.js, `LEARNER_NIVEAU_VALUES`). Collège, lycée et université ne
 * sont que des regroupements d'affichage, déduits du niveau.
 *
 * **Le plus spécifique l'emporte** :
 *
 * 1. visite invitée → Collège, sans échappatoire ;
 * 2. aperçu (niveau ou étape choisi dans le menu Aperçu, pour la session seulement) ;
 * 3. **séance en cours** : elle impose son niveau, verrouillage compris. La classe ne fait que
 *    préciser à l'intérieur de la plage de la séance (une 6ᵉ dans une séance « tout le
 *    collège » reste au cycle 3 ; dans une séance « lycée », elle passe au lycée) ;
 * 4. **compte non élève** (professeur, admin, personnel… — demande du 22/11/2026) : son
 *    **choix explicite** (`users.pedago_content_level` ; `complet` = vue gestion, université,
 *    aucune borne), sinon le plus haut niveau de **ses groupes** (héritage compris), sinon le
 *    **cycle 3**. Ni replis hérités ni préférence d'affichage. Ce niveau ne règle que le
 *    contenu pédagogique consulté, jamais un droit ni un écran de gestion ;
 * 5. **classe** de l'élève (`groups.curriculum_niveau`, hérité des parents ; plusieurs
 *    classes : le plus haut niveau) ;
 * 6. replis hérités de l'élève, faute de niveau : l'ancienne règle d'affichage — le plus
 *    simple des `groups.pedago_level` et de `maps.pedago_level`, sinon le défaut de
 *    l'établissement (`ui.biodiv.pedago_level_default`), qui n'est **jamais un plafond**.
 *
 * **Préférence de l'élève** (`users.biodiv_pedago_level`) : elle ne règle que l'affichage
 * (`etape`) et ne peut que le simplifier, sauf `ui.biodiv.pedago_pref_can_raise`. Elle ne
 * touche ni `niveau` ni `maxPalier` : les questions qui valident une fiche suivent la classe
 * ou la séance, pas un confort d'affichage.
 *
 * Sortie (serveur comme front) :
 *
 * ```text
 * {
 *   niveau:            'cycle3' … 'es_terminale' | 'universite' | null (inconnu : repli),
 *   contentEtape:      regroupement du niveau (ou du repli) : 'college' | 'lycee' | 'universite',
 *   etape:             affichage, préférence appliquée,
 *   curriculumNiveaux: niveaux du programme proposés (notions), null = tous,
 *   maxPalier:         palier maximal des questions qui verrouillent (null = aucune borne),
 *   sources:           { niveau, affichage } — 'invite' | 'apercu' | 'seance' | 'profil' |
 *                      'vue_complete' | 'classe' | 'groupe' | 'carte' | 'site' | 'defaut' |
 *                      'preference'
 * }
 * ```
 *
 * Le serveur fait autorité pour ce qu'il décide seul (le verrouillage) : il recalcule le
 * niveau depuis le jeton et la base, sans se fier à un niveau envoyé par le client. La seule
 * donnée reçue est l'identifiant de la **séance en cours** (`pedagoSession`), crue seulement si
 * le compte en a une exécution démarrée et non terminée (`pedago_session_runs`).
 */

const {
  resolveBiodivPedagoLevel,
  loadUserGroupPedagoProfile,
  normalizePedagoLevel,
  minPedagoLevel,
  DEFAULT_SITE_LEVEL,
} = require('../biodivPedagoLevel');
const {
  curriculumPalier,
  curriculumNiveauxForEtape,
  parseNotionNiveauFilter,
  visibleCurriculumNiveaux,
  normalizeLearnerNiveau,
  learnerNiveauPalier,
  etapeForLearnerNiveau,
  highestLearnerNiveau,
} = require('../pedagoScales');
const { normalizeStaffContentLevel, STAFF_CONTENT_LEVEL_FULL } = require('../shared/pedagoEnums');

/** Palier maximal d'une étape quand le niveau n'est pas connu. */
const ETAPE_MAX_PALIER = Object.freeze({ college: 2, lycee: 5, universite: null });

/** Origines possibles d'un niveau, du plus fort au plus faible. */
const LEARNER_LEVEL_SOURCES = Object.freeze([
  'invite',
  'apercu',
  'seance',
  'profil',
  'vue_complete',
  'classe',
  'groupe',
  'carte',
  'site',
  'defaut',
]);

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
 * Niveaux visés par une séance, sur l'échelle de l'apprenant. Le **public** est
 * `pedago_sessions.level` ; `config.notionNiveau` le précise s'il reste dans la même étape
 * (« cycle 4 » pour une séance collège). Hors de l'étape (notions de collège révisées dans
 * une séance lycée), c'est un filtre de contenu, pas un public : il est ignoré ici.
 *
 * @param {{ level?: string|null, notionNiveau?: string|null }|null} session
 * @returns {string[]} vide = la séance n'impose rien
 */
function sessionLearnerNiveaux(session) {
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

/** Affichage après préférence : ne peut que simplifier, sauf `prefCanRaise`. */
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

/** Niveau par défaut d'un compte non élève sans choix ni groupe avec un niveau. */
const STAFF_DEFAULT_NIVEAU = 'cycle3';

/**
 * Niveau de contenu d'un compte non élève, hors aperçu et hors séance : choix explicite du
 * profil (`complet` = vue gestion, aucune borne), sinon le plus haut niveau de ses groupes,
 * sinon le cycle 3. Aucun repli hérité (étape de groupe, carte, établissement) et aucune
 * préférence d'affichage : le niveau choisi est appliqué tel quel.
 */
function resolveStaffLevel(contentLevel, classNiveau) {
  const choice = normalizeStaffContentLevel(contentLevel);
  if (choice === STAFF_CONTENT_LEVEL_FULL) {
    return buildLearnerLevel({
      niveau: 'universite',
      contentEtape: 'universite',
      source: 'vue_complete',
    });
  }
  let niveau = STAFF_DEFAULT_NIVEAU;
  let source = 'defaut';
  if (choice) {
    niveau = choice;
    source = 'profil';
  } else if (classNiveau) {
    niveau = classNiveau;
    source = 'classe';
  }
  return buildLearnerLevel({ niveau, contentEtape: etapeForLearnerNiveau(niveau), source });
}

/**
 * Cœur pur : résout le niveau d'un apprenant à partir de ses entrées déjà chargées.
 *
 * @param {{
 *   isGuest?: boolean,
 *   teacherPreview?: string|null,   // étape ou niveau choisi dans le menu Aperçu
 *   staff?: boolean,                // compte personnel non élève (prof, admin, personnel…)
 *   contentLevel?: string|null,     // users.pedago_content_level (compte non élève)
 *   session?: { level?: string|null, notionNiveau?: string|null }|null,
 *   classNiveaux?: Array<string|null>,  // groups.curriculum_niveau (héritage compris)
 *   groupLevels?: Array<string|null>,   // groups.pedago_level — repli
 *   mapLevel?: string|null,             // maps.pedago_level — repli
 *   siteDefault?: string|null,          // ui.biodiv.pedago_level_default — repli
 *   userPreference?: string|null,       // users.biodiv_pedago_level — affichage seulement
 *   prefCanRaise?: boolean,
 * }} input
 */
function resolveLearnerLevel(input = {}) {
  const {
    isGuest = false,
    teacherPreview = null,
    staff = false,
    contentLevel = null,
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

  const classNiveau = highestLearnerNiveau(classNiveaux);
  const sessionNiveaux = sessionLearnerNiveaux(session);
  if (staff && sessionNiveaux.length === 0) return resolveStaffLevel(contentLevel, classNiveau);
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
    // Seule valeur de l'ancienne échelle qui désigne un niveau sans ambiguïté.
    if (legacyEtape === 'universite') niveau = 'universite';
  }

  const contentEtape = niveau ? etapeForLearnerNiveau(niveau) : legacyEtape;
  // La préférence d'affichage est celle d'un élève : un compte non élève règle son niveau.
  const etape = staff
    ? contentEtape
    : applyDisplayPreference(contentEtape, userPreference, prefCanRaise);
  return buildLearnerLevel({
    niveau,
    contentEtape,
    etape,
    source,
    affichage: etape !== contentEtape ? 'preference' : source,
  });
}

/** Identifiant de séance reçu d'une requête (`?pedagoSession=` ou corps), ou `null`. */
function readPedagoSessionParam(req) {
  const raw = req?.query?.pedagoSession ?? req?.body?.pedagoSession;
  if (raw == null || Array.isArray(raw) || typeof raw === 'object') return null;
  const key = String(raw).trim();
  return key && key.length <= 120 ? key : null;
}

/**
 * Aperçu de niveau annoncé par le client (`?pedagoPreview=` ou corps), ou `null`. Il n'est
 * cru que pour un **compte non élève** (`loadLearnerLevel`) : l'aperçu ne fait qu'aligner le
 * serveur sur ce que le menu Aperçu affiche, et un compte non élève peut de toute façon choisir
 * son niveau dans son profil. Un élève qui l'enverrait n'obtient rien.
 */
function readPedagoPreviewParam(req) {
  const raw = req?.query?.pedagoPreview ?? req?.body?.pedagoPreview;
  if (raw == null || Array.isArray(raw) || typeof raw === 'object') return null;
  return normalizeLearnerNiveau(raw) || normalizePedagoLevel(raw) || null;
}

/**
 * Séance en cours d'un compte : publiée, module allumé, exécution démarrée et pas terminée
 * depuis. `null` sinon — un identifiant quelconque n'impose rien.
 */
async function loadActivePedagoSession(userId, idOrSlug, db) {
  const key = String(idOrSlug || '').trim();
  if (!key) return null;
  const { getSettingValue } = require('../settings');
  if (!(await getSettingValue('ui.modules.pedago_sessions_enabled', true))) return null;
  let row;
  try {
    row = await db.queryOne(
      `SELECT s.id, s.level, s.config_json
         FROM pedago_sessions s
         INNER JOIN pedago_session_runs r ON r.session_id = s.id AND r.user_id = ?
        WHERE (s.id = ? OR s.slug = ?)
          AND s.is_published = 1
          AND r.last_started_at IS NOT NULL
          AND (r.last_completed_at IS NULL OR r.last_completed_at < r.last_started_at)
        LIMIT 1`,
      [String(userId), key, key],
    );
  } catch (e) {
    if (e && (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE')) return null;
    throw e;
  }
  if (!row) return null;
  let config = {};
  try {
    config = JSON.parse(row.config_json || '{}') || {};
  } catch {
    config = {};
  }
  return { id: String(row.id), level: row.level, notionNiveau: config.notionNiveau ?? null };
}

/**
 * Charge et résout le niveau d'un compte, élève ou non (un compte non élève suit son niveau
 * de contenu, cf. en-tête). `null` pour un compte inconnu : aucun filtrage.
 *
 * @param {string|number|null} userId
 * @param {{
 *   mapId?: string|null,
 *   pedagoSessionId?: string|null,  // séance en cours annoncée par le client
 *   teacherPreview?: string|null,   // aperçu annoncé par le client (compte non élève seul)
 *   profile?: { levels: string[], curriculumNiveaux: string[] },  // déjà chargé
 *   db?: { queryOne: Function },
 * }} [options]
 */
async function loadLearnerLevel(userId, options = {}) {
  const id = userId != null ? String(userId).trim() : '';
  if (!id) return null;
  const db = options.db || require('../../database');
  const user = await loadLevelColumns(db, id);
  if (!user) return null;
  const staff = String(user.user_type) !== 'student';

  const { getSettingValue } = require('../settings');
  const [siteDefault, prefCanRaise, profile, session] = await Promise.all([
    getSettingValue('ui.biodiv.pedago_level_default', DEFAULT_SITE_LEVEL),
    getSettingValue('ui.biodiv.pedago_pref_can_raise', false),
    options.profile || loadUserGroupPedagoProfile(id),
    options.pedagoSessionId ? loadActivePedagoSession(id, options.pedagoSessionId, db) : null,
  ]);

  let mapLevel = null;
  const mapId = options.mapId != null ? String(options.mapId).trim() : '';
  if (mapId && !staff) {
    const map = await db.queryOne('SELECT pedago_level FROM maps WHERE id = ? LIMIT 1', [mapId]);
    mapLevel = map ? map.pedago_level : null;
  }

  const level = resolveLearnerLevel({
    teacherPreview: staff ? options.teacherPreview || null : null,
    staff,
    contentLevel: staff ? user.pedago_content_level : null,
    siteDefault,
    prefCanRaise: Boolean(prefCanRaise),
    session,
    classNiveaux: profile.curriculumNiveaux,
    groupLevels: profile.levels,
    mapLevel,
    userPreference: user.biodiv_pedago_level,
  });
  return session ? { ...level, sessionId: session.id } : level;
}

/**
 * Colonnes de niveau d'un compte. Base pas encore migrée (colonne 387 absente) : relecture
 * sans `pedago_content_level`, le compte non élève retombe sur ses groupes ou le cycle 3.
 */
async function loadLevelColumns(db, id) {
  try {
    return await db.queryOne(
      'SELECT user_type, biodiv_pedago_level, pedago_content_level FROM users WHERE id = ? LIMIT 1',
      [id],
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    return db.queryOne('SELECT user_type, biodiv_pedago_level FROM users WHERE id = ? LIMIT 1', [
      id,
    ]);
  }
}

/** Raccourci des routes : niveau du compte connecté, séance en cours comprise. */
function loadLearnerLevelForRequest(req, options = {}) {
  return loadLearnerLevel(req?.auth?.userId, {
    ...options,
    pedagoSessionId: readPedagoSessionParam(req),
    teacherPreview: readPedagoPreviewParam(req),
  });
}

module.exports = {
  ETAPE_MAX_PALIER,
  STAFF_DEFAULT_NIVEAU,
  LEARNER_LEVEL_SOURCES,
  maxPalierForLevel,
  sessionLearnerNiveaux,
  resolveLearnerLevel,
  readPedagoSessionParam,
  readPedagoPreviewParam,
  loadActivePedagoSession,
  loadLearnerLevel,
  loadLearnerLevelForRequest,
};
