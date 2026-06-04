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

| Couche | Emplacement | Usage |
|--------|-------------|--------|
| Infra | `server.js`, `database.js`, `lib/productResolver.js` | Un serveur, isolation JWT `product` |
| Utilitaires | `src/utils/image.js` (`IMAGE_COMPRESSION_PRESETS`), `markdown.js`, `visitMascotState.js`, `mapViewMascotMotion.js` | ForetMap + imports depuis `src/gl/` |
| Noyaux | `src/shared/*`, `lib/shared/*Core.js` | Parité front/back (cadres image, repères, etc.) |
| Packs mascotte | `src/shared/mascot-pack/` (validation UI, preview sprite_cut), `src/utils/glMascotPackToVisit.js` | Studio GL + mapper `sprite_cut` → format visite |
| Miroir serveur GL | `lib/gl-pack/mascotPack.js` via **`npm run sync:gl-pack-lib`** (enchaîné par **`npm run build`**) | Validation Zod `/api/gl/mascots/packs*` sans `src/` |
| Miroir serveur visite | `lib/visit-pack/` via **`npm run sync:visit-pack-lib`** | Validation packs visite |
| Renderer mascotte | `VisitMapMascotRenderer` via `GLMascotRenderer` | Mascottes `foretmap` dans le plateau GL |
| Collab | `lib/shared/contextCommentsCore.js`, `lib/shared/reactionEmojiCore.js` | Routeurs fins `routes/context-comments.js` et `routes/gl/context-comments.js` |
| Progression lecture | `lib/shared/learningAckCore.js`, `src/shared/components/LearningAcknowledgeButton.jsx` | Accusés « lu / appris / étudié » (ForêtMap tutos + GL espèces, glossaire, tutos via `routes/gl/learning.js` et table `gl_learning_acknowledgements`) |
| Statistiques joueurs | `lib/glPlayerStats.js`, `routes/gl/stats.js`, `src/gl/components/GLStatsView.jsx` | Stats perso (`GET /api/gl/stats/me`) et collectives classe (`GET /api/gl/stats/class`, permission `gl.players.manage`) — vitalité + apprentissages |

**À ne pas mutualiser** : tables `gl_*`, RBAC GL, catalogue `glMascotCatalog.js` (ids `gl-*`), styles couleur GL.

**Commentaires contextuels** : types `gl_*` uniquement sur **`/api/gl/context-comments`** (retirés de l’API ForetMap standard pour éviter deux chemins JWT).

## Routage produit

- La résolution de produit se fait via `lib/productResolver.js`.
- Source de vérité :
  - `req.hostname` (`gl.*` => produit `gl`)
  - surcharge possible via header `X-Foretmap-Product` (tests/e2e).
- Fallback SPA :
  - ForetMap => `dist/index.vite.html`
  - GL => `dist/gl.html`

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
- Repères événements (Lot QCM repères) : `event_config_json` sur `gl_chapter_markers` (type `question` : mode fixe ou pool aléatoire filtré biomes/catégories/niveaux/difficulté + sélection fine). Admin : `GLMarkerEventEditor` + `GET /api/gl/qcm/pool-preview`. Jeu : `POST /api/gl/games/:id/markers/:markerId/present-question`, popover `GLQcmPopover` à l'arrivée (`useGLMarkerArrival`), re-déclenchement via `gameplay.marker_question_retrigger`.
- Affichage carte repères : colonnes `display_mode`, `emoji`, `icon_url` sur `gl_chapter_markers` ; normalisation partagée `glMarkerAppearanceCore` ; rendu via `GLBoardMarkers` (texte, emoji ou icône favicon). Défaut question/quiz : emoji `❓`.

Ajouts Lot 2D (édition visuelle carte) :

- `GLChapterMapEditor` : édition visuelle des repères de chapitre alignée avec les conventions ForetMap (coordonnées `%` sur image, sélection, déplacement).
- `GLKingdomMapView` + `GLKingdomZoneEditor` : dessin polygonal des zones royaume à la souris, édition des sommets en direct, sélection de chapitre indépendante de la partie active.
- Socle frontend partagé : `useGlPctMapGestures`, `GLPctMapCanvas`, `GLBoardMarkers` pour homogénéiser les interactions carte GL.

Ajouts Lot 2C (mascottes & équipes) :

- `GET /api/gl/mascots[?gameId=]` : retourne le catalogue (`mascots`) + les `assignments` actuels pour la partie demandée.
- `POST /api/gl/mascots/assign` : assignation transactionnelle d'une mascotte à une équipe. Met à jour `gl_teams.mascot_id` ET upsert dans `gl_mascot_assignments`. Refuse `409` si la mascotte est déjà utilisée par une autre équipe de la même partie ; `404` si la mascotte n'est pas dans le catalogue.

