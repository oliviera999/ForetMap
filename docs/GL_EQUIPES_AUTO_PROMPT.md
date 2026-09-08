# Prompt d'exécution — Composition automatique des équipes GL (lot v1)

> **Usage : à coller dans Cursor** (mode Agent, dépôt ForetMap ouvert). Ce document est le
> cahier des charges exécutable du lot v1. La justification des choix est dans
> [GL_EQUIPES_AUTO_CONCEPTION.md](GL_EQUIPES_AUTO_CONCEPTION.md) — le lire avant de coder,
> ne pas le recopier.
>
> **Une seule règle prime sur tout ce qui suit** : en cas de contradiction entre ce prompt
> et `CLAUDE.md`, `.cursor/rules/**` ou `.cursor/skills/**`, **les règles du dépôt
> l'emportent** — et tu le signales dans ta réponse au lieu de trancher seul.

---

## 0. Contexte à charger avant d'écrire une ligne

Lis dans cet ordre, sans les résumer dans ta réponse :

1. `docs/GL_EQUIPES_AUTO_CONCEPTION.md` — la spécification (§ 4 le moteur, § 7 les pièges).
2. `lib/glRoster.js` — `computeBalancedAssignments`, `assignPlayerToTeamTx`,
   `autoAssignRosterTx`, `unassignPlayerFromGameTx`. **Tu réutilises ces fonctions, tu ne
   les réécris pas.**
3. `routes/gl/games/teams.js` et `routes/gl/games/roster.js` — les routes voisines : mêmes
   conventions de validation, de codes d'erreur et de messages français.
4. `tests/gl-roster-balance.test.js` — le patron de test pur avec RNG seedé, à imiter.
5. `.cursor/rules/foretmap-gl.mdc` (isolement produit, permissions, tests séquentiels) et
   `.cursor/rules/foretmap-conventions.mdc`.

## 1. Ce que tu dois livrer

Une fonctionnalité **« Composer automatiquement les équipes »** dans la console MJ : le MJ
choisit une taille d'équipe et une recette, obtient un **aperçu modifiable**, puis
l'applique. Trois recettes en v1 : `random`, `random_memory` (par défaut), `carry_over`.

**Périmètre strict.** Tout le reste (axes de profil, recettes `mixed` / `roles` /
`homogeneous`, verrous MJ, réglages par classe) appartient aux lots v2/v3 : la fonction de
coût doit les **accueillir** sans les implémenter.

## 2. Décisions déjà prises — non négociables

| #   | Décision                                                                                                                                                                           | Raison                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Aucune migration SQL.** Rien de nouveau en base.                                                                                                                                 | Zéro risque de collision de numéro `NNN_` avec une PR parallèle ; la v1 ne persiste aucun profil.                                                                                   |
| D2  | **Composition autorisée seulement si `gl_games.status = 'draft'`** — sinon `409`.                                                                                                  | `grantStartingFeuilletsToTeam` distribue le lot d'ouverture à toute équipe créée sur une partie `live`/`paused` : composer sur une partie démarrée doublonnerait les feuillets.     |
| D3  | L'**aperçu n'écrit rien** ; l'**application** reçoit la composition explicite (éventuellement retouchée par le MJ) et la revalide côté serveur.                                    | Le MJ doit pouvoir ajuster avant d'appliquer. On ne fait jamais confiance au corps reçu : chaque `playerId` est revérifié comme actif et appartenant à la classe de la partie.      |
| D4  | Écritures via `assignPlayerToTeamTx` / `unassignPlayerFromGameTx` existantes, dans **une seule transaction** (`withTransaction`).                                                  | Ne pas dupliquer la logique d'affectation ni la contrainte de classe.                                                                                                               |
| D5  | On **n'assainit pas** le pointeur global `gl_players.team_id` dans ce lot : on émet un avertissement `ANOTHER_GAME_LIVE`.                                                          | Défaut préexistant, déclenché aussi par le panneau manuel. « Ne pas modifier le comportement métier sans demande explicite » (`CLAUDE.md`). À tracer en suivi T1 dans le CHANGELOG. |
| D6  | **Déterminisme complet à graine donnée** : `(graine, recette, effectif, historique)` ⇒ toujours la même proposition. `Math.random` n'apparaît nulle part dans les fonctions pures. | Testabilité, et le MJ doit pouvoir régénérer à l'identique.                                                                                                                         |
| D7  | **Aucun score individuel n'est exposé** dans les réponses d'API ni dans l'UI.                                                                                                      | Élèves mineurs — cf. conception § 9.                                                                                                                                                |
| D8  | **Aucune donnée ForetMap** n'alimente la composition, même via `linked_foretmap_user_id`.                                                                                          | Isolement produit GL, non négociable.                                                                                                                                               |

