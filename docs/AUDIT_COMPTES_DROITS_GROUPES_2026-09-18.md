# Audit — comptes, droits et groupes (ForetMap × GL × Moodle/LTI), 18 septembre 2026

> **Instantané au 18 septembre 2026** (`v1.168.2`, branche `main` à `2fd4ee2`). Périmètre :
> tout ce qui touche aux **personnes** — connexion et sessions, inscription, comptes
> (création, import, fiche, suppression), profils RBAC et permissions, groupes (rôle par
> défaut, profil imposé, périmètre, code de classe), pont d'identité Gnomes & Licornes,
> synchronisation Moodle et entrée LTI, et l'interface « Profils & utilisateurs ».
>
> Aucun changement de comportement n'accompagne cet audit : c'est un constat, pas un lot
> correctif. Chaque point porte un identifiant stable (`CDG-xx`), une gravité, les
> fichiers et lignes concernés, le scénario qui le déclenche, et une piste. Les pistes de
> la section 9 sont des propositions à arbitrer.
>
> Méthode : lecture intégrale du socle (`lib/rbac.js`, `middleware/requireTeacher.js`,
> `routes/rbac.js`, `routes/groups.js`, `routes/students.js`, `routes/auth.js`,
> `lib/group*.js`, `lib/mapAccess.js`, `lib/identity.js`) et relectures ciblées de
> `routes/gl/auth.js` + `lib/gl*.js`, `lib/moodle/*`, `lib/lti/*`, `lib/studentRouteHelpers.js`,
> `lib/groupImport.js`, et du front (`src/App.jsx`, `src/hooks/useAuthSession.js`,
> `src/services/api.js`, `src/components/profiles*`, `src/components/groups-views.jsx`),
> confrontées au document de référence
> [`docs/reference/foretmap/comptes-roles-et-groupes.md`](reference/foretmap/comptes-roles-et-groupes.md).
> Tout constat a été vérifié dans le code avant d'être écrit ; rien n'a été exécuté contre
> une base de production. Les audits antérieurs
> [`AUDIT_ROLE_PROFESSEUR_2026-09.md`](AUDIT_ROLE_PROFESSEUR_2026-09.md) (rôle n3boss),
> [`AUDIT_COMPTES_2026-09.md`](AUDIT_COMPTES_2026-09.md) (identités unifiées) et
> [`AUDIT_UX_GESTION_UTILISATEURS_2026-09.md`](AUDIT_UX_GESTION_UTILISATEURS_2026-09.md)
> (UX de l'onglet) restent valables ; celui-ci ne reprend pas leurs constats déjà traités.

Gravité : **BLOQUANT** (escalade de droits ou perte de données réalisable par un utilisateur
ordinaire) · **MAJEUR** (contournement d'une règle documentée, fonction promise absente,
bug reproductible en usage courant) · **MINEUR** (gêne, incohérence sans conséquence
d'accès) · **INFO** (nettoyage, dette).

Confiance : **H** (code lu, scénario reconstitué pas à pas) · **M** (dépend d'un réglage,
d'un état de base ou d'un usage) · **B** (probable, non rejoué).

---

## 1. Résumé exécutif

Le modèle d'autorisation est **sain dans ses fondations** : un seul RBAC pour les deux
produits, permissions relues en base à chaque requête (cache versionné), révocation de
session immédiate (compte désactivé, mot de passe changé), isolement `product` effectif,
mots de passe bcrypt, SQL paramétré partout, jeton de réinitialisation à usage unique.
L'essentiel des gardes anti-escalade existe (`prof` → `admin`, dernier administrateur,
« on n'accorde pas une permission qu'on ne détient pas », profils sûrs pour les groupes).

Ce qui craint tient à **des gardes écrites une fois puis contournées par une autre voie**,
et à un **front qui ne suit pas le modèle de droits du serveur**. Sept points à traiter en
priorité :

1. **N'importe quel enseignant peut devenir administrateur** en changeant son propre e-mail
   pour un alias codé en dur, effectif au redémarrage suivant (CDG-01).
2. **L'import de comptes est une voie sans périmètre ni garde de rôle** : mot de passe,
   e-mail, profil de tout élève ou enseignant non admin de l'établissement, par simple
   homonymie (CDG-02, CDG-03).
3. **Un MJ Gnomes & Licornes peut prendre le mot de passe ForetMap d'un vrai compte élève**
   rapproché à son joueur (CDG-04).
4. **L'entrée LTI ouvre une session enseignant ou admin sur la seule foi d'un e-mail**
   déclaré par la plateforme, sans contrôle du rôle LTI (CDG-05).
5. **Le prof de classe ne peut rien faire** : l'onglet « Classe » promis par la doc
   n'affiche ni liste d'élèves, ni rattachement, ni code de classe — le sous-onglet
   Groupes est réservé aux permissions d'administration des profils (CDG-20).
6. **Deux mécaniques Moodle désactivent des classes entières** : cocher « hors
   synchronisation » sur un groupe, ou synchroniser une seule cohorte quand des élèves
   ont changé de cohorte (CDG-21, CDG-22).
7. **Aucun moyen de désactiver un compte ni de supprimer un enseignant** hors Moodle,
   alors que la doc et plusieurs gardes supposent l'existence de comptes inactifs (CDG-40).

Un fil rouge traverse le tout : la **« vue globale » est déduite d'une permission de
statistiques** (`stats.read.all`), la matrice de rôles est **dupliquée en cinq listes
divergentes** (staff, réservés, non-n3beur, verrouillés, sûrs), et **quatre voies écrivent
un rôle** (attribution, import, création, groupes) avec quatre jeux de règles.

---

## 2. Ce qui est bien (vérifié, sans constat)

- `hydrateAuthFromTokenClaims` relit `is_active` et `token_epoch` à chaque requête ; toute
  écriture réelle d'un nouveau mot de passe incrémente l'époque (`routes/rbac.js:1093`,
  `routes/students.js:418`, `routes/auth.js:1166/1239`, `routes/gl/auth.js:591/1292`,
  `lib/glPlayerIdentity.js:131`).
- Isolement produit : `verifyJwtForProduct` sur `/api/gl/*` (`middleware/requireGlAuth.js:65`),
  garde `/api` de `server.js:488-509`, Socket.IO et `/api/sync-state` cohérents.
- Attribution de rôle : garde unique `checkRoleAssignmentAllowed` partagée par l'unitaire et
  le lot (`lib/rbacRoleAssignment.js`) ; seul un admin touche un admin ; dernier admin protégé.
- Profil par défaut d'un groupe borné aux profils « sûrs » (`lib/groupDefaultRole.js`), et le
  profil imposé ne rétrograde jamais un encadrant (`custom_role_preserved`).
- `password_hash` jamais renvoyé (liste blanche `lib/publicUser.js`) ; jeton de reset
  aléatoire, haché, à usage unique atomique ; `state` OAuth aléatoire, cookie HttpOnly.
- Semis RBAC durable (`rbac_seeded_permissions`) : une révocation admin survit au redémarrage.
- Les tests de gel des matrices (`tests/foretmap-permissions-catalog-alignment.test.js`,
  `tests/gl-permissions-catalog-alignment.test.js`) empêchent une dérive silencieuse du
  catalogue.

---

## 3. Failles et escalades de droits

### CDG-01 — BLOQUANT · Tout enseignant devient admin en changeant son e-mail (H)

- `lib/rbac.js:314-316` : `ADMIN_CANONICAL_LOGIN` vaut `'oliviera9'` par défaut ;
  `ensureDefaultAssignments` (`:861-886`), rejoué **à chaque démarrage** via
  `ensureRbacBootstrap`, pose le rôle `admin` en primaire sur **tout** compte enseignant dont
  la partie locale de l'e-mail vaut cet alias (`canonicalFromEmail`, `lib/identity.js:9-13`).
- `PATCH /api/auth/me/profile` (`routes/auth.js:358-400`) laisse **tout** compte, enseignant
  compris, changer son e-mail avec son seul mot de passe courant (unicité seulement).
- **Scénario** : un prof de classe met son e-mail à `oliviera9@exemple.org` (unique, donc
  accepté) ; au prochain déploiement il est administrateur. Variante : un n3boss crée un
  enseignant (`users.create`, `rbac.js:104-127`) ou importe une ligne `prof` avec cet
  e-mail (aucune contrainte de domaine à l'import, cf. doc « ne sont pas limitées aux
  domaines »).
- La doc affirme « aucune adresse personnelle n'est inscrite d'avance … le code étant
  hébergé sur un dépôt » : c'est faux pour l'alias.
- **Piste** : retirer la valeur par défaut (alias vide = aucun repli), ne promouvoir qu'à la
  **création** du compte seed (`lib/teacherAdminSeed.js`) et jamais en bootstrap ;
  interdire à un enseignant de changer lui-même son e-mail, ou exiger une confirmation
  admin. Ajouter un test « e-mail canonique posé par un non-admin ≠ promotion ».

### CDG-02 — BLOQUANT · Import de comptes : prise de contrôle de tout élève par homonymie (H)

- `routes/students.js:255-262` : la ligne d'import est rapprochée du compte existant par
  **type + prénom + nom sur toute la base**, sans `canAccessStudentId` ni périmètre de
  groupe ; `:386-422` réécrit e-mail, pseudo, description, affiliation, **mot de passe**
  (avec bump d'époque) et **profil** (`setPrimaryRole` sans `checkRoleAssignmentAllowed`).
- Le n3boss a la vue globale par défaut, mais la doc ouvre `students.import` au prof de
  classe (« un admin peut l'ouvrir ») : il reprend alors le compte d'un élève d'une autre
  classe (mot de passe connu de lui), lui donne `eleve_chevronne`, et rien ne le borne.
- Aucun test n'importe avec un acteur sans vue globale.
- **Piste** : passer chaque mise à jour par `canAccessStudentId` (hors vue globale) et par
  `checkRoleAssignmentAllowed` ; refuser de changer le mot de passe d'un compte existant
  hors périmètre ; journaliser les comptes touchés (aujourd'hui seuls des totaux,
  `:516-526`).

### CDG-03 — BLOQUANT · Import : un n3boss réinitialise le mot de passe d'un pair (H)

- `canActorMutateImportedAdmin` (`lib/studentRouteHelpers.js:478-485`) ne protège que
  l'admin. Une ligne `prof;Nadia;Pilote;NouveauMDP12!` change le mot de passe d'un autre
  n3boss ou prof de classe (`routes/students.js:409-419`) et peut le rétrograder en
  `prof_classe`. Silencieux (pas d'identité dans l'audit).
- La création unitaire ne contrôle l'homonymie **que pour les élèves** (`rbac.js:166-173`) :
  deux enseignants homonymes existent, l'import met à jour l'un des deux au hasard (Map
  écrasée, `students.js:162-167`).
- **Piste** : interdire à l'import toute modification de mot de passe/profil d'un compte
  **enseignant** existant sauf par un admin ; refuser l'homonymie enseignant à l'import.

### CDG-04 — BLOQUANT · Un MJ G&L obtient le mot de passe ForetMap d'un vrai compte élève (H)

- `POST /api/gl/admin/players` (`routes/gl/admin.js:452`) : `ensureEmailAvailable`
  (`:171-186`) accepte l'e-mail d'un élève ForetMap ; `upsertForetmapUserForGlPlayer`
  (`lib/glGroupBridge.js:191-205`, `findStudentUser:80`) **rapproche ce vrai compte** (ou
  par pseudo + prénom + nom).
- `POST /players/:id/reset-password` (`admin.js:707-727`, permission `gl.players.manage`
  seulement) → `setGlPlayerPassword` (`lib/glPlayerIdentity.js:119-134`) écrit
  `users.password_hash` **sans distinguer compte miroir et vrai compte**, ni périmètre.
- Même effet via `PUT /players/:id` + `email` (`forceEmail:true`, `:602`) puis « mot de
  passe oublié ».
- **Piste** : refuser le reset MJ quand `users.auth_provider ≠ 'gl_bridge'` (rediriger vers
  « mot de passe oublié »), ou l'exiger sous `students.manage`-équivalent avec périmètre ;
  test « reset-password sur joueur lié à un vrai compte → 403 ».

### CDG-05 — BLOQUANT · LTI : session enseignant/admin sur la seule foi d'un e-mail (H code, M exploitabilité)

- `lib/lti/identity.js:14-33` `findUserByEmail` cherche dans **tous** les types de comptes ;
  `resolveLtiUser:41-70` n'applique ni filtre de domaine (`integration.moodle.email_domains`)
  ni contrôle du **rôle LTI** (Learner / Instructor) ; `lib/lti/session.js:51-78` bâtit un
  jeton enseignant complet. Un lancement _Learner_ dont le claim `email` égale l'adresse
  d'un admin ForetMap ouvre une session admin. L'exploitabilité dépend de la politique
  d'e-mail de Moodle (modifiable par l'utilisateur avec confirmation, selon réglage).
- Repli `moodle_id` (`identity.js:61-68`) sans filtre d'issuer : Moodle de test et de prod
  partagent les identifiants numériques.
- `buildGlStaffSession` (`lib/lti/session.js:115-130`) n'exige pas `teacher.access`.
- **Piste** : n'ouvrir une session enseignant que si le rôle LTI est _Instructor_ **et**
  l'e-mail est du domaine autorisé ; sinon session élève ou refus ; filtrer par `issuer`.

### CDG-06 — MAJEUR · Un gestionnaire de profils non admin s'attribue le profil n3boss (H)

- `checkRoleAssignmentAllowed` (`lib/rbacRoleAssignment.js:559-578`) ne garde que `admin`.
  Un profil sur mesure doté d'`admin.users.assign_roles` peut s'attribuer `prof` (ou
  `gl_admin`, `prof_classe`) — donc `students.delete`, `tasks.validate`, `audit.read`…
  La doc promet « ne peut pas s'attribuer des pouvoirs qu'il ne détient pas », règle
  appliquée aux **permissions** (`rbac.js:736-746`) mais pas aux **rôles**.
- Rien n'interdit non plus de poser un rôle d'enseignant (`prof`) sur un compte `student`,
  un rôle `gl_*` sur un compte ForetMap, ou de se retirer soi-même son profil.
- **Piste** : refuser l'attribution d'un rôle de rang ≥ au sien (hors admin), d'un rôle
  `gl_*` hors console GL, et d'un rôle d'enseignant à un `user_type = 'student'` ; refuser
  l'auto-attribution.

### CDG-07 — MAJEUR · `admin.users.assign_roles` vaut prise de contrôle (H)

- `PATCH /api/rbac/users/:type/:id` (`routes/rbac.js:942-1094`) — même permission que
  l'attribution de profil — réécrit e-mail **et mot de passe** de tout compte non admin
  (n3boss compris). Le libellé du catalogue (« Attribution des profils ») ne le dit pas.
- **Piste** : permission dédiée (`users.manage` / `users.password.reset`) ou, à défaut,
  refuser le mot de passe d'un compte de rang ≥ au sien ; renommer le libellé.

### CDG-08 — MAJEUR · Impersonation : cible non bornée, acteur non revérifié, trace perdue (H)

- `POST /api/auth/admin/impersonate` (`routes/auth.js:1266-1305`) : seule interdiction = soi-même.
  Tout porteur d'`admin.impersonate` (permission accordable à un profil sur mesure) prend la
  main sur un **administrateur** : la permission équivaut alors à `admin`.
- `middleware/requireTeacher.js:63-68` : l'acteur n'est revérifié que sur
  `admin.impersonate`, pas sur `is_active` ni `token_epoch` (GL fait mieux,
  `lib/auth/glHydration.js:121-133`).
- Pendant la session « voir comme », **toutes les actions sont journalisées au nom de la
  victime** : `resolveActorFromReq` (`lib/identity.js:27-33`) lit `req.auth.userId`,
  consommé par `lib/auditLog.js:63-68`. Seuls début et fin sont tracés. Le doc dit
  « l'action est tracée ».
- `GET /me` chemin « resynchronisation de groupe » (`routes/auth.js:275-284`) ré-émet un
  jeton **sans** `impersonating/actor*` (reconnu en commentaire) et **écrase** celui du
  chemin précédent : l'admin se retrouve avec un jeton élève ordinaire, `/impersonate/stop`
  répond 400 (`:1355-1357`).
- **Piste** : interdire une cible de rang ≥ à celui de l'acteur (admin → admin réservé au
  seed) ; relire `is_active`/époque de l'acteur ; faire porter `impersonatedBy` par
  `auditLog` ; propager les claims d'impersonation sur les deux chemins de ré-émission.

### CDG-09 — MAJEUR · Ligne de progression : un profil d'encadrement peut entrer dans l'échelle n3beur (H code, M usage)

- `lib/rbac.js:350-387` : `STAFF_ROLE_SLUGS` = `admin, prof, visiteur, personnel` — **sans**
  `prof_classe`. `isStudentProgressionTierSlug('prof_classe', 350)` → vrai (rang < 400).
  `PATCH /api/rbac/profiles/:id` accepte `min_done_tasks` sur n'importe quel profil
  (`routes/rbac.js:641-643`, seuls forum/commentaires/plafond sont gardés). Dès qu'un admin
  pose un seuil sur « Prof de classe » (ou sur un profil maison de rang < 400 portant
  `groups.manage`), `getStudentProgressionRoles` l'inclut et la validation d'une tâche
  promeut l'élève **prof de classe** (`teacher.access`, `groups.manage`).
- Le front (`src/utils/profilesRbacHelpers.js:13-23`, `isN3beurTierConfigurableProfile`)
  exclut `prof_classe` ; le serveur non — l'API reste ouverte.
- **Piste** : une seule source « profils de l'échelle » = `eleve_*` **ou** profil sans
  permission d'encadrement (réutiliser `GROUP_DEFAULT_SAFE_PERMISSION_KEYS`) ; refuser
  `min_done_tasks` ailleurs côté serveur.

### CDG-10 — MAJEUR · La « vue globale » est déduite d'une permission de statistiques (H)

- `lib/groupScope.js:46-50` : `canBypassGroupScope` = rôle `admin` **ou** `stats.read.all`.
  Ce bypass gouverne la gestion de **tous** les groupes (`isGroupInManageScope`), la
  visibilité des rattachements, la création de groupes racine, l'import de groupes, la
  création d'élèves hors périmètre. Donner « lecture stats globales » à un prof de classe
  lui ouvre donc la gestion de toutes les classes.
- **Piste** : permission dédiée (`groups.scope.all` ou `users.scope.all`), `stats.read.all`
  ne gouvernant que les lectures de statistiques.

### CDG-11 — MAJEUR · Suppression et duplication d'élèves sans périmètre (H)

- `DELETE /api/students/:id` (`routes/students.js:821-825`, `students.delete`) et
  `POST /api/students/:id/duplicate` (`:560-568`, `users.create`) n'appliquent aucun
  `canAccessStudentId`. Un prof de classe à qui l'on ouvre ces droits (la doc le prévoit
  pour `users.create`) supprime ou duplique n'importe quel élève de l'établissement. La
  duplication n'exige pas non plus de `group_id` hors vue globale, contrairement à la
  création (`rbac.js:228-234`).
