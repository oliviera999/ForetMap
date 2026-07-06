# GL — Les deux sets de QCM (rattachement ressources & accès élève)

Documentation de synthèse du système de QCM du sous-produit **Gnomes & Licornes (GL)** :
les deux jeux de questions, leur ancrage aux ressources, les voies d'accès joueur et le
backbone commun de rattachement/gating.

> Schéma visuel : [`GL_QCM_SETS.html`](./GL_QCM_SETS.html) (ouvrir dans un navigateur).

## Aiguillage — un seul test sur le code question

Tout le back GL choisit le dataset à partir du préfixe du `question_code`
(`lib/glQcmResolve.js`) :

| Motif du code       | Dataset    | Set (`qcmSet`) |
| ------------------- | ---------- | -------------- |
| `/^LQCM\d+$/i`      | `qcm_lore` | `lore`         |
| sinon (`QF…`, etc.) | `qcm`      | `biome`        |

Ce test unique aiguille le chargement, la présentation, l'enregistrement des tentatives et le
gating, partout.

## Set 1 — Écologie / biome (`qcm`)

Catalogue : **`gl_qcm_questions`** (`migrations/096_gl_qcm.sql`).

| Colonne                                           | Rôle                                             |
| ------------------------------------------------- | ------------------------------------------------ |
| `question_code` (PK, VARCHAR 16)                  | code stable (ex. `QF0123`)                       |
| `biome_slug` (FK `gl_biomes`)                     | **ancrage principal : le biome**                 |
| `categorie_slug` (FK `gl_qcm_categories`)         | catégorie thématique                             |
| `numero_dans_categorie`                           | + contrainte unique `(biome, catégorie, numéro)` |
| `choix_a … choix_e`                               | 5 choix                                          |
| `reponse_correcte`                                | ENUM A–E                                         |
| `niveau`, `difficulte`, `difficulte_label`        | filtres de pool                                  |
| `feedback_*` (mig. 112), `photo_*`, `wikipedia_*` | feedback pédagogique / illustration              |
| `statut`                                          | seules les questions `actif` sont tirées         |

Rattachements :

- **Biome** : direct, colonne `biome_slug`.
- **Espèce** : _indirect_ (pas de colonne) — via le `biome_slug` partagé (les `gl_species`
  portent aussi un biome) et, pour le gating, via `gl_resource_question_links`
  (`resource_type='species'`).
- **Glossaire écologie** : `gl_qcm_question_glossary (question_code, glossary_code)` →
  `gl_glossary_terms`.

## Set 2 — Lore / narratif (`qcm_lore`)

Catalogue : **`gl_qcm_lore_questions`** (`migrations/138_gl_qcm_lore.sql`).

| Colonne                                        | Rôle                                         |
| ---------------------------------------------- | -------------------------------------------- |
| `question_code` (PK)                           | code `LQCM…`                                 |
| `chapitre_slug` (FK `gl_qcm_lore_scopes`)      | **ancrage principal : le scope de chapitre** |
| `categorie_slug` (FK `gl_qcm_lore_categories`) | catégorie lore                               |
| `tier_lore`                                    | ENUM `cle` \| `recit` (palier narratif)      |
| `choix_a … choix_e`, `reponse_correcte`        | 5 choix + réponse A–E                        |
| `niveau`, `difficulte`                         | filtres de pool                              |
| `feedback_correct`, `feedback_a…e`             | feedback par choix (natif ici)               |
| `source_lore`, `statut`                        | provenance / activation                      |

Table de scope **`gl_qcm_lore_scopes`** : `slug`, `nom`, `plateau` (TINYINT). C'est le champ
`plateau` qui relie un scope au **numéro de plateau** du chapitre en jeu.

Rattachements :

- **Chapitre / plateau** : via `chapitre_slug` → scope → `plateau`.
- **Glossaire lore** : `gl_qcm_lore_question_glossary (question_code, lore_code)` →
  `gl_lore_glossary_terms`.

## Le liant : marqueur de carte

Un `gl_chapter_marker` peut porter une question de **l'un ou l'autre** set. Deux modèles
coexistent :

- **Legacy** (`migrations/097_gl_chapter_markers_qcm.sql`) : colonnes `qcm_categorie_slug` +
  `qcm_question_code` (FK `gl_qcm_questions`) — set écologie uniquement.
- **Moderne** : `event_config_json.question = { set, mode, pool | fixedQuestionCode }` où
  `set = 'biome' | 'lore'` et `mode = 'fixed' | 'random'`.

L'aiguillage se fait dans `drawQuestionFromMarker` (`lib/glMarkerQuestionPool.js`) :

