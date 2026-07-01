# Couverture tests GL

Ce document centralise les commandes et la matrice de couverture pour Gnomes & Licornes.

**Inventaire (juin 2026)** : **118** fichiers `tests/gl-*.test.js`, **87** fichiers `tests-ui/gl/**`, **21** scénarios `e2e/gl-*.spec.js`.

## Commandes

- Backend GL ciblé : `node --test --test-concurrency=1 --test-force-exit tests/gl-*.test.js`
- Suite backend globale : `npm test`
- UI (Vitest, ForetMap + GL) : `npm run test:ui` — **exécuté en CI** après la suite backend
- E2E GL : `npx playwright test e2e/gl-*.spec.js`
- Snapshot GL : `npm run test:snapshot:gl`
- Charge GL (Artillery) : `npm run test:load:gl`

## Backend API (`tests/gl-*.test.js`)

### Auth et session

- `gl-auth.test.js`, `gl-auth-config-me.test.js`, `gl-auth-forgot-password.test.js`, `gl-auth-helpers.test.js`
- `gl-staff-login.test.js`, `gl-staff-auth.test.js`, `gl-staff-auth-unit.test.js`
- `gl-guest-mode.test.js` — Mode Découverte invité (`POST /api/gl/auth/guest`, demo-feuillets)
- `gl-player-google-auth.test.js`, `gl-profile.test.js`, `gl-intro.test.js`, `gl-intro-lib.test.js`

### Gameplay et parties

- `gl-game-actions.test.js`, `gl-game-turns.test.js`, `gl-game-lifecycle.test.js`, `gl-game-status.test.js`, `gl-game-access.test.js`
- `gl-games.test.js`, `gl-games-roster.test.js`, `gl-games-runtime.test.js`, `gl-games-query-validation.test.js`
- `gl-game-events-replay.test.js`, `gl-journal.test.js`, `gl-journal-query-validation.test.js`
- `gl-vitality.test.js`, `gl-virtual-dice.test.js`, `gl-market.test.js`, `gl-market-query-validation.test.js`
- `gl-spell-cast.test.js`, `gl-feuillet-zone-present.test.js`, `gl-feuillet-zones-loader.test.js`

### Chapitres, contenus, lore

- `gl-chapters-admin.test.js`, `gl-chapters-admin-mutations.test.js`, `gl-chapter-detail.test.js`
- `gl-chapters-helpers.test.js`, `gl-chapters-import.test.js`, `gl-chapters-validation.test.js`
- `gl-chapter-biomes.test.js`, `gl-chapter-biomes-lib.test.js`, `gl-chapter-charte-import.test.js`, `gl-chapter-spells.test.js`
- `gl-content.test.js`, `gl-content-import-export.test.js`, `gl-import-wp.test.js`
- `gl-lore-helpers.test.js`, `gl-lore-feuillets.test.js`, `gl-lore-feuillet-species-reveal.test.js`, `gl-lore-import.test.js`, `gl-lore-query-validation.test.js`
- **Accès & acquisition feuillets** : `gl-lore-feuillet-preview.test.js` (aperçu verrouillé), `gl-lore-feuillet-access.test.js` (scoping biomes joués, masquage, réglage aperçu), `gl-feuillet-acquisition-pure.test.js` (pool chapitre / pays, canaux), `gl-feuillet-acquisition.test.js` (attribution + pool ③)
- `gl-media-chapter-link.test.js` — scènes récit, métas `_keys.json`, collisions clé stable

### Glossaire, QCM, espèces, sorts

- `gl-glossary-catalog.test.js`, `gl-glossary-admin-crud.test.js`, `gl-glossary-import-lib.test.js`, `gl-glossary-validation.test.js`, `gl-glossary-autolink.test.js`
- `gl-qcm-catalog.test.js`, `gl-qcm-choices.test.js`, `gl-qcm-import-lib.test.js`, `gl-qcm-mj-only.test.js`, `gl-qcm-question-query.test.js`, `gl-qcm-query-validation.test.js`
- `gl-qcm-lore-catalog.test.js`, `gl-qcm-lore-import.test.js`
- `gl-species-catalog.test.js`, `gl-species-admin-crud.test.js`, `gl-species-import-lib.test.js`, `gl-species-validation.test.js`
- `gl-spells-catalog.test.js`, `gl-spells-admin-crud.test.js`, `gl-spells-import-lib.test.js`, `gl-spells-validation.test.js`

### Mascottes, médias, carte

- `gl-mascots.test.js`, `gl-mascots-errors.test.js`, `gl-mascots-query-validation.test.js`
- `gl-mascot-catalog.test.js`, `gl-mascot-pack-to-visit.test.js`, `gl-visit-map-mascot-css.test.js`
- `gl-image-frame.test.js`, `gl-image-frame-parity.test.js`, `gl-asset-manifest.test.js`
- `gl-zone-content.test.js`, `gl-zone-content-detect.test.js`, `gl-map-zone-detect.test.js`, `gl-zone-at-pct.test.js`
- `gl-kingdom-map-query-validation.test.js`, `gl-biomes-registry.test.js`, `gl-plateau-board-slug.test.js`, `gl-plateau-audio-slug.test.js`

### Admin, réglages, RBAC

