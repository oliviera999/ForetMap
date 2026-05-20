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
`modules.journal_enabled`, `modules.kingdom_map_enabled`.

Toggle via `PUT /api/gl/admin/settings/modules.*` (validation booléenne stricte).
Lu par le front au login via `GET /api/gl/auth/config`.

## Permissions RBAC GL

`gl.read`, `gl.content.manage`, `gl.players.manage`, `gl.game.manage`,
`gl.team.manage`, `gl.event.emit`, `gl.mascot.position`,
`gl.settings.manage`, `gl.action.request`.

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
- Validation Zod partagée : `src/utils/glMascotPack.js` +
  `lib/gl-pack/mascotPack.js`.
- Studio front : `src/gl/components/GLMascotPackManager.jsx`,
  `GLMascotPackWysiwygEditor.jsx`, `GLMascotPackPreviewPanel.jsx`.
- Renderer multi-mode : `src/gl/components/GLMascotRenderer.jsx`
  + state machine `src/gl/hooks/useGLMascotStateMachine.js`.

## Voir aussi

- `docs/GL_ARCHITECTURE.md`
- `docs/GL_TRANSPOSITION_EXECUTION.md`
- `docs/QA_AUDIT_PERSONAE_PROMPT.md` (section 4 — personae GL)
- `docs/reports/qa-ux-gl-template.md`