## 3. Backend — fichiers à créer

### 3.1 `lib/gl/teamComposition.js` — moteur **pur** (aucun accès base)

Fonctions exportées, toutes pures et déterministes :

```js
// Poids d'une recette. Les clés absentes valent 0.
// RECIPE_WEIGHTS = { random: { size: 1 },
//                    random_memory: { size: 1, repeat: 0.6 },
//                    carry_over: null }   // carry_over ne passe pas par le moteur
const RECIPE_WEIGHTS = { /* ... */ };

/**
 * @param {object[]} players  [{ playerId }]  — pool déjà filtré (actifs)
 * @param {number[]} teamSlots  indices 0..n-1 des équipes à remplir
 * @param {Map<string, number>} pairHistory  clé `${min}-${max}`, poids ≥ 0
 * @param {object} weights  { size, repeat, inter, intra, roles, vitality }
 * @param {function} rng  générateur seedé
 * @returns {{ slots: number[][], cost: number, breakdown: object }}
 */
function computeComposition({ players, teamSlots, pairHistory, weights, rng });

/** Coût d'une composition, terme par terme. Utilisé par la recherche locale et les tests. */
function scoreComposition({ slots, pairHistory, weights });

/** Générateur congruentiel seedé — même implémentation que tests/gl-roster-balance.test.js. */
function createSeededRng(seed);

/** Graine lisible et reproductible (ex. « brume-4172 ») ⇒ entier 32 bits. */
function seedFromLabel(label);
```

Contraintes d'implémentation :