- **Piste** : même garde que la création unitaire.

### CDG-12 — MAJEUR · Staff G&L sans compte enseignant ForetMap via Google (H)

- `routes/gl/auth.js:315-323` et `:662-670` : sans `users` de type `teacher` pour l'e-mail,
  `resolveGlStaffLogin({teacherId:null})` (`lib/glStaffAuth.js:285-305`) accepte toute ligne
  `gl_admins` active → session MJ/Admin sans compte ForetMap, sans `teacher.access`, sans
  époque ni `is_active` à l'hydratation (`glHydration.js:81-100`, `LEFT JOIN`). Contredit
  `docs/reference/gl/roles-et-connexion.md` et la voie mot de passe (`auth.js:139-186`).
- Révocation non répercutée : retirer `teacher.access` ou désactiver l'enseignant ne coupe
  pas une session MJ en cours ni une prise de contrôle en cours (`glHydration.js:121-133`
  ne relit que `gl_admins`).
- **Piste** : exiger le `users` enseignant sur la voie Google comme sur la voie mot de
  passe ; relire RBAC ForetMap + `is_active` à l'hydratation GL staff.

### CDG-13 — MAJEUR · Connexion : énumération de comptes et throttle contourné (H)

- `routes/auth.js:634-678` : « Ce compte n'a pas de mot de passe » et « Compte inactif »
  sont renvoyés **avant** `bcrypt.compare` et **sans** `loginThrottle.recordFailure`
  (contrairement à `:620-633` et `:680-702`). Un identifiant existant et son état se
  devinent sans jamais déclencher le verrou.
