# Audit des bugs de ForetMap (hors G&L) — 19 novembre 2026

Instantané daté, sur `main` en v1.250.6 (`8e620f6`). Périmètre : toute l'application **hors
Gnomes & Licornes** — `server.js`, `app.js`, `database.js`, `routes/**` (hors `routes/gl`),
`lib/**` (hors `lib/gl*`), `middleware/requireTeacher.js`, `lib/mcp/**`, `src/**` (hors
`src/gl`), soit environ 300 000 lignes. G&L a fait l'objet de son propre audit le même jour :
[`AUDIT_BUGS_GL_2026-11-19.md`](AUDIT_BUGS_GL_2026-11-19.md). Ce document ne le reprend pas.

Objet : les **défauts de correction** (logique, droits, courses, écarts front ↔ API, plantages).
Hors objet : style, performances (sauf quand elles cassent une fonction), doublons, justesse
scientifique des textes.

Ce document ne corrige rien : il liste, classe et dit comment chaque constat a été établi. Un
constat déjà relevé par un audit antérieur n'est repris que s'il est **toujours présent** ; il
est alors signalé comme tel.

## 1. Méthode et niveau de preuve

Six relectures indépendantes, une par domaine : comptes et droits, tâches et vie sociale, cartes
et contenus terrain, contenus pédagogiques, socle serveur et connecteur MCP, front. Puis
vérification croisée des constats les plus graves. Chaque constat porte l'un de ces trois
niveaux :

- **Rejoué** — le défaut a été provoqué : requêtes HTTP (supertest sur `server.js`) contre une
  base à part, créée pour l'audit avec le schéma et les migrations de `main`, puis supprimée ;
  ou navigateur Chromium sur le build de production. Les scripts sont jetables et ne sont pas
  versionnés ; le scénario est décrit assez précisément pour être réécrit en test.
- **Lu** — le chemin complet (route, garde, bibliothèque, SQL, ou composant et appelants) a été
  relu une seconde fois après la relecture qui l'a signalé.
- **Signalé** — relevé sur lecture du code, non revérifié. À confirmer avant de corriger.

État de la suite sur `main` au moment de l'audit :

| Vérification           | Résultat                                             |
| ---------------------- | ---------------------------------------------------- |
| `npm run lint`         | 0 erreur, 321 avertissements                         |
| `npm run test:ui`      | 800 fichiers, 6 157 tests passés                     |
| `npm run build`        | passe, aucun miroir CJS modifié                      |
| `npm test` (backend)   | 6 390 tests : 6 387 passés, **1 échec**, 2 ignorés   |
| `npm run test:content` | 147 passés                                           |
| e2e                    | non relancés (navigateurs Playwright incomplets ici) |

### 1.1 `main` est rouge depuis la PR #688 (G&L)

`tests/gl-tenir-jets-paralleles.test.js:258` (« Nommer sans objet : la page est réparée
entre-temps… ») échoue **à chaque exécution** depuis le commit `c724273` (« Relance rendue — jet
annulé réappliqué », fusionné par la PR #688). Il passe sur le parent `a46cd25`. L'assertion qui
tombe est l'invariant `LIVRE_SOLDE` (« le dernier mouvement du livre ne tombe pas sur le solde
courant » : bourse 4/4, livre 6/7).

Cause probable, non instruite plus avant : depuis `c724273`, le passage en souffle réapplique le
jet annulé d'une Relance laissée par un test précédent du même fichier, ce qui écrit un mouvement
au grand livre ; le test remet ensuite les bourses à 4/4 par `setPlayerBourses`
(`tests/helpers/glTenirFixtures.js:405`), qui écrit en base **sans passer par le grand livre**.
Il faut trancher entre un défaut de la fixture (le plus probable) et un mouvement de trop dans
`rendreRelancesNonRejoueesTx` (`lib/glTour.js`). À traiter dans les lots G&L, en priorité : la
CI ne tourne que sur les PR, donc toute PR ouverte depuis hérite de cet échec.

**Suivi** : la PR #690 (brouillon, ouverte pendant l'audit) annonce la réparation de ce test.

## 2. Synthèse

69 constats, dont 48 rejoués. Les sept premiers donnent une escalade de droits, exposent un
contenu protégé, ou font tomber le serveur. Ils sont tous rejoués.

| N°  | Constat                                                                                        | Preuve |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| S1  | Une coupure MySQL suivie d'une connexion ou déconnexion Socket.IO arrête le serveur            | Rejoué |
| A1  | L'import de comptes réécrit le mot de passe et l'e-mail d'un compte élève promu admin          | Rejoué |
| A2  | Un délégué abaisse le rang d'un profil supérieur au sien, puis l'attribue                      | Rejoué |
| T1  | Un homonyme fait monter l'autre élève de palier (donc de permissions) et lui montre ses tâches | Rejoué |
| T2  | Un élève s'inscrit sur sa propre proposition, la marque faite : acceptation contournée, badge  | Rejoué |
| C1  | Les parcours (et leurs étapes) d'un plan fermé par code se lisent sans code                    | Rejoué |
| P1  | Une question réservée (`strict`) se résout sans compte, sans verrou, par essais successifs     | Rejoué |

Viennent ensuite 24 constats importants et 38 mineurs. Les importants portent surtout sur des
données d'élèves visibles hors de leur périmètre (A4, T3, T4), des pertes de données
silencieuses (P2 à P4, C2 à C5, C7), deux contournements dans le connecteur MCP (S2, S3), et le
front qui garde l'état d'un autre compte après une déconnexion (F1, F2).

À retenir aussi : **`main` est rouge** (§ 1.1). Un test G&L échoue depuis la PR #688.

Ce qui tient : aucune route d'écriture n'est sans garde ; l'OAuth du connecteur et l'isolement
des produits (y compris en temps réel) sont corrects ; la réponse d'un QCM n'est jamais servie à
l'élève ; le recalcul des statuts de tâche et la récurrence sont protégés contre la concurrence ;
les 284 appels `api('/api/…')` du front visent tous une route existante ; et un parcours
Playwright de tous les onglets (admin sur ordinateur, élève sur mobile) ne lève aucune erreur de
page. Le détail de ce qui a été relu sans constat est en § 9.