1. `set='lore'` → délègue à `drawLoreQuestionFromMarker`
   (`lib/glMarkerLoreQuestionPool.js`), scope résolu depuis le `plateau_number` du chapitre.
2. `mode='fixed'` → charge la `fixedQuestionCode` (vérifie qu'elle est présentable).
3. `mode='random'` → construit le pool filtré (biome(s) du chapitre, catégories, niveaux,
   difficulté min/max) puis tire en Fisher-Yates jusqu'à une question présentable.

## Accès élève / joueur — trois voies (communes aux deux sets)

**A. Sur la carte, via un marqueur** (cas nominal en partie)

1. L'équipe arrive sur un repère « question » (`isQuestionMarker()`).
2. `useGLMarkerArrival` → `POST /api/gl/games/:id/markers/:markerId/present-question`.
3. Le back tire la question, la présente (choix mélangés, `presentationToken` JWT) + chips de
   glossaire appariées au texte.
4. Affichage dans `GLQcmPopover`.
5. Réponse → `POST /api/gl/games/:id/qcm/answer` : score, écriture dans `gl_game_events`,
   bascule automatique sur le bon set selon le préfixe du code.

**B. Tirage catalogue / dé virtuel** (hors marqueur)

- `GLQcmModal` appelle `GET /api/gl/qcm/draw` (écologie, pool biome + catégorie) **ou**
  `GET /api/gl/lore/qcm/draw?chapitreSlugs=…` (lore), puis `/…/questions/:code/present`.

**C. Hors partie**

- Réponse via `POST /api/gl/qcm/questions/:code/answer` (bascule lore selon le préfixe).

**Verrou d'accès** : le réglage `gameplay.qcm_mj_only` (`migrations/114_gl_qcm_mj_only.sql`) —
si activé, seuls MJ/staff peuvent présenter et valider les QCM ; les joueurs ne déclenchent
plus le popover.

## Backbone commun : rattachement & gating

Modèle unifié qui relie n'importe quelle ressource aux questions des deux sets
(`migrations/145_gl_learning_resource_links.sql`). **Désactivé par défaut**
(`gl_settings 'gating.enabled' = false`).

- **`gl_resource_question_links`** :
  `(question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status, confidence)`
  — clé unique sur les 4 premiers.
  `question_dataset ∈ {qcm, qcm_lore}` ;
  `resource_type ∈ {species, glossary, lore_glossary, tutorial, feuillet, content_page, ecosystem}` ;
  `resource_ref` = référence polymorphe (pas de FK, validation applicative).
- **`gl_resource_gating_policy`** :
  `(resource_type, resource_ref, mode, required_correct, enabled)` — politique par ressource,
  résolue en cascade ressource → chapitre/scope → site.
- **`gl_qcm_attempts`** : tentatives **par lecteur** (`reader_user_type/id`, `is_correct`,
  `game_id`/`team_id` nullables) — nécessaire à la granularité `player` (les scores de partie
  ne vivaient jusque-là que par équipe dans `gl_game_events`).
- Surcharges de granularité : colonnes `gating_granularity` sur `gl_chapters` et
  `gl_qcm_lore_scopes` (NULL = hérite du site).

Quand le gating est actif, l'élève ne peut « **Marquer comme appris** » une ressource (espèce,
feuillet, glossaire…) qu'après avoir réussi **toutes** les questions `is_gating` approuvées qui
y sont liées (`routes/gl/learning.js` → `assertGatingSatisfiedForAcknowledge`,
cœur commun `lib/shared/resourceQuestionGatingCore.js`).

La migration 145 reprend automatiquement les liens glossaire existants des deux tables
(`gl_qcm_question_glossary` → `resource_type='glossary'`,
`gl_qcm_lore_question_glossary` → `lore_glossary`).

## Fichiers clés

- Migrations : `096`, `097`, `112`, `114`, `138`, `145`.
- Libs : `lib/glQcmResolve.js`, `lib/glMarkerQuestionPool.js`, `lib/glMarkerLoreQuestionPool.js`,
  `lib/glQcmAttempts.js`, `lib/learningGatingRuntime.js`, `lib/learningGatingAcknowledge.js`,
  `lib/shared/resourceQuestionGatingCore.js`, `lib/shared/resourceQuestionMatch.js`.
- Routes : `routes/gl/qcm.js`, `routes/gl/games/qcm.js`, `routes/gl/games/markers.js`,
  `routes/gl/learning.js`, `routes/gl/learning-links.js`.
- Front : `src/gl/components/GLQcmModal.jsx`, `GLQcmPopover.jsx`,
  `src/gl/hooks/useGLMarkerArrival.js`.
