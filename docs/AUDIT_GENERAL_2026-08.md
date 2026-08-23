# Audit général ForetMap — 2026-08-23

> **Statut : à traiter.** Audit transversal du monorepo (code, base de données, mécaniques
> de jeu GL, UI/UX, outillage qualité) réalisé en lecture seule sur la branche
> `claude/audit-general-projet-h7bgl2` (base : `main` @ `73338c5`, version `1.110.0`).
> Aucun fichier de code n'a été modifié par cet audit.

## 1. Résumé exécutif

Le projet est d'un niveau nettement supérieur à la moyenne pour une application scolaire :
SQL systématiquement paramétré, chaîne JWT/RBAC exemplaire, économie GL transactionnelle
avec verrous `FOR UPDATE`, migrations idempotentes gardées par des tests, ~850 fichiers de
tests, documentation vivante. **Aucune faille critique** (injection SQL exploitable, route
d'administration non protégée, path traversal) n'a été trouvée.

Les points à traiter en priorité relèvent de trois familles : **triche/exploits dans le jeu
GL** (le plus impactant fonctionnellement), **durcissement sécurité** (rate-limit, exposition
d'informations, politique de mot de passe) et **accessibilité/UX** (contrastes, cibles
tactiles, navigation clavier).

| Domaine                | Critique | Majeur | Mineur | Info |
| ---------------------- | :------: | :----: | :----: | :--: |
| Backend & sécurité     |    0     |   5    |   14   |  5   |
| Base de données        |    0     |   4    |   9    |  7   |
| Mécaniques de jeu (GL) |    0     |   4    |   3    |  3   |
| Frontend UI/UX         |    0     |   9    |   12   |  6   |
| Tests / CI / docs      |    0     |   2    |   9    |  9   |

### Top 10 à traiter en premier

1. **[GL] Réponses de QCM révélables par force brute** — l'endpoint `answer` hors partie ne
   consomme aucun jeton et renvoie la bonne réponse (`routes/gl/qcm.js:238-284`).
2. **[GL] Farm de score via présentation illimitée de questions** — `present-question` ne
   vérifie pas la position de l'équipe (`routes/gl/games/markers.js:145-281`).
3. **[Sécu] forgot/reset-password prof sans rate-limit strict** — inondation d'emails
   possible (`server.js:149-155`).
4. **[Sécu] Liste interne des problèmes du site exposée publiquement** —
   `GET /api/site-issues` sans authentification (`server.js:408-415`).
5. **[Sécu] Mot de passe minimum à 4 caractères** — y compris pour les comptes prof/admin
   (`lib/settings.js:349`).
6. **[BDD] Course de capacité sur l'inscription de groupe** — `/assign-group` hors
   transaction peut dépasser `required_students` (`routes/tasks/assignments.js:154-204`).
7. **[UX] Rafale de 300+ requêtes à l'ouverture du catalogue biodiversité** — 3 requêtes par
   carte plante (`src/components/context-comments.jsx:156,195`).
8. **[A11y] Contrastes des textes secondaires et états vides sous WCAG AA** — gris `#aaa`/`#bbb`
   ≈ 2:1 (`src/index.css`, multiples).
9. **[A11y] Zones de la carte inaccessibles au clavier** —
   `src/components/map/ZonePolygonsLayer.jsx:67`.
10. **[Qualité] Aucun audit de sécurité npm en CI** alors que 4 vulnérabilités _high_ existent
    en prod (`.github/workflows/ci.yml`, pile Socket.IO).

## 2. Méthodologie

Audit statique, en lecture seule, sans exécution ni accès base, mené en six passes
parallèles :

- **Backend & sécurité** : `server.js`, `app.js`, `routes/*.js`, `middleware/`, `lib/`
  transverses, partie pool de `database.js`.
- **Base de données** : `database.js`, `migrations/*.sql`, `sql/schema_foretmap.sql`, patterns
  SQL dans `routes/` et `lib/`.
- **Mécaniques de jeu GL** : `routes/gl/*.js`, `src/gl/**`, `middleware/requireGlAuth.js`,
  `lib/gl*.js`, `docs/GL_*`.
- **Frontend UI/UX** : `src/` hors `src/gl/`, `index.vite.html`, `src/index.css`.
- **Tests / CI / docs** : `tests/`, `tests-ui/`, `e2e/`, `.github/workflows/`, `docs/`,
  `package.json`.
- **Contenu des docs de référence** : les 18 fichiers de `docs/reference/` (qualité, cohérence,
  terminologie, lacunes, fraîcheur, marqueurs en attente) — voir §8.

Les constats majeurs les plus lourds ont été revérifiés directement dans le code. **Réserve :**
les exploits GL de farm/brute-force reposent sur les réglages **par défaut** des parties
(`markerQuestionRetrigger='every_arrival'`, gating off) ; certains profils réduisent la surface
mais ne referment pas la faille de révélation de réponse, indépendante des réglages.

## 3. Mécaniques de jeu (Gnomes & Licornes)

### Exploits & intégrité

- **[MAJEUR] Réponses de QCM révélables par force brute** — `routes/gl/qcm.js:238-284` —
  `POST /qcm/questions/:code/answer` (permission `gl.read`) ne consomme aucun jeton
  (`consumePresentationJti` absent, contrairement au chemin scoré) : avec un **seul**
  `presentationToken`, un élève peut soumettre `choiceId` 0,1,2,3,4 successivement, et la
  réponse qui renvoie `correct:true` expose même `correctChoiceId`. L'anti-triche (bonne
  réponse jamais en clair) est contournée en 5 requêtes. **Reco :** consommer le jeton à la
  première tentative et ne jamais renvoyer `correctChoiceId` en rejeu.
- **[MAJEUR] Farm de score via présentation illimitée de questions** —
  `routes/gl/games/markers.js:145-281` — `present-question` ne vérifie pas que l'équipe du
  joueur est réellement sur le repère (contrairement à `present-arrival`, qui contrôle
  `team.position_marker_id === markerId` en `:344`). Avec le réglage par défaut
  `markerQuestionRetrigger='every_arrival'`, la même question est présentable à volonté ;
  combiné à la connaissance des réponses, `gl_team_scores` se farme sans limite. **Reco :**
  exiger `team.position_marker_id === markerId` côté joueur.
- **[MAJEUR] Cooldown anti-triche du gating contournable** — `routes/gl/qcm.js:266-272` +
  `lib/learning.js` — Le verrou de re-tentative n'est posé que si `resourceType`/`resourceRef`
  sont fournis : en brute-forçant la réponse **sans** contexte de ressource, puis en marquant
  la ressource « acquise » avec la bonne réponse trouvée, l'élève valide le gating sans délai
  ni apprentissage réel. **Reco :** poser le cooldown sur la question elle-même, indépendamment
  du contexte ressource.