## 3. Comptes, authentification, droits, groupes

### A1 — L'import de comptes réécrit le mot de passe d'un compte élève promu admin — Rejoué

- **Où** : `lib/students/studentImportService.js:281-293` (garde
  `existingIsProtectedTeacher`) et `:514-537` (`updateImportedAccount`) ;
  `lib/studentRouteHelpers.js:519-533`.
- **Défaut** : la protection d'un compte existant ne regarde que son **type**
  (`users.user_type`), jamais le rang de son profil. Un compte de type élève qui porte un profil
  élevé (`admin`, `prof`) se fait réécrire mot de passe et e-mail par quiconque a
  `students.import` — le profil `prof` l'a par défaut, avec la vue globale. La garde de rang
  (`checkRoleAssignmentAllowed`) ne joue que si la cellule « Rôle » est remplie, et l'e-mail
  change sans `applyEmailChangeEffects` (l'ancienne adresse n'est pas avertie). Variante de
  CDG-03 ([`AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md`](AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md)
  § 3), fermée à l'époque pour les seuls comptes de type enseignant.
- **Rejoué** : compte `student` au profil attribué `admin`. Un prof importe la ligne
  `;Prénom;Nom;PrisDeForce-2026;;;pirate@…;` → 200 `updated: 1`. `POST /api/auth/login` avec le
  nouvel e-mail et le nouveau mot de passe → 200, `roleSlug: admin`, sans étape TOTP (réglage
  `enroll` par défaut, victime non enrôlée).