- `gl-admin-classes-players.test.js`, `gl-admin-helpers.test.js`, `gl-admin-query-validation.test.js`
- `gl-players-admin.test.js`, `gl-players-import.test.js`, `gl-player-journal.test.js`, `gl-player-journal-lib.test.js`, `gl-player-stats.test.js`
- `gl-settings.test.js`, `gl-settings-cache.test.js`, `gl-rbac.test.js`, `gl-brand.test.js`
- `gl-diagnostics.test.js`, `gl-realtime.test.js`, `gl-product-routing.test.js`

### Validation Zod (O7) et utilitaires

- `gl-learning.test.js`, `gl-learning-validation.test.js`
- `gl-forum-query-validation.test.js`, `gl-context-comments-query-validation.test.js`, `gl-tutorials-query-validation.test.js`, `gl-stats-query-validation.test.js`
- `gl-marker-appearance.test.js`, `gl-marker-effects.test.js`, `gl-marker-lore-question-pool.test.js`, `gl-marker-present-question.test.js`, `gl-marker-question-pool.test.js`
- `gl-norm-map-coords.test.js`, `gl-point-in-polygon.test.js`, `gl-pack-lib-mirror.test.js`, `gl-collab-extensions.test.js`

## UI Vitest (`tests-ui/gl/` — 87 fichiers)

Principales zones :

- **Session / shell** : `useGLSession.test.jsx`, `GLAuthView.test.jsx`, `GLTopBar.test.jsx`, `glAppShellHelpers.test.js`, `GLAppBanners.test.jsx`, `useGLOverlays.test.jsx`
- **Plateau / carte** : `GLGameBoard.test.jsx`, `GLBoardMascot.test.jsx`, `GLBoardMarkers.test.jsx`, `useGLBoardMascotMotion.test.js`, `useGlBoardImageFit.test.js`, `useGLMarkerArrival.test.js`, `useGLKingdomZones.test.js`
- **Glossaire / QCM** : `GLGlossaryView.test.jsx`, `GLGlossaryTermList.test.jsx`, `GLGlossaryTermForm.test.jsx`, `glGlossaryEditorForm.test.js`, `GLQcmModal.test.jsx`, `glQcmCatalogPanel.test.js`, `glQcmDisplay.test.js`
- **Espèces / sorts** : `GLSpeciesCatalog.test.jsx`, `GLSpeciesDetailModal.test.jsx`, `glSpeciesEditorForm.test.js`, `GLSpellCastWizard.test.jsx`, `glSpellsEditorForm.test.js`
- **Admin contenus** : `GLContentLibraryView.test.jsx`, `GLContentLibraryAuditPanel.test.jsx`, `GLChapterMapStudio.test.jsx`, `glChapterRecitConvention.test.js`, `glStorySceneRefs.test.js`, `glChapterIllustration.test.js`
- **MJ / feuillets** : `GLGameMasterConsole.test.jsx`, `GLFeuilletDiscoveryPopover.test.jsx`, `GLSeleneCarnetView.test.jsx`, `GLVirtualDicePopover.test.jsx`
- **API client** : `apiGL.test.js`

Liste complète : `Get-ChildItem tests-ui/gl -Recurse -Include *.test.js,*.test.jsx`.

## E2E Playwright GL (`e2e/gl-*.spec.js`)

- `gl-foundations.spec.js` — socle navigation GL
- `gl-content.spec.js` — contenus / chapitres
- `gl-game-flow.spec.js` — parcours partie
- `gl-mascots.spec.js` — mascottes
- `gl-player-full-cycle.spec.js` — cycle joueur complet
- `gl-mj-console.spec.js` — console maître du jeu
- `gl-users-admin.spec.js` — admin utilisateurs / impersonate
- `gl-socket-reconnect.spec.js` — reconnexion temps réel
- `gl-responsive-accessibility.spec.js` — responsive / a11y
- `gl-player-journal.spec.js` — carnet personnel
- `gl-guest-discovery.spec.js` — Mode Découverte (API invité, onglets, dé → feuillets → mur de fin)
- `gl-intro.spec.js` — overlay intro
- `gl-profile.spec.js` — profil joueur
- `gl-stats.spec.js` — statistiques joueur
- `gl-media-assets.spec.js` — liaison médias médiathèque
- `gl-virtual-dice.spec.js` — dés virtuels (joueur connecté)
- `gl-market.spec.js`, `gl-zone-music.spec.js`, `gl-marker-question.spec.js`
- `gl-chapters-map-editor.spec.js`, `gl-kingdom-map-editor.spec.js`

## E2E Playwright ForetMap (hors GL)

- `e2e/plants-biodiversity.spec.js` — onglet Biodiversité (prof)
- `e2e/stats-foretmap.spec.js` — onglet Stats (prof)
- `e2e/admin-impersonation.spec.js` — prise de contrôle admin
- `e2e/observations-notebook.spec.js` — carnet observations élève
- `e2e/pedago-quiz.spec.js`, `e2e/pedago-food-web.spec.js`, `e2e/pedago-glossary.spec.js` — pédagogie biodiversité élève

## Charge et snapshots

- Artillery GL : `load/artillery-gl.yml`
- Snapshot DB GL : `tests/snapshot-gl.test.js`

## QA personae

- Skill : `.cursor/skills/foretmap-gl-qa-personae/SKILL.md`
- Prompt : `docs/QA_GL_PERSONAE_PROMPT.md`