- **[MAJEUR] Les coûts en gemmes des feuillets/zones ne bloquent pas l'acquisition** —
  `lib/glVitality.js:49-64`, `lib/glLoreFeuilletEffects.js:47-49`, `lib/glFeuilletZonePresent.js:148`
  — `applyPlayerVitalityDelta` borne le résultat à `[0,99]` : un `cout_gemme` est une ponction
  « si tu as de quoi », jamais un verrou. Une équipe à 0 gemme obtient quand même le
  feuillet/la traversée de zone, là où le marché et les sorts refusent explicitement avec
  `INSUFFICIENT_BALANCE`. **Reco :** décider si les coûts lore doivent gater (contrôle de solde
  avant application) ou documenter que ce sont des ponctions non-bloquantes.
- **[MINEUR] QCM entièrement lisible par un invité** — `routes/gl/qcm.js:214-284` —
  `requireGlPermission('gl.read')` ne bloque pas les invités : un `gl_guest` peut présenter
  n'importe quelle question et, via le brute-force ci-dessus, extraire toutes les bonnes
  réponses du catalogue avant même de créer un compte. **Reco :** réserver `present`/`answer` à
  un profil authentifié, ou au minimum consommer le jeton pour les invités.
- **[MINEUR] `limite_usage` / cooldowns de sorts jamais appliqués** — `lib/glSpellCast.js` —
  Le champ existe en base (`migrations/108`) mais n'est lu nulle part ; un sort peut être
  relancé sans limite tant que le solde suffit (confirmé par
  `docs/GL_EQUILIBRAGE_ANALYSE_RAPPORT.md` §1). **Reco :** câbler une lecture runtime du plafond
  d'usage si l'équilibrage l'exige.
- **[MINEUR] Émission Socket.IO d'un événement potentiellement erroné (concurrence)** —
  `routes/gl/games/vitality.js:63-70` et `:124-131` — L'événement est retrouvé par
  `ORDER BY id DESC LIMIT 1` (dernier de la partie) et non par l'`insertId` de la requête :
  sous concurrence, deux gestes MJ simultanés peuvent réémettre le mauvais événement (les
  chemins repère/feuillet ont déjà migré vers `insertId`, cf. `markers.js:447`). **Reco :**
  renvoyer l'événement par son `insertId`.

### Boucles de jeu & équilibrage (informatif)

- **[INFO] Aucun crédit de gemme sur bonne réponse QCM** — `routes/gl/games/qcm.js:173-192`
  n'incrémente que `gl_team_scores` (+1), jamais `power_points` ; les seules entrées de monnaie
  sont les gestes MJ et les récompenses de feuillets. L'« économie » repose entièrement sur le
  MJ — à garder en tête pour l'équilibrage (cohérent avec la PR #334 en cours).
- **[INFO] Effacement permanent de feuillets** — `lib/glLoreFeuilletEffects.js:11-26` — Un
  feuillet `effacement='total'` (ou cumulé ≥100 %) devient illisible : si une information de
  progression n'existe que sur un feuillet effaçable, risque de cul-de-sac narratif. À
  surveiller lors du peuplement.
- **[INFO] Progression des chapitres pilotée par le MJ** — `routes/gl/chapters.js` — Pas de
  déblocage automatique côté joueur, donc pas de risque de blocage définitif dû à une condition
  cassée côté code.

## 4. Backend & sécurité

- **[MAJEUR] Endpoints forgot/reset-password prof sans rate-limit strict** — `server.js:149-155`
  — `authLimiter` couvre `/api/auth/login`, `/register`, `/reset-password` et les endpoints GL,
  mais **pas** `/api/auth/forgot-password`, `/api/auth/teacher/forgot-password` ni
  `/api/auth/teacher/reset-password` (`routes/auth.js:894,965,1003`) : inondation d'emails de
  réinitialisation possible (limitée seulement par le limiteur général). **Reco :** ajouter ces
  trois chemins au montage `authLimiter`.
- **[MAJEUR] Liste interne des problèmes du site exposée publiquement** — `server.js:408-415` —
  `GET /api/site-issues` et `/api/site-issues.json` servent `docs/SITE_ISSUES.md/.json` (« audit
  interne ») sans authentification : feuille de route pour un attaquant. **Reco :** protéger par
  `requirePermission('admin.settings.read')` ou retirer l'endpoint.
- **[MAJEUR] Longueur minimale de mot de passe par défaut : 4 caractères** —
  `lib/settings.js:349`, `lib/passwordReset.js:81` — `security.password_min_length` a un défaut
  **et un plancher** de 4, appliqué à l'inscription et aux resets élève **et** prof. **Reco :**
  relever le plancher à 8+ (au moins pour les comptes teacher).
- **[MAJEUR] DELETE /api/tasks/:id non transactionnel** — `routes/tasks.js:1087-1089` — Trois
  `execute` (task_logs, task_assignments, tasks) sans `withTransaction`, alors que
  POST/PUT/validate du même fichier le sont : un échec au milieu laisse une tâche amputée. Idem
  `DELETE /api/groups/:id` (`routes/groups.js:454-456`). **Reco :** envelopper dans
  `withTransaction`.
- **[MAJEUR] Limite de corps JSON 25 Mo appliquée à toutes les routes** — `server.js:182-184` —
  `express.json({ limit: 25mb })` global (surchargeable à 100 Mo) : tout endpoint, y compris
  publics (login, quiz), accepte 25 Mo bufferisés en mémoire — vecteur de pression mémoire avec
  les images base64. **Reco :** défaut bas (~1 Mo), limite haute montée seulement sur les routes
  d'upload/import.
- **[MINEUR] Identifiant de connexion journalisé en clair sur échec** — `routes/auth.js:542` —
  `payload: { identifier }` persisté dans `security_events` : PII, et risque de capturer un mot
  de passe tapé dans le mauvais champ. **Reco :** ne stocker qu'une forme tronquée/hachée.
- **[MINEUR] Uploads base64 sans vérification des octets magiques** —
  `routes/observations.js:138-141`, `routes/settings.js:444-446`, `routes/plants.js:285-296` —
  Extension image forcée sans contrôle du contenu réel (XSS mitigé par CSP sandbox +
  attachment). **Reco :** valider les magic bytes et une taille max par famille.
