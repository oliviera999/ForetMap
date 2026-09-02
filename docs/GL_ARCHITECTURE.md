# Gnomes & Licornes — Architecture

Ce document décrit l'architecture du second mode **Gnomes & Licornes** (GL) dans la codebase ForetMap.

## Objectif

- Garder un seul dépôt et un seul serveur Node.
- Servir deux produits séparés :
  - `foretmap.olution.info` (ForetMap historique)
  - `gl.olution.info` (Gnomes & Licornes)
- Isoler les sessions, permissions et données GL sans modifier le métier ForetMap.

## Code partagé ForetMap ↔ GL (mutualisation)

Couches **autorisées** (sans fusionner auth, thème `gl-theme` ni catalogues métier) :

| Couche                | Emplacement                                                                                                                           | Usage                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infra                 | `server.js`, `database.js`, `lib/productResolver.js`                                                                                  | Un serveur, isolation JWT `product`                                                                                                                  |
| Base d'URL front      | `src/shared/appBase.js` (`API`, `withAppBase`)                                                                                        | Résolution neutre du `base` Vite ; importable par ForetMap et GL sans tirer une session ni une logique 401 produit                                   |
| Chargement ressource  | `src/hooks/useApiResource.js`                                                                                                         | Hook générique `data/loading/error/reload` avec garde anti-course ; le `fetcher` reste local au produit (`api` ou `apiGL`)                           |
| Utilitaires           | `src/utils/image.js` (`IMAGE_COMPRESSION_PRESETS`), `markdown.js`, `visitMascotState.js`, `mapViewMascotMotion.js`                    | ForetMap + imports depuis `src/gl/`                                                                                                                  |
| Géométrie carte       | `src/utils/zoneGeometry.js` + réexports `visitMapGeometry.js`, `mapImageFit.js`                                                       | Parsing des polygones en % et rectangle `object-fit: contain` partagés visite/biodiversité, alias historiques conservés                              |
| Auto-liens GL         | `src/utils/glTermAutolink.js`                                                                                                         | Fabrique commune glossaire SVT / glossaire lore ; rendu markdown, désinfection et classes CSS restent dans chaque module appelant                    |
| Noyaux                | `src/shared/*`, `lib/shared/*Core.js`                                                                                                 | Parité front/back (cadres image, repères, etc.)                                                                                                      |
| OAuth pur             | `lib/shared/oauthCommon.js`                                                                                                           | Fonctions Google OAuth strictement pures (listes de domaines/e-mails, configuration, autorisation) ; aucune session, cookie, redirection ni claim    |
| Helpers tâches        | `lib/tasks/taskQueries.js`                                                                                                            | Cluster ForetMap partagé entre routes tâches / propositions / inscriptions ; les helpers d'écriture acceptent `dbx`/`tx` pour une transaction        |
| Tirage QCM / lore     | `lib/gl/questionDrawShared.js`                                                                                                        | Sélection commune des questions GL biome et lore, sans dupliquer la logique de pool                                                                  |
| Packs mascotte        | `src/shared/mascot-pack/` (validation UI, preview sprite_cut), `src/utils/glMascotPackToVisit.js`                                     | Studio GL + mapper `sprite_cut` → format visite                                                                                                      |
| Miroir serveur GL     | `lib/gl-pack/mascotPack.js` via **`npm run sync:gl-pack-lib`** (enchaîné par **`npm run build`**)                                     | Validation Zod `/api/gl/mascots/packs*` sans `src/`                                                                                                  |
| Miroir serveur visite | `lib/visit-pack/` via **`npm run sync:visit-pack-lib`**                                                                               | Validation packs visite                                                                                                                              |
| Renderer mascotte     | `VisitMapMascotRenderer` via `GLMascotRenderer`                                                                                       | Mascottes `foretmap` dans le plateau GL                                                                                                              |
| Collab                | `lib/shared/contextCommentsCore.js` (qui s'appuie sur `lib/shared/reactionEmojiCore.js`, lui-même aussi requis par `routes/forum.js`) | Routeurs fins `routes/context-comments.js` et `routes/gl/context-comments.js`                                                                        |
| Progression lecture   | `lib/shared/learningAckCore.js`, `src/shared/components/LearningAcknowledgeButton.jsx`                                                | Accusés « lu / appris / étudié » (ForêtMap tutos + GL espèces, glossaire, tutos via `routes/gl/learning.js` et table `gl_learning_acknowledgements`) |
| Statistiques joueurs  | `lib/glPlayerStats.js`, `routes/gl/stats.js`, `src/gl/components/GLStatsView.jsx`                                                     | Stats perso (`GET /api/gl/stats/me`) et collectives classe (`GET /api/gl/stats/class`, permission `gl.players.manage`) — vitalité + apprentissages   |
| Identité / groupes    | `lib/glGroupBridge.js`, `groups` + `group_members`, `gl_classes.foretmap_group_id`                                                    | Chaque classe GL a un groupe ForetMap miroir ; les nouveaux joueurs GL sont liés à `users` et membres du groupe                                      |

**À ne pas mutualiser** : tables gameplay `gl_*` (hors lien groupe), RBAC JWT GL, sessions, cookies, redirections OAuth, claims, catalogue `glMascotCatalog.js` (ids `gl-*`), styles couleur GL.

**Commentaires contextuels** : types `gl_*` uniquement sur **`/api/gl/context-comments`** (retirés de
l’API ForetMap standard pour éviter deux chemins JWT). ⚠️ **Backend seul à ce jour** : la route est
montée, testée et branchée sur `contextCommentsCore`, mais **aucune UI G&L ne la consomme** — le
composant `GLContextComments` écrit en juillet 2026 n’a jamais été monté et a été retiré au ménage
de la v1.90.1 (récupérable dans l’historique Git). Câbler l’UI reste à faire ; côté ForetMap,
`src/components/context-comments.jsx` est en service et sert de modèle.

## Routage produit

- La résolution de produit se fait via `lib/productResolver.js`.
- Source de vérité :
  - `req.hostname` (`gl.*` => produit `gl`)
  - surcharge possible via header `X-Foretmap-Product` (tests/e2e).
- Fallback SPA :
  - ForetMap => `dist/index.vite.html`
  - GL => `dist/gl.html`

### Pipeline JWT et frontière produit

- Les routeurs `/api/gl/*` sont montés **avant** la garde ForetMap. Toute route GL doit rester
  sous ce préfixe et utiliser l'auth GL dédiée (`middleware/requireGlAuth.js`).
- La garde `/api` ForetMap vérifie le jeton Bearer quand il existe : un JWT `product:"gl"` reçoit
  un **403**, tandis qu'un JWT ForetMap vérifié est mémorisé sur `req.verifiedForetJwt`.
- Les middlewares ForetMap (`requireAuth`, `requirePermission`, `requireTeacher`, `requireProduct`)
  réutilisent ces claims si le jeton est identique, puis réappliquent la contrainte produit avec
  `checkClaimsProduct`. Montés directement (test, hors garde globale), ils retombent sur une
  vérification JWT complète.
- **Signature et vérification passent exclusivement par `lib/auth/jwtPipeline.js`**
  (`signJwtToken` / `verifyJwtToken`), qui épingle l'algorithme **HS256** à la vérification. Ne pas
  rappeler `jsonwebtoken` ailleurs : sans liste d'algorithmes explicite, un jeton forgé avec un
  autre algorithme reste recevable.
- Rappel : un JWT est **signé, pas chiffré** — son contenu est lisible par le porteur. Ne jamais y
  placer de secret (bonne réponse d'un QCM, etc.).
- Gardes de régression : `tests/jwt-pipeline.test.js` (cache de claims, isolement GL, épinglage
  d'algorithme).

## Build frontend

- `vite.config.js` expose trois entrées :
  - `main` (`index.vite.html`)
  - `mascotPackTool` (`mascot-pack-tool.html`)
  - `gl` (`gl.html`)
- Le mode GL est implémenté sous `src/gl/`.

## API GL

Préfixe : `/api/gl`

- Auth : `routes/gl/auth.js` (écran unique : `POST /login` avec `identifier`+mot de passe — joueur `gl_players` puis MJ/Admin ForetMap ; OAuth Google `google/start` mode `auto` par défaut ; alias `staff/login` MJ-only ; joueur Google : `gl_players.email` ou lien `linked_foretmap_user_id` ; admins ForetMap RBAC `admin` → synchro auto `gl_admins` ; profil self-service `PATCH /api/gl/auth/me/profile`, lien ForetMap joueur `POST/DELETE /api/gl/auth/link-foretmap`, changement mot de passe staff `POST /api/gl/auth/staff/change-password`)
- Contenus éditoriaux (pages éditoriales `gl_content_pages`) : `routes/gl/content.js`
- Chapitres et repères (`gl_chapters`, `gl_chapter_markers`) : `routes/gl/chapters.js`
- Gameplay : `routes/gl/games.js`
- Mascottes (catalogue + assignation, `gl_mascot_assignments`) : `routes/gl/mascots.js`
- Admin GL : `routes/gl/admin.js`

Ajouts phase post-fondation :

- `GET /api/gl/admin/content` : listing éditorial (slug, titre, mise à jour), réservé `gl.content.manage`.
- Édition inline des pages `world/rules` via `GLContentPage` (PUT `/api/gl/content/:slug`) ; l’onglet joueur **Sortilèges** utilise le catalogue `gl_spells` filtré par `gl_chapter_spells` (popover fiche, intro `sortileges_markdown`).

Ajouts Lot 2A (gameplay paramétrable) :

- `GET /api/gl/gameplay-settings` : snapshot des toggles de gameplay (joueur + admin).
- `POST /api/gl/games/:id/turn/next` : avance le tour cyclique (refus `409` si `gameplay.turns_enabled=false`).
- `POST /api/gl/games/:id/actions` (joueur) + `POST /api/gl/games/:id/actions/:actionId/resolve` (MJ) : flux d'actions joueurs validées par le MJ.
- `POST /api/gl/games/:id/events` accepte deux nouveaux types : `narration` (texte diffusé) et `score` (delta + raison, persisté dans `gl_team_scores`).

Ajouts Lot 2B (contenus & chapitres) :

- `GET /api/gl/chapters/:slug` : détail d'un chapitre (champs `gl_chapters`) + ses `markers` triés.
- `POST/PUT/DELETE /api/gl/chapters/admin[/:id]` : CRUD chapitres (permission `gl.content.manage` ; refus `409` à la suppression si une partie référence le chapitre).
- `POST /api/gl/chapters/admin/:id/markers`, `PUT/DELETE /api/gl/chapters/admin/markers/:markerId` : CRUD repères de chapitre. La suppression détache d'abord les équipes positionnées sur ce marker (`gl_teams.position_marker_id` → `NULL`) avant l'effacement.
- Front admin `GLChaptersAdminView` : aperçu de la carte chapitre et éditeur visuel des repères (clic pour positionner, glisser pour ajuster), avec persistance via `POST/PUT /api/gl/chapters/admin/.../markers`.
- Repères événements (Lot QCM repères) : `event_config_json` sur `gl_chapter_markers` (type `question` : mode fixe ou pool aléatoire ; **`question.set`** `biome` ou `lore` — biomes filtrés par slug biome, lore par scope chapitre `ch0`…`ch5`/`tous` et `tier_lore`). Admin : `GLMarkerEventEditor` + aperçu pool (`GET /api/gl/qcm/pool-preview` ou `GET /api/gl/lore/qcm/pool-preview`). Catalogues parallèles : tables `gl_qcm_*` (biomes SVT, codes `QCM…`) et `gl_qcm_lore_*` (histoire, codes `LQCM…`). Jeu : `POST /api/gl/games/:id/markers/:markerId/present-question`, popover `GLQcmPopover` à l'arrivée (`useGLMarkerArrival`), re-déclenchement via `gameplay.marker_question_retrigger`.
- Affichage carte repères : colonnes `display_mode`, `emoji`, `icon_url` sur `gl_chapter_markers` ; normalisation partagée `glMarkerAppearanceCore` ; rendu via `GLBoardMarkers` (texte, emoji ou icône favicon). Défaut question/quiz : emoji `❓`.

Ajouts Lot 2D (édition visuelle carte) :

- `GLChapterMapStudio` : studio admin **Contenus → Chapitres** — carte unique avec repères (`GLBoardMarkers`) et zones polygonales (`GLKingdomZoneMapOverlay` + `useGLKingdomZones` / `useGLKingdomZoneEditor`) ; musique de zone si `modules.zone_music_enabled` ; **popover texte/images** par zone (`popoverMarkdown`, `popoverImages`) affiché en partie via `POST /api/gl/games/:id/zones/:zoneId/present-content` et `GLZoneContentPopover` (re-déclenchement `gameplay.zone_content_retrigger` / `gl_games.zone_content_retrigger`).
- Socle frontend partagé : `useGlPctMapGestures`, `GLPctMapCanvas`, `GLBoardMarkers` pour homogénéiser les interactions carte GL.

### Onglet Contenus : bibliothèque, médiathèque et doc de référence

L'onglet admin **Contenus** (`GLContentsAdminView`) agrège pages éditoriales, chapitres,
catalogues XLSX, médiathèque et documentation de référence. Il est réservé à `gl.content.manage` ;
les joueurs ne voient que ce que publient les routes de lecture GL.

#### Bibliothèque de contenus (import en masse)

1. `GET /api/gl/admin/content-library/limits` expose les plafonds effectifs.
2. `POST /api/gl/admin/content-library/analyze` classe les fichiers et exécute les imports en
   **dry-run**, sans écriture en base.
3. L'interface ne coche que les entrées `canApply` sans erreur.
4. `POST /api/gl/admin/content-library/apply` renvoie les fichiers retenus et applique réellement.

Contraintes :

- Transport recommandé : `multipart/form-data`. Le JSON hérité reste réservé aux petits tests et
  subit `FORETMAP_JSON_BODY_LIMIT`.
- Plafonds par défaut : ZIP **50 Mo**, fichier **32 Mo**, décompressé **100 Mo**, **200** fichiers ;
  ajustables par `FORETMAP_CONTENT_LIBRARY_MAX_*` (voir `.env.example`).
- Une sélection contenant un ZIP passe en mode **archive** : le premier ZIP est envoyé, les autres
  fichiers sélectionnés sont ignorés avec un avertissement.
- Une archive est refusée si deux entrées portent le même nom de fichier final (`basename`,
  comparé sans tenir compte de la casse) : l'`apply` référence les fichiers par nom, une collision
  serait ambiguë.
- Natures (`kind`) applicables : `media`, `species`, `glossary`, `lore_glossary`, `spells`, `qcm`,
  `qcm_lore`, `chapters`, `chapter_charte`, `lore_feuillets`. La classification XLSX repose sur les
  noms de feuilles et quelques en-têtes discriminants (QCM lore vs QCM biomes, glossaire lore vs
  glossaire scientifique).
- Les médias appliqués sont écrits dans `uploads/media-library/`, étiquetés `app: 'gl'` dans
  `_keys.json`, puis les manifestes d'assets sont resynchronisés.

Gardes : `tests/content-library-*.test.js` et `tests-ui/gl/GLContentLibrary*.test.jsx`.

#### Médiathèque GL et conventions de fichiers

Le dossier physique est partagé (`uploads/media-library/`), mais l'API le découpe en deux
médiathèques **logiques**, séparées par la seule étiquette `app` de `_keys.json` : les routes GL
listent les médias `app: 'gl'` **et** les fichiers hérités sans étiquette ; les routes ForetMap
masquent ces hérités. Une suppression est refusée si la cible n'appartient pas à la médiathèque de
l'appelant (`assertMediaItemInScope`).

- `GET /api/gl/admin/media-library/usage` — références en base (chapitres, zones, espèces, QCM,
  pages, journaux, intro) ; alimente les badges « Utilisée / Inutilisée ».
- `GET /api/gl/admin/media-library/audit` — conventions attendues : plateaux, biomes, feuillets,
  images d'intro, audio de plateaux, scènes de récit et clés `recit_*` suspectes. Équivalent en
  ligne de commande : `npm run gl:audit:media-keys`.
- `GET /api/gl/admin/media-library/chapter-scenes?chapter=0..5` — scènes de récit d'un chapitre,
  d'après les clés stables `recit_…`.
- `PATCH /api/gl/admin/media-library/scene-meta` — légende, ordre et drapeau de couverture dans
  `_keys.json`. Avec `cover: true`, les autres couvertures du même chapitre sont retirées.

#### Documentation de référence éditable

`routes/gl/reference-docs.js` expose `docs/reference/gl/*.md` dans **Contenus → Doc de référence** :

- le fichier Markdown versionné dans Git reste la base ;
- une édition faite depuis l'application est une **surcouche** en table `gl_reference_docs` ;
- le serveur ne réécrit jamais les fichiers du dépôt ;
- `reset` supprime la surcouche et revient au fichier Git — si le déploiement d'exécution ne
  contient pas `docs/reference/gl`, une surcouche reste lisible, mais un `reset` sans fichier rend
  le document introuvable (**404**) ;
- les slugs sont limités au nom de fichier Markdown (`^[a-z0-9]+(-[a-z0-9]+)*$`, 80 caractères max),
  sans création ni traversée de chemin.

Gardes : `tests/gl-reference-docs.test.js` et `tests-ui/gl/GLReferenceDocsPanel.test.jsx`.

Ajouts Lot 2C (mascottes & équipes) :

- `GET /api/gl/mascots[?gameId=]` : retourne le catalogue (`mascots`) + les `assignments` actuels pour la partie demandée.
- `POST /api/gl/mascots/assign` : assignation transactionnelle d'une mascotte à une équipe. Met à jour `gl_teams.mascot_id` ET upsert dans `gl_mascot_assignments`. Refuse `409` si la mascotte est déjà utilisée par une autre équipe de la même partie ; `404` si la mascotte n'est pas dans le catalogue.

Catalogue de mascottes : source de vérité unique `src/utils/glMascotCatalog.js` (ESM, consommé par le frontend Vite). Le backend l'importe dynamiquement via `lib/glMascotCatalog.js` (cache mémoire). Rendu visuel : composant React `GLMascotAvatar` qui délègue à `GLMascotFallbackSvg` (SVG inline) tant qu'aucun asset Rive/spritesheet n'est livré pour G&L. Les ids portent le préfixe `gl-*` (`gl-gnome-mousse`, `gl-licorne-aube`, …) pour cohabiter avec le catalogue forêt (`renard2-cut-spritesheet`, etc.) sans conflit. Voir aussi `docs/MASCOT_PACK.md` (note divergence catalogue visite vs G&L).

Les endpoints GL exigent un JWT avec claim `product = "gl"`.

#### Droits relus à chaque requête (pas de permissions figées dans le jeton)

Le JWT GL ne porte que l'**identité** (`userType` + `userId`) et le contexte de partie. Les
**droits effectifs sont recalculés à chaque requête** par `middleware/requireGlAuth.js`
(via `lib/auth/glHydration.js`), exactement comme `hydrateAuthFromTokenClaims` côté ForetMap :

1. l'identité est relue dans `gl_players` / `gl_admins` — compte **supprimé ou désactivé** →
   `401` immédiat ; le rôle staff (`gl_admins.role`) fait foi, pas le `roleSlug` du jeton ;
2. les permissions viennent du **catalogue RBAC partagé** (`lib/rbac.js` →
   `buildAuthzPayloadForRoleSlug`), et non plus d'une liste codée en dur côté GL.

Conséquence : retirer un rôle, rétrograder un admin en MJ ou désactiver un joueur prend effet
**à la requête suivante**, sans attendre l'expiration du jeton. Le tableau `permissions` inscrit
dans le JWT à l'émission (`getGlRolePermissions`) n'est plus qu'un affichage pour le client ;
son alignement avec le catalogue est verrouillé par
`tests/gl-permissions-catalog-alignment.test.js`.

Une panne BDD pendant l'hydratation renvoie **`503`** (jamais `401`), pour ne pas provoquer de
boucle de reconnexion côté client. L'invité (`gl_guest`) n'a pas de ligne en base : son identité
reste portée par le jeton, mais ses permissions sont celles du rôle `gl_observateur`.

Historique : cf. `docs/AUDIT_BUGS_2026-07.md` (constat B6).

### Gameplay paramétrable (toggles `gl_settings`)

Chaque toggle est une clé dans `gl_settings` (modifiable via `PUT /api/gl/admin/settings/:key`, permission `gl.settings.manage`). Tous **désactivés par défaut** → comportement minimal (déplacement de mascotte uniquement, comme avant Lot 2A).

| Toggle (clé `gl_settings`)        | Effet quand `true`                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gameplay.turns_enabled`          | Active la rotation cyclique des équipes (`current_team_id` sur `gl_games`, événement `turn_change`). Les actions joueurs (si activées) ne sont autorisées que pour l'équipe du tour courant.                                                                     |
| `gameplay.narration_enabled`      | Le MJ peut envoyer un événement `narration` (texte affiché en bandeau temporaire chez les joueurs).                                                                                                                                                              |
| `gameplay.player_actions_enabled` | Les joueurs peuvent soumettre une demande d'action sur un marker via la modale carte ; insérée dans `gl_action_requests` (`status=pending`).                                                                                                                     |
| `gameplay.scoring_enabled`        | Activation du tableau de scores par équipe (`gl_team_scores`) ; bonus possible à la résolution d'une action acceptée.                                                                                                                                            |
| `gameplay.vitality_enabled`       | Points de vie (❤️) et points de pouvoir (💎) **persistants par joueur** (`gl_players`) ; ajustements MJ par joueur ou par équipe (`POST .../vitality/player`, `POST .../vitality/team`), événement `vitality_change`. Pas de réinitialisation entre les parties. |
| `gameplay.default_health_points`  | PV initiaux des **nouveaux** joueurs (entier 0–99, défaut `3`).                                                                                                                                                                                                  |
| `gameplay.default_power_points`   | PP initiaux des **nouveaux** joueurs (entier 0–99, défaut `3`).                                                                                                                                                                                                  |
| `gameplay.qcm_mj_only`            | Seul le staff MJ peut présenter et valider les QCM en partie (`present-question`, `qcm/answer`) ; les joueurs n’ont plus le popover à l’arrivée sur un repère.                                                                                                   |
| `gameplay.spell_cast_mj_only`     | Seul le staff MJ peut ouvrir l’assistant de lancement de sortilèges.                                                                                                                                                                                             |

**Profils de séance** : combinaisons recommandées applicables en un clic dans Réglages GL — voir [GL_GAMEPLAY_PRESETS.md](GL_GAMEPLAY_PRESETS.md).

Côté serveur : module `lib/glSettings.js` (cache mémoire 30 s, invalidé à chaque PUT `gameplay.*`). Côté client : `apiGL('/api/gl/gameplay-settings')` au login et au déclenchement de chaque event reçu côté MJ ; UI conditionnelle dans `GLGameMasterConsole` et `GLMapView`.

## Isolation de sécurité

- Guard serveur global : un token GL est refusé sur les routes `/api/*` ForetMap.
- Auth GL dédiée via `middleware/requireGlAuth.js`.
- Permissions GL dédiées (`gl.*`) enregistrées dans RBAC (`lib/rbac.js`).
- CORS multi-origines :
  - `FRONTEND_ORIGINS` (CSV) prioritaire
  - fallback `FRONTEND_ORIGIN` (legacy)

## Base de données

Tables GL préfixées `gl_` :

- Fondations (`migrations/080_gl_foundations.sql`)
  - `gl_admins`
  - `gl_classes`
  - `gl_players`
  - `gl_settings`
  - `gl_content_pages`
- Gameplay (`migrations/081_gl_gameplay.sql`)
  - `gl_chapters`
  - `gl_chapter_markers`
  - `gl_games`
  - `gl_teams`
  - `gl_team_members`
  - `gl_game_events`
  - `gl_mascot_assignments`
- Gameplay paramétrable (`migrations/082_gl_gameplay_settings.sql`)
  - `gl_games.current_team_id` (colonne) — équipe dont c'est le tour
  - `gl_team_scores` — score cumulé par équipe et par partie
  - `gl_action_requests` — demandes d'action joueurs (pending / accepted / refused)
  - Seed des toggles `gameplay.*` dans `gl_settings` (tous `false`)
- Marché (`migrations/106_gl_market.sql`, module `modules.market_enabled`)
  - `gl_market_trades` — négociation bilatérale entre deux joueurs d’une classe
  - `gl_market_trade_sides` — offre par joueur + case « J’accepte »
  - `gl_market_trade_messages` — fil de discussion par échange
  - Routes `/api/gl/market/*`, logique `lib/glMarket.js`, UI `GLMarketView`
- Lancement de sortilèges (`migrations/109_gl_spell_cast.sql`, `110_gl_spell_cast_mj_only.sql`, `113_gl_spell_cast_game_scope.sql`, module `modules.spell_cast_enabled`)
  - Après déploiement d’un lot touchant les sortilèges : vérifier `schema_version >= 113` et la colonne `gl_spell_cast_drafts.roster_scope` (redémarrage Node pour appliquer les migrations au boot).
  - `gl_spell_cast_drafts` / `gl_spell_cast_contributions` — pool collaboratif ; `roster_scope` : `team` (joueur, une équipe) ou `game` (staff MJ, toutes équipes via `gl_team_members`)
  - Coût : `cout_gemmes` → PP (💎), `cout_coeurs` → PV (❤️) sur `gl_players` ; débit au `launch`, stats via événement `spell_cast`
  - Réglages : `gameplay.spell_cast_contribution_mode`, `gameplay.spell_cast_team_scope`, `gameplay.spell_cast_mj_only` (G8 — défaut `false` : les joueurs lancent ; le profil de séance « MJ + tours » le passe à `true` pour un lancement réservé au MJ, cf. `docs/GL_GAMEPLAY_PRESETS.md`)
  - Routes `/api/gl/games/:id/spell-casts/*`, logique `lib/glSpellCast.js`, UI `GLSpellCastWizard` (Sortilèges, carte, popover, **console MJ → Sortilèges**)
  - Événement `spell_cast` (+ `teamId` par contribution) + Socket.IO `gl:spell_cast:draft`
  - **L'effet du sort n'est pas exécuté** : `effet_court`/`effet_detaille`/`portee`/`cible`/`timing`/`limite_usage`/`cumul` sont du texte affiché, jamais interprété — seul le coût est joué, l'effet est appliqué à la main par le MJ. Chaîne complète et points d'attention : [`docs/AUDIT_SORTILEGES.md`](AUDIT_SORTILEGES.md)

## Temps réel

- Socket.IO conserve le canal historique ForetMap.
- Ajout GL :
  - abonnement client `subscribe:gl-game`
  - room `gl:game:{id}`
  - émission serveur `gl:game:event` via `emitGlGameEvent()`
  - abonnement client `subscribe:gl-class` (marché)
  - room `gl:class:{id}`
  - émission serveur `gl:market:trade-changed` via `emitGlMarketTradeChanged()`

## Frontend GL (lot actuel)

- Shell : `src/gl/AppGL.jsx`
- Auth commune (identifiant + mot de passe) et OAuth Google (mode auto)
- Onglets joueur : Cartes, La nature (Écosystèmes / Biodiversité / Glossaire scientifique), L’aventure (Histoire / Carnet Sélène / Sortilèges), Le monde G&L, Les joueurs, Journaux
- Onglets admin : utilisateurs, reglages, mascottes, console MJ
- Réutilisation renderer mascotte via `VisitMapMascotRenderer`
- Onglet admin `Contenus` pour piloter les pages éditoriales.

### Cohérence esthétique avec ForetMap

- GL charge directement la couche partagée puis le thème local (sans tout `index.css`) :
  - [`src/shared/styles/motion.css`](../src/shared/styles/motion.css)
  - [`src/shared/styles/modal-shell.css`](../src/shared/styles/modal-shell.css)
  - [`src/shared/styles/toast-shell.css`](../src/shared/styles/toast-shell.css)
  - [`src/shared/styles/visit-map-mascot.css`](../src/shared/styles/visit-map-mascot.css)
  - [`src/gl/styles/gl-base.css`](../src/gl/styles/gl-base.css)
  - [`src/gl/styles/gl-theme.css`](../src/gl/styles/gl-theme.css)
- ForetMap importe les mêmes fichiers `src/shared/styles/*` via [`src/index.css`](../src/index.css).
- Les couleurs GL restent locales (hex dans `gl-theme.css`), sans bascule vers la palette ForetMap.

#### Quand utiliser quoi (effets visuels)

| Besoin        | Classe / composant                                                       |
| ------------- | ------------------------------------------------------------------------ |
| Entrée de vue | `.fade-in` sur un wrapper (ex. `.gl-main-inner`, pas sur `<main>` fixed) |
| Liste décalée | `.stagger`                                                               |
| Modale        | `DialogShell` + `fm-modal-overlay` / `fm-modal-panel`                    |
| Toast fixe    | `FixedToast` ou `.fm-toast-anchor` + `.fm-toast`                         |
| Pulse aide    | `.is-attention-pulse`                                                    |
| Stats animées | keyframe `statPop` via `.stat-card` / `.gl-stat-card`                    |

- Hook partagé : [`src/shared/hooks/usePrefersReducedMotion.js`](../src/shared/hooks/usePrefersReducedMotion.js) (popovers, plateau, etc.).
- Variables modale/toast thématisées sous `.gl-app` : `--fm-modal-*`, `--fm-toast-*`.
- Les modules GL (forum, tutoriels, journal de partie, **carnet personnel** `my-journal`, musique de zones, notifications, aide) ont des styles dédiés dans `gl-theme.css` pour rester homogènes avec le shell GL. (Les styles `.gl-context-comments` ont été retirés en v1.90.1 avec le composant jamais monté ; à réécrire le jour où l’UI sera câblée.)

### Carnet personnel joueur

> Documentation dédiée : **[docs/GL_CARNET_JOUEUR.md](GL_CARNET_JOUEUR.md)** (« Mon journal » — vue d'ensemble, articles, imports d'éléments appris, API, composants).

- Carnet organisé en **articles** (titre optionnel + texte markdown et/ou illustrations ; article « média seul » possible). Module `modules.player_journal_enabled`.
- Plafonds `gameplay.player_journal_max_chars` / `player_journal_max_assets` (défaut `0` = illimité, plafond optionnel **par article** réglable par le MJ/admin).
- Tables `gl_player_journal_articles`, `gl_player_journal_article_assets`, `gl_player_journal_imports` ; API `routes/gl/player-journal.js` (CRUD articles + médias + imports).
- UI `GLPlayerJournalView` (fil chronologique articles + imports) avec `GLPlayerJournalArticleCard` (éditeur) et `GLPlayerJournalImportCard` (élément importé), lecture MJ via `GLPlayerJournalReadModal` (statistiques classe, `gl.players.manage`).

#### Import d'éléments appris

- Le joueur peut **importer dans son carnet** un élément du site une fois **marqué appris/lu/découvert** (`gl_learning_acknowledgements`), marquage éventuellement **quiz-gaté** (`gl_resource_question_links` / `gl_resource_gating_policy`). Types couverts : espèce, glossaire, tutoriel, **glossaire lore, feuillet, page de contenu, écosystème (biome)**.
- Backend : accusé générique `POST /api/gl/learning/mark/:resourceType/:ref` (types étendus dans `GL_MARKABLE`, `GL_RESOURCE_TYPES`, `LEARNING_TARGET_TYPES`) ; registre d'existence/titre `lib/glLearnableResources.js` ; import gaté sur l'acquisition (`POST /api/gl/player-journal/me/imports`).
- Front : contrôle réutilisable `GLLearnAndImport` (marquer + importer) et `GLJournalImportButton`, déposés sur les pages d'éléments (écosystèmes, biodiversité, glossaires, tutoriels, feuillets, pages de contenu). L'onglet cible du lien « Voir » est mappé dans `utils/glJournalImportMeta.js`.

### Lore — Carnet de Sélène et glossaire narratif

Deux lexiques **distincts** : glossaire SVT (`gl_glossary_*`, routes `/api/gl/glossary/*`) et glossaire lore (`gl_lore_glossary_*`, routes `/api/gl/lore/glossary/*`). Seul le rendu des feuillets combine les auto-liens (SVT sur `ancrage_scientifique`, lore sur `texte`).

| Couche      | Emplacement                                                                                                  | Rôle                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schéma      | migrations `117_gl_lore_carnet.sql`, `157_gl_feuillet_attribution.sql`                                       | `gl_lore_plateaux`, `gl_lore_feuillets`, `gl_lore_glossary_terms`, `gl_lore_glossary_relations`, `gl_game_feuillet_states` (+ `discovered_by_player_id` / `discovered_by_name` / `discovered_source`) ; surcharges partie sur `gl_games` (`lore_*`)                                                                                                              |
| Import      | `lib/glLoreFeuilletsImport.js`, `lib/glLoreGlossaryImport.js`                                                | XLSX `data/gl/corpus-feuillets-selene.xlsx`, `glossaire-lore-gnomes-et-licornes.xlsx` ; scripts `npm run gl:import:lore-feuillets`, `gl:import:lore-glossary`                                                                                                                                                                                                    |
| Runtime     | `lib/glLoreFeuillets.js`, `glLoreFeuilletRetrigger.js`, `glLoreFeuilletEffects.js`, `glLoreGlossaryMatch.js` | Progression, re-déclenchement, effacement/gemmes/cœurs, filtre spoiler                                                                                                                                                                                                                                                                                           |
| Accès       | `routes/gl/lore.js`, `lib/glLoreFeuilletPreview.js`                                                          | **Feuillets non lisibles par défaut** : liste joueur scopée aux biomes des chapitres joués, **aperçu verrouillé** (titre + `lore_feuillet_preview_fields`) tant que non trouvé ; MJ intégral                                                                                                                                                                     |
| Acquisition | `lib/glFeuilletAcquisition.js`, `glFeuilletChapterPool.js`, `glBiomePays.js`                                 | **Stratégie ③** : consultation gatée (QCM) → attribution d'un feuillet du pool du chapitre à l'équipe, avec découvreur ; branché sur `routes/gl/learning.js` (`feuilletRevealed`) + canal espèce (`glLoreFeuilletSpeciesReveal.js`)                                                                                                                              |
| API         | `routes/gl/lore.js` (`/api/gl/lore/*`)                                                                       | Lecture feuillets/glossaire, `present`/`read`/`hold`, admin import/export                                                                                                                                                                                                                                                                                        |
| Réglages    | `lib/glSettings.js`, `GLSettingsView`, console MJ                                                            | Modules `lore_carnet_enabled`, `lore_glossary_enabled` ; gameplay `lore_feuillet_retrigger`, `lore_feuillet_preview_fields`, `lore_feuillet_acquisition_enabled`, `lore_feuillet_acquisition_channels`, `lore_effacement_enabled`, `lore_gemme_costs_enabled`, `lore_heart_rewards_enabled`, `lore_spoiler_max_level` ; cascade NULL sur `gl_games` → plateforme |
| Carte       | `useGLLoreFeuilletArrival`, `GLFeuilletDiscoveryPopover`                                                     | Déclenchement à l’entrée zone (`kingdom_zone_id` ou heuristique `zone_label` / `plateau_number` / `biome_slug`)                                                                                                                                                                                                                                                  |
| UI joueur   | `GLSeleneCarnetView`, `GLLoreGlossaryView`, `GLLoreGlossaryPopover`, `GLLoreGlossaryMarkdown`                | Onglets `selene-carnet`, `lore-glossary` ; badge 🔒 + « Découvert par … » ; styles `mode_apparition` / effacement dans `gl-theme.css`                                                                                                                                                                                                                            |
| Admin       | `GLContentsAdminView` (sous-onglets Carnet Sélène / Glossaire lore), `GLKingdomZoneFeuilletLinker`           | Import XLSX, liaison feuillet ↔ zone polygonale                                                                                                                                                                                                                                                                                                                  |
| Journal     | `lib/glJournalPresent.js`                                                                                    | Types `feuillet_discovered`, `feuillet_read`, `feuillet_held`, `feuillet_effaced`                                                                                                                                                                                                                                                                                |

**Zone narrative vs zone carte** : le champ Excel `zone` alimente `zone_label` / `plateau_number` ; la FK `kingdom_zone_id` reste NULL jusqu’à assignation admin (studio carte).

**Accessibilité** : `texte_accessible` servi par défaut aux joueurs si présent ; bascule narratif / accessible dans le carnet.

Tests : `tests/gl-lore-import.test.js`, `tests/gl-lore-feuillets.test.js`, `tests/gl-lore-feuillet-preview.test.js`, `tests/gl-lore-feuillet-access.test.js`, `tests/gl-feuillet-acquisition-pure.test.js`, `tests/gl-feuillet-acquisition.test.js`, `tests-ui/gl/GLSeleneCarnetView.test.jsx`. Accès & acquisition détaillés dans `docs/AUDIT_FEUILLETS_ACCES.md`. Doc API section `/api/gl/lore/*`, données `data/gl/README.md`.

### Cadres d'image configurables

- Modèle partagé : `src/utils/glImageFrame.js` (`lib/glImageFrame.js` côté serveur).
- Éditeur visuel : `GLImageFrameEditor` (charte, markdown, chapitre, avatar).
- Charte : `platform.brand.slots.*.frame` (via `PUT /api/gl/admin/settings/platform.brand`).
- Chapitres : `mapImageFrame` persisté en base (`gl_chapters.map_image_frame_json`).
- Markdown : attribut `data-gl-frame` normalisé côté `renderMarkdownToSafeHtml`.
- Détails et exemples : `docs/GL_IMAGE_FRAMES.md`.

## Migration de contenu WordPress

Source recommandée : API publique WordPress de `yo.olution.info` (avec canonical `www.yo.olution.info`).

- Config : `scripts/gl-import-wp.config.json`
- Script : `scripts/gl-import-wp.js`
- Commande : `npm run gl:import:wp`

Modes disponibles :

- `--dry-run` (défaut) : export markdown dans `tmp/gl-wp-import/*.md`.
- `--apply` : UPSERT direct dans la table cible.
- `--target=brand` : cible `gl_settings` (`platform.title`, `platform.subtitle`, `platform.brand`).
- `--target=pages` (défaut) : cible `gl_content_pages` (mapping `slugMap`).
- `--target=chapters` (Lot 2B) : cible `gl_chapters`, en utilisant la clé `chapterMap` de la config pour ne retenir que les pages WP référencées comme chapitres GL (`slug`, `biome`, `mapImageUrl`, `orderIndex`).
- `--target=all` : enchaîne `brand` puis `pages` et, si `chapterMap` est renseigné, `chapters`.

Le mapping de slugs est configurable (ex. `le-monde-de-gnomes-licornes -> world` pour les pages, et `chapitre-1-la-foret-magique -> { slug: foret-magique, ... }` pour les chapitres). La config accepte aussi `canonicalHost` (URL canonique WordPress, ex. `www.yo.olution.info`) et `brandMap` (fallback logo).

## Variables d'environnement utiles

- `FRONTEND_ORIGINS`
- `GL_FRONTEND_ORIGIN`
- `GL_GOOGLE_OAUTH_CLIENT_ID`
- `GL_GOOGLE_OAUTH_REDIRECT_URI`
- `GL_GOOGLE_OAUTH_ALLOWED_DOMAINS`
- `GL_GOOGLE_OAUTH_ALLOWED_EMAILS`
- `GL_PROD_BASE_URL`

## Vérification rapide

- Build : `npm run build` (doit générer `dist/gl.html`)
- API : `GET /api/gl/chapters`
- Santé : `npm run deploy:check:prod` (check ForetMap + GL si `GL_PROD_BASE_URL`)
