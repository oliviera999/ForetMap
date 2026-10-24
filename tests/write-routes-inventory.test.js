'use strict';

// Inventaire figé des routes d'écriture (audit du 25/09/2026, piste B, étape B0).
//
// Énumère chaque route POST / PUT / PATCH / DELETE montée par `server.js` (hors `/api/gl/*`,
// qui a son propre modèle d'accès) et la compare à la liste ci-dessous, où chaque route
// déclare sa protection. Le but : qu'une route d'écriture ajoutée **sans** protection, ou
// dont la garde disparaît, fasse échouer la CI.
//
// Protection détectée : les gardes posées devant le handler, sur la route ou par un
// `router.use` du routeur qui la porte — `requirePermission('clé')` et `requireTeacher`
// (→ `permission:clé`), `requireAuth` (→ `auth`, tout compte connecté), et
// `requireGroupManagement`. Plusieurs gardes s'écrivent jointes par `+`.
// Aucune garde détectée : la ligne doit dire pourquoi, en commençant par
//   - `publique : …` — ouverte à dessein (connexion, inscription, entrée par code…) ;
//   - `garde interne : …` — le contrôle est fait dans le handler (jeton lu à la main,
//     contexte élève, secret de déploiement…).
//
// Ajouter une route d'écriture : ajouter sa ligne ici, avec la garde que le test détecte ou
// la justification. Pas de base de données : l'application est chargée, jamais servie.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// 1) Mémoriser le chemin de montage de chaque routeur : Express 5 ne le garde pas sur la
//    couche. `app.use` passe par `Router.prototype.use` (paquet `router`, = express.Router).
const Router = require('router');

const mounts = new Map(); // routeur → [{ path, fn }] dans l'ordre des `use`
const originalUse = Router.prototype.use;
Router.prototype.use = function recordMount(...args) {
  let path = '/';
  let fns = args;
  if (typeof args[0] === 'string' || args[0] instanceof RegExp || Array.isArray(args[0])) {
    [path, ...fns] = args;
  }
  const list = mounts.get(this) || [];
  for (const fn of fns.flat(Infinity)) list.push({ path, fn });
  mounts.set(this, list);
  return originalUse.apply(this, args);
};

// 2) Étiqueter les gardes d'authentification AVANT le chargement des routes (qui les
//    importent par déstructuration).
const authMiddleware = require('../middleware/requireTeacher');

const originalRequirePermission = authMiddleware.requirePermission;
authMiddleware.requirePermission = function taggedRequirePermission(key, options) {
  const fn = originalRequirePermission(key, options);
  fn.guardTag = `permission:${key}`;
  return fn;
};
authMiddleware.requireTeacher.guardTag = 'permission:teacher.access';
authMiddleware.requireAuth.guardTag = 'auth';

const { app } = require('../server');

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const NAMED_GUARDS = new Set(['requireGroupManagement']);