Catalogue de mascottes : source de vérité unique `src/utils/glMascotCatalog.js` (ESM, consommé par le frontend Vite). Le backend l'importe dynamiquement via `lib/glMascotCatalog.js` (cache mémoire). Rendu visuel : composant React `GLMascotAvatar` qui délègue à `GLMascotFallbackSvg` (SVG inline) tant qu'aucun asset Rive/spritesheet n'est livré pour G&L. Les ids portent le préfixe `gl-*` (`gl-gnome-mousse`, `gl-licorne-aube`, …) pour cohabiter avec le catalogue forêt (`renard2-cut-spritesheet`, etc.) sans conflit. Voir aussi `docs/MASCOT_PACK.md` (note divergence catalogue visite vs G&L).

Les endpoints GL exigent un JWT avec claim `product = "gl"`.

### Gameplay paramétrable (toggles `gl_settings`)

Chaque toggle est une clé dans `gl_settings` (modifiable via `PUT /api/gl/admin/settings/:key`, permission `gl.settings.manage`). Tous **désactivés par défaut** → comportement minimal (déplacement de mascotte uniquement, comme avant Lot 2A).

| Toggle (clé `gl_settings`) | Effet quand `true` |
|---|---|
| `gameplay.turns_enabled` | Active la rotation cyclique des équipes (`current_team_id` sur `gl_games`, événement `turn_change`). Les actions joueurs (si activées) ne sont autorisées que pour l'équipe du tour courant. |
| `gameplay.narration_enabled` | Le MJ peut envoyer un événement `narration` (texte affiché en bandeau temporaire chez les joueurs). |
| `gameplay.player_actions_enabled` | Les joueurs peuvent soumettre une demande d'action sur un marker via la modale carte ; insérée dans `gl_action_requests` (`status=pending`). |
| `gameplay.scoring_enabled` | Activation du tableau de scores par équipe (`gl_team_scores`) ; bonus possible à la résolution d'une action acceptée. |
| `gameplay.vitality_enabled` | Points de vie (❤️) et points de pouvoir (💎) **persistants par joueur** (`gl_players`) ; ajustements MJ par joueur ou par équipe (`POST .../vitality/player`, `POST .../vitality/team`), événement `vitality_change`. Pas de réinitialisation entre les parties. |
| `gameplay.default_health_points` | PV initiaux des **nouveaux** joueurs (entier 0–99, défaut `3`). |
| `gameplay.default_power_points` | PP initiaux des **nouveaux** joueurs (entier 0–99, défaut `3`). |

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
  - Réglages : `gameplay.spell_cast_contribution_mode`, `gameplay.spell_cast_team_scope`, `gameplay.spell_cast_mj_only` (lancement réservé au MJ — flux principal)
  - Routes `/api/gl/games/:id/spell-casts/*`, logique `lib/glSpellCast.js`, UI `GLSpellCastWizard` (Sortilèges, carte, popover, **console MJ → Sortilèges**)
  - Événement `spell_cast` (+ `teamId` par contribution) + Socket.IO `gl:spell_cast:draft`

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
- Onglets joueur : Cartes, Biotope, Biocenose, Histoire, Monde, Sortileges, Regles
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

| Besoin | Classe / composant |
|--------|-------------------|
| Entrée de vue | `.fade-in` sur un wrapper (ex. `.gl-main-inner`, pas sur `<main>` fixed) |
| Liste décalée | `.stagger` |
| Modale | `DialogShell` + `fm-modal-overlay` / `fm-modal-panel` |
| Toast fixe | `FixedToast` ou `.fm-toast-anchor` + `.fm-toast` |
| Pulse aide | `.is-attention-pulse` |
| Stats animées | keyframe `statPop` via `.stat-card` / `.gl-stat-card` |

- Hook partagé : [`src/shared/hooks/usePrefersReducedMotion.js`](../src/shared/hooks/usePrefersReducedMotion.js) (popovers, plateau, etc.).
- Variables modale/toast thématisées sous `.gl-app` : `--fm-modal-*`, `--fm-toast-*`.
- Les modules GL (forum, tutoriels, journal de partie, **carnet personnel** `my-journal`, carte royaume, notifications, commentaires contextuels, aide) ont des styles dédiés dans `gl-theme.css` pour rester homogènes avec le shell GL.

### Carnet personnel joueur

- Module `modules.player_journal_enabled` ; limites `gameplay.player_journal_max_chars` / `player_journal_max_assets`.
- Tables `gl_player_journals`, `gl_player_journal_assets` ; API `routes/gl/player-journal.js`.
- UI `GLPlayerJournalView` (joueur), lecture MJ via `GLPlayerJournalReadModal` (statistiques classe, `gl.players.manage`).

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
