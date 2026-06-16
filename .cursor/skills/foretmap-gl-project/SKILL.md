---
name: foretmap-gl-project
description: Donne le contexte du sous-module Gnomes & Licornes (GL) dans le monorepo ForetMap. À utiliser pour toute évolution GL (auth joueur/MJ, parties, mascottes, contenus, modules, MCP).
---

# Sous-module GL (Gnomes & Licornes)

## Quand utiliser

- Évolution d'une route `routes/gl/*`, table `gl_*` ou composant `src/gl/`.
- Ajout / modification de modules GL (mascottes, forum, commentaires contextuels,
  notifications, tutoriels, journal, carte royaume).
- Diagnostics ou MCP côté GL (`gl_public_health`, `gl_diagnostics`).

## Architecture

- Routage host (`gl.*`) géré par `lib/productResolver.js`.
- Entrée Vite dédiée `gl.html` → `src/gl/main.jsx` → `src/gl/AppGL.jsx`.
- Backend séparé sous `/api/gl/*` (auth, content, chapters, games, mascots,
  admin, context-comments, forum, tutorials, journal, kingdom-map).
- Auth GL : JWT avec `product: 'gl'`, vérifié par `middleware/requireGlAuth.js`.
  Les routes ForetMap rejettent ce token (cf. `server.js`).
- Tables : migrations `080_gl_foundations.sql` à `087_gl_kingdom_map.sql`.
- Settings GL : `lib/glSettings.js` (gameplay + modules) ; clés
  `gameplay.*` et `modules.*`.

## Modules activables (drapeaux)

`modules.mascot_packs_enabled`, `modules.context_comments_enabled`,
`modules.forum_enabled`, `modules.notifications_enabled`,
`modules.tutorials_enabled`, `modules.help_enabled`,
`modules.journal_enabled`, `modules.player_journal_enabled`,
`modules.zone_music_enabled`,
`modules.market_enabled`, `modules.spell_cast_enabled`,
`modules.virtual_dice_enabled`.

Toggle via `PUT /api/gl/admin/settings/modules.*` (validation booléenne stricte).
Lu par le front au login via `GET /api/gl/auth/config`.

## Permissions RBAC GL

`gl.read`, `gl.content.manage`, `gl.players.manage`, `gl.game.manage`,
`gl.team.manage`, `gl.event.emit`, `gl.mascot.position`,
`gl.settings.manage`, `gl.action.request`.

## Conventions UI GL

- Le front GL charge **sans** tout `index.css` :
  - `src/shared/styles/motion.css`, `modal-shell.css`, `toast-shell.css`
  - `src/gl/styles/gl-base.css` (reset, emoji, bannières rôle)
  - `src/gl/styles/gl-theme.css`
- Garder la palette GL locale (hex dans `gl-theme.css`), sans remplacer par `--forest`, `--leaf`, etc.
- Effets visuels partagés (`src/shared/styles/`) :
  - motion : `.fade-in`, `.stagger`, `.animate-pop`, `.is-attention-pulse`
  - modales : `DialogShell` + `fm-modal-overlay` / `fm-modal-panel`
  - toasts : `FixedToast` ou `.fm-toast-anchor` + `.fm-toast`
- Animation d’entrée : préférer `.gl-main-inner.fade-in` plutôt que `.gl-main.fade-in` (évite le piège `transform` sur les portails).
- Hook `usePrefersReducedMotion` : `src/shared/hooks/` (réexport GL dans `src/gl/hooks/`).
- Toute nouvelle vue GL : styles métier dans `gl-theme.css` (préfixe `gl-`).

## Convention tests

- Backend : `tests/gl-*.test.js` avec `tests/helpers/glFixtures.js`.
- Toujours `--test-concurrency=1 --test-force-exit` pour éviter deadlocks
  schéma partagé (réinitialisation BDD).
- e2e : `e2e/gl-*.spec.js` (Playwright) avec serveur `npm run start:e2e`.

## Studio mascottes

- Catalogue local : `src/utils/glMascotCatalog.js`.
- Packs persistés : tables `gl_mascot_packs`, `gl_mascot_pack_assets`,
  `gl_mascot_sprite_library` ; routes `/api/gl/mascots/packs*` et
  `/api/gl/mascots/sprite-library*` (permission `gl.content.manage`).
- Validation Zod : `src/utils/glMascotPack.js` + miroir CJS
  `lib/gl-pack/mascotPack.js` (**`npm run sync:gl-pack-lib`**, enchaîné par le build).
- UI / preview partagée : `src/shared/mascot-pack/`, conversion
  `src/utils/glMascotPackToVisit.js` pour `sprite_cut` → renderer visite.
- Studio front : `src/gl/components/GLMascotPackManager.jsx`,
  `GLMascotPackWysiwygEditor.jsx`, `GLMascotPackPreviewPanel.jsx`.
- Renderer multi-mode : `src/gl/components/GLMascotRenderer.jsx`
  - state machine `src/gl/hooks/useGLMascotStateMachine.js`.

## Cadres d'image GL

- Modèle partagé : `src/utils/glImageFrame.js` (frontend) et `lib/glImageFrame.js` (backend).
- Éditeur visuel : `src/gl/components/GLImageFrameEditor.jsx`.
- Charte : `platform.brand.slots.*.frame` (`GLBrandEditor`, `GLSettingsView`, validation `routes/gl/admin.js`).
- Chapitres : `mapImageFrame` (`routes/gl/chapters.js`, migration `091_gl_chapters_map_image_frame.sql`).
- Markdown : attribut `data-gl-frame` nettoyé/normalisé dans `src/utils/markdown.js`.
- Référence fonctionnelle : `docs/GL_IMAGE_FRAMES.md`.

## Voir aussi

- `docs/GL_ARCHITECTURE.md`
- `docs/GL_TRANSPOSITION_EXECUTION.md`
- `docs/QA_AUDIT_PERSONAE_PROMPT.md` (section 4 — personae GL)
- `docs/reports/qa-ux-gl-template.md`
