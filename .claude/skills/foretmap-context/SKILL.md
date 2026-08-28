---
name: foretmap-context
description: Contexte et architecture du projet ForetMap (forêt comestible, Lycée Lyautey) — backend Express/MySQL, frontend React/Vite, rôles élève/prof, fichiers clés. À utiliser pour toute tâche touchant l'API, le frontend ou la base, et pour se repérer dans la base de code.
---

# Contexte projet ForetMap

## Rôles

- **Élèves** : inscription/connexion (bcrypt, session localStorage), carte des zones, prise de
  tâches, marquer une tâche faite (commentaire/image), stats.
- **Professeurs** : connexion prof (e-mail/mot de passe) → JWT côté serveur ; gèrent zones, plantes, tâches, élèves
  (suppression avec cascade assignments/logs + recalcul des statuts), valident les tâches.

## Stack & architecture

- **Backend** : Node + Express + MySQL (`mysql2` pool). `server.js` (montage routeurs, CORS,
  static, SPA fallback, routes santé), `database.js` (pool, `initDatabase()`, schéma, seed),
  `routes/*.js`, `middleware/requireTeacher.js` (JWT prof).
- **Frontend** : React 19 + Vite. `index.vite.html` → `src/main.jsx` ; modules dans
  `src/components/`, `src/hooks/`, `src/services/`. Build servi depuis `dist/` en prod.
  Runtime JSX **automatic** : pas d'`import React` pour écrire du JSX.
- **Shell applicatif** (`src/App.jsx`, ~1 470 lignes après l'audit du 27/08) : il **orchestre**,
  il ne calcule plus. Ce qui en est sorti et où chercher :
  - `src/hooks/useAppDataSync.js` — les 14 états de domaine (cartes, zones, tâches, projets,
    archives, plantes, repères, tutoriels) et `fetchAll` : sonde `/api/sync-state`, refetch ciblé
    par domaine, boucle de rafraîchissements concurrents, bandeau « serveur indisponible ».
  - `src/hooks/useAppDataPolling.js` — cadence adaptative (temps réel, onglet en arrière-plan,
    onglets « calmes ») + refetch en quittant un onglet secondaire.
  - `src/utils/appAccess.js` — droits pédago (`canManagePedagoContent`) et participation
    (`resolveParticipationFlag`, forum / commentaires de contexte).
  - `src/utils/appMapScope.js` — portée des cartes selon le rôle et résolution de la carte active.
  - `src/utils/appIdentity.js` — noms affichés · `src/utils/appShellHelpers.js` — onglet mémorisé,
    OAuth, split desktop.
  - `src/components/app/` — `AppHeader`, `MapTasksArea`, `PedagoTabs`, `TeacherTopTabs`,
    `StudentBottomNav`, `RolePreviewBanners`, `NoticeBanner`, `AppLoader`, `AppFooter`,
    `AppUserDialog`, `UnauthenticatedShell` (écran de connexion + visite invitée).
  - Contextes partagés : `src/contexts/` (`PublicSettings`, `Session`, `Data`, `Tour`).
- **GL** : sous-produit isolé (host `gl.*`, API `/api/gl/*`) → skill `foretmap-gl`.
- **Utilitaires** `lib/` : `logger.js` (Pino + redact), `routeLog.js` (`logRouteError`),
  `requestId.js`, `httpRequestLog.js`, `logMetrics.js`, `env.js`, `uploads.js`,
  `speciesAutofill*.js`. Helpers métier par domaine : `lib/tasks/taskQueries.js`
  (`getTaskWithAssignments`), `lib/*RouteHelpers.js`.

## Points d'attention

- SQL paramétré (`?`) ; bcrypt ; logger Pino (pas de `console`).
- Réponses API JSON ; 401 + `{ deleted: true }` → front déconnecte + toast.
- Servir `dist/` en prod si présent, sinon `public/` ; ne pas casser l'ordre du fallback SPA.
- Ne pas modifier le comportement métier sans demande explicite ; évolutions → `docs/EVOLUTION.md`.
- **Refactorer un composant racine → poser d'abord un test de montage** (`tests-ui/AppShellWiring.test.jsx`).
  Sans lui, la CI ne dit rien de plus que « ça compile » : un `const` référencé depuis un tableau
  de dépendances de hook avant sa déclaration a cassé tout l'écran authentifié sans qu'aucune des
  trois portes de qualité ne le voie. `no-use-before-define` est désormais **en erreur** pour ce
  motif. Post-mortem : `docs/AUDIT_REFACTORING_APP_2026-08.md` §5.

## Voir aussi

- Règles : `.cursor/rules/foretmap-conventions.mdc`, `foretmap-backend.mdc`, `foretmap-frontend.mdc`
- Skills : `foretmap-database`, `foretmap-testing`, `foretmap-gl`, `foretmap-observability`
- Docs : `docs/LOCAL_DEV.md`, `docs/API.md`, `docs/EVOLUTION.md`,
  `docs/AUDIT_REFACTORING_APP_2026-08.md` (carte du shell + dette restante)