- **[MINEUR] CSP quasi absente** — `server.js:127-131,198-202` — helmet monté avec
  `contentSecurityPolicy: false` ; le middleware maison ne définit que `img-src`, pas de
  `script-src`/`object-src`. **Reco :** construire une CSP complète (nonce/hash pour les styles
  inline).
- **[MINEUR] Pannes BDD traitées comme « anonyme » dans l'auth optionnelle** —
  `middleware/requireTeacher.js:146-152`, `lib/auth/jwtPipeline.js:38-48` — Toute exception (y
  compris SQL) est avalée en `req.auth = null` : une panne BDD dégrade silencieusement en vue
  anonyme au lieu d'un 503. **Reco :** ne rattraper que les erreurs JWT, propager les erreurs
  d'hydratation.
- **[MINEUR] Token JWT accepté en query string pour Socket.IO** — `lib/realtime.js:53` — Un
  `?token=` peut fuiter dans les logs des proxies. **Reco :** n'accepter que `handshake.auth` et
  l'en-tête Authorization.
- **[MINEUR] Énumération de comptes par canal temporel au login** — `routes/auth.js:535-548` —
  Compte introuvable → pas de `bcrypt.compare` factice, donc réponse plus rapide que
  « mot de passe faux ». **Reco :** comparer contre un hash factice constant.
- **[MINEUR] Écritures pendant une lecture + N+1 dans GET /api/stats/all** —
  `routes/stats.js:316-348` — `syncStudentPrimaryRoleFromProgress` (écriture de rôle possible)
  s'exécute par élève à chaque GET. **Reco :** déplacer la synchro vers les événements de
  validation de tâche et agréger.
- **[MINEUR] Coordonnées de repère non validées** — `routes/map.js:189-215` — `x_pct`/`y_pct`
  insérés tels quels (NaN, hors bornes possibles ; paramétré donc sans injection). **Reco :**
  coercition + bornes 0-100 (zod).
- **[MINEUR] Pool MySQL sans connectTimeout** — `database.js:66-80` — Si MySQL est injoignable
  au niveau TCP, les requêtes s'empilent avant erreur. **Reco :** définir `connectTimeout` (et un
  timeout par requête pour l'interactif).
- **[MINEUR] Multer sans fileFilter** — `lib/contentLibraryUpload.js:45-54` — Accepte tout type
  MIME (limites de taille/nombre présentes, réservé aux profs). **Reco :** `fileFilter` par
  extension/MIME attendus.
- **[MINEUR] Email personnel en dur comme allowlist OAuth par défaut** —
  `lib/authRouteHelpers.js:30` — `GOOGLE_ALLOWED_EMAILS_DEFAULT = ['oliv.arn.lau@gmail.com']` :
  PII versionnée et droit d'accès codé en dur. **Reco :** vider le défaut, exiger la config env
  en prod.
- **[MINEUR] PUT /api/tasks/:id : route de ~370 lignes hors asyncHandler** —
  `routes/tasks.js:708-1078` — Logique proposeur/validateur/manageur entremêlée, avec un mode
  debug exposant `err.message` au client (`FORETMAP_DEBUG_TASK_PUT_CLIENT`, `:1067-1076`).
  **Reco :** découper et rebasculer sur `asyncHandler`.
- **[MINEUR] Contrôles de permission redondants (code mort)** —
  `routes/tutorials.js:374-376,385-387,674-676` — `requirePermission('tutorials.manage')` suivi
  d'un `if (!canManageTutorials(req))` qui revérifie la même permission (branche inatteignable).
  **Reco :** supprimer l'un des deux.
- **[MINEUR] Réponses non paginées sur les listes principales** — `routes/tasks.js:283-413`,
  `routes/plants.js:427-441`, `routes/tutorials.js:323-350`, `routes/zones.js:156-196` —
  Croissance non bornée (le forum, lui, est paginé). **Reco :** plafond `LIMIT` de sécurité ou
  pagination optionnelle.
- **[MINEUR] Rate limit en mémoire par processus** — `lib/rateLimit.js:109-128` — Sous Passenger
  multi-instances, le plafond effectif est multiplié par le nombre d'instances. **Reco :**
  documenter, ou store partagé si plusieurs instances.
- **[INFO] LIMIT interpolé (borné par zod)** — `routes/audit.js:28` — `LIMIT ${limit}` avec
  `limit` entier ∈ [1,200] : sûr, mais seul écart au « SQL toujours paramétré ». **Reco :**
  passer en placeholder pour l'exemplarité.
- **[INFO] Fichiers de diagnostic à la racine avec infos d'environnement** —
  `server.js:584-614`, `app.js:7-20` — `startup*.log` contiennent DB_HOST/DB_USER/DB_NAME (pas le
  mot de passe). À garder hors docroot.
- **[INFO] Détail d'environnement OAuth exposé aux `admin.settings.read`** —
  `routes/settings.js:632-661` — `allowedDomains`/`allowedEmails` renvoyés en clair (cohérent avec
  le rôle).
- **[INFO] Pas de révocation de JWT** — Un jeton émis (dont impersonation) reste valable jusqu'à
  expiration (TTL 1 h 30 par défaut) ; la suppression/désactivation de compte est toutefois
  neutralisée à l'hydratation (403 « Aucun profil attribué »).

## 5. Base de données

> Un audit BDD approfondi existe déjà (`docs/AUDIT_BDD_2026-08.md`), largement exécuté
> (migrations 183-190). Les constats ci-dessous relèvent ce qui **reste ouvert**.

- **[MAJEUR] Course de capacité sur l'inscription de groupe** —
  `routes/tasks/assignments.js:154-204` — Contrairement à `/assign` (verrou `claimAssignmentSeat`
  - `FOR UPDATE`), `/assign-group` calcule `maxSlots` sur une lecture antérieure et insère hors
    transaction : une inscription concurrente peut dépasser `required_students`. **Reco :**
    `withTransaction` avec relecture de `tasks` sous `FOR UPDATE`.
- **[MAJEUR] Suppression d'un joueur GL bloquée par une FK RESTRICT → 500** —
  `migrations/109_gl_spell_cast.sql:34`, `routes/gl/admin.js:480-505` —
  `fk_gl_spell_cast_contrib_player` est `ON DELETE RESTRICT`, mais le garde de la route ne refuse
  que les parties `draft/live/paused` : un joueur ayant contribué à un sort dans une partie
  **terminée** déclenche `ER_ROW_IS_REFERENCED_2` non capté (500). **Reco :** détacher/purger les
  contributions, ou capter l'errno 1451 en 409.
