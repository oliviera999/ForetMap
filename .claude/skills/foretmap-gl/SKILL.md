---
name: foretmap-gl
description: Sous-produit Gnomes & Licornes (GL) du monorepo ForetMap — routage host, auth produit (joueur/invité/MJ/admin), isolement cross-produit, modules, contenus (chapitres/lore/marché/sorts/QCM), mascottes & cadres d'image GL, styles, tests séquentiels. À utiliser pour toute évolution routes/gl, tables gl_*, src/gl.
---

# Gnomes & Licornes (GL)

Sous-produit **isolé** du monorepo. Détail : `.cursor/rules/foretmap-gl.mdc`,
`.cursor/skills/foretmap-gl-project/SKILL.md`, `docs/GL_ARCHITECTURE.md`.

## Routage & isolement (non négociable)

- Host `gl.*` (ou header `X-Foretmap-Product: gl`) → SPA `gl.html`
  (`src/gl/main.jsx` → `src/gl/AppGL.jsx`), via `lib/productResolver.js`. API sous `/api/gl/*`.
- JWT `product:'gl'` **rejeté** sur les routes ForetMap principales (et inversement). Ne jamais
  brancher une route GL hors `/api/gl/*` ni mélanger les tables `gl_*`. Couvrir l'isolement par un test.

## Auth & RBAC

- Token : JWT claim `product:'gl'` (`signAuthToken({ product:'gl', … })`), vérifié par
  `middleware/requireGlAuth.js`. Profils : joueur, invité (`gl.auth.guest`), MJ/admin + impersonation
  (`gl.auth.impersonate.start/stop`).
- Permissions : `gl.read`, `gl.content.manage`, `gl.players.manage`, `gl.game.manage`,
  `gl.team.manage`, `gl.event.emit`, `gl.mascot.position`, `gl.settings.manage`, `gl.action.request`,
  `gl.spell_cast`. Route admin/MJ → refus explicite d'un joueur (401/403).

## Modules & contenus

- Feature flags `modules.*_enabled` dans `lib/glSettings.js` (validation booléenne stricte côté
  `routes/gl/admin.js`, lus via `GET /api/gl/auth/config`). Tout nouvel onglet → flag + validation.
- Domaines `routes/gl/*` : chapters, kingdom-map, lore, glossary, market, spells, qcm, journal,
  learning, forum, tutorials, species, games, mascots, content, admin, auth. Seed via `npm run gl:import:*`.

## Mascottes / cadres / styles

- Mascottes id `gl-*` ; `GLMascotRenderer` + `useGLMascotStateMachine`. Packs : Zod
  `src/utils/glMascotPack.js` + miroir CJS `lib/gl-pack/mascotPack.js` (`npm run sync:gl-pack-lib`).
- Cadres image : `src/utils/glImageFrame.js` + `lib/glImageFrame.js` (`docs/GL_IMAGE_FRAMES.md`).
- UI : ne charge pas tout `index.css` (seulement `src/shared/styles/*` + `gl-base.css` + `gl-theme.css`) ;
  palette GL locale (préfixe `gl-`), pas de `--forest`/`--leaf`.

## Tests & commits

- Backend `tests/gl-*.test.js` + `tests/helpers/glFixtures.js`, **séquentiels**
  (`--test-concurrency=1 --test-force-exit`). e2e `e2e/gl-*.spec.js`. Matrice `docs/GL_TESTS.md`.
- Commits exclusivement GL : `feat(gl)` / `fix(gl)` / `chore(gl)`.
