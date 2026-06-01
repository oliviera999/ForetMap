# Couverture tests GL

Ce document centralise les commandes et la matrice de couverture pour Gnomes & Licornes.

## Commandes

- Backend GL ciblé: `node --test --test-concurrency=1 --test-force-exit tests/gl-*.test.js`
- Suite backend globale: `npm test`
- UI GL (Vitest): `npm run test:ui`
- E2E GL: `npx playwright test e2e/gl-*.spec.js`
- Snapshot GL: `npm run test:snapshot:gl`
- Charge GL (Artillery): `npm run test:load:gl`

## Backend API

- Auth: `tests/gl-auth.test.js`, `tests/gl-auth-config-me.test.js`, `tests/gl-staff-login.test.js`, `tests/gl-staff-auth.test.js`
- Gameplay: `tests/gl-game-actions.test.js`, `tests/gl-game-turns.test.js`, `tests/gl-game-lifecycle.test.js`, `tests/gl-games.test.js`, `tests/gl-games-roster.test.js`, `tests/gl-game-events-replay.test.js`
- Chapitres/contenus: `tests/gl-chapters-admin.test.js`, `tests/gl-chapter-detail.test.js`, `tests/gl-chapters-admin-mutations.test.js`, `tests/gl-content.test.js`
- Mascottes: `tests/gl-mascots.test.js`, `tests/gl-mascots-errors.test.js`, `tests/gl-mascot-catalog.test.js`
- Admin GL: `tests/gl-admin-classes-players.test.js`, `tests/gl-settings.test.js`
- Utilitaires: `tests/gl-settings-cache.test.js`, `tests/gl-staff-auth-unit.test.js`

## UI (Vitest + RTL)

- `tests-ui/gl/apiGL.test.js`
- `tests-ui/gl/useGLSession.test.jsx`
- `tests-ui/gl/GLAuthView.test.jsx`
- `tests-ui/gl/GLMascotAvatar.test.jsx`
- `tests-ui/gl/GLMascotFallbackSvg.test.jsx`
- `tests-ui/gl/GLUsersAdminView.test.jsx`
- Biocénose (catalogue tuiles + fiche modale) : `tests-ui/gl/GLSpeciesCatalog.test.jsx`, `tests-ui/gl/GLSpeciesDetailModal.test.jsx`

## E2E Playwright GL

- `e2e/gl-foundations.spec.js`
- `e2e/gl-content.spec.js`
- `e2e/gl-game-flow.spec.js`
- `e2e/gl-mascots.spec.js`
- `e2e/gl-player-full-cycle.spec.js`
- `e2e/gl-mj-console.spec.js`
- `e2e/gl-users-admin.spec.js`
- `e2e/gl-socket-reconnect.spec.js`
- `e2e/gl-responsive-accessibility.spec.js`

## Charge et snapshots

- Artillery GL: `load/artillery-gl.yml`
- Snapshot DB GL: `tests/snapshot-gl.test.js`

## QA personae

- Skill: `.cursor/skills/foretmap-gl-qa-personae/SKILL.md`
- Prompt: `docs/QA_GL_PERSONAE_PROMPT.md`
