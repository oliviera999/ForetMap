# Audit temps réel ForetMap (baseline 2026-03-26)

## Objectif

Établir une baseline lisible du temps réel avant/après corrections, puis documenter les changements déployés dans ce cycle.

## Baseline mesurée (code)

- Points d’émission côté backend (`routes/`):
  - `emitTasksChanged`: 17 occurrences.
  - `emitStudentsChanged`: 6 occurrences.
  - `emitGardenChanged`: 13 occurrences.
- Frontend:
  - 1 polling global (`setInterval(fetchAll, ...)`) dans `src/App.jsx`.
  - 3 listeners socket (`tasks:changed`, `students:changed`, `garden:changed`) dans `src/hooks/useForetmapRealtime.js`.
- Couverture backend dédiée:
  - `tests/realtime.test.js` (émission no-op, flux socket, auth socket, ciblage map).

## Problèmes observés avant correctifs

- Socket sans authentification de handshake.
- Broadcast global peu ciblé.
- Synchronisation incomplète après `tasks:changed` (projets de tâches pas toujours rafraîchis immédiatement).
- Ambiguïté de l’indicateur temps réel côté prof.

## Correctifs implémentés

### Backend

- Auth JWT obligatoire sur connexion Socket.IO (`lib/realtime.js`).
- Rooms de domaine + room carte (`subscribe:map`), émissions ciblées quand `mapId` est disponible.
- Payloads enrichis avec `mapId` sur événements tâches/jardin quand la donnée est connue (`routes/tasks.js`, `routes/task-projects.js`, `routes/map.js`, `routes/zones.js`).
- Logs debug d’émission pour suivi de charge/diagnostic.

### Frontend

- Hook temps réel branché pour session élève **et** session prof authentifiée (`src/hooks/useForetmapRealtime.js`).
- Handshake socket avec token JWT + souscription carte dynamique.
- Sur `tasks:changed`, rafraîchissement `tasks` + `taskProjects` du contexte carte actif.
- Événements `foretmap_realtime` uniformisés (`tasks`, `students`, `garden`) pour synchronisation inter-vues.
- Polling adaptatif dans `src/App.jsx` (ralenti si push live, ralenti en onglet caché).
- Indicateur prof clarifié avec état `polling`.

## Validation

- Backend: `node --test "tests/realtime.test.js"` -> OK.
- E2E multi-session ajouté (`e2e/realtime-multi-session.spec.js`), exécution locale bloquée par une dépendance Playwright cassée (`Cannot find module '../../zipBundle'`).

## Points de suivi

- Points de suivi Playwright local (historique).

## Addendum 2026-09 (o2switch / Passenger)

Le canal Socket.IO reste un **signal** ; la donnée à jour passe par refetch REST.

- **Filet** : `useAppDataPolling` continue `fetchAll` toutes les 90 s même si `rtStatus === 'live'` (un événement manqué n’attend plus un rechargement manuel).
- **Transport client** : `src/utils/socketIoClientOptions.js` — `polling` + `upgrade: false` (ForetMap et GL).
- **GL** : `src/gl/realtime/glSocketClient.js` — un `io()` par jeton, rooms à refcount.
- **Auth ForetMap** : hydratation JWT en base à la connexion socket ; `subscribe:map` seulement si la carte existe.
- **Observations** : `observations:changed` (B5 traité).
- **Diagnostics** : `runtimeProcess.realtime.{enabled,clients}`.
- **Hors code** : 1 instance Passenger, éventuellement HTTP/1.1 vhost (cPanel).