function joinPath(prefix, path) {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function guardName(fn) {
  if (fn?.guardTag) return fn.guardTag;
  if (NAMED_GUARDS.has(fn?.name)) return fn.name;
  return null;
}

function appliesTo(scopePath, routePath) {
  return scopePath === '/' || routePath === scopePath || routePath.startsWith(`${scopePath}/`);
}

/** Routes d'écriture montées, avec la liste ordonnée des gardes détectées. */
function collectWriteRoutes() {
  const routes = [];
  function walk(router, prefix, inherited) {
    const recorded = [...(mounts.get(router) || [])];
    const scoped = [...inherited];
    for (const layer of router.stack) {
      if (layer.route) {
        for (const routePath of [].concat(layer.route.path)) {
          const full = joinPath(prefix, String(routePath));
          for (const method of Object.keys(layer.route.methods)) {
            if (!WRITE_METHODS.has(method)) continue;
            const chain = [
              ...scoped.filter((m) => appliesTo(m.path, full)).map((m) => m.fn),
              ...layer.route.stack.map((l) => l.handle),
            ];
            const guards = [...new Set(chain.map(guardName).filter(Boolean))];
            routes.push({ key: `${method.toUpperCase()} ${full}`, guards });
          }
        }
        continue;
      }
      const index = recorded.findIndex((r) => r.fn === layer.handle);
      const mount = index >= 0 ? recorded.splice(index, 1)[0] : null;
      assert.ok(
        mount,
        `montage introuvable pour la couche « ${layer.name} » sous ${prefix || '/'}`,
      );
      assert.equal(typeof mount.path, 'string', `montage non textuel sous ${prefix || '/'}`);
      const mountPath = joinPath(prefix, mount.path);
      if (Array.isArray(layer.handle?.stack)) walk(layer.handle, mountPath, scoped);
      else scoped.push({ path: mountPath, fn: layer.handle });
    }
  }
  walk(app.router, '', []);
  return routes.filter((r) => !/^[A-Z]+ \/api\/gl(\/|$)/.test(r.key));
}

/**
 * Inventaire figé : « MÉTHODE chemin » → protection (voir l’en-tête). Trié par chemin.
 */
const WRITE_ROUTES = Object.freeze({
  'POST /api/admin/integrations/moodle/check': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/conflicts/:id': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/exempt': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/lti/suggest': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/merge': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/mirrors': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/pending-matches/:id':
    'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/runs': 'permission:integrations.moodle.manage',
  'POST /api/admin/integrations/moodle/runs/:id/undo': 'permission:integrations.moodle.manage',
  'POST /api/admin/restart':
    'garde interne : secret de déploiement (requireDeploySecret, routes/admin-ops.js)',
  'POST /api/auth/admin/impersonate': 'permission:admin.impersonate',
  'POST /api/auth/admin/impersonate/stop': 'auth',
  'PUT /api/auth/discovery-tour-seen': 'auth',
  'POST /api/auth/elevate': 'publique : ancienne élévation par PIN, répond 410 Gone',
  'POST /api/auth/forgot-password': 'publique : demande de réinitialisation (limiteur authLimiter)',
  'POST /api/auth/login': 'publique : connexion (limiteur authLimiter)',
  'POST /api/auth/me/password': 'auth',
  'PATCH /api/auth/me/profile': 'auth',
  'POST /api/auth/register':
    'publique : inscription (réglage ui.auth.allow_register, limiteur authLimiter)',
  'POST /api/auth/reset-password':
    'publique : réinitialisation par jeton à usage unique (limiteur authLimiter)',
  'POST /api/auth/teacher': 'publique : ancienne élévation par PIN, répond 410 Gone',
  'POST /api/auth/totp/backup-codes': 'auth',
  'POST /api/auth/totp/enroll/confirm':
    'garde interne : jeton intermédiaire de connexion (étape enroll) ou session (resolveEnrollmentContext, routes/authTotp.js) ; limiteur authLimiter',
  'POST /api/auth/totp/enroll/start':
    'garde interne : jeton intermédiaire de connexion (étape enroll) ou session (resolveEnrollmentContext, routes/authTotp.js) ; limiteur authLimiter',
  'POST /api/auth/totp/users/:userId/reset': 'permission:admin.users.assign_roles',
  'POST /api/auth/totp/verify':
    'garde interne : jeton intermédiaire de connexion (étape verify, loadPendingContext, routes/authTotp.js) ; limiteur authLimiter',
  'POST /api/auth/teacher/forgot-password':
    'publique : demande de réinitialisation (limiteur authLimiter)',
  'POST /api/auth/teacher/login': 'publique : ancienne route, répond 410 Gone',
  'POST /api/auth/teacher/reset-password':
    'publique : réinitialisation par jeton à usage unique (limiteur authLimiter)',
  'POST /api/clades': 'permission:plants.manage',
  'DELETE /api/clades/:id': 'permission:plants.manage',
  'PUT /api/clades/:id': 'permission:plants.manage',
  'POST /api/clades/activity/check':
    'publique : correction en lecture seule (activité élève), aucune écriture',
  'POST /api/clades/activity/subtree':
    'publique : calcul en lecture seule (activité élève), aucune écriture',
  'POST /api/context-comments': 'auth',
  'DELETE /api/context-comments/:id': 'auth',
  'PATCH /api/context-comments/:id/place-status': 'auth+permission:place_messages.manage',
  'POST /api/context-comments/:id/reactions': 'auth',
  'POST /api/context-comments/:id/report': 'auth',
  'POST /api/csp-report':
    'publique : rapports CSP envoyés par le navigateur (corps borné, aucune donnée métier)',
  'PUT /api/curriculum/glossary-categories/:categorie/notions': 'permission:plants.manage',
  'PUT /api/curriculum/glossary-terms/:code/notions': 'permission:plants.manage',
  'PUT /api/curriculum/quiz-categories/:slug/notions': 'permission:plants.manage',
  'PUT /api/curriculum/quiz-questions/:code/notions': 'permission:plants.manage',
  'POST /api/enov/access':
    'publique : entrée par code du plan e-nov (bcrypt, limiteur authLimiter)',
  'POST /api/enov/logout': 'publique : efface le laissez-passer du plan e-nov, toujours 200',
  'POST /api/food-web/interactions': 'permission:plants.manage',
  'DELETE /api/food-web/interactions/:id': 'permission:plants.manage',
  'PUT /api/food-web/interactions/:id': 'permission:plants.manage',
  'DELETE /api/forum/posts/:id': 'auth',
  'PATCH /api/forum/posts/:id': 'auth',
  'POST /api/forum/posts/:id/reactions': 'auth',
  'POST /api/forum/posts/:id/report': 'auth',
  'PATCH /api/forum/reports/:id': 'auth+permission:forum.group.moderate',
  'POST /api/forum/threads': 'auth',
  'PATCH /api/forum/threads/:id/lock': 'auth+permission:forum.group.moderate',
  'PATCH /api/forum/threads/:id/pin': 'auth+permission:forum.group.moderate',
  'POST /api/forum/threads/:id/posts': 'auth',
  'POST /api/glossary/terms/:code/acknowledge': 'auth',
  'POST /api/groups': 'auth+requireGroupManagement',
  'DELETE /api/groups/:id': 'auth',
  'PATCH /api/groups/:id': 'auth',
  'POST /api/groups/:id/class-code': 'auth+requireGroupManagement',
  'PUT /api/groups/:id/members': 'auth',
  'DELETE /api/groups/:id/members/:userId': 'auth+requireGroupManagement',
  'POST /api/groups/:id/members/:userId': 'auth+requireGroupManagement',
  'POST /api/groups/:id/members/bulk': 'auth+requireGroupManagement',
  'POST /api/groups/import': 'auth+requireGroupManagement',
  'POST /api/id-keys': 'permission:id_keys.manage',
  'DELETE /api/id-keys/:id': 'permission:id_keys.manage',
  'PUT /api/id-keys/:id': 'permission:id_keys.manage',
  'POST /api/id-keys/:id/couplets': 'permission:id_keys.manage',
  'DELETE /api/id-keys/:id/couplets/:coupletId': 'permission:id_keys.manage',
  'PUT /api/id-keys/:id/couplets/:coupletId/leads': 'permission:id_keys.manage',
  'POST /api/individuals': 'permission:individuals.manage',
  'DELETE /api/individuals/:id': 'permission:individuals.manage',
  'PUT /api/individuals/:id': 'permission:individuals.manage',
  'POST /api/individuals/:id/measurements': 'permission:individuals.measure',
  'DELETE /api/individuals/:id/measurements/:measurementId': 'permission:individuals.manage',
  'POST /api/learning-links': 'permission:plants.manage',
  'DELETE /api/learning-links/:id': 'permission:plants.manage',
  'PATCH /api/learning-links/:id': 'permission:plants.manage',
  'POST /api/learning-links/gating': 'permission:plants.manage',
  'DELETE /api/learning-links/locks': 'permission:plants.manage',
  'PUT /api/learning-links/policy': 'permission:plants.manage',
  'POST /api/learning-links/review': 'permission:plants.manage',
  'POST /api/learning-links/suggest': 'permission:plants.manage',
  'PUT /api/learning-links/type-policy': 'permission:plants.manage',
  'POST /api/lti/launch': 'publique : lancement LTI signé par la plateforme (id_token vérifié)',
  'POST /api/lti/login':
    'publique : initiation OIDC LTI 1.3 (plateforme Moodle, réglage lti.enabled)',
  'POST /api/lti/session':
    'garde interne : échange d’un ticket LTI à usage unique contre une session',
  'POST /api/map-categories': 'permission:zones.manage',
  'DELETE /api/map-categories/:id': 'permission:zones.manage',
  'PUT /api/map-categories/:id': 'permission:zones.manage',
  'PUT /api/map-categories/reorder': 'permission:zones.manage',
  'POST /api/map-routes': 'permission:zones.manage',
  'DELETE /api/map-routes/:id': 'permission:zones.manage',
  'PUT /api/map-routes/:id': 'permission:zones.manage',
  'POST /api/map/markers': 'permission:map.manage_markers',
  'DELETE /api/map/markers/:id': 'permission:map.manage_markers',
  'PUT /api/map/markers/:id': 'permission:map.manage_markers',
  'POST /api/map/markers/:id/photos': 'permission:map.manage_markers',
  'DELETE /api/map/markers/:id/photos/:pid': 'permission:map.manage_markers',
  'PUT /api/map/markers/:id/photos/reorder': 'permission:map.manage_markers',
  'DELETE /api/media-library': 'permission:media.manage',
  'POST /api/media-library': 'permission:media.manage',
  'DELETE /api/notifications/:id': 'auth',
  'POST /api/notifications/:id/read': 'auth',
  'POST /api/notifications/read-all': 'auth',
  'POST /api/pedago-sessions': 'permission:plants.manage',
  'PUT /api/pedago-sessions/:idOrSlug': 'permission:plants.manage',
  'POST /api/pedago-sessions/:idOrSlug/runs/complete': 'auth',
  'POST /api/pedago-sessions/:idOrSlug/runs/start': 'auth',
  'POST /api/plan/access':
    'publique : entrée par code du plan public (bcrypt, limiteur authLimiter)',
  'POST /api/plan/logout': 'publique : efface le laissez-passer du plan, toujours 200',
  'POST /api/plants': 'permission:plants.manage',
  'DELETE /api/plants/:id': 'permission:plants.manage',
  'PUT /api/plants/:id': 'permission:plants.manage',
  'POST /api/plants/:id/acknowledge-discovery': 'auth',
  'PUT /api/plants/:id/map-species/:mapId': 'permission:plants.manage',
  'POST /api/plants/:id/photo-upload': 'permission:plants.manage',
  'POST /api/plants/:id/validate-hazard': 'permission:plants.hazards.validate',
  'POST /api/plants/import': 'permission:plants.manage',
  'POST /api/plants/plantnet-identify': 'permission:plants.manage',
  'POST /api/quiz/admin/import': 'permission:plants.manage',
  'POST /api/quiz/admin/questions': 'permission:plants.manage',
  'PUT /api/quiz/admin/questions/:code': 'permission:plants.manage',
  'POST /api/quiz/questions/:code/answer':
    'publique : réponse au quiz libre, jeton de présentation à usage unique',
  'POST /api/rbac/profiles': 'permission:admin.roles.manage',
  'DELETE /api/rbac/profiles/:id': 'permission:admin.roles.manage',
  'PATCH /api/rbac/profiles/:id': 'permission:admin.roles.manage',
  'POST /api/rbac/profiles/:id/duplicate': 'permission:admin.roles.manage',
  'PUT /api/rbac/profiles/:id/permissions': 'permission:admin.roles.manage',
  'PATCH /api/rbac/progression-by-validated-tasks': 'permission:admin.roles.manage',
  'POST /api/rbac/progression/recompute': 'permission:admin.roles.manage',
  'POST /api/rbac/users': 'permission:users.create',
  'PATCH /api/rbac/users/:userType/:userId': 'permission:admin.users.assign_roles',
  'PUT /api/rbac/users/:userType/:userId/role': 'permission:admin.users.assign_roles',
  'POST /api/rbac/users/bulk-role': 'permission:admin.users.assign_roles',
  'DELETE /api/rbac/users/teacher/:userId': 'permission:admin.users.assign_roles',
  'PUT /api/school-calendar/days': 'permission:admin.settings.write',
  'PUT /api/school-calendar/weekdays': 'permission:admin.settings.write',
  'POST /api/school-calendar/years': 'permission:admin.settings.write',
  'PUT /api/settings/admin/:key': 'permission:admin.settings.write',
  'PUT /api/settings/admin/help-content': 'permission:admin.settings.write',
  'POST /api/settings/admin/help-content/reset': 'permission:admin.settings.write',
  'PUT /api/settings/admin/help-narrator': 'permission:admin.settings.write',
  'POST /api/settings/admin/help-narrator/reset': 'permission:admin.settings.write',
  'POST /api/settings/admin/maps': 'permission:admin.settings.write',
  'PUT /api/settings/admin/maps/:id': 'permission:admin.settings.write',
  'PUT /api/settings/admin/maps/:id/georef': 'permission:admin.settings.write',
  'POST /api/settings/admin/maps/:id/image': 'permission:admin.settings.write',
  'DELETE /api/settings/admin/media-library': 'permission:admin.settings.write',
  'POST /api/settings/admin/media-library': 'permission:admin.settings.write',
  'POST /api/settings/admin/plan-access-code': 'permission:admin.settings.write',
  'POST /api/settings/admin/staff-plan-access-code': 'permission:admin.settings.write',
  'POST /api/settings/admin/enov-plan-access-code': 'permission:admin.settings.write',
  'POST /api/settings/admin/system/restart': 'permission:admin.settings.secrets.write',
  'PUT /api/settings/admin/tour-content': 'permission:tours.manage',
  'POST /api/settings/admin/tour-content/reset': 'permission:tours.manage',
  'POST /api/species-observations': 'auth',
  'DELETE /api/species-observations/:id': 'auth',
  'POST /api/species-observations/:id/decision': 'permission:observations.validate',
  'POST /api/species-observations/:id/interaction-evidence': 'permission:observations.validate',
  'DELETE /api/species-observations/:id/interaction-evidence/:interactionId':
    'permission:observations.validate',
  'POST /api/species-observations/:id/photos': 'auth',
  'DELETE /api/species-observations/:id/photos/:photoId': 'auth',
  'POST /api/staff-plan/access':
    'publique : entrée par code du plan des personnels (limiteur authLimiter)',
  'POST /api/staff-plan/logout':
    'publique : efface le laissez-passer du plan des personnels, toujours 200',
  'POST /api/staff-plan/report':
    'garde interne : resolveStaffPlanViewer, 401 sans compte ni laissez-passer',
  'DELETE /api/students/:id': 'permission:students.delete',
  'POST /api/students/:id/duplicate': 'permission:users.create',
  'PATCH /api/students/:id/profile': 'auth',
  'POST /api/students/import': 'permission:students.import',
  'POST /api/students/register': 'auth',
  'POST /api/task-projects': 'permission:tasks.manage',
  'DELETE /api/task-projects/:id': 'permission:tasks.manage',
  'PUT /api/task-projects/:id': 'permission:tasks.manage',
  'POST /api/task-projects/:id/archive': 'permission:tasks.manage',
  'POST /api/task-projects/:id/duplicate': 'permission:tasks.manage',
  'POST /api/task-projects/:id/unarchive': 'permission:tasks.manage',
  'POST /api/task-projects/:id/validate': 'permission:tasks.validate',
  'POST /api/tasks': 'permission:tasks.manage',
  'DELETE /api/tasks/:id': 'permission:tasks.manage',
  'PUT /api/tasks/:id':
    'garde interne : jeton lu dans le handler (parseOptionalAuth), droits tasks.manage / tasks.validate / proposition de l’élève',
  'POST /api/tasks/:id/archive': 'permission:tasks.manage',
  'POST /api/tasks/:id/assign':
    'garde interne : resolveStudentActionContext(…, tasks.assign_self), identité tirée du jeton',
  'POST /api/tasks/:id/assign-group': 'permission:tasks.assign.group',
  'POST /api/tasks/:id/done':
    'garde interne : resolveStudentActionContext, identité tirée du jeton',
  'DELETE /api/tasks/:id/logs/:logId': 'permission:tasks.manage',
  'POST /api/tasks/:id/unarchive': 'permission:tasks.manage',
  'POST /api/tasks/:id/unassign':
    'garde interne : resolveStudentActionContext, identité tirée du jeton',
  'POST /api/tasks/:id/validate': 'permission:tasks.validate',
  'POST /api/tasks/import': 'permission:tasks.manage',
  'POST /api/tasks/proposals':
    'garde interne : resolveStudentActionContext(…, tasks.propose), identité tirée du jeton',
  'POST /api/tasks/reorder-project': 'permission:tasks.manage',
  'POST /api/tutorials': 'permission:tutorials.manage',
  'DELETE /api/tutorials/:id': 'permission:tutorials.manage',
  'PUT /api/tutorials/:id': 'permission:tutorials.manage',
  'POST /api/tutorials/:id/acknowledge-read': 'auth',
  'POST /api/tutorials/:id/cover-photo-upload': 'permission:tutorials.manage',
  'POST /api/tutorials/import/files': 'permission:tutorials.manage',
  'PUT /api/tutorials/reorder': 'permission:tutorials.manage',
  'POST /api/usage': 'publique : compteur d’usage anonyme (lot borné, aucune donnée nominative)',
  'POST /api/user-journal/embeds/resolve': 'auth',
  'POST /api/user-journal/me/articles': 'auth',
  'DELETE /api/user-journal/me/articles/:articleId': 'auth',
  'PUT /api/user-journal/me/articles/:articleId': 'auth',
  'POST /api/user-journal/me/articles/:articleId/assets': 'auth',
  'DELETE /api/user-journal/me/articles/:articleId/assets/:assetId': 'auth',
  'PUT /api/user-journal/me/articles/:articleId/pin': 'auth',
  'POST /api/user-journal/me/imports': 'auth',
  'DELETE /api/user-journal/me/imports/:importId': 'auth',
  'PUT /api/user-journal/me/imports/:importId/pin': 'auth',
  'POST /api/visit/markers': 'permission:visit.manage',
  'DELETE /api/visit/markers/:id': 'permission:visit.manage',
  'PUT /api/visit/markers/:id': 'permission:visit.manage',
  'DELETE /api/visit/mascot-assets/public': 'permission:visit.manage',
  'POST /api/visit/mascot-packs': 'permission:visit.manage',
  'DELETE /api/visit/mascot-packs/:id': 'permission:visit.manage',
  'PUT /api/visit/mascot-packs/:id': 'permission:visit.manage',
  'POST /api/visit/mascot-packs/:id/assets': 'permission:visit.manage',
  'DELETE /api/visit/mascot-packs/:id/assets/:filename': 'permission:visit.manage',
  'PATCH /api/visit/mascot-packs/:id/assets/:filename': 'permission:visit.manage',
  'POST /api/visit/mascot-packs/:id/reset': 'permission:visit.manage',
  'POST /api/visit/mascot-packs/import': 'permission:visit.manage',
  'POST /api/visit/mascot-packs/import/analyze': 'permission:visit.manage',
  'PUT /api/visit/mascot-preference': 'garde interne : authenticate puis 401 sans compte (handler)',
  'POST /api/visit/mascot-sprite-library/assets': 'permission:visit.manage',
  'DELETE /api/visit/mascot-sprite-library/assets/:filename': 'permission:visit.manage',
  'PATCH /api/visit/mascot-sprite-library/assets/:filename': 'permission:visit.manage',
  'POST /api/visit/media': 'permission:visit.manage',
  'DELETE /api/visit/media/:id': 'permission:visit.manage',
  'PUT /api/visit/media/:id': 'permission:visit.manage',
  'PUT /api/visit/media/reorder': 'permission:visit.manage',
  'POST /api/visit/rebuild-from-map': 'permission:visit.manage',
  'POST /api/visit/seen':
    'publique : suivi de visite, anonyme par cookie ou compte élève contrôlé (authenticate)',
  'POST /api/visit/sync': 'permission:visit.manage',
  'PUT /api/visit/tutorials': 'permission:visit.manage',
  'POST /api/visit/zones': 'permission:visit.manage',
  'DELETE /api/visit/zones/:id': 'permission:visit.manage',
  'PUT /api/visit/zones/:id': 'permission:visit.manage',
  'POST /api/zones': 'permission:zones.manage',
  'DELETE /api/zones/:id': 'permission:zones.manage',
  'PUT /api/zones/:id': 'permission:zones.manage',
  'POST /api/zones/:id/photos': 'permission:zones.manage',
  'DELETE /api/zones/:id/photos/:pid': 'permission:zones.manage',
  'PUT /api/zones/:id/photos/reorder': 'permission:zones.manage',
});

const JUSTIFIED = /^(publique|garde interne) : .{10,}$/;

const ROUTES = collectWriteRoutes();

test('l’énumération trouve les routes d’écriture de l’API (garde-fou de l’outil)', () => {
  assert.ok(ROUTES.length >= 200, `trop peu de routes d’écriture trouvées : ${ROUTES.length}`);
  const keys = ROUTES.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, 'route d’écriture montée deux fois');
  assert.ok(keys.includes('PUT /api/zones/:id'));
  assert.ok(keys.includes('POST /api/quiz/admin/import'));
});