- Le throttle est **par identifiant saisi** (`lib/loginThrottle.js:30-35`) alors qu'un
  compte répond à quatre identifiants (pseudo, e-mail, pseudo G&L, alias canonique) :
  quatre budgets d'échecs, contrairement au doc (« bloquent ce compte »).
- `lib/identity.js:82-88` : l'alias canonique résout **n'importe quel** enseignant admin
  (`LIMIT 1` sans `ORDER BY`) si `TEACHER_ADMIN_EMAIL` est absent.
- **Piste** : un seul message d'échec, `recordFailure` sur toutes les branches, clé de
  throttle = identifiant **résolu** (`users.id`) quand le compte existe.

### CDG-14 — MINEUR · Réglage « connexion Google enseignant » contournable (H)

- `routes/auth.js:772-778` vérifie `allow_google_teacher` dans `/google/start` selon
  `mode` ; `/google/callback` (`:866-877`) ne relit que `enabled` puis cherche un enseignant
  **quel que soit le mode** (`:959-962`). `allow_google_teacher=false` +
  `/google/start?mode=student` → session enseignant. Pas de test.

### CDG-15 — MINEUR · E-mail non vérifié comme clé de liaison Google (M)

- Un élève pose l'adresse `prenom.nom@lycee` d'un futur prof (`PATCH /me/profile`) ; à sa
  première connexion Google ce prof atterrit dans le compte élève (`/google/callback:1027-1030`)
  et la création de son compte enseignant échoue en 409.