- **Correction** : appliquer à toute mise à jour d'un compte existant la garde de rang de
  `checkStudentDeletionAllowed` (le plus haut des profils effectif et attribué strictement
  inférieur à celui de l'acteur), et passer le changement d'e-mail par
  `applyEmailChangeEffects`.

### A2 — Un délégué abaisse le rang d'un profil supérieur au sien, puis l'attribue — Rejoué

- **Où** : `routes/rbac.js:708-716` (`PATCH /api/rbac/profiles/:id`), `lib/rbacRouteHelpers.js`
  (`rankChangeError`).
- **Défaut** : seul le **nouveau** rang est comparé à celui de l'acteur, jamais le rang actuel du
  profil. `PUT …/permissions` refuse pourtant de toucher un profil de rang ≥ (AC4). Un délégué de
  rang 450 descend à 300 un profil de rang 480 qui porte `admin.impersonate`, puis l'attribue :
  la garde de rang de l'attribution passe. Suppose une console déléguée sur mesure (par défaut,
  seul l'admin a `admin.roles.manage`).
- **Rejoué** : attribution directe → 403 ; `PUT permissions` → 403 ; `PATCH {rank: 300}` → 200 ;
  nouvelle attribution → 200, le compte visé reçoit `admin.impersonate` et
  `audit.security.read`.
- **Correction** : hors admin, refuser le PATCH si `existing.rank >= req.auth.roleRank`.

### Autres constats — comptes et droits

| N°  | Constat                                                                                                                                                                                                                                                              | Où                                                                  | Gravité   | Preuve  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- | ------- |
| A3  | Garde AC3 (pas de changement d'e-mail sans mot de passe) contournable : un compte Google sans mot de passe en pose un sans fournir d'ancien (`POST /me/password`), puis change l'e-mail avec ce mot de passe neuf. Prise de compte durable depuis une session volée. | `routes/auth.js:990-1040`, `lib/profileUpdate.js:39-46`             | Important | Rejoué  |
| A4  | Tout élève membre d'un groupe lit la liste nominative (noms, id, profils, état) de ce groupe et de ses descendants. `docs/API.md` exige `groups.read` ; la fiche `GET /:id` ne donne, elle, que des comptages.                                                       | `routes/groups.js:316-350`, `:813-822`, `lib/groupScope.js`         | Important | Rejoué  |
| A5  | LTI : un compte de type élève au profil `prof` ou `admin` entre par un lancement « Learner » avec toutes ses permissions (la garde Instructor ne regarde que `user_type`). Reste de CDG-05.                                                                          | `routes/lti.js:133`, `lib/lti/session.js`                           | Important | Lu      |
| A6  | Un admin **désactivé** n'est ni supprimable ni rétrogradable : la garde « dernier administrateur actif » s'applique même à une cible inactive (409).                                                                                                                 | `lib/teacherDeletion.js:38-41`, `lib/rbacRoleAssignment.js:128-131` | Important | Rejoué  |
| A7  | Le réglage « connexion Google élève » coupé se contourne : `start?mode=teacher` puis rappel sans le cookie de mode → session élève (`normalizeOAuthMode(null)` vaut `student`, le chemin élève ne relit pas le réglage).                                             | `routes/auth.js:942-943`, `lib/auth/googleAuthService.js:441`       | Mineur    | Rejoué  |
| A8  | `POST /api/rbac/users/bulk-role` : une entrée sans `id` fait tomber tout le lot en 500 (paramètre `undefined` passé à mysql2).                                                                                                                                       | `routes/rbac.js:1041`                                               | Mineur    | Rejoué  |
| A9  | `reset-password` avec un mot de passe non textuel : le jeton est consommé, puis `bcrypt.hash` échoue → 500 ; un second essai valide reçoit « jeton invalide ».                                                                                                       | `routes/auth.js:1095-1104`, `:1172-1182`                            | Mineur    | Rejoué  |
| A10 | Réinitialisation par e-mail d'un mot de passe **enseignant** : `password_must_reset` n'est pas remis à 0 (la voie élève le fait) ; le compte doit changer son mot de passe une seconde fois.                                                                         | `routes/auth.js:1179-1182`                                          | Mineur    | Lu      |
| A11 | Supprimer un sous-groupe fait de ses enfants des groupes racines (`parent_group_id = NULL`), même pour un acteur sans vue globale, qui les perd ensuite de son périmètre.                                                                                            | `routes/groups.js:735`                                              | Mineur    | Lu      |
| A12 | Fusion de comptes : les profils principaux de B passent à A sans collision (deux `is_primary`), le plus élevé est servi, et aucun `recomputeUserRole` ne suit.                                                                                                       | `lib/accountMerge.js` (`applyMerge`)                                | Mineur    | Lu      |
| A13 | Écarts relevés sans rejeu : `PATCH /api/rbac/users/:type/:id` garde le rang sur le seul profil effectif et sans périmètre de groupe ; `POST /api/auth/register` avec un `firstName` non textuel → 500.                                                               | `routes/rbac.js`, `routes/auth.js:581`                              | Mineur    | Signalé |

## 4. Tâches, progression, vie sociale

### T1 — Un homonyme fait monter l'autre élève de palier et lui montre ses tâches — Rejoué

- **Où** : `lib/rbac.js:622-635` (`countValidatedAssignmentsForStudent`) et `:867-884`
  (`syncProgressionForValidatedTask`) ; `lib/stats/statsReadModel.js:64-68` et `:178-186` ;
  consommés par `routes/stats.js:89-96` et `:193-198`.
- **Défaut** : le correctif « homonymes » (`lib/tasks/assignmentIdentityMatch.js`) n'a pas été
  porté à ces quatre requêtes, qui gardent
  `ta.student_id = u.id OR (prénom = prénom AND nom = nom)`. Les tâches validées d'un homonyme
  comptent dans la progression de l'autre, qui change de palier **et donc de permissions** ;
  `GET /api/stats/me/:id` lui liste les inscriptions de l'homonyme ; la vue prof et l'export CSV
  sont faussés. Des homonymes existent : l'import Moodle et le pont G&L créent des comptes sans
  contrôle de nom. Le commentaire de `lib/rewards/creditedTasks.js` signale l'écart.
- **Rejoué** : A et B s'appellent « Lucas X », tous deux `eleve_novice`. Cinq tâches de B sont
  validées, A n'en a aucune. A passe `eleve_avance` ; `GET /api/stats/me/A` renvoie `done: 5`
  et la liste des cinq tâches de B ; même chose sur `/api/stats/all`.
- **Correction** : remplacer ces quatre conditions par `assignmentIdentityMatch('ta')`.

### T2 — S'inscrire sur une tâche « proposée » ou « faite » contourne l'acceptation — Rejoué

- **Où** : `routes/tasks/assignments.js:94-110` et `lib/tasks/assignmentSeat.js:148-150` (seuls
  `validated` et `on_hold` sont refusés) ; `routes/tasks/assignments.js:439-441` ;
  `lib/rewards/metrics.js:310-316`.
- **Défaut** : le front interdit ces inscriptions (`src/utils/taskQuickAssign.js:34,56` : « Idée
  encore en discussion », « C'est déjà plié »), l'API non. Un élève propose une tâche, s'y
  inscrit et la marque faite : elle quitte « proposée » sans qu'un adulte l'accepte, arrive dans
  la file « à valider », et il reçoit aussitôt le badge « Semeur d'idées », jamais retiré. Sur une
  tâche déjà `done` (mode `single_done`) où il reste des places, un élève qui n'a rien fait
  s'inscrit et est crédité à la validation.
- **Rejoué** : trois propositions, chaque `assign` puis `done` → 200, tâches `done` en base,
  `GET /api/rewards/me` attribue `collectif.semeur.1` et `.2`. Second scénario : A marque
  « fait », B s'inscrit ensuite (200), validation, les stats de B affichent `done: 1`.
- **Correction** : refuser `proposed` et `done` dans `claimAssignmentSeat`, sous le verrou, et ne
  pas faire avancer une tâche `proposed` au « fait ».

### Autres constats — tâches et vie sociale

| N°  | Constat                                                                                                                                                                                                                                      | Où                                                                                                | Gravité   | Preuve |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- | ------ |
| T3  | Un prof de classe (`stats.read.group`) voit dans le **détail** et le **journal** d'une tâche les inscrits et comptes rendus (noms, commentaires, photos) d'élèves hors de ses groupes ; la liste, elle, les borne.                           | `lib/tasks/assignmentVisibility.js:41-43`, `:160`, `:181`, `lib/taskAuthzHelpers.js:12-20`        | Important | Rejoué |
| T4  | Le nom de l'élève qui propose reste visible des non-camarades : en liste, `proposed_by_student_id` n'est masqué que pour l'anonyme, et la description garde « Proposition n3beur : Prénom Nom » (liste et détail). Écart avec `docs/API.md`. | `routes/tasks.js:332`, `:351`, `routes/tasks/proposals.js:128-132`                                | Important | Rejoué |
| T5  | `POST /api/tasks/:id/done` : commentaire non borné ; au-delà de 64 Ko → 500 et la tâche n'est pas marquée (une file hors ligne qui rejoue sur 5xx ne passe jamais) ; un objet est accepté et enregistré illisible.                           | `routes/tasks/assignments.js:321`, `:377-392`                                                     | Important | Rejoué |
| T6  | Réaction emoji : double appui simultané → `ER_DUP_ENTRY` → 500 (forum : 8 essais sur 20 ; commentaires de contexte : même schéma).                                                                                                           | `lib/shared/forumCore.js:459-483`, `lib/shared/contextCommentsCore.js:288-316`                    | Mineur    | Rejoué |
| T7  | Double validation simultanée : 200/200, notifications « validée », audit et évaluation en double (contrôle lu hors transaction, `UPDATE` sans condition).                                                                                    | `lib/tasks/taskActions.js:157-199`                                                                | Mineur    | Rejoué |
| T8  | `PUT /api/tasks/:id` réserve `edit_revision` avant de vérifier les droits : un appel refusé peut faire recevoir un 409 `edit_conflict` à tort à un enregistrement légitime simultané.                                                        | `routes/tasks.js:806-813`, `lib/editRevision.js:119-131`                                          | Mineur    | Lu     |
| T9  | `GET /api/context-comments/counts` ne vérifie pas que le lecteur voit le contexte (fuite de compteurs pour un repère réservé ou une carte hors périmètre).                                                                                   | `routes/context-comments.js:262-301`                                                              | Mineur    | Lu     |
| T10 | Plafonds comptés hors verrou (tâches actives d'un élève, photos d'observation, illustrations du carnet) : léger dépassement possible en envois simultanés.                                                                                   | `routes/tasks/assignments.js:136-153`, `observationService.js:564-570`, `user-journal.js:342-350` | Mineur    | Lu     |

## 5. Cartes, lieux, plantes, médias, Visite, plans

### C1 — Les parcours d'un plan fermé par code se lisent sans code — Rejoué

- **Où** : `routes/map-routes.js:272-304` (`GET /api/map-routes`).
- **Défaut** : la liste est bornée par la garde de surface et le périmètre du compte, mais ne
  croise jamais les cartes autorisées sur la surface (`allowedMapIdsForSurface`), contrairement à
  zones, catégories et `/api/maps`. Un anonyme sur la surface `visit` (ouverte) reçoit tout
  parcours publié de la carte du plan qui inclut `visit` dans ses surfaces — le défaut
  `['map','visit','plan']` de l'éditeur : titre, description, cibles et texte des étapes.
- **Rejoué** : plan en `access_mode = code`. `/api/plan/content` → 401, `/api/zones?map_id=…` →
  400 ; mais `GET /api/map-routes` anonyme → 200 avec « Tour des nouveaux personnels » et l'étape
  « Badge requis, code porte 4321 ». Même chose sur l'hôte du plan avec `?surface=visit`.
- **Correction** : intersecter avec `allowedMapIdsForSurface(surface)`, comme `listLocations`.

### Autres constats — cartes et contenus terrain

| N°  | Constat                                                                                                                                                                                                                                                                                                                       | Où                                                                                                     | Gravité   | Preuve  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | ------- |
| C2  | Médiathèque : `_keys.json` (partagé ForetMap / G&L) est indexé par une clé tirée du nom d'origine. Deux envois ForetMap « photo.jpg » : le premier perd son étiquette, passe « hérité G&L », disparaît de ForetMap et n'y est plus supprimable. Un envoi nommé comme une ressource du jeu détourne `resolveMediaByStableKey`. | `lib/mediaLibrary.js:266`, `:543`, `lib/glAssetManifest.js:28`, `:97`                                  | Important | Rejoué  |
| C3  | Le contrôle d'appartenance d'un média compare le chemin brut : `"/media-library/…"` (ou `//`, `./`) n'est trouvé dans aucune entrée et passe « hérité G&L » ; un admin G&L supprime ainsi un média ForetMap.                                                                                                                  | `lib/mediaLibrary.js:557`                                                                              | Important | Rejoué  |
| C4  | Catégorie désactivée : tout PUT de zone ou de repère, même sans `category_ids`, retire la zone de cette catégorie (filtre `is_active = 1` des catégories « assignables ») ; la réactivation ne restaure rien.                                                                                                                 | `lib/terrain/locationService.js:488`, `:774`, `lib/locationCategories.js:234`                          | Important | Rejoué  |
| C5  | Visite : remplacer l'image d'un média par un contenu invalide supprime l'ancien fichier **avant** d'écrire le nouveau → 400, et le média est cassé (404, `image_path` toujours renseigné).                                                                                                                                    | `routes/visit/media.js:190`                                                                            | Important | Rejoué  |
| C6  | Plan des personnels : « Signaler un problème » sur un lieu d'une carte sélectionnable autre que la carte par défaut → 404 « Lieu introuvable » (le signalement ne cherche que sur la carte par défaut, le front n'envoie pas la carte).                                                                                       | `routes/staff-plan.js:339`, `src/plan/planApi.js`                                                      | Important | Rejoué  |
| C7  | Téléverser une photo d'espèce n'incrémente pas `edit_revision` : un formulaire ouvert avant l'envoi passe le verrou optimiste et efface la photo, dont le fichier reste orphelin.                                                                                                                                             | `lib/biodiv/speciesService.js:291-360`                                                                 | Important | Rejoué  |
| C8  | Entrées non textuelles → 500 : `name: 123` sur une zone, `label` objet sur un repère, `x_pct: 'abc'` en PUT (après une resynchronisation partielle des catégories), `image_data: 12345` sur une photo.                                                                                                                        | `lib/terrain/locationService.js:711`, `:324`, `lib/entityPhotoRoutes.js:198-212`, `lib/uploads.js:102` | Mineur    | Rejoué  |
| C9  | Repère : coordonnées non bornées en modification (`x_pct: 250`, `y_pct: -40` enregistrés, repère hors carte) ; la création borne 0–100.                                                                                                                                                                                       | `lib/terrain/locationService.js:316-317`                                                               | Mineur    | Rejoué  |
| C10 | Erreurs sans `status` → 500 générique : import d'espèces (URL de tableur invalide, fichier vide, source absente), image de carte de plus de 8 Mo.                                                                                                                                                                             | `lib/biodiv/speciesService.js:540-570`, `lib/terrain/mapService.js:355`                                | Mineur    | Rejoué  |
| C11 | Supprimer un lieu (ou le changer de carte) laisse ses étapes de parcours ; le parcours devient impossible à enregistrer (400 « Étape N : ce lieu n'existe pas ») tant que l'étape n'est pas retirée à la main.                                                                                                                | `lib/terrain/locationService.js:819`, `routes/map-routes.js`                                           | Mineur    | Lu      |
| C12 | `?surface=staff` sur `/api/map-routes` : la garde obtient le lecteur du porteur de code, mais le filtre des étapes reçoit `req.auth` (null) et retire des étapes légitimes. Aucun front n'appelle cette porte.                                                                                                                | `routes/map-routes.js:241`, `:303`                                                                     | Mineur    | Lu      |
| C13 | Photos d'un lieu masqué ou réservé : la garde de `/photos/:pid/data` redirige vers `/uploads/zones/<id>/<n>.jpg`, chemin public par choix, aux numéros consécutifs. À arbitrer (§ 11).                                                                                                                                        | `lib/uploadsPrivatePaths.js:32`                                                                        | Mineur    | Signalé |

## 6. Contenus pédagogiques

### P1 — Une question réservée (`strict`) se résout sans compte et sans verrou — Rejoué

- **Où** : `lib/learningGatingLockMode.js:64-84` (`resolvePresentContext`) et `:173-175`
  (lecteur inconnu → `ok`) ; `lib/pedago/quizService.js:345-354`, `:405`, `:444` (verrou posé
  seulement si `auth?.userId`).
- **Défaut** : la présentation « avec contexte » (`?resourceType=&resourceRef=`) ne demande aucun
  compte. Sans compte, `assertQuestionOpen` laisse passer et aucun verrou de re-tentative n'est
  posé ; chaque présentation donne un jeton neuf. En enchaînant présentation et réponse sans
  en-tête `Authorization`, on écarte les mauvais choix un à un, puis on répond juste du premier
  coup une fois connecté — exactement ce que le mode `strict` doit empêcher.
- **Rejoué** : politique `strict`, question bloquante d'un tutoriel. Sans contexte, la
  présentation anonyme → 403. Avec contexte, sans compte : quatre couples présentation/réponse en
  200, le dernier `correct: true`, aucun `cooldown`.
- **Correction** : exiger un compte (401) dès qu'un contexte ressource est fourni, et inscrire
  l'identifiant du compte dans le jeton.

### Autres constats — contenus pédagogiques

| N°  | Constat                                                                                                                                                                                                                                                                       | Où                                                                                                    | Gravité   | Preuve  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- | ------- |
| P2  | Créer ou importer une question sur un couple (catégorie, numéro) déjà pris **écrase l'autre question**, bonne réponse comprise (`ON DUPLICATE KEY UPDATE` sur `uq_quiz_cat_num`) ; l'API répond 201 `created`, l'import compte `created: 1`, le nouveau code n'existe jamais. | `lib/shared/questionCrudCore.js:177-185`, `lib/fmQuizImport.js:365-405`, `migrations/128_quiz.sql:49` | Important | Rejoué  |
| P3  | Modifier une question efface le caractère bloquant qu'un prof avait posé sur ses liens glossaire d'origine `keyword` (suppression puis recréation non bloquante).                                                                                                             | `lib/fmQuizCrud.js:68-90`, `lib/pedago/learningLinks.js:279-299`                                      | Important | Rejoué  |
| P4  | Un import QCM **partiel** purge les liens glossaire `keyword` de **toutes** les questions (purge globale, seules les lignes du fichier sont recalculées).                                                                                                                     | `lib/fmQuizImport.js:437-457`, `lib/pedago/learningLinks.js:286-291`                                  | Important | Rejoué  |
| P5  | Séance pédagogique : un prérequis en brouillon (403 sur la dépendante, 404 sur le prérequis) ou un cycle A ↔ B (accepté à l'écriture) bloque définitivement la séance pour les élèves.                                                                                        | `routes/pedago-sessions.js:184-205`, `:465-472`                                                       | Important | Rejoué  |
| P6  | Individus et mesures : date impossible, hauteur ≥ 1000 (DECIMAL(5,2)) ou groupe inconnu → 500 ; circonférence négative acceptée ; en PUT, zone inexistante → 500 et zone d'une autre carte acceptée.                                                                          | `routes/individuals.js:55-60`, `:308-316`, `:356-382`                                                 | Mineur    | Rejoué  |
| P7  | Calendrier scolaire : une date impossible (`2031-09-31`) passe la regex → 500 ; `daysInRange` normalise et saute des jours.                                                                                                                                                   | `lib/schoolCalendar.js:54-59`                                                                         | Mineur    | Rejoué  |
| P8  | `POST /api/clades/activity/check` (public) : `{ placements: [null] }` → TypeError → 500.                                                                                                                                                                                      | `routes/clades.js:180`, `:191`                                                                        | Mineur    | Rejoué  |
| P9  | Supprimer un couplet d'une clé d'identification **publiée** laisse des propositions sans issue (`ON DELETE SET NULL`, `validateKeyGraph` ne tourne qu'à la publication).                                                                                                      | `routes/id-keys.js:302-325`, `migrations/275_id_keys.sql:43`                                          | Mineur    | Lu      |
| P10 | Verrou de re-tentative écrit avec `NOW()` de la base, relu comme UTC (`timezone: 'Z'`) : décalé du fuseau si la base de prod n'est pas en UTC. Déjà relevé ([`AUDIT_ETAT_DES_LIEUX_2026-09-25.md`](AUDIT_ETAT_DES_LIEUX_2026-09-25.md) § 1.3.8), toujours présent.            | `lib/learningGatingCooldown.js`, `database.js:181`                                                    | Mineur    | Signalé |

## 7. Socle serveur, base, connecteur MCP

### S1 — Un rejet non géré dans la présence temps réel arrête le serveur — Rejoué

- **Où** : `lib/realtime.js:143` (`void getSettingValue(...).then(...)` sans `.catch`),
  `lib/realtime.js:163` (`await isModuleEnabled(...)` non protégé dans `registerPresenceSocket`,
  lancé en `void` l. 474) ; `server.js:872-876` (`unhandledRejection` → `process.exit(1)`).
- **Défaut** : `getSettingValue` relance l'erreur SQL dès que le cache des réglages est périmé
  (15 s, ou après toute écriture). Une connexion ou déconnexion de socket pendant que MySQL est
  injoignable, que le pool est saturé (« Queue limit reached ») ou qu'une connexion tombe
  produit un rejet non géré : **tout le serveur s'arrête**. L'appel voisin de la l. 683, lui, a
  son `.catch`.
- **Rejoué** : client socket.io connecté, pool fermé, cache périmé ; à la déconnexion du client,
  `UNHANDLED: Error: Pool is closed … settingsStore.js:118`, sortie du process en code 1.
- **Correction** : `.catch` sur le `getSettingValue(...).then` de `schedulePresenceEmit`, et
  try/catch autour de `registerPresenceSocket`.

### Autres constats — socle et MCP

| N°  | Constat                                                                                                                                                                                                                                                                                                                                          | Où                                                                                  | Gravité   | Preuve |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- | ------ |
| S2  | MCP : un nom de CTE déclaré dans une **sous-requête** masque la vraie table dans toute la requête (`… WHERE EXISTS (WITH users AS (SELECT 1 AS x) SELECT x FROM users)`) → `foretmap_sql_select` / `foretmap_export` lisent des tables refusées (`users.description`, forum, notifications…). Sans `DB_MCP_USER`, pas de seconde barrière MySQL. | `lib/mcp/sqlAst.js:263-268`, `:318-319`, `lib/mcp/tools/data.js:280`                | Important | Rejoué |
| S3  | MCP : `POST /MCP` (casse différente) échappe à la garde d'hôte et à `MCP_ENABLED=false` (regex sensible à la casse, routage Express non) : un jeton déjà émis reste utilisable après coupure, et sur l'hôte `gl.*`.                                                                                                                              | `lib/mcp/index.js:103-110`, `:157`, `lib/mcp/server.js:118`                         | Important | Rejoué |
| S4  | Le middleware CSP attend une lecture SQL (cache périmé) avant `next()`, monté avant les statiques et `/api/health` : base qui ne répond plus → **toutes** les réponses bloquées, y compris les sondes « sans BDD ».                                                                                                                              | `server.js:337-352`                                                                 | Important | Rejoué |
| S5  | MCP : le bypass RGPD suit le réglage global, pas la permission `mcp.privacy_bypass` de l'appelant (seuls les outils de domaine la vérifient). Sans effet avec les profils par défaut ; important si un profil sur mesure reçoit `mcp.sql` sans `mcp.privacy_bypass`.                                                                             | `lib/mcp/server.js`, `lib/mcp/tools/usage.js:32`, `sqlSelect.js:100`, `data.js:260` | Mineur    | Rejoué |
| S6  | Le fallback SPA répond `200 text/html` pour un fichier absent sous `/uploads`, `/assets`, `/tutos`, `/fonts`, `/gl/intro` : le service worker met le HTML en cache comme image, et un chunk disparu après déploiement donne une erreur MIME au lieu d'un 404.                                                                                    | `lib/spaFallback.js:97-104`                                                         | Mineur    | Rejoué |
| S7  | L'en-tête `X-Foretmap-Product` est encore honoré en production pour le HTML, le manifest, `/sw.js` et le favicon ; le manifest est servi `public, max-age=86400` sans `Vary` (empoisonnement possible d'un cache partagé).                                                                                                                       | `lib/productResolver.js:26-31`, `lib/pwaRoutes.js`, `lib/spaFallback.js`            | Mineur    | Rejoué |
| S8  | Chaque `db:migrate` recrée la catégorie de lieu « Infrastructure » si un prof l'a supprimée (`INSERT IGNORE` du schéma rejoué, sans la garde « table vide » des tutoriels).                                                                                                                                                                      | `sql/schema_foretmap.sql:1124`, `database.js:815-818`                               | Mineur    | Rejoué |
| S9  | MCP : l'empreinte de confirmation ignore le contenu des objets imbriqués (`JSON.stringify` avec liste de clés appliquée à tous les niveaux) : un code confirmé pour un `data` vaut pour un autre. Ne concerne que `mcp.confirm_mode=all_writes`.                                                                                                 | `lib/mcp/confirm.js:57-63`                                                          | Mineur    | Rejoué |
| S10 | Le journal fatal `unhandledRejection` perd la cause (`{ reason }` au lieu de `{ err }` : Pino journalise `{}`).                                                                                                                                                                                                                                  | `server.js:874`                                                                     | Mineur    | Rejoué |
| S11 | MCP : `foretmap_sql_execute` laisse `innodb_lock_wait_timeout = 5` sur une connexion rendue au pool ; les transactions suivantes sur cette connexion attendent 5 s au lieu de 50.                                                                                                                                                                | `lib/mcp/sqlWrite/execute.js:56-60`                                                 | Mineur    | Lu     |
| S12 | `FORETMAP_TX_MAX_MS` (désactivé par défaut) : après abandon, la connexion est rendue au pool pendant que le travail continue ; son `commit()` peut toucher une connexion réattribuée.                                                                                                                                                            | `database.js:551-561`, `:569-578`                                                   | Mineur    | Lu     |
| S13 | Une migration de numéro inférieur à `schema_version` est ignorée sans bruit ; `db:status` répond « à jour ». Déjà relevé (25/09), toujours présent.                                                                                                                                                                                              | `database.js:964-976`, `lib/migrationStatus.js:53`                                  | Mineur    | Rejoué |

## 8. Front ForetMap

Aucun constat gênant. Le code central (`api()`, `fetchJsonWithRetry`, `useAppDataSync`, temps
réel, forum, commentaires) est solidement défendu. Les défauts sont aux marges : ce qui se passe
entre deux onglets, après une déconnexion, ou quand une requête échoue.

### F1 — Un changement de compte dans un onglet n'est pas répercuté dans les autres — Rejoué

- **Où** : `src/services/api.js:256` (`getAuthToken` relit `localStorage` à chaque appel) et
  `:110` (`dispatchSessionChanged`, propre à la fenêtre) ; `src/hooks/useSessionWindowSync.js:47-91`
  (aucun écouteur `storage`) ; `src/services/api.js:526` (la fermeture de session sur 401 exige
  un jeton présent).
- **Défaut** : le jeton est relu dans le stockage partagé à chaque requête, mais l'état React
  (nom, droits, onglets) reste celui du premier compte. Déconnexion puis connexion d'un autre
  compte dans l'onglet A : l'onglet B affiche l'ancien compte et envoie le jeton du nouveau, qui
  signe donc ses écritures. Après une simple déconnexion en A, B part sans jeton et ses 401 ne
  le déconnectent jamais. Cas réel : tablettes partagées, arrivée par Moodle (nouvel onglet).
- **Rejoué** (Playwright, deux onglets) : admin connecté dans A et B ; déconnexion puis connexion
  élève en A. B affiche toujours « admin.test » et les onglets d'administration, avec le jeton
  de l'élève.
- **Correction** : écouter `storage` sur la clé `foretmap_session` et appeler `forceLogout` (ou
  recharger la session) si le compte change ou disparaît.

### F2 — Une réponse `/api/auth/me` tardive annule la déconnexion d'un prof — Rejoué

- **Où** : `src/hooks/useAppDataSync.js:334-346` (garde `sid` pour l'élève seulement) ;
  `src/hooks/useAuthMeHydration.js:28` ; `src/hooks/useAuthSession.js:227-290`
  (`mergeAuthMeResponse` repose droits et compte, et réécrit le jeton si `refreshedToken`).
- **Défaut** : une déconnexion pendant qu'un `/api/auth/me` est en vol est défaite à son
  arrivée : le shell prof réapparaît sans session stockée (actions en 401 sans déconnexion), et
  la session est même réécrite si la réponse porte un jeton renouvelé. Une réponse tardive peut
  aussi poser les droits prof sur la session d'un élève qui vient de se connecter.
- **Rejoué** (Playwright) : `/api/auth/me` retardé de 3 s, cycle complet déclenché, clic sur
  « Déconnexion » → écran de connexion ; trois secondes plus tard, en-tête « admin.test » et
  onglets prof de retour, stockage vide.
- **Correction** : dans `mergeAuthMeResponse`, ignorer la réponse si le jeton courant est vide
  ou ne désigne plus le même compte qu'au départ de la requête.

### Autres constats — front

| N°  | Constat                                                                                                                                                                                                                                                                                                                                          | Où                                                                                                                                                | Gravité   | Preuve |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| F3  | Le service worker appelle `skipWaiting()` dès l'installation, puis purge l'ancien cache : un onglet ouvert sur l'ancien build perd ses bundles chargés à la demande (rechargement forcé et saisie perdue en ligne ; onglet qui ne s'ouvre plus hors ligne). Le bandeau « une mise à jour est prête » ne trouve jamais de `registration.waiting`. | `src/shared/pwa/swTemplate.js:468`, `:473-478`, `public/sw.js:132`, `src/shared/pwa/registerServiceWorker.js:97-122`                              | Important | Lu     |
| F4  | Déplacer un repère : le `PUT` de fin de glisser n'a pas de `.catch`. Un refus ou une coupure réseau ne donne aucun message, et le repère reste affiché à sa nouvelle place (style posé dans le DOM). « Enregistrer le contour » d'une zone : même absence de gestion d'erreur, sans indicateur d'envoi.                                          | `src/hooks/useMapGestures.js:220-224`, `src/hooks/useZoneEditPoints.js:419-426`                                                                   | Important | Lu     |
| F5  | `useDebouncedAutoSave` déclenche sa sauvegarde « de démontage » dès que `enabled` passe à faux : effacer le titre d'une tâche ou d'un tutoriel en édition envoie aussitôt un `PUT` au titre vide ; une fresque en conflit renvoie la même écriture.                                                                                              | `src/shared/hooks/useDebouncedAutoSave.js:218-240`                                                                                                | Mineur    | Rejoué |
| F6  | Boutons « Modèle CSV / XLSX » des panneaux d'import : même clé React `[object Object]` (`key={b.key ?? b.label}` avec un libellé JSX). Avertissement console, risque de bouton omis ou doublé.                                                                                                                                                   | `src/shared/components/ImportPanel.jsx:141`                                                                                                       | Mineur    | Rejoué |
| F7  | Catalogue QCM : chargement relancé à chaque frappe sans garde « dernière réponse gagne » ; la liste peut ne plus correspondre au texte saisi. Motif déjà relevé ([`AUDIT_CODE_2026-09-13.md`](AUDIT_CODE_2026-09-13.md) § 2.5), toujours présent ici.                                                                                            | `src/shared/qcm/QcmCatalogPanel.jsx:117-150`                                                                                                      | Mineur    | Lu     |
| F8  | Individus suivis : deux clics rapides peuvent afficher la fiche du premier individu alors que la mesure saisie part sur le second.                                                                                                                                                                                                               | `src/components/pedago/IndividualsView.jsx:95-106`, `:140-150`                                                                                    | Mineur    | Lu     |
| F9  | Dates calculées en UTC au lieu de l'heure locale : filtre de période du carnet (`new Date('AAAA-MM-JJ')`), date de mesure par défaut (`toISOString().slice(0,10)`), plages par défaut de l'audit, de l'usage et du suivi. À UTC+1, un article écrit entre 0 h et 1 h sort de la période.                                                         | `src/shared/journal/JournalBookView.jsx:115-142`, `IndividualsView.jsx:77`, `audit-views.jsx:56`, `UsagePanel.jsx:35`, `UserTrackingPanel.jsx:30` | Mineur    | Lu     |
| F10 | Visite : la garde « carte demandée = carte affichée » n'est vérifiée qu'avant la lecture de la progression ; un changement de carte pendant cette lecture applique l'ancienne carte, et le `finally` périmé baisse `loading` trop tôt.                                                                                                           | `src/hooks/useVisitContent.js:94-119`                                                                                                             | Mineur    | Lu     |

## 9. Relu sans constat, et non relu

**Relu sans constat** :

- **Comptes** : `middleware/requireTeacher.js` (hydratation, époque de jeton, 401 `deleted`,
  liste blanche `password_must_reset`, prise de contrôle, MFA par requête) ; `lib/auth/**`
  (session glissante, marqueur MFA reconduit, TOTP et anti-rejeu) ; `routes/authTotp.js` ;
  connexion, `/me`, mot de passe oublié, prise de contrôle, export, déconnexion ;
  `lib/rbac.js` (lectures), `lib/rankGuard.js`, `lib/effectiveRole.js`, `lib/groupScope.js`,
  `lib/groupImport.js` ; suppression d'élèves ; LTI hors A5 ; `lib/accessGate.js`.
- **Tâches** : création, mise à jour, archivage, suppression, `assign-group` (sous verrou),
  `unassign`, journaux, réordonnancement, duplication, récurrence (marqueur sous `FOR UPDATE`),
  recalcul des statuts (compare-and-set), achèvement des projets, archivage automatique,
  rappels d'échéance ; récompenses ; notifications (bornées au propriétaire) ; forum et
  commentaires (périmètre, modération) ; observations ; carnet ; usage et suivi.
- **Terrain** : cartes et calage GPS ; détail d'un lieu (audience, surface, périmètre) ;
  `lib/mapAccess.js`, `lib/surfaceAccess.js`, `lib/locationAudience.js` ; plans (cache par carte
  légitime) ; Visite (`/content`, `/progress`, `/seen`, synchronisation) ; confinement des
  téléversements à `uploads/` et signature d'image ; packs mascotte (noms assainis).
- **Pédagogie** : quiz (réponse jamais servie à l'élève, jeton HMAC à usage unique, tirage sans
  questions `strict`) ; moteur de verrouillage (modes, tolérance, accusés) ; curriculum ;
  glossaire, tutoriels, documents de référence ; fresques (verrou optimiste) ; réseau trophique.
- **Socle** : OAuth MCP (`redirect_uri` exact, PKCE S256, code à usage unique, rotation et
  réutilisation des refresh, audience, révocation) ; isolement des jetons et des produits (y
  compris Socket.IO) ; écritures MCP plan → apply ; `readDb` en lecture seule ; démarrage avec
  reprise, tâches quotidiennes, arrêt gracieux ; `admin-ops` (secret comparé en temps constant).

**Non relu, ou survolé** — à couvrir par une seconde passe si l'on veut un audit exhaustif :
`routes/admin/moodle.js` et `lib/moodle/**` (hors fusion) ; `lib/lti/launch.js`, `oidc.js`,
`bindings.js` (signature, `nonce`) ; `lib/accounts/personalDataExport.js` et les nettoyeurs ;
`lib/tasks/taskImport.js` ; `lib/recurringTasks.js` (calculs de dates) ;
`lib/rewards/core/engine.js` ; `lib/placeMessages.js` ; `lib/remoteMedia.js` (garde-fous SSRF
du relais d'images) ; `lib/speciesAutofill*.js` ; `lib/contentLibrary*.js` ;
`routes/visit/mascot.js` au-delà de la l. 1238 ; `lib/learningGatingProgress.js`,
`learningLinksBulk.js` ; `lib/fresqueDecks.js` ; `lib/idKeyBundle.js` ; `lib/mcp/health/**`,
`audits/**`, `domains/**` ; `lib/rateLimit.js` ; le SQL de chaque migration.

## 10. Lots de correction (lancés le 19 novembre 2026)

Le lot 0 (remettre `main` au vert) est fait : la PR #690 est fusionnée. Les onze lots suivants
tournent **en parallèle**, une session chacun. Ils sont découpés **par fichiers** pour ne pas se
marcher dessus : chaque lot possède ses fichiers, et seuls `CHANGELOG.md`, `docs/API.md` et
`docs/reference/**` sont partagés, en ajout seulement. Chaque lot porte ses tests, écrits à
partir des scénarios de rejeu, et ouvre sa propre PR. Ce document et l'index des audits ne
sont mis à jour que par la session d'audit.

| Lot | Contenu                                                            | Constats                                             |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | Socle serveur : présence temps réel, CSP, SPA, produit, migrations | S1, S4, S6, S7, S8, S10, S12, S13                    |
| 2   | Connecteur MCP                                                     | S2, S3, S5, S9, S11                                  |
| 3   | Authentification, mots de passe, LTI                               | A3, A5, A7, A9, A10, A13 (inscription)               |
| 4   | Profils RBAC, groupes, import et fusion de comptes                 | A1, A2, A4, A6, A8, A11, A12, A13 (RBAC), retrait    |
| 5   | Tâches, progression, stats                                         | T1, T2, T3, T4, T5, T7, T8, T10 (tâches), CR         |
| 6   | Forum, commentaires de contexte, observations, carnet              | T6, T9, T10 (photos)                                 |
| 7   | Terrain : lieux, catégories, parcours, plans, gestes de carte      | C1, C4, C6, C8 (lieux), C9, C10 (carte), C11–C13, F4 |
| 8   | Médiathèque, médias de Visite, fiches espèces                      | C2, C3, C5, C7, C8 (uploads), C10 (espèces)          |
| 9   | Quiz, liens d'apprentissage, verrouillage                          | P1, P2, P3, P4, P10, F7                              |
| 10  | Séances, individus, calendrier, clades, clés d'identification      | P5, P6, P7, P8, P9, F8, F9 (individus)               |
| 11  | Front : session multi-onglets, PWA, sauvegarde automatique, dates  | F1, F2, F3, F5, F6, F9, F10                          |

« Retrait » : garde de rang au retrait d'un membre de groupe. « CR » : comptes rendus en mode
`group`. Voir § 11.

## 11. Décisions (tranchées le 19 novembre 2026)

- [x] **P1 — Quiz avec contexte sans compte** : un compte est exigé (401 dès qu'un contexte
      ressource est fourni sans compte) ; le jeton porte l'identifiant du compte.
- [x] **A3 — Première pose d'un mot de passe** en libre-service : rien n'est changé directement,
      un lien de définition est envoyé à l'adresse en place.
- [x] **A4 — Liste des membres d'un groupe** : intacte avec `groups.read` / `groups.manage` ; un
      simple membre ne voit que les **prénoms** des membres de **son propre groupe** (ni nom,
      ni id, ni profil, rien des sous-groupes).
- [x] **C13 — Photos d'un lieu masqué ou réservé** : exposition actuelle conservée (photos de
      lieux publiques par choix), à documenter dans `docs/API.md`.
- [x] **S6 — Fichiers absents** : 404 franc pour un chemin avec extension sous `/assets`,
      `/uploads`, `/tutos`, `/fonts`, `/gl/intro` ; l'index reste servi aux routes SPA.
- [x] **Groupes** : on ne retire d'un groupe qu'un compte de rang strictement inférieur au sien
      (l'admin garde tout).
- [x] **Comptes rendus de tâche** en mode `group` : un compte rendu sans élève rattaché (écrit
      par l'encadrement) est visible de tous ceux qui voient la tâche, comme en mode
      `assignees`.