- Départ = `computeBalancedAssignments` de `lib/glRoster.js` (écart d'effectif ≤ 1 garanti
  dès l'initialisation), puis **recherche locale par échange de deux joueurs**, première
  amélioration, ordre des paires tiré avec le même `rng`, **borne dure de 2 000 itérations**.
- `pairHistory` : poids `Σ 0.8^rang` (rang 0 = partie la plus récente).
- Le terme `size` reste dans la fonction de coût même s'il est déjà satisfait à
  l'initialisation : un échange ne doit jamais pouvoir le dégrader.
- Les termes `inter`, `intra`, `roles`, `vitality` sont **déclarés, câblés à 0 et
  documentés** « lot v2 » — pas de calcul mort, juste la place.

### 3.2 `lib/glTeamCompositionHistory.js` — lecture de l'historique

```js
/**
 * Paires ayant déjà coéquipé dans les parties passées de la classe.
 * Exclut `excludeGameId`. Une seule requête (pas de N+1).
 * @returns {Map<string, number>} clé `${minPlayerId}-${maxPlayerId}` → poids décroissant
 */
async function loadPairHistory(queryAll, { classId, excludeGameId, decay = 0.8, maxGames = 12 });

/** Taux de brassage cumulé de la classe : paires distinctes déjà réunies / paires possibles. */
async function computeMixingRate(queryAll, { classId });
```

SQL : `gl_team_members tm ⋈ gl_games g ON g.id = tm.game_id` filtré sur `g.class_id`,
ordonné par `g.id DESC`, limité à `maxGames` parties. **Requête paramétrée** (`?`),
jamais d'interpolation.

### 3.3 `lib/glTeamComposition.js` — orchestration et écriture

```js
/** Construit une proposition complète, sans rien écrire. */
async function buildCompositionProposal(db, { gameId, recipe, seed, teamSize, includeInactive });

/** Applique une composition validée. À appeler dans withTransaction. */
async function applyCompositionTx(tx, { gameId, actorId, teams, replaceExisting });
```

`buildCompositionProposal` :

1. Charge la partie (`id, class_id, chapter_id, status`) → `GAME_NOT_FOUND` / `GAME_NOT_DRAFT`.
2. Charge les joueurs de la classe (`is_active = 1` sauf `includeInactive`).
   Moins de 2 joueurs ⇒ `NOT_ENOUGH_PLAYERS`.
3. `teamCount = clamp(Math.round(joueurs / teamSize), 2, plafondMascottes)`.
4. Alterne les peuples `gnome` / `unicorn` sur les équipes (index pair/impair), en
   garantissant **au moins un de chaque**.
5. Nom, couleur et mascotte par équipe (§ 3.4).
6. `carry_over` : recopie les équipes de la **dernière partie de la même classe possédant
   des équipes** (nom, type, couleur, mascotte) et réunit les mêmes membres encore actifs ;
   les joueurs nouveaux ou sans équipe précédente sont répartis dans les équipes les moins
   remplies. Aucune partie antérieure ⇒ `warnings: ['NO_PREVIOUS_GAME']` et repli sur
   `random`.
7. Sinon : `computeComposition` avec les poids de la recette.
8. Calcule les avertissements et l'explication (§ 4.2).

`applyCompositionTx` :

1. Revalide chaque `playerId` : existe, `class_id` = celle de la partie, non dupliqué entre
   équipes ⇒ sinon `INVALID_MEMBER`.
2. Si `replaceExisting` : `unassignPlayerFromGameTx` pour tous les membres de la partie,
   **puis** `DELETE FROM gl_teams WHERE game_id = ?` — dans cet ordre, sinon la garde
   « équipe avec joueurs assignés » se déclenche.
3. `INSERT` des équipes (mêmes colonnes que `routes/gl/games/teams.js`), puis
   `assignPlayerToTeamTx` pour chaque membre.
4. Journalise **un** événement :
   `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)`
   avec `team_id = NULL`, `actor_type = 'mj'`, `event_type = 'teams_composed'`, et un
   `payload_json` contenant `{ recipe, seed, weights, teamCount, teamSize, explain }`.
   **Aucun score individuel dans ce payload** (D7).

> `grantStartingFeuilletsToTeam` **n'est pas** appelé : la partie est en brouillon (D2), le
> lot d'ouverture sera distribué au démarrage comme pour toute équipe créée à la main.

### 3.4 `lib/gl/teamNaming.js` — nommage, couleurs, mascottes

```js
function pickTeamNames({ count, chapter, rng });   // ex. « Les Veilleurs de la Mangrove »
function pickTeamColors({ count, rng });           // palette fixe ≥ 8 teintes contrastées
function pickMascots({ teamTypes, catalog, rng }); // une mascotte distincte par équipe, filtrée par peuple
```

- Le nom s'appuie sur le chapitre (biomes rattachés, `plateau_number`, thème) via un
  vocabulaire figé dans le module. Noms **uniques** dans une même partie ; repli numéroté
  (« Équipe 3 ») si le vocabulaire est épuisé.
- Catalogue mascottes côté serveur : `lib/glMascotCatalog.js`. Si le catalogue ne fournit
  pas assez de mascottes distinctes pour un peuple, **réduire `teamCount`** et remonter
  `warnings: ['MASCOT_POOL_TOO_SMALL']` — ne jamais réutiliser deux fois la même mascotte.

## 4. API — deux routes, dans `routes/gl/games/teams.js`

Permissions : `requireGlPermission('gl.team.manage')` **et**, dans le handler,
`hasGlPermission(req.glAuth, 'gl.players.manage')` (la composition affecte des joueurs) →
`403 { error: 'Permission insuffisante' }` sinon. Les deux sont exportées par
`middleware/requireGlAuth.js`.

### 4.1 `POST /api/gl/games/:id/teams/compose/preview`

```jsonc
// Requête
{
  "recipe": "random_memory", // random | random_memory | carry_over — défaut random_memory
  "teamSize": 4, // 2..8, défaut 4
  "seed": "brume-4172", // optionnel ; généré et renvoyé si absent
  "includeInactive": false, // défaut false
}
```

```jsonc
// 200
{
  "seed": "brume-4172",
  "recipe": "random_memory",
  "teamSize": 4,
  "teams": [
    {
      "name": "Les Veilleurs de la Mangrove",
      "type": "gnome",
      "color": "#22c55e",
      "mascotId": "gl-...",
      "members": [{ "playerId": 12, "pseudo": "…", "firstName": "…", "lastName": "…" }],
      "explain": { "size": 4, "newPairs": 5, "repeatedPairs": 1 },
    },
  ],
  "explain": { "totalPlayers": 16, "excludedInactive": 2, "repeatedPairs": 2, "mixingRate": 0.41 },
  "warnings": ["ANOTHER_GAME_LIVE"],
}
```

Erreurs : `400` identifiant ou corps invalide · `404` partie introuvable ·
`409` `GAME_NOT_DRAFT` / `NOT_ENOUGH_PLAYERS`. Messages d'erreur **en français**, format
`{ error }`, comme les routes voisines.

### 4.2 `POST /api/gl/games/:id/teams/compose/apply`

```jsonc
// Requête — la composition, éventuellement retouchée par le MJ
{
  "recipe": "random_memory",
  "seed": "brume-4172",
  "replaceExisting": true,
  "teams": [
    {
      "name": "…",
      "type": "gnome",
      "color": "#22c55e",
      "mascotId": "gl-…",
      "memberIds": [12, 7, 31],
    },
  ],
}
```

`200 { "ok": true, "teamIds": [...], "assignedCount": 16 }`.
Erreurs : `400` corps invalide (nom vide, `type` hors `gnome|unicorn`, `memberIds`
dupliqués entre équipes) · `404` partie introuvable · `409` `GAME_NOT_DRAFT`,
`INVALID_MEMBER` (joueur d'une autre classe), `TEAMS_NOT_EMPTY` (équipes existantes sans
`replaceExisting`).

**Documente les deux routes dans `docs/API.md` dans le même lot** (méthode, URL, portée,
format, contraintes d'accès).

## 5. Front — console MJ

- Nouveau composant `src/gl/components/mj/GLTeamComposeDialog.jsx` : taille cible, trois
  cartes de recette, graine affichée + bouton « Régénérer », case « inclure les joueurs
  inactifs ».
- Aperçu : une carte par équipe (nom, peuple, couleur, mascotte, membres) avec réaffectation
  d'un joueur d'une équipe à l'autre avant application. Boutons **Régénérer** /
  **Appliquer** / **Annuler**.
- Point d'accroche : bouton « Composer automatiquement » dans
  `src/gl/components/mj/GLGameMasterConsoleTeams.jsx`, à côté de « Ajouter équipe Gnome ».
  **Désactivé, avec une info-bulle explicative, si la partie n'est pas en brouillon.**
- Appels via `apiGL` (patron : `src/gl/components/admin/GLGameRosterPanel.jsx`).
  Composants `GLButton` / `GLField` / `GLSelect` / `GLInput` existants ; pas de CSS ad hoc
  si une classe `gl-*` fait déjà l'affaire.
- Après application : rafraîchir la liste des équipes et le roster
  (`setRosterRefreshKey`, `onReloadGame`).
- **Aucun score, aucune moyenne, aucun libellé de « niveau » à l'écran** (D7) : les
  explications restent factuelles (effectif, binômes inédits, paires répétées).
- Rappels lint : runtime JSX _automatic_ (pas d'`import React` décoratif) et
  `no-use-before-define` **en erreur** sur `src/**`.

## 6. Tests — dans le même lot, non négociable

| Fichier                                     | Contenu attendu                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/gl-team-composition.test.js`         | Moteur **pur**, RNG seedé (patron `gl-roster-balance.test.js`) : déterminisme (même graine ⇒ même sortie, deux graines ⇒ sorties différentes) ; écart d'effectif ≤ 1 ; `random_memory` réduit strictement les paires répétées face à `random` sur un historique fabriqué ; `scoreComposition` décompose bien terme par terme ; borne d'itérations respectée.                                                                                                                |
| `tests/gl-team-naming.test.js`              | Noms uniques dans une partie ; repli numéroté ; mascottes distinctes ; réduction de `teamCount` quand le catalogue est trop petit ; couleurs distinctes.                                                                                                                                                                                                                                                                                                                    |
| `tests/gl-team-composition-history.test.js` | `loadPairHistory` : décroissance `0.8^rang`, exclusion de la partie courante, plafond `maxGames`, clé de paire normalisée (min-max).                                                                                                                                                                                                                                                                                                                                        |
| `tests/gl-games-teams-compose.test.js`      | Routes (supertest) : 401 sans jeton · 403 sans `gl.team.manage` · 403 sans `gl.players.manage` · 404 partie inconnue · 400 corps invalide · **409 partie non `draft`** · aperçu qui n'écrit rien (compte de `gl_teams` inchangé) · application qui crée équipes + membres · `replaceExisting` qui remplace sans buter sur la garde « équipe avec joueurs assignés » · `INVALID_MEMBER` pour un joueur d'une autre classe · un unique événement `teams_composed` journalisé. |
| `tests-ui/GLTeamComposeDialog.test.jsx`     | Montage réel du dialogue, appel d'aperçu simulé, application déclenchée avec la composition affichée.                                                                                                                                                                                                                                                                                                                                                                       |

Tests GL **séquentiels obligatoires** (`--test-concurrency=1 --test-force-exit`) : BDD
partagée, sinon deadlocks `initSchema()`.

## 7. Documentation à mettre à jour dans le même lot

1. `docs/API.md` — les deux routes.
2. `docs/GL_ARCHITECTURE.md` — les nouveaux modules dans le tableau des couches.
3. `docs/reference/gl/chapitres-et-progression.md` § « Le déroulement d'une partie »,
   étape 2 « Composer les équipes » — décrire la composition automatique **en français
   simple, sans jargon**, et dire explicitement qu'elle n'est possible qu'avant le
   démarrage. Ajouter le point d'attention sur l'équilibre gnome/licorne et les sortilèges.
4. `docs/reference/gl/guide-du-mj.md` — le geste, dans le déroulé du MJ.
5. `CHANGELOG.md` sous **`[Non publié]`** : ce qui est ajouté, et le suivi **T1** (pointeur
   global `gl_players.team_id`, cf. D5). **Ne pas toucher au champ `version`** de
   `package.json` : le bump se fait automatiquement à la fusion.
6. `docs/GL_EQUIPES_AUTO_CONCEPTION.md` — passer le statut de « non implémentée » à
   « v1 livrée », et cocher les arbitrages tranchés (§ 12).

## 8. Definition of Done

```bash
npm run lint
npm run format:check
npm test           # inclut les 4 nouveaux fichiers de tests backend
npm run test:ui    # inclut le test de montage du dialogue
```

Les quatre commandes passent. Puis : `git add -A`, commit, push sur la branche de travail,
et PR en brouillon.

Ta réponse finale doit tenir en une page et contenir :

- la liste des fichiers créés / modifiés ;
- les décisions que tu as prises là où ce prompt laissait le choix ;
- **ce que tu n'as pas fait et pourquoi** ;
- la sortie réelle des commandes ci-dessus (pas un résumé rassurant : si un test échoue, tu
  le dis et tu montres la sortie).

## 9. Hors périmètre — ne fais pas ceci

- ❌ Créer une migration ou une table (D1).
- ❌ Modifier la sémantique de `autoAssignRosterTx`, `assignPlayerToTeamTx` ou des routes
  `roster/*` existantes. Tu peux les appeler, pas les changer.
- ❌ Implémenter les axes de profil ou les recettes `mixed` / `roles` / `homogeneous`.
- ❌ Persister un score de joueur, où que ce soit.
- ❌ Lire une table ForetMap (`users`, `tasks`, `groups`…) depuis le code de composition.
- ❌ Toucher au champ `version` de `package.json`.
- ❌ Composer sur une partie `live` / `paused`, ou contourner la garde par un `force`.
- ❌ Introduire une dépendance npm pour l'optimisation combinatoire : la recherche locale
  décrite tient en cinquante lignes.

## 10. Points à faire valider avant de coder

Si l'un de ces points te semble mal tranché, **pose la question plutôt que d'improviser** :

1. Taille d'équipe par défaut : **4**.
2. Décroissance de l'historique : **0,8** par chapitre d'ancienneté, sur les **12** dernières
   parties de la classe.
3. `carry_over` recopie **aussi** les mascottes et les couleurs.
4. Les noms d'équipe sont puisés dans le lore du chapitre, pas neutres.
5. Le pointeur `gl_players.team_id` est **laissé tel quel** en v1, avec avertissement (D5).