- **[MAJEUR] Orphelins `group_id` après suppression d'un groupe** — `routes/groups.js:453-454` —
  `tasks.group_id`, `forum_threads.group_id`, `observation_logs.group_id` n'ont **aucune FK** vers
  `groups` et ne sont pas remis à NULL au DELETE : tâches/fils rattachés à un groupe fantôme.
  **Reco :** FK `ON DELETE SET NULL` (ou NULLer ces colonnes dans la transaction).
- **[MAJEUR — dette reconnue] 29 colonnes temporelles en VARCHAR(32), deux référentiels de
  temps** — `sql/schema_foretmap.sql:153-165,224-225,637,739…` — Point 13 du plan précédent,
  explicitement « à venir » : VARCHAR ISO et DATETIME `CURRENT_TIMESTAMP` (heure locale)
  coexistent ; la purge doit filtrer chaque table dans son propre référentiel. **Reco :** mener
  le lot DATETIME UTC (avec `timezone: 'Z'` côté pool).
- **[MINEUR] Suppressions multi-tables hors transaction (groupes, joueurs GL)** —
  `routes/groups.js:453-454`, `routes/gl/admin.js:502-503` — Deux `execute` successifs : état
  intermédiaire possible sur échec. **Reco :** `withTransaction`.
- **[MINEUR] Jetons de réinitialisation `gl_player` jamais purgés à la suppression du joueur** —
  `routes/gl/admin.js:502` vs `lib/studentDeletion.js:48` — La purge applicative existe pour les
  élèves mais pas côté GL. **Reco :**
  `DELETE FROM password_reset_tokens WHERE user_type='gl_player' AND user_id=?`.
- **[MINEUR] `initSchema` peut rendre au pool une connexion avec `FOREIGN_KEY_CHECKS=0`** —
  `database.js:357-377`, `sql/schema_foretmap.sql:6,901` — Portée session ; si une exception
  survient avant le `SET …=1` final, le `finally` fait `conn.release()` (impact réel pour les
  tests in-process). **Reco :** rétablir `FOREIGN_KEY_CHECKS=1` dans le `finally` (ou
  `conn.destroy()` sur échec).
- **[MINEUR] Versionnage scalaire des migrations + trous de numérotation** —
  `database.js:483-484` (trous : 031, 032, 035, 060, 125, 127, 171, 179-182) — `schema_version`
  est un entier unique : un fichier ajouté dans un trou inférieur à la version courante ne sera
  jamais joué sur les bases déjà migrées. **Reco :** documenter « toujours numéroter au-dessus du
  max » (ou table de migrations par fichier).
- **[MINEUR] Pool sans `timezone` ni timeouts explicites** — `database.js:66-81` — Pas de
  `timezone`/`dateStrings` (double fuseau), pas de `connectTimeout`/`maxIdle`/`idleTimeout`.
  **Reco :** `timezone: 'Z'` lors du lot dates, expliciter les timeouts.
- **[MINEUR] `queueLimit: 200` : rejet brut au 201ᵉ appel en attente** — `database.js:74-79` —
  L'erreur mysql2 remonte en 500 générique au lieu d'un 503. **Reco :** capter dans le handler
  d'erreurs global → 503.
- **[MINEUR] Purge de rétention limitée à `audit_log`/`security_events`** —
  `scripts/purge-audit-logs.js:43-53` — `gl_game_events` (LONGTEXT) et
  `gl_qcm_presentation_uses` croissent sans rétention (nettoyés seulement au DELETE de partie).
  **Reco :** étendre `npm run logs:purge` aux journaux GL des parties closes.
- **[MINEUR] Purge `audit_log` sans index sur `created_at`** — `sql/schema_foretmap.sql:628-642`
  — Index sur `(actor, id)`/`(action, id)` seulement ; filtre de purge sur `created_at` (VARCHAR)
  = full scan. **Reco :** ajouter l'index si la volumétrie décolle.
- **[MINEUR] Suppression de compte : parcours couvert pour « student » seulement** —
  `lib/studentDeletion.js` — Contenu forum polymorphe sans FK ; la suppression d'un compte
  prof/teacher laisserait des posts orphelins. **Reco :** factoriser la purge par `user_type`
  avant d'ouvrir la suppression d'autres types.
- **[INFO]** Tables héritées recréées puis droppées à chaque `initSchema` (contournement assumé,
  testé) ; `password_reset_tokens` polymorphe sans FK (assumé, migration 189) ; collation de
  connexion `utf8mb4_general_ci` ≠ tables `utf8mb4_unicode_ci` (sans effet, incohérent) ; pas
  d'index sur `tasks.status` (volumétrie faible) ; doublons de numéros 021/037 (rejeu idempotent
  documenté) ; formats de date hétérogènes dans une même colonne VARCHAR ; géoréférencement GPS
  carte en attente d'un relevé de terrain.

## 6. Frontend UI/UX (hors GL)

- **[MAJEUR] Rafale de requêtes N×3 sur le catalogue Biodiversité** —
  `src/components/context-comments.jsx:156,195`, `src/components/foretmap-views.jsx:677` — Chaque
  carte plante monte un `ContextComments` qui, même replié, déclenche 3 requêtes au montage
  (`load` preview, `refreshTotal`, `GET /api/settings/public`) : 300+ requêtes à l'ouverture,
  risque de 429. **Reco :** lire les emojis depuis `usePublicSettings()` (déjà importé) et
  différer les chargements à l'ouverture réelle de la section.
- **[MAJEUR] Convention « 401 deleted:true → déconnexion » non systématique** — ~40 fichiers
  (`forum-views.jsx:63`, `stats-views.jsx:39`, `profiles-views.jsx`, `groups-views.jsx`, `pedago/*`…)
  — Appels `api()` sans intercepter `AccountDeletedError` ni recevoir `onForceLogout` : un compte
  supprimé reste en session zombie jusqu'au poll global. **Reco :** migrer vers `useApiResource`
  (qui gère le cas) ou ajouter catch/forceLogout partout.
- **[MAJEUR] Contrastes insuffisants sur textes secondaires et états vides** —
  `src/index.css:2193,2516,2528,1244,1785,1957,2277,2545,2683` — `#bbb` sur crème `#fefae0` ≈
  1,8:1, `#aaa` ≈ 2,2:1, loin du 4,5:1 WCAG AA ; `.empty` porte les messages clés destinés aux
  élèves. **Reco :** remonter à au moins `#6b7280` voire `var(--leaf)`.