### CDG-16 — MINEUR · Affiliation : la « restriction individuelle » est levée par l'élève lui-même (H)

- Le doc présente l'affiliation comme une **restriction de cartes** cumulée au périmètre de
  groupe (`lib/mapAccess.js:113-132`). Or l'élève la modifie librement dans son profil
  (`routes/students.js:696-760`, `routes/auth.js:404-410`, `lib/profileUpdate.js:32`) et la
  choisit à l'inscription. Ce n'est donc pas une restriction mais une préférence.
- **Piste** : trancher — soit retirer l'affiliation du profil élève, soit la documenter
  comme un choix de l'élève.

### CDG-17 — MINEUR · Divers (H)

- MJ (et non seulement admin) supprime des lignes `users` via
  `POST /players/reconcile { deleteOrphanBridgeAccounts }` (`routes/gl/admin.js:924`),
  borné aux miroirs orphelins.
- `POST /api/gl/admin/classes` transmet `defaultRoleId` sans `validateDefaultRoleId`
  (`glGroupBridge.js:52-54`) : un groupe ForetMap peut être créé avec `default_role_id = admin`
  en base (neutralisé à la résolution, mais visible et trompeur).
- Identifiant saisi persisté en clair dans `security_events` (`routes/auth.js:613, 626`) :
  un mot de passe tapé dans le champ identifiant devient lisible par `audit.read`.
- Nonce LTI en mémoire de processus (`lib/lti/oidc.js:82-94`) : rejouable sur une autre
  instance Passenger pendant 10 min.

---

## 4. Bugs

### CDG-20 — MAJEUR · Le prof de classe n'a pas d'onglet « Classe » fonctionnel (H)

- Profil livré : `teacher.access, groups.read, groups.manage, stats.read.group,
observations.read.group, staff_plan.access` (`lib/rbac.js:275-282`).
- L'onglet est affiché (`src/App.jsx:628-636`, libellé « Classe » `:1724`) mais
  `ProfilesAdminView` ne charge la liste des comptes que sous `admin.roles.manage ||
admin.users.assign_roles` (`src/components/profiles-views.jsx:91-99`), le sous-onglet
  Groupes n'est autorisé que sous `canManageProfiles`
  (`src/utils/profilesUserListFilters.js:283-286`) et `GroupsAdminView` est monté sous la
  même condition (`profiles-views.jsx:887`).
- **Résultat** : ni liste d'élèves, ni rattachement, ni code de classe, ni comptes en
  attente — alors que le **serveur accepte** tous ces appels avec `groups.manage`. La doc
  (§ « Deux métiers », point 3 ; § « Fiche d'un compte ») décrit un onglet qui n'existe pas.
  Aucun test (UI ou e2e) ne monte ce profil.
- **Piste** : dériver l'accès aux sous-onglets des permissions **serveur** (`groups.read`,
  `groups.manage`) ; charger `/api/groups` sans `/api/rbac/users` pour ce profil ; test de
  montage de `ProfilesAdminView` avec le profil `prof_classe`.

### CDG-21 — MAJEUR · Moodle : « hors synchronisation » sur un groupe désactive ses comptes (H)

- `lib/moodle/plan.js:95-96` ajoute la cohorte à `inScopeExternalGroupIds` **avant** le test
  `group_sync_exempt` (`:110-117`, `continue` avant la boucle membres). La boucle de
  désactivation (`:568-598`) voit alors `wasInScope = true`, `seenInScope = false` →
  `user.deactivate` pour **tout compte actif créé par la sync** dont c'est la seule cohorte.
- `tests/moodle-sync-apply.test.js:284` ne le détecte pas (les comptes `created` de la
  cohorte y sont déjà inactifs).
- **Piste** : n'ajouter la cohorte au périmètre qu'après le test d'exemption ; test dédié.

### CDG-22 — MAJEUR · Moodle : synchroniser une seule cohorte désactive les élèves passés ailleurs, sans retour (H)

- `plan.js:577-583` : `stillKnownElsewhere` ne regarde que les `external_groups` déjà
  synchronisés. Scénario documenté (« Appliquer sur une seule cohorte ») : un élève créé
  l'an passé, passé de 26#603 à 26#604 jamais synchronisée → `gone` → désactivé. À la sync
  suivante de 604, `plan.js:308-314` n'émet qu'une info et `apply.js:398-410` ne réactive
  jamais. Le doc promet « seul un vrai départ de la cohorte le fait ».

### CDG-23 — MAJEUR · Import de comptes : une cellule vide **rétrograde** ou **écrase** (H)

- Rôle vide → `eleve_novice` (`lib/studentRouteHelpers.js:416-418`) puis `setPrimaryRole`
  inconditionnel à la mise à jour (`routes/students.js:420-422`) : un réimport du fichier de
  rentrée sans colonne Rôle remet un chevronné en novice et un « Personnel » en n3beur.
  Contredit « une cellule vide laisse la valeur actuelle ».
- Affiliation vide → `'both'` (`lib/studentAffiliation.js:15`) → écrase une affiliation
  bornée (`students.js:404-407`, `payload.affiliation != null` toujours vrai).
- Fusion de doublons : ligne 1 `eleve_avance` + ligne 2 Rôle vide → rôle final
  `eleve_novice` (`studentRouteHelpers.js:589-590`), l'inverse de « dernière ligne
  renseignée ».
- **Piste** : distinguer « absent » et « vide » pour le rôle et l'affiliation comme pour le
  mot de passe (`hasImportScalarValue`).

### CDG-24 — MAJEUR · Import : « Classe > Sous-groupe » rattache au mauvais atelier (H)

- `lib/groupImport.js:258-273` : l'enfant est cherché **globalement** par slug/nom sans
  tenir compte du parent. « 6ème A > Atelier sciences » puis « 6ème B > Atelier sciences »
  rattache la seconde classe à l'atelier de 6A.

### CDG-25 — MAJEUR · Import de groupes : mise à jour destructive, cycles non contrôlés (H)

- `groupImport.js:553-578` + `updateGroupRecord:437-448` : Parent vide → `parent_group_id
= NULL` (un réimport sans colonne Parent détache tous les sous-groupes) ; Type vide →
  `class` ; « Accorde n3beur » vide → `0`. Aucun contrôle d'auto-parent ni de cycle
  (contrairement à `routes/groups.js:489-514`). Groupe inactif mis à jour sans réactivation
  mais mémorisé actif dans l'index (`:455`).

### CDG-26 — MAJEUR · Compte supprimé pendant la session : 403 au lieu de 401 `deleted:true` (H)

- `middleware/requireTeacher.js:71-83` : ligne `users` absente → on continue,
  `buildAuthzPayload` → `null` (rôles cascadés) → 403 « Aucun profil attribué ». Le front ne
  déconnecte que sur 401 (`src/services/api.js:281-295`). Seules trois routes renvoient le
  401 attendu (`routes/students.js:551`, `routes/observations.js:51/127/226`).
- **Piste** : dans l'hydratation, `account == null` → `AuthRevokedError('account_deleted')`
  → 401 `{ deleted: true }`.

### CDG-27 — MAJEUR · Front : session élève expirée ou révoquée, l'appli reste ouverte (H)

- Sur 401 / `SESSION_REVOKED`, `api()` efface le stockage et émet `foretmap_teacher_expired`
  (`src/services/api.js:281-296`), mais `useSessionWindowSync` ne remet pas `student` à
  `null` (`src/hooks/useSessionWindowSync.js:33-38`) et la porte d'entrée est `student ||