test('chaque route d’écriture est déclarée dans l’inventaire figé', () => {
  const missing = ROUTES.filter((r) => !Object.hasOwn(WRITE_ROUTES, r.key)).map(
    (r) => `${r.key} (gardes détectées : ${r.guards.join('+') || 'aucune'})`,
  );
  assert.deepEqual(
    missing,
    [],
    'route(s) d’écriture non déclarée(s) : ajouter une ligne à WRITE_ROUTES avec sa protection',
  );
});

test('aucune route déclarée n’a disparu (inventaire à jour)', () => {
  const mounted = new Set(ROUTES.map((r) => r.key));
  const stale = Object.keys(WRITE_ROUTES).filter((key) => !mounted.has(key));
  assert.deepEqual(stale, [], 'route(s) déclarée(s) mais plus montée(s) : retirer la ligne');
});

test('la protection déclarée est celle qui est posée devant le handler', () => {
  const mismatches = [];
  for (const { key, guards } of ROUTES) {
    const declared = WRITE_ROUTES[key];
    if (declared == null) continue;
    const detected = guards.join('+');
    if (detected) {
      if (declared !== detected)
        mismatches.push(`${key} : déclaré « ${declared} », posé « ${detected} »`);
    } else if (!JUSTIFIED.test(declared)) {
      mismatches.push(`${key} : aucune garde posée, justification attendue (« ${declared} »)`);
    }
  }
  assert.deepEqual(mismatches, []);
});