- **[MAJEUR] Cibles tactiles < 44px sur l'écran carte (usage tablette principal)** —
  `src/index.css:162,2139-2153,1717,2168` — `.btn-sm` 38px, toolbar carte forcée à 30px
  (`!important`), `.modal-close` 36×36 ; la convention exige ≥ 44px. **Reco :** garder la
  compacité visuelle mais restaurer une zone de frappe ≥ 44px (padding ou `::after`).
- **[MAJEUR] Zones de la carte inaccessibles au clavier** —
  `src/components/map/ZonePolygonsLayer.jsx:67` — Les polygones ne s'ouvrent qu'au clic (`<g>`
  sans `tabIndex`/`role`/clavier), alors que les repères sont de vrais boutons accessibles.
  **Reco :** `role="button"`, `tabIndex=0`, `aria-label`, Enter/Espace — ou liste textuelle des
  zones.
- **[MAJEUR] Navigation basse : jusqu'à 12 onglets avec débordement invisible sur mobile** —
  `src/components/app/StudentBottomNav.jsx:24-131`, `src/index.css:482-493` — Défilement
  horizontal avec scrollbar masquée, sans affordance : Forum, Carnet, Visite, À propos peuvent
  être hors écran. **Reco :** dégradé/chevron de débordement, ou onglet « Plus ».
- **[MAJEUR] Onglet actif non exposé aux lecteurs d'écran** — `StudentBottomNav.jsx`,
  `TeacherTopTabs.jsx`, `auth-views.jsx:236` — Aucun `aria-current`/`role="tab"`+`aria-selected`
  (grep vide) : l'onglet actif n'est signalé que par la classe CSS. **Reco :** `aria-current="page"`
  sur le bouton actif, `aria-selected` sur les onglets de connexion.
- **[MAJEUR] Piège de focus figé au montage dans les modales** —
  `src/hooks/useDialogA11y.js:25-27,61` — `focusables` capturé une seule fois : dans les modales à
  contenu dynamique (Suspense, formulaires multi-étapes), Tab boucle sur des éléments obsolètes ;
  de plus un seul Escape ferme toutes les modales imbriquées. **Reco :** recalculer les
  focusables à chaque Tab, ne fermer que le dialogue le plus haut.
- **[MAJEUR] `window.prompt`/`alert` pour des actions métier prof** —
  `tasks-views.jsx:287`, `groups-views.jsx:396-401`, `visit-views.jsx:662,703`,
  `visit/VisitEditorPanel.jsx:148-259` — Dialogues natifs (saisie d'un ID de groupe à la main,
  création de groupe en 3 prompts chaînés…) : cassent le thème, pénibles sur tablette, sujets aux
  fautes de frappe. **Reco :** modales `DialogShell` avec `<select>` (le pattern
  `TaskConfirmDialog` existe).
- **[MINEUR]** Cascade d'effets rechargeant la liste des sujets du forum
  (`forum-views.jsx:53-70`) ; double fetch de `/api/settings/public` malgré `usePublicSettings`
  (`forum-views.jsx:112`, `context-comments.jsx:195`) ; catalogue biodiversité non paginé/virtualisé
  (`foretmap-views.jsx:677-700`) ; toast unique 2,4 s pour erreurs longues sans variante visuelle
  (`shared/components/TimedToast.jsx:5`) ; erreurs du formulaire d'auth sans `role="alert"` et pas
  de vrai `<form onSubmit>` (`auth-views.jsx:262-263`) ; vignettes de galerie non accessibles au
  clavier (`map/PhotoGallery.jsx:169-180`) ; composants > 500 lignes (`App.jsx` 1711,
  `visit-views.jsx` 1214, `tasks-views.jsx` 1028…) ; onglets prof à 40px sur petits écrans
  (`index.css:48`) ; fetch stats élève sans garde anti-course (`stats-views.jsx:35-43`) ; emojis
  d'onglets sans `aria-hidden` (lecteurs d'écran verbeux) ; deux modales mascotte hors
  `DialogShell` ; `index.css` monolithique de 7460 lignes ; `window.confirm` (36 occurrences)
  coexistant avec deux autres patterns de confirmation.
- **[INFO]** Police de navigation 0,68 rem à contraste limite (`index.css:465-470`) ; Escape
  global de la visite en écouteur window non coordonné ; `keepPrevIfEqual` en `JSON.stringify` à
  chaque poll (`utils/stableCollection.js:9-18`) ; duplication login/session
  (`auth-views.jsx:142-171`) ; `console.error/warn` résiduels (23 occurrences) ; bandeau iOS PWA
  en `.btn-sm` 38px ; Google Fonts depuis CDN sans auto-hébergement (dégradation propre en
  offline).

## 7. Tests, CI, documentation & dépendances