isTeacherAccount` (`src/App.jsx:431, 1148`). Toast « Session n3boss expirée. » pour un
  élève, polling en échec silencieux. Contredit « un mot de passe changé déconnecte toutes
  les sessions ». Aucun test.

### CDG-28 — MAJEUR · Front : le jeton glissant est écrasé par le jeton d'origine (M)

- `mergeAuthMeResponse` stocke `refreshedToken` dans `foretmap_session.token`
  (`src/hooks/useAuthSession.js:227-235`) mais `student.authToken` garde le jeton initial
  (`src/services/api.js:17-35, 197-210`) ; `updateStudentSession` fait primer
  `merged.authToken` (`useAuthSession.js:85-99`), appelé au montage et après « Mon profil ».
  Scénario : élève actif > 1 h 30, recharge → `register` réussit avec le jeton neuf, puis le
  jeton expiré est réécrit → 401 → session effacée. Le jeton est stocké en **quatre**
  exemplaires (`foretmap_session.token`, `foretmap_auth_token`, `foretmap_teacher_token`,
  `foretmap_student.authToken`). À confirmer en conditions réelles.

### CDG-29 — MINEUR · Front : session mixte élève + prof (M)

- `PinModal` et le retour OAuth prof enregistrent la session enseignant sans effacer
  `foretmap_student` (`src/components/auth/PinModal.jsx:55-66`,
  `src/hooks/useOauthRedirectSession.js:66-76`, `App.jsx:1312-1317`). Au rechargement,
  `POST /api/students/register` avec le jeton prof → 403 → toast « Connexion instable » à
  chaque chargement.

### CDG-30 — MINEUR · Front : nom affiché des enseignants remplacé par le nom du profil (M)

- `mergeAuthMeResponse` pose `displayName: auth.roleDisplayName` (`useAuthSession.js:227-235`)
  → badge d'en-tête « n3boss » / « Admin » au lieu du nom ; même confusion dans le bandeau
  d'impersonation (`RolePreviewBanners.jsx:37`). Le test `useAuthSession.test.jsx:144-172`
  fige ce comportement.

### CDG-31 — MINEUR · Confirmations de profil sensible : libellé faux, confirmation inutile (H)

- Lot : `requestBulkRole` force `reason: 'grant'` même pour une rétrogradation
  (`ProfilesAccountsPanel.jsx:272-289`) → « Attribuer un profil sensible ? … passeront au
  profil n3beur novice ». Unitaire : « Aucun profil » sur un admin ouvre la confirmation puis
  échoue (« Retirer un profil n'est pas possible depuis la liste », `profiles-views.jsx:599`).

### CDG-32 — MINEUR · Chargement tout-ou-rien avec droits partiels (H)

- `Promise.all(/api/rbac/profiles, /api/rbac/users)` (`profiles-views.jsx:95-99`) alors que
  le serveur exige une permission différente pour chacune (`rbac.js:270, 767`) et que
  `canManageProfiles` = l'une **ou** l'autre → erreur globale, aucune liste. Même schéma
  dans `GroupsAdminView` (`groups-views.jsx:643-651`).

### CDG-33 — MINEUR · Rattachement/détachement G&L casse la session courante (H)

- `POST/DELETE /api/gl/auth/link-foretmap` (`routes/gl/auth.js:1313-1470`) ne renvoient pas
  de nouveau jeton ; le JWT porte l'époque de l'ancien compte, comparée à celle du
  **nouveau** (`glHydration.js:57-64`) → 401 à la requête suivante dès que les époques
  diffèrent (ex. après un reset MJ).
- Prise de contrôle impossible à quitter si le joueur est en `password_must_reset`
  (`middleware/requireGlAuth.js:39-42, 116-121` bloque `/admin/impersonate/stop`).

### CDG-34 — MINEUR · Divers (H)

- `/admin/impersonate` sur un compte désactivé → 500 (`routes/auth.js:1319-1326`,
  `AuthRevokedError` attrapée comme panne).
- Mot de passe non-chaîne (`{"password":123}`) → 500 à `/register` et `/login`
  (`routes/auth.js:517-521, 680`).
- Seed admin : `seedTeacherChecked = true` posé **avant** l'appel (`routes/auth.js:178-186`) ;
  une panne BDD au premier login rend le seed inopérant jusqu'au redémarrage.
- Undo Moodle : `group.ensure` supprime la ligne `external_groups` même quand le groupe n'est
  que désactivé (`lib/moodle/undo.js:258-278`) → la sync suivante crée un **second groupe**
  pour la même cohorte ; classe G&L désactivée mais retrouvée (`localState.js:414-418` sans
  filtre `is_active`).
- `PUT /api/gl/admin/players/:id` : conflit d'e-mail silencieux (`emailConflict` ignoré,
  `routes/gl/admin.js:579-602`).
- `POST /api/gl/admin/classes` : `SELECT … ORDER BY id DESC LIMIT 1` au lieu de
  `result.insertId` (`admin.js:226`) — course entre deux créations.
- Création joueur non atomique → miroirs `users` orphelins si `INSERT gl_players` échoue
  (`lib/gl/importPlayers.js:166-222`, `admin.js:494-517`).
- Import : rattachement par `ON DUPLICATE KEY UPDATE role_in_group = VALUES(...)`
  (`groupImport.js:308-313`) rétrograde un responsable en membre ; `glGroupBridge.js:314-318`
  idem à chaque sync.
- `parseGroupRefsCell` découpe aussi sur `/` (`groupImport.js:99`) : « 6A/6B » devient un
  chemin parent/enfant.
- `GET /api/groups/:id/members` : la première garde (`:610-612`) est morte, la seconde
  (`:613-615`) la recouvre.

---

## 5. Incohérences (code ↔ doc, code ↔ code)

### CDG-40 — MAJEUR · Aucune désactivation de compte ni suppression d'enseignant hors Moodle (H)

- `users.is_active` n'est écrit que par `lib/moodle/apply.js:402`, `lib/moodle/undo.js` et le
  seed. `PATCH /api/rbac/users` n'accepte pas `is_active` ; aucune route ne supprime un
  compte `teacher`. Pourtant : la doc dit « Désactiver un élève le coupe aussi du jeu » ;
  `countPrimaryAdmins` parle de « dernier administrateur **actif** » en comptant les
  inactifs (`lib/rbacRoleAssignment.js:538-546`) ; la fiche affiche « compte actif ou
  désactivé ». Le seul moyen de neutraliser un enseignant est de lui retirer son profil —
  et `ensureDefaultAssignments` lui **redonne `prof` au redémarrage** (`lib/rbac.js:861-879`),
  comme le login (`routes/auth.js:721-722, 969`).
- **Piste** : action « Désactiver / réactiver » (admin) sur la fiche, suppression d'un
  enseignant (avec transfert ou anonymisation de ses contenus), compter les admins
  **actifs**, ne plus poser de rôle par défaut sur un enseignant sans rôle.

### CDG-41 — MAJEUR · Plancher 12 caractères enseignant non tenu sur quatre voies (H)

- `routes/gl/auth.js:583-592` (`/reset-password` avec un jeton `user_type='teacher'`,
  **le même jeton que ForetMap**) et `:1254` (`/staff/change-password`) : 8.
- Seed `TEACHER_ADMIN_*` validé à 4 (`routes/auth.js:183`, `lib/teacherAdminSeed.js:29-37`).
- `students.import.allow_weak_passwords` ramène le plancher prof/admin à 1
  (`lib/studentRouteHelpers.js:657-669`). Doc : « ne descend jamais en dessous quel que soit
  le réglage ».

### CDG-42 — MAJEUR · Pas de changement de mot de passe authentifié dans ForetMap (H)

- `PATCH /me/profile` ne touche pas `password_hash` ; seuls le lien e-mail et un admin le
  changent. Un élève **sans e-mail** ne peut jamais changer son mot de passe ; un compte
  Google **sans mot de passe** ne peut ni éditer son profil (`currentPassword` requis,
  `routes/auth.js:404-409`) ni en obtenir un (`/forgot-password` exige `password_hash`,
  `:1124`). Doc : « changé … par l'utilisateur ».
- `password_must_reset` n'est appliqué que par GL ; un mot de passe provisoire reste
  utilisable indéfiniment sur ForetMap (`routes/auth.js:1163` ne fait que le remettre à 0).

### CDG-43 — MAJEUR · Quatre voies écrivent un rôle, quatre jeux de règles (H)

| Voie                          | Garde admin | Garde rang / auto-attribution | Périmètre | Ordre rôle explicite ↔ rôle de groupe                    |
| ----------------------------- | ----------- | ----------------------------- | --------- | -------------------------------------------------------- |
| `PUT /rbac/users/:t/:id/role` | oui         | non (CDG-06)                  | non       | —                                                        |
| `POST /rbac/users` (unitaire) | par slug    | non                           | oui       | rôle demandé **réappliqué après** rattachement (`:251`)  |
| `POST /students/import`       | par slug    | non                           | non       | rôle inséré **puis** rattachement → rôle de groupe gagne |
| Groupes (`addStudentToGroup`) | —           | profils sûrs                  | oui       | —                                                        |

- Conséquence : fichier « visiteur » + classe n3beur → n3beur ; création unitaire d'un
  élève dans un groupe **imposant** → le rôle demandé écrase l'imposition jusqu'au prochain
  `/me`. Le rapport d'import affiche le rôle du fichier, pas le rôle final.
- **Piste** : une seule fonction `assignRoleForAccount({actor, target, role, viaImport})` qui
  porte toutes les gardes, appelée par les quatre voies ; décider une fois l'ordre
  explicite/groupe.

### CDG-44 — MINEUR · Cinq listes de « profils système » divergentes (H)

| Liste                                                                                        | Fichier                           | Contenu                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `STAFF_ROLE_SLUGS`                                                                           | `lib/rbac.js:350`                 | admin, prof, visiteur, personnel                  |
| `isStaffRoleSlug`                                                                            | `lib/rbacRouteHelpers.js:365-370` | idem (copie)                                      |
| `NON_N3BEUR_SYSTEM_ROLE_SLUGS`                                                               | `lib/shared/n3beurRolesCore.js`   | + `prof_classe`                                   |
| `RESERVED_ROLE_SLUGS`                                                                        | `lib/rbacRouteHelpers.js:270-279` | 8 slugs, **sans** `gl_*`                          |
| `TEACHER_ACCESS_LOCKED_ROLE_SLUGS`                                                           | `lib/rbacRouteHelpers.js:306`     | admin, prof, prof_classe                          |
| `isAllowedGroupDefaultRole`                                                                  | `lib/groupDefaultRole.js:35-45`   | exclut admin, prof, `gl_*` par slug + permissions |
| front : `appAccess.js:20-23`, `profilesUserGroups.js:83`, `groupDefaultRoleOptions.js:34-45` | `src/utils/`                      | miroirs partiels                                  |

- `prof_classe` est « staff » pour certaines règles et « palier configurable » pour
  d'autres (CDG-09) ; la convention « préfixe `gl_` = rôle du jeu » n'est écrite nulle part
  et s'applique à un profil maison nommé `gl_quelquechose`.
- **Piste** : un module `lib/shared/roleTaxonomy.js` (source unique, synchronisé front par
  `sync:shared-cores`) exposant `isStaff`, `isLadder`, `isGlRole`, `isReserved`.

### CDG-45 — MINEUR · Rang des profils système modifiable sans garde (H)

- `PATCH /api/rbac/profiles/:id` accepte `rank` sur tout profil, y compris `admin` et
  `prof_classe`. Le rang pilote `computeNativePrivilegedRole` (barre haute n3boss dès 400 +
  `teacher.access`), l'échelle (CDG-09), les profils sûrs (< 400), l'ordre des groupes
  imposants. Monter `prof_classe` à 400 lui donne l'interface n3boss ; descendre `admin`
  n'a pas d'effet (slug), ce qui rend le rang peu lisible. Un non-admin doté
  d'`admin.roles.manage` peut renommer et reclasser le profil admin (seule la route
  `permissions` est gardée, `rbac.js:721-725`).

### CDG-46 — MINEUR · Rôle par défaut recréé à la connexion et au démarrage (H)

- Enseignant sans rôle primaire : `prof` (rôle **fort**) au login (`routes/auth.js:721-722,
969`) et au bootstrap (`lib/rbac.js:861-879`) ; élève sans rôle : `eleve_novice` au login
  mais `visiteur` à l'inscription et à la création Google. Voir CDG-40.

### CDG-47 — MINEUR · Doc ↔ code, divers (H)

- « Un compte visiteur peut être créé à la place » en mode enseignant Google : faux, le
  code ne crée jamais d'élève en `mode=teacher` (`routes/auth.js:1009-1025`, test
  `auth.test.js:464`).
- « Session close au bout de 12 heures » : `roleChanged || permissionsChanged` ré-émettent
  sans consulter `slidingMaxSeconds` (`routes/auth.js:252`) ; la durée effective maximale est
  `sliding_max + ttl_base`.
- Élève inactif : jeton émis via Google (`routes/auth.js:1027-1067`, pas de contrôle
  `is_active`) puis 401 immédiat ; « mot de passe oublié » accepté pour un élève inactif
  (`:1120-1124`) mais refusé pour un prof (`:1193-1197`).
- Moodle : rapprochement par nom sans notion de « même classe » ni contrôle d'e-mail
  divergent (`lib/moodle/matching.js:240-254`) ; `integration.moodle.enabled` vérifié
  seulement à l'apply (`syncRun.js:190`), pas pour conflits, undo, rapprochements manuels,
  miroirs ; « Créer un compte » depuis un rapprochement est immédiat et hors journal
  (`pendingMatches.js:303-317`) ; undo ignore `sync_exempt` ; miroirs d'équipes non
  journalisés donc non annulables ; politique acceptant `prof_classe` comme rôle par défaut
  puis écarté en silence (`policies.js:370-376`).
- Import CSV : clé d'identité sensible aux accents (`students.js:164`) alors que Moodle les
  retire (`matching.js:22-29`) — « Léa Martin » importée deux fois.
- Création d'enseignant réservée **par slug** `admin`/`prof`
  (`lib/studentRouteHelpers.js:462-472`, même règle côté front) : un profil dérivé de n3boss
  avec `users.create` ne peut pas créer d'enseignant, contrairement à ce que la doc laisse
  entendre (« profil dérivé »).
- G&L : longueur minimale joueur « relevable par un réglage » codée à 4 dans trois routes
  (`routes/gl/admin.js:471, 713`, `importPlayers.js:103`) ; `gl_admins.is_active=0` annulé au
  login d'un admin ForetMap non lié (`lib/glStaffAuth.js:47-131`) ; rapprochement d'un élève
  existant force `password_must_reset=1` (`admin.js:519-523`) alors que la doc dit « garde
  son mot de passe ».
- Front : `PinModal` refuse un enseignant sans `teacher.access` (`PinModal.jsx:49-54`) alors
  que l'écran unique l'accepte (conforme doc) ; libellés bruts `(student)/(teacher)`,
  « manager » dans `GroupMembersEditor` (`groups-views.jsx:392, 408`) ; « (n3beur) / (n3boss) »
  d'après `userType` dans le bandeau d'impersonation.
- **Marque en dur** (régression au sens de `CLAUDE.md`) : `lib/mailer.js:48, 69, 89, 112`
  (« ForetMap », `no-reply@foretmap.local`), `src/components/app/AppHeader.jsx:86`,
  `src/components/auth-views.jsx:67, 71, 300, 373`, `src/utils/appShellHelpers.js:19-45`,
  `src/components/profiles/CreateUserPanel.jsx:131`, `src/components/groups-views.jsx:179`.

---

## 6. Manques

### CDG-50 — MAJEUR · Tests absents sur les gardes de droits (H)

Aucun test ne couvre : import de comptes par un acteur **sans vue globale** (CDG-02) ;
import mettant à jour un enseignant existant (CDG-03) ; attribution d'un rôle de rang ≥ au
sien par un non-admin (CDG-06) ; impersonation d'un admin, d'un inactif, par un non-admin
(CDG-08) ; reset MJ sur un joueur lié à un vrai compte (CDG-04) ; LTI _Learner_ avec e-mail
enseignant, issuer croisé (CDG-05) ; staff GL Google sans compte enseignant (CDG-12) ;
`allow_google_teacher=false` (CDG-14) ; montage de `ProfilesAdminView` / `GroupsAdminView`
avec le profil `prof_classe` (CDG-20) ; groupe exempt Moodle avec comptes actifs, cohorte
hors périmètre (CDG-21/22) ; import avec Rôle / Affiliation vides (CDG-23) ; `POST
/api/groups/import` (parent, homonyme, cycle) ; chemin `foretmap_teacher_expired` et jeton
rafraîchi côté front (CDG-27/28) ; `min_done_tasks` sur `prof_classe` (CDG-09). Les e2e
comptes / groupes / impersonation ne tournent qu'en **admin**.

### CDG-51 — MINEUR · Transactions et verrous (H)

- Import CSV non transactionnel : rôles insérés **après** la boucle (`students.js:480-492`) ;
  une erreur en cours laisse des comptes sans profil (« Aucun profil attribué » au login).
  Le dry-run ne simule pas les groupes (`:375-377`).
- Undo Moodle sans verrou (`undo.js:417-480` n'appelle pas `acquireLock`).
- `PUT /api/groups/:id/members` ne resynchronise que les **nouveaux** membres
  (`routes/groups.js:748-758`) ; les retirés d'un groupe imposant gardent le profil imposé
  jusqu'à leur prochain `/me` (sans rétrogradation ensuite, par construction).

### CDG-52 — MINEUR · Sécurité, divers (H)

- Jetons de reset non invalidés par un changement de mot de passe (`lib/passwordReset.js:114-146`).
- `/forgot-password` : limite IP seulement, pas par adresse cible (60 e-mails / 15 min).
- `?resetToken=` laissé dans l'URL après usage (`src/components/auth-views.jsx:81-95`).
- 401 `deleted:true` traité seulement par `fetchAll` / temps réel ; les appels directs
  affichent « Compte supprimé » sans déconnexion.
- `GET /api/rbac/users` ne renvoie pas `is_active` (seule la fiche l'a) : la liste ne
  distingue pas un compte désactivé par Moodle.

### CDG-53 — MINEUR · Fonctions promises par la doc, absentes (H)

- Prof de classe rattaché à ses groupes : aucune UI côté création d'enseignant
  (`POST /rbac/users` ignore `group_id` pour un `teacher`) ; le rattachement passe par
  l'éditeur de membres du groupe, où un enseignant est un « membre » comme un autre (le
  périmètre ne dépend d'ailleurs pas de `role_in_group`, `lib/groupScope.js:97-108`).
- Suppression d'un profil RBAC : aucune route `DELETE /api/rbac/profiles/:id` (un profil
  sur mesure créé par erreur reste à vie).
- Réglage LTI `unknown_user = queue` enregistrable (`lib/lti/settingsRegistry.js:108`) mais
  jamais lu.

---

## 7. Simplifications et dette

### CDG-60 — INFO · Duplications mesurées (H)

- Gardes anti-escalade réécrites à l'import (`canActorImportRoleSlug`,
  `canActorMutateImportedAdmin`, comptage dernier admin `students.js:290-306`) au lieu de
  `checkRoleAssignmentAllowed` / `countPrimaryAdmins` — origine de CDG-02/03.
- Trois inserts `group_members` aux sémantiques différentes (`groupImport.js:308-313`
  écrase le rôle, `groupMembers.js:25-29` préserve, `moodle/apply.js:223-232` SELECT puis
  INSERT).
- `mergeDuplicate*ImportItems` et `pickLastNonEmpty*` en double (`studentRouteHelpers.js`,
  `groupImport.js`) ; `resolveImportRowsFromBody` ≡ `importRows.resolveImportRows`.
- OAuth Google : `routes/auth.js:123-174` réimplémente `lib/googleOAuthShared.js:20-64` ;
  `lib/authRouteHelpers.js:273-285` duplique `encodeOAuthPayload` /
  `buildOAuthFrontendRedirect` avec une signature divergente.
- Triple `jwt.verify` par requête (`lib/rateLimit.js:82-110`, `server.js:488-512`,
  `routes/auth.js:232, 1293, 1358`) alors que `req.verifiedForetJwt` existe.
- Suppression de joueur G&L dupliquée (`routes/gl/admin.js:646-690` ≡
  `lib/studentDeletion.js:57-84`) ; `ensureEmailAvailable` ≡ `loadBlockedEmails`.
- `parseJson` ×3 et quatre slugifieurs côté Moodle ; `normalizeImportUserType` /
  `ALLOWED_IMPORT_USER_TYPES` `@deprecated` mais exportés.
- Front : trois définitions de « qui voit Profils & utilisateurs » (`App.jsx:628-636`,
  `TeacherTopTabs.jsx:203-211`, `profilesRbacHelpers.js:48-73`) ; `hasPermissionInRole` alias
  strict de `hasPermission` ; `profilesRolePrompts.js` (146 l.) mort ; quatre appelants de
  `/api/auth/me` ; rattachement des comptes en attente en boucle séquentielle alors que
  `POST /:id/members/bulk` existe ; deux listes paginées quasi identiques partageant la même
  clé `localStorage`.
- Paramètres hérités inertes : `signAuthToken(_legacyElevated)`, `requirePermission(_options)`,
  `elevatedPermissions: []`.
- Requête morte `lib/identity.js:19-23` (seconde recherche impossible si la première échoue).

### CDG-61 — INFO · Pistes de simplification structurelle

1. **Une taxonomie de rôles** (CDG-44) partagée front/back.
2. **Une fonction d'attribution de rôle** (CDG-43) et **une fonction de rattachement**
   (`addStudentToGroup`) appelées par toutes les voies, import compris.
3. **Une permission de vue globale** distincte des stats (CDG-10).
4. **Un état de compte** (`actif / désactivé / supprimé`) avec ses actions admin et ses
   effets (sessions, GL, groupes) écrits une fois (CDG-40).
5. **Le front lit les mêmes permissions que le serveur** pour ouvrir un écran ; les
   capacités UI (`deriveProfilesCapabilities`) dérivées d'une table permission → écran,
   testée contre `ROLE_PERMISSION_MATRIX` comme le sont déjà les catalogues.

---

## 8. Tableau de synthèse

| ID     | Gravité  | Sujet                                                  | Fichiers principaux                                      |
| ------ | -------- | ------------------------------------------------------ | -------------------------------------------------------- |
| CDG-01 | BLOQUANT | Alias admin codé en dur + e-mail auto-modifiable       | `lib/rbac.js`, `lib/identity.js`, `routes/auth.js`       |
| CDG-02 | BLOQUANT | Import : mise à jour d'élèves sans périmètre ni garde  | `routes/students.js`                                     |
| CDG-03 | BLOQUANT | Import : mot de passe / profil d'un enseignant pair    | `routes/students.js`, `lib/studentRouteHelpers.js`       |
| CDG-04 | BLOQUANT | Reset MJ sur un vrai compte élève                      | `routes/gl/admin.js`, `lib/glPlayerIdentity.js`          |
| CDG-05 | BLOQUANT | LTI : session enseignant par e-mail, sans rôle         | `lib/lti/identity.js`, `lib/lti/session.js`              |
| CDG-06 | MAJEUR   | Auto-attribution d'un rôle supérieur (hors admin)      | `lib/rbacRoleAssignment.js`                              |
| CDG-07 | MAJEUR   | `assign_roles` = mot de passe et e-mail de tout compte | `routes/rbac.js`                                         |
| CDG-08 | MAJEUR   | Impersonation : cible, acteur, trace, jeton perdu      | `routes/auth.js`, `lib/identity.js`, `middleware/`       |
| CDG-09 | MAJEUR   | `prof_classe` peut entrer dans l'échelle n3beur        | `lib/rbac.js`, `routes/rbac.js`                          |
| CDG-10 | MAJEUR   | Vue globale déduite de `stats.read.all`                | `lib/groupScope.js`                                      |
| CDG-11 | MAJEUR   | Suppression / duplication d'élèves sans périmètre      | `routes/students.js`                                     |
| CDG-12 | MAJEUR   | Staff G&L sans compte enseignant ; révocation          | `routes/gl/auth.js`, `lib/glStaffAuth.js`, `glHydration` |
| CDG-13 | MAJEUR   | Login : énumération, throttle contourné, alias         | `routes/auth.js`, `lib/loginThrottle.js`                 |
| CDG-20 | MAJEUR   | Prof de classe : onglet « Classe » vide                | `src/components/profiles-views.jsx`, `src/utils/`        |
| CDG-21 | MAJEUR   | Moodle : groupe exempt → comptes désactivés            | `lib/moodle/plan.js`                                     |
| CDG-22 | MAJEUR   | Moodle : cohorte hors exécution → désactivation        | `lib/moodle/plan.js`, `apply.js`                         |
| CDG-23 | MAJEUR   | Import : cellule vide rétrograde / écrase              | `routes/students.js`, `lib/studentRouteHelpers.js`       |
| CDG-24 | MAJEUR   | Import : sous-groupe cherché globalement               | `lib/groupImport.js`                                     |
| CDG-25 | MAJEUR   | Import de groupes destructif, cycles                   | `lib/groupImport.js`                                     |
| CDG-26 | MAJEUR   | Compte supprimé → 403 au lieu de 401 `deleted`         | `middleware/requireTeacher.js`                           |
| CDG-27 | MAJEUR   | Front : session élève révoquée non fermée              | `src/hooks/useSessionWindowSync.js`                      |
| CDG-28 | MAJEUR   | Front : jeton glissant écrasé (à confirmer)            | `src/hooks/useAuthSession.js`, `src/services/api.js`     |
| CDG-40 | MAJEUR   | Ni désactivation de compte ni suppression d'enseignant | `routes/rbac.js`, `lib/rbac.js`                          |
| CDG-41 | MAJEUR   | Plancher 12 caractères non tenu (4 voies)              | `routes/gl/auth.js`, seed, import                        |
| CDG-42 | MAJEUR   | Pas de changement de mot de passe authentifié          | `routes/auth.js`                                         |
| CDG-43 | MAJEUR   | Quatre voies d'écriture de rôle, quatre règles         | `routes/rbac.js`, `routes/students.js`, `lib/group*.js`  |
| CDG-50 | MAJEUR   | Tests absents sur les gardes                           | `tests/`, `tests-ui/`, `e2e/`                            |

---

## 9. Priorisation proposée

**Lot A — fermer les escalades (petit, urgent)**

1. CDG-01 : alias par défaut vide, promotion uniquement à la création du seed, e-mail
   enseignant non modifiable en self-service.
2. CDG-02/03/11 : `canAccessStudentId` + `checkRoleAssignmentAllowed` à l'import, à la
   suppression, à la duplication ; refus de toucher un enseignant existant hors admin.
3. CDG-04 : reset MJ réservé aux comptes miroirs.
4. CDG-05 : rôle LTI _Instructor_ + domaine autorisé pour une session enseignant.
5. CDG-06/08 : rang de la cible < rang de l'acteur (attribution et impersonation),
   `impersonatedBy` dans l'audit, claims propagés sur `/me`.
6. Tests correspondants (CDG-50).

**Lot B — rendre le prof de classe réel (moyen)**

7. CDG-20 : sous-onglets dérivés de `groups.read` / `groups.manage`, montage testé.
8. CDG-10 : permission de vue globale distincte.
9. CDG-53 : rattachement d'un enseignant à ses groupes depuis sa fiche.

**Lot C — cycle de vie des comptes (moyen)**

10. CDG-40/46 : désactivation / réactivation, suppression d'enseignant, plus de rôle par
    défaut recréé.
11. CDG-26/27/28 : 401 `deleted`, fermeture de session élève, jeton unique côté front.
12. CDG-41/42 : plancher 12 partout, changement de mot de passe authentifié, `password_must_reset`
    appliqué par ForetMap.

**Lot D — imports et Moodle (moyen)**

13. CDG-21/22 : périmètre après exemption, réactivation quand l'élève réapparaît.
14. CDG-23/24/25/43 : « vide = inchangé », enfant cherché sous son parent, cycles,
    fonction unique d'attribution et de rattachement.

**Lot E — dette (petit, non urgent)**

15. CDG-44 : taxonomie unique ; CDG-13 : un seul message d'échec et throttle par compte ;
    CDG-47 marque en dur ; CDG-60 duplications.

---

## 10. Pour aller plus loin

[`docs/reference/foretmap/comptes-roles-et-groupes.md`](reference/foretmap/comptes-roles-et-groupes.md) ·
[`docs/reference/gl/roles-et-connexion.md`](reference/gl/roles-et-connexion.md) ·
[`docs/reference/foretmap/rentree-moodle.md`](reference/foretmap/rentree-moodle.md) ·
[`AUDIT_ROLE_PROFESSEUR_2026-09.md`](AUDIT_ROLE_PROFESSEUR_2026-09.md) ·
[`AUDIT_COMPTES_2026-09.md`](AUDIT_COMPTES_2026-09.md) ·
[`AUDIT_MOODLE_IDENTITES_2026-09.md`](AUDIT_MOODLE_IDENTITES_2026-09.md) ·
[index des audits](audits/README.md)
