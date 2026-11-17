---
name: gl-tenir-moteur
description: Carte du tour de la mouture « Tenir à deux » de Gnomes & Licornes — phases, surfaces, droits rejoués par le serveur (glTenirPermissionsCore), transactions, grand livre des bourses, évènements et libellés du journal, temps réel, chronométrage, sabliers. À lire avant de brancher un nouveau geste, une route de partie, un réglage ou un évènement dans lib/glTour.js, lib/glChasse.js, lib/glSpellCast.js ou routes/gl/games/.
---

# « Tenir à deux » — carte du tour

Dossier technique complet : `docs/GL_TENIR_A_DEUX.md`. Règles : `docs/GL_TENIR_A_DEUX_REGLES.md`.

## Une partie « Tenir »

`isTenirGame(settings, game)` = réglage `gameplay.tenir_enabled` **et** `gl_games.tenir_profil`
(`complet` | `prologue`). Réglages résolus : défauts ← `gl_settings` ← écarts du profil ←
surcharges de la partie (`resolveTenirSettings`, clés `OVERRIDABLE_KEYS` de `lib/glTenir.js`).
Un réglage nouveau se déclare à quatre endroits : `DEFAULT_GAMEPLAY`, `TENIR_SETTING_KEYS` et le
registre de `lib/glSettings.js`, puis `data/gl/tenir/reglages-defaut.json` (et son jumeau
`exemple/`), avec un `INSERT IGNORE` du défaut en migration.

## Phases et surfaces

- Phases d'un tour : `ouverture → jeu → souffle → clos` (`ouvrirTourTx`, `changerPhaseTx` de
  `lib/glTour.js`). La clôture du chapitre (`POST /end`, `lib/glSeuil.js`) ferme le tour : à
  l'écran, c'est **le camp** (le fichier garde son nom technique).
- Présences : chacun est présent par défaut (`lib/glPresences.js`) ; aucune confirmation, aucune
  demande. Le Retrait est levé pour tous au passage en `clos`.
- File du prof (`lib/glDemandes.js`) : `des_a_valider`, `jet_en_suspens`, `sort_a_appliquer`
  (« Sort à honorer »), `plume` (« Lettre à relire »), `mentorat`, `chimere`, `defi_case`,
  `nommer`. Sorties automatiques dans `solderAttentesDeSeanceTx` (`lib/glTour.js`).
- Surfaces : `tableau` (le prof porte les gestes de l'équipe active), `hybride`, `tablette`
  (`resolveSurface`). Au tableau, rien ne change sans décision.
- Chaque phase est chronométrée (`gl_game_round_phases`, `lib/glRoundPhases.js`).
- Sabliers : `lib/glSablier.js` + `src/shared/glSablierCore.js`, composant `GLSablier`.

## Droits : le serveur rejoue, le client grise

Noyau pur `src/shared/glTenirPermissionsCore.js` (miroir `lib/shared/`) :

- `resolveTenirPermissions({ surface, phase, actorKind, … })` → `jeter` (un sort), `lancer`
  (les dés), `repondre`, `fouiller`, `lire`, `marche`… ;
- `isSortPermisSurSurface` : au tableau, un élève ne lance pas un sort de la phase `jeu`.

Côté serveur : `assertActionOuverte` (`lib/glTour.js`) pour lancer / répondre / fouiller,
`resolveLectureContext` pour lire et tenir, `assertTenirSurfacePermission`
(`lib/glSpellCast.js`) pour les sorts. Refus : 403 `TENIR_PERMISSION`, 409 `TENIR_PHASE`.
Les routes prof portent `requireGlPermission('gl.game.manage')`.

## Écrire dans une partie

- Une route = `withTransaction(async (tx) => …)` puis `emitAll(gameId, events)` **après** le
  commit. Les fonctions du moteur finissent par `Tx` et prennent `tx` en premier argument.
- **Bourses** : uniquement `applyBourseDeltaTx` (`lib/glBourses.js`) ; réserve de la caravane :
  `creditReserveTx` / `debitReserveTx`. Chaque mouvement écrit une ligne du grand livre
  (`gl_resource_ledger`, cause dans `CAUSES`). Une cause nouvelle s'ajoute à `CAUSES`.
- **Invariants** : `lib/glTenirInvariants.js` (bourses, livre, pions, voile, pages, quotas). Le
  banc les rejoue après chaque geste ; `LIVRE_TOTAL` attrape toute ressource créée de rien.
- **Aléa et horloge** : `lib/glRandom.js` (`forGame(gameId)`), `lib/glClock.js` (`now()`).
  Jamais `Math.random()` ni `new Date()` dans une règle du jeu.

## Évènements, journal, temps réel

- `insertGameEvent(tx, { gameId, teamId, actorType, actorId, eventType, payload })`
  (`lib/glGameEvents.js`). `actorType` : `mj`, `team` (un élève ou son équipe), `system`.
- Un payload privé porte `private: true` et `publicKeys` : `emitGlGameEvent`
  (`lib/realtime.js`) le réduit pour la salle ; le prof relit le détail par HTTP.
- **Tout type émis a un libellé** dans `lib/glJournalPresentTenir.js` et figure dans
  `TENIR_EVENT_TYPES` (`tests/gl-journal-tenir-exhaustif.test.js` le vérifie). Le libellé
  respecte les garde-fous (skill `gl-tenir-garde-fous`).
- Ce que lit un écran : bloc `tenir` de `GET /api/gl/games/:id` (`lib/glTenirView.js`, bourses
  filtrées par spectateur) et `GET …/tenir/tour` (`routes/gl/games/tenir-tour.js`).

## Brancher un nouveau geste : la liste

1. Le droit dans `glTenirPermissionsCore` (puis `npm run sync:shared-cores`) et son contrôle serveur.
2. La fonction `…Tx` dans le module du domaine, la route dans `routes/gl/games/`.
3. L'évènement, son libellé de journal, son éventuelle ligne d'Olu (`lib/glTenirOlu.js`).
4. Sa **sortie automatique** s'il attend quelqu'un (changement de phase, clôture, séance
   suivante, camp).
5. Tests `tests/gl-tenir-*.test.js` (fixtures `tests/helpers/glTenirFixtures.js`, suites
   séquentielles `--test-concurrency=1 --test-force-exit`), puis le banc (skill `gl-banc`).
6. `docs/API.md`, `docs/GL_TENIR_A_DEUX.md`, doc de référence `docs/reference/gl/`.