- **[MAJEUR] Aucun audit de sécurité npm en CI** — `.github/workflows/ci.yml` — La CI enchaîne
  lint → format → tests → coverage → build, sans job `npm audit` ni scanning ; or 4 vulnérabilités
  _high_ existent en prod : `engine.io` et `socket.io-parser` (Socket.IO exposé), `brace-expansion`,
  `ip-address` (SSRF via google-auth-library), + 3 _moderate_. **Reco :** ajouter
  `npm audit --omit=dev --audit-level=high` (non bloquant d'abord), puis `npm audit fix` en lot
  dédié en priorisant la pile Socket.IO.
- **[MAJEUR] 8 vulnérabilités en prod dont 4 high, quasi toutes corrigibles sans breaking
  change** — `package.json`/`package-lock.json` — Voir ci-dessus ; toutes sauf `uuid` (via
  exceljs) annoncées « fix available ». **Reco :** `npm audit fix` + re-test.
- **[MINEUR]** Les e2e ne bloquent plus la CI (`ci.yml`, `continue-on-error: true`) et la
  « smoke » est en réalité la suite complète (41 specs) → extraire un vrai sous-ensemble bloquant ;
  14 `test.skip()` conditionnels silencieux dans les e2e (`visit-mode.spec.js:140`,
  `admin-impersonation.spec.js:10,17`) → transformer les « élément introuvable » en échec ; ~32
  sleeps arbitraires dans les tests backend → attentes sur condition ; `routes/admin-ops.js` sans
  test de route dédié ; composants transverses sans test UI (`ErrorBoundary.jsx`,
  `notifications-center.jsx`, `DialogShell.jsx`, forum peu couvert) ; `google-auth-library` une
  majeure en retard (10.9 → 11.x) ; `xlsx`/SheetJS 0.18.5 gelé avec advisories → migrer vers
  `exceljs` ; endpoints `admin-ops` absents de `docs/API.md` ; auto-commit de `dist/` non
  revalidé par la CI (`frontend-dist.yml`).
- **[INFO]** Couverture par domaine excellente (tous les domaines majeurs ont des tests dédiés,
  y compris validation de requêtes systématique) ; pas de `.only` oublié ni TODO dans les specs ;
  flakiness suivie activement (retries Playwright = 2, `workers: 1`) ; `docs/API.md` en phase avec
  les 15 derniers commits (5/5 sur échantillon) ; `LOCAL_DEV.md`/`EXPLOITATION.md` à jour et
  utilisables ; **zéro TODO/FIXME/HACK** dans le code applicatif (dette externalisée dans
  `docs/reference/INCOHERENCES.md`) ; aucun fichier sensible versionné (garde-fous `.gitignore`
  outillés) ; `dist/` versionné (~30 Mo, choix de déploiement assumé) avec binaires dupliqués
  `public/`+`dist/` → envisager Git LFS ; un `.sql` tracké (`data/import/foret-comestible-garden.sql`,
  sans PII) à ajouter à la whitelist `.gitignore`.

### Décisions fonctionnelles en attente

- **Aucune demande de changement « 🔧 À implémenter »** en attente dans `docs/reference/` (les 4
  occurrences décrivent le mécanisme lui-même).
- Un seul point ouvert apparenté : décision **⏳ En attente** du point **G13-b** dans
  `docs/reference/INCOHERENCES.md:527` (17 sortilèges « proposés » jouables comme officiels ;
  arbitrage suspendu faute d'un écran de tri par chapitre).

## 8. Documentation de référence (contenu fonctionnel)

> Cette section audite le **contenu** des 18 documents non techniques de `docs/reference/`
> (destinés aux profs, MJ et admins), au-delà du seul angle « fraîcheur » du §7. Ces docs
> décrivent « ce que le jeu fait aujourd'hui » ; ils sont désormais **joints systématiquement**
> aux audits (voir la note de méthode en fin de section).

### Décisions et marqueurs en attente (liste exhaustive)

- **Aucun marqueur `🔧 À implémenter` actif** : les 4 occurrences décrivent la convention
  elle-même (`README.md:34,72,88`, `guide-du-mj.md:181`). Aucun « TODO ».
- **`INCOHERENCES.md:527` — G13-b, `⏳ En attente` (2026-08-20)** : un sortilège « proposé » se
  joue comme un sortilège officiel ; arbitrage suspendu le temps de trier le catalogue. **Seul
  point du registre non résolu.**
- **`INCOHERENCES.md:389,392` + `economie-marche-sorts.md:226` — G9** : plancher de vitalité
  configurable, « à trancher après observation en classe ».
- **`lore-deux-peuples.md:122-134`, `gl/presentation.md:185-189`** : intégration du corpus « Les
  deux peuples du seuil » dans les contenus du jeu — action d'édition MJ/admin restant à faire
  (pas du code).

### Constats de contenu

- **[MAJEUR] Contradiction directe sur ce que font les « tours »** — `carte-du-royaume.md:37` et
  `guide-du-mj.md:27` (« seule l'équipe dont c'est le tour agit », sorts inclus) contredisent
  `chapitres-et-progression.md:77-81` (« toutes les équipes rejouent en même temps ; aucune n'est
  au trait ») et `economie-marche-sorts.md:107` (« lancer un sort n'est pas lié au tour »). C'est
  la décision G13-a marquée livrée. **Reco :** aligner les deux premiers docs sur le mode réel
  (tours globaux, quota par tour sur déplacement/dé seulement, sorts non bornés).
- **[MAJEUR] L'encadré « le jeu n'a pas de lore » se contredit dans le même document** —
  `gl/presentation.md:32-37` affirme qu'il n'existe pas de récit mettant en scène gnomes/licornes,
  alors que `:185-189` (même doc) annonce le corpus « Les deux peuples du seuil » rédigé et
  pré-intégré (G1 marqué résolu). Le lecteur tombe d'abord sur l'affirmation périmée. **Reco :**
  reformuler en « le récit existe et reste à mettre en scène » ou supprimer l'encadré.
- **[MINEUR] Fraîcheur** : portraits d'OLU décrits comme « à venir » (`foretmap/presentation.md:140-141`)
  alors qu'ils sont opérationnels (`visite-et-mascottes.md:198-207`) ; renvois « (à rédiger) »
  vers deux docs déjà écrits (`taches-tutoriels-et-validation.md:247-248`) ; mention « doc économie
  prévu au sommaire » obsolète (`INCOHERENCES.md:392`) ; résumé d'arbitrage de bas de page
  (`INCOHERENCES.md:558-575`) en retard sur la vague d'août (F8, G11-G14, G13-b).
- **[MINEUR] Terminologie divergente** : le carnet personnel GL porte trois noms (« Mon journal »
  / « carnet personnel » / « journal personnel » — `gl/presentation.md:117`, `guide-du-mj.md:52,110`) ;
  libellé franglais « Reset mdp » (`roles-et-connexion.md:84,86`) vs « réinitialisation de mot de
  passe » ailleurs ; les deux tableaux de rôles GL divergent (`gl/presentation.md:43-46` vs
  `roles-et-connexion.md:16-21`) sur qui crée le compte joueur et sur l'auth du MJ.
- **[MINEUR] Lacunes** : le « dé virtuel » est cité comme module (`gl/presentation.md:165`,
  `guide-du-mj.md:22`) mais jamais expliqué ; le module Quiz ForetMap est traité très
  superficiellement (`pedagogie-quiz-glossaire-reseau.md:15-21`) au regard du QCM GL ; les
  « Cadres d'image » sont listés sans définition (`gl/presentation.md:126-127`).
- **[INFO] Registre `INCOHERENCES.md` bien tenu** (24/25 points résolus et datés), mais deux
  résolutions sont **démenties par des docs consommateurs** (G1 par l'encadré périmé, G13-a par la
  contradiction « tours ») et deux décisions « à trancher après observation » (G9, G13-b) n'ont pas
  de mécanisme de rappel.
- **[INFO] Densité** : `visite-et-mascottes.md` (237 l., mêle Visite + mascottes + réglage OLU) et
  `taches-tutoriels-et-validation.md` (248 l.) gagneraient un sommaire interne ou un découpage
  (OLU en doc dédié).

**Points forts de la doc** : registre d'arbitrage exemplaire (constat → options → décision datée,
traçable vers les audits techniques), ton et public parfaitement tenus (français clair, encadrés
⚠️ orientés « geste à faire »), convention de mise à jour explicite et vivante, guide du MJ très
opérationnel (tableau incidents symptôme/cause/geste), corpus lore de grande qualité.

> **Note de méthode — joindre ces docs aux audits.** Le premier lot d'audit ne couvrait `docs/`
> que sous l'angle tests/CI/fraîcheur. Désormais, tout audit général inclut une passe de contenu
> sur `docs/reference/` (cohérence interne, terminologie, lacunes, fraîcheur, marqueurs en
> attente), conformément au skill `foretmap-docs-reference`.

## 9. Mécaniques de jeu (GL) — propositions pour rendre le jeu plus vivant

> Section **prospective** (pas un constat de défaut) : pistes d'évolution à trancher par le
> propriétaire. Rien n'est implémenté par cet audit. Propositions classées de la moins coûteuse
> (pur réglage / donnée) à la plus structurante (moteur).

### 9.0 Le diagnostic de fond : un plateau qui « n'applique presque rien »

Trois faits, tirés des docs de référence et des audits code, cadrent le problème :

- **L'appli encaisse, le MJ applique.** Pour les sortilèges, le logiciel retire le coût mais
  n'exécute aucun effet (`economie-marche-sorts.md:114-138`) : soin, déplacement, bonus, durée
  sont appliqués **à la main** par le MJ ; `limite d'usage` et `cumul` ne sont jamais vérifiés
  par le code (`:132-134,163-165`).
- **Les « tours » ne tournent pas.** Chaque « tour suivant » ouvre un round où **toutes les
  équipes rejouent en même temps** (`chapitres-et-progression.md:77-81`). L'alternance est une
  convention d'animation, pas une règle du jeu.
- **La vitalité s'accumule sans puits.** Cœurs/gemmes sont durables et traversent les parties
  (`economie-marche-sorts.md:14-15,222-226`) : sur une année, une classe thésaurise et la tension
  disparaît.

Conséquence : pour un élève, **jouer ne change presque rien à l'écran** — c'est le levier
d'engagement n°1. Pourtant les champs d'effet existent déjà : chaque case stocke par branche
`neutre`/`gnome`/`licorne` un `deltaPv`, un `deltaGems`, un `deltaMove` et un `passTurn`
(`src/shared/glMarkerEventConfigCore.js:105-111`), et le moteur applique bien `deltaMove`
(déplacement auto sur parcours numéroté) et `passTurn` (`lib/glMarkerEffectAutoMove.js`,
`lib/glMarkerVitalityEffects.js`). Le socle est là, sous-exploité.

### 9.1 Rendre les récompenses tangibles et automatiques (levier n°1)

- **Créditer une petite récompense sur bonne réponse au QCM en partie** : aujourd'hui une bonne
  réponse ne donne que +1 au score d'équipe (`chapitres-et-progression.md:69-71`), jamais de
  gemme. Ajouter un gain configurable (ex. +1 💎 tous les N bonnes réponses) relie l'effort de
  l'élève à sa jauge, côté serveur, sans intervention MJ. _Coût : moteur léger + réglage._
- **Peupler les branches d'effet des cases** (deltaPv/deltaGems/deltaMove déjà câblés) pour que
  l'arrivée sur un repère produise un résultat visible immédiat, différencié gnome/licorne — ce
  que le lore raconte déjà (`carte-du-royaume.md:24-26`). _Coût : donnée (studio / import tableur),
  zéro code._
- **Cadrer l'asymétrie** : gros gains sur les cases « défi » (avec QCM), petits aléas sur les
  cases neutres, pour garder la récompense liée à l'apprentissage.

### 9.2 Remplacer les cases « passe ton tour » (demande explicite)

**Pourquoi c'est prioritaire.** « Passe ton tour » est une punition à temps mort : l'élève reste
spectateur, l'inverse de l'objectif en classe. Un enfant mis sur la touche décroche, et l'impact
cumulé est réel vu le nombre de cases concernées.

**Note de décompte.** L'audit certifié de la PR #334 (dump du 2026-08) recensait **7** cases
« passe ton tour » ; le décompte évoqué en séance est de **42**. Les données de cases vivent en
base (importées via `lib/glChaptersImport.js`), pas dans le dépôt : le décompte fiable doit venir
de `GET /api/gl/admin/plateaux/coherence` (endpoint ajouté par la PR #334) ou d'une requête sur
`gl_markers`. La proposition ci-dessous est **indépendante du nombre** : elle vise toute case
portant `passTurn` ou un `effet_mecanique` textuel « passe ton tour ».

| #   | Remplacement                                                                        | Effet pour l'élève                                          | Coût de mise en œuvre                                                                   |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A   | **Recul immédiat** (`deltaMove` négatif : −2/−3 cases) au lieu de `passTurn`        | Revers **visible et instantané**, sans temps mort           | **Nul côté moteur** (`deltaMove` déjà appliqué) : pur changement de donnée              |
| B   | **Dé du prochain tour divisé par deux** (arrondi bas, minimum 1)                    | Le revers **dure un tour** mais l'élève **agit quand même** | Petit ajout moteur : état par équipe `malus_prochain_de` (module dé déjà présent)       |
| C   | **Mini-défi de rattrapage** : QCM sur la case ; réussi = pas de malus, raté = recul | Convertit la punition en **moment d'apprentissage**         | Moyen : réutilise le moteur QCM + branche l'effet sur l'issue                           |
| D   | **Détour narratif** : la case ouvre un feuillet/évènement de lore                   | Le temps « perdu » devient **du récit**                     | Faible : rattache un contenu de zone/feuillet à la case                                 |
| E   | **Petit malus de ressource** (−1 💎, jamais un cœur)                                | Revers léger, sans temps mort                               | **Nul côté moteur** (`deltaGems` déjà appliqué) — éviter les cœurs (valeur de conduite) |

**Recommandation — combiner A + B + C selon la case :**

1. **Par défaut, option A (recul immédiat)** : meilleur rapport effet/coût (zéro code, feedback
   instantané, aucun enfant sur la touche). Une migration de données réécrit en une passe toutes
   les cases `passTurn:true` en `deltaMove:-2` (valeur à caler en test).
2. **Option B (dé ÷ 2 au prochain tour)** — exactement la piste proposée en séance — pour les
   cases où un revers « qui dure » a du sens narratif (tempête, sort adverse). Régler l'arrondi
   (÷2 arrondi bas, plancher 1 pour ne jamais bloquer) et l'afficher (« dé réduit ce tour-ci »).
3. **Option C (mini-défi)** sur une minorité de cases, pour transformer le malus en question
   d'écologie (piste la plus pédagogique).

Éviter tout revers touchant les cœurs (valeur de conduite) ou laissant l'élève sans action.
**Décision à prendre :** proportion A/B/C, valeur du recul, règle d'arrondi du dé.

### 9.3 Donner une vraie dynamique de tour

- **Vraie initiative optionnelle** : un mode « tour par tour » qui désigne réellement l'équipe au
  trait (le vocabulaire le promet déjà, `chapitres-et-progression.md:77-81`), en gardant le mode
  simultané actuel en option.
- **Objectif de round** : un mini-but commun par tour (« la première équipe à 3 bonnes réponses
  gagne un bonus »), pour rythmer les rounds simultanés sans réécrire le moteur.

### 9.4 Recréer de la tension économique (puits de points)

- **Puits réguliers** : péages de zone, coût d'entrée d'un plateau, « entretien » de la mascotte —
  pour contrer l'accumulation durable (`economie-marche-sorts.md:222-226`).
- **Boutique de bonus temporaires** (relançables) : dé bonus, protection d'un tour, indice de
  QCM — des dépenses désirables qui font circuler les gemmes.
- **Plancher configurable** déjà noté au registre (G9) : empêcher de descendre sous X cœurs.

### 9.5 Coopération et compétition

- **Objectifs d'équipe visibles** (collection de feuillets d'un chapitre, carte explorée) avec
  récompense collective.
- **Course aux feuillets** entre équipes, en s'appuyant sur le canal de découverte par zone
  existant (`chapitres-et-progression.md:95-107`).

### 9.6 Cohérence à corriger au passage (doc ↔ code)

- **Le QCM d'entraînement trahit la promesse anti-triche de la doc** : la doc affirme « un élève
  ne peut pas lire la bonne réponse par avance » (`qcm-et-pedagogie.md:126-132`), or l'endpoint
  hors partie (`routes/gl/qcm.js:238-284`) renvoie `correctChoiceId` sans consommer de jeton (cf.
  §3). **À corriger côté code** pour que le comportement rejoigne la promesse écrite.
- **Effets promis mais non appliqués** : la divergence `effet_mecanique` (lu) ↔ `event_config_json`
  (exécuté) est la cause racine de l'inertie (§9.0) ; le contrôle de cohérence de la PR #334 est
  le bon outil pour la résorber au fil du peuplement.

## 10. Plan d'action recommandé

**Lot 1 — Intégrité du jeu (le plus urgent fonctionnellement)**
Consommer le jeton dans `qcm/answer` + ne plus renvoyer `correctChoiceId` en rejeu ; exiger la
position d'équipe dans `present-question` ; poser le cooldown sur la question ; trancher le
comportement des coûts en gemmes des feuillets/zones.

**Lot 2 — Durcissement sécurité**
`authLimiter` sur les 3 routes forgot/reset prof ; protéger/retirer `/api/site-issues` ; relever
le plancher de mot de passe ; abaisser la limite JSON globale ; transactionnaliser les DELETE
tasks/groups.

**Lot 3 — Intégrité BDD**
Transaction + `FOR UPDATE` sur `/assign-group` ; FK/NULL sur `group_id` orphelins ; gérer la FK
RESTRICT des contributions de sorts ; purge des jetons GL.

**Lot 4 — Accessibilité & UX**
Contrastes des gris secondaires ; cibles tactiles ≥ 44px ; zones de carte au clavier ;
`aria-current`/`aria-selected` ; débordement de la navigation basse ; remplacer les
`window.prompt/alert/confirm` par des modales ; corriger le piège de focus.

**Lot 5 — Qualité continue**
Job `npm audit` en CI + `npm audit fix` (pile Socket.IO) ; réduire la rafale de requêtes du
catalogue ; généraliser `useApiResource` pour la déconnexion sur compte supprimé.

**Lot 6 — Cohérence documentaire (docs/reference)**
Aligner `carte-du-royaume.md`/`guide-du-mj.md` sur le mode réel des « tours » ; reformuler
l'encadré « pas de lore » de `gl/presentation.md` ; corriger les renvois « (à rédiger) » et les
mentions de fraîcheur (portraits OLU, doc économie) ; harmoniser la terminologie (carnet
personnel, « Reset mdp », tableaux de rôles) ; documenter le dé virtuel.

**Lot 7 — Évolution du jeu (sur décision du propriétaire, cf. §9)**
Remplacer les cases « passe ton tour » (option A par défaut, B/C selon la case) ; créditer une
récompense automatique sur bonne réponse QCM ; peupler les branches d'effet des cases ; recréer
des puits économiques. À cadrer avant implémentation (proportions, valeurs).

## 11. Points forts

- **Sécurité applicative de bon niveau** : SQL systématiquement paramétré (aucune injection),
  JWT HS256 épinglé contre la confusion d'algorithmes, secret exigé/validé en prod, pipeline
  d'auth distinguant 401/403/503, isolement produit GL bidirectionnel effectif, RBAC réhydraté à
  chaque requête, tokens de reset hachés + usage unique + anti host-poisoning, comparaison à temps
  constant du DEPLOY_SECRET, neutralisation XSS des SVG.
- **Économie GL robuste** : marché et sorts verrouillent brouillon puis joueurs en `FOR UPDATE`,
  revérifient les soldes dans la transaction, échouent en `INSUFFICIENT_BALANCE` ; aucune valeur
  négative atteignable ; anti-rejeu du QCM en partie bien conçu (jeton signé HMAC jamais chiffré,
  `jti` à usage unique consommé en base) ; race conditions double-clic couvertes par tests.
- **Base de données rigoureuse** : migrations idempotentes gardées par `INFORMATION_SCHEMA`,
  garde anti-doublons + tests CI, migrations réparatrices nettoyant les orphelins avant de poser
  les FK, cache RBAC invalidé de façon prouvable, suppression de compte élève transactionnelle et
  complète, backup quotidien + purge RGPD.
- **Frontend soigné** : code splitting généralisé (`React.lazy`, chunks manuels), `useApiResource`
  avec garde anti-course, `DialogShell` unifié (focus trap, restauration, `aria-modal`),
  `prefers-reduced-motion`, labels/`autoComplete` sur l'auth, locale fr-FR sans exception, ton
  remarquablement adapté aux lycéens, robustesse réseau (backoff, mode hors-ligne visite,
  reconnexion Socket.IO, brouillons persistés).
- **Outillage qualité hors normes** : ~850 fichiers de tests avec couverture systématique par
  domaine et tests de non-régression nommés d'après les bugs, CI mature et auto-documentée
  (chaque timeout justifié par un incident daté), documentation vivante et vérifiée, zéro dette de
  marqueurs dans le code.
