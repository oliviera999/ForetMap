# Prompt agent (Claude Code / Cursor) — Quiz : enregistrer la réponse choisie et analyser les distracteurs

> À soumettre tel quel à l'agent, à la racine du dépôt, sur une branche `feat/quiz-reponse-choisie`
> créée depuis `main`. Établi le 06/11/2026 (base : migration courante **328**). Si `main` a
> bougé, vérifier d'abord que les fichiers cités existent encore et adapter les chemins.
> Réalisation en une passe : une branche, une PR en brouillon, **un commit par lot** (A → E).

---

## Rôle et cadre

Tu interviens sur ForêtMap en développeur senior. Réponds, commente et documente **en français**.
Applique `CLAUDE.md` et `.cursor/rules/` :

- SQL paramétré, logger Pino ;
- tests dans le même lot ;
- `docs/API.md` pour toute route modifiée, `docs/reference/` pour tout changement visible ;
- `CHANGELOG.md` sous `[Non publié]` ;
- **ne pas toucher au champ `version`** ;
- marque jamais en dur.

### Constat

`user_quiz_attempts` ne garde que `is_correct`. On ne sait donc pas **quel** choix l'élève a
retenu. Or un distracteur choisi révèle une conception erronée précise (« la plante tire sa
matière du sol », « le décomposeur est un consommateur »…). C'est la donnée la plus utile au
professeur, et la seule qui permette de juger la qualité d'une question.

Sans elle :

- l'outil MCP `foretmap_quiz` (action `stats`) répond « distracteurs non calculables » ;
- `GET /api/quiz/admin/questions/stats` ne peut pas distinguer :
  - une question mal construite ;
  - une notion mal comprise ;
  - un distracteur que personne ne choisit, donc inutile.

La banque vient en outre d'être largement réécrite le 06/11/2026 (distracteurs rééquilibrés en
longueur, feedbacks complétés, nouvelles questions). Les statistiques futures doivent pouvoir
distinguer **les versions d'une question** : une répartition des choix n'a de sens que pour un
même jeu de choix.

### Objectif

1. Enregistrer, à chaque réponse ForêtMap, la **lettre d'origine** du choix retenu, l'ordre de
   présentation, le temps de réponse mesuré côté serveur, le contexte et l'empreinte de version
   de la question.
2. En tirer des statistiques d'items exploitables par le professeur et par le connecteur MCP.

### Interdit absolu : Gnomes & Licornes

Ne lis, ne modifie, ne teste rien sous `routes/gl/`, `src/gl/`, `lib/gl*`, `lib/gl-pack/`,
`gl.html`, ni aucune migration ou table `gl_*` (dont `gl_qcm_attempts`). Les commits ne portent
pas le préfixe `(gl)`.

Attention aux modules **partagés** par les deux produits :

- `lib/qcmChoices.js` ;
- `lib/qcmPresentationUse.js` ;
- le sérialiseur de réponse ;
- `lib/shared/*`.

Toute modification y est **rétrocompatible** : le comportement et la charge du
`presentationToken` côté GL restent identiques. Un test le prouve : les quatre points d'appel
répondent comme avant pour GL.

### Lis d'abord

- `routes/quiz.js` : routes `…/present` et `…/answer`, `INSERT user_quiz_attempts` (≈ l. 344),
  pose du verrou (`registerFmCooldownOnWrongIfGating`).
- `lib/qcmChoices.js` (mélange et identifiants de choix), `lib/qcmPresentationUse.js`
  (consommation du `jti`), la construction et la vérification du `presentationToken`.
- `lib/quizQuestionStats.js` et la route `GET /api/quiz/admin/questions/stats`.
- `lib/accountMerge.js` : il réécrit `user_quiz_attempts` à la fusion de comptes.
- Le connecteur MCP :
  - la définition de l'outil `foretmap_quiz` (`lib/mcp/tools/domains/`) ;
  - ses requêtes (`lib/mcp/domains/`, action `stats`, champ `distractors`) ;
  - `docs/MCP.md` l. ≈ 230.
- Migrations `126_glossary.sql` (création de la table), `215_gating_attempt_indexes.sql`,
  `253_integrity_foreign_keys.sql` (pourquoi `question_code` n'a pas de clé étrangère).
- `docs/API.md` § « Le `presentationToken` » et § conditionnement ;
  `docs/AUDIT_VALIDATION_QUIZ_2026-09.md` (chaîne complète, § 1).
- La notice de confidentialité (`src/shared/privacy/privacyNoticeContent.js`), le registre
  (`docs/MCP_REGISTRE_TRAITEMENT.md`) et `lib/retention/` : ce qu'ils disent des tentatives de
  quiz et de leur durée de conservation.
- L'écran d'administration des questions (`src/` : édition d'une question, statistiques de
  questions), hors `src/gl/`.

### Avant d'écrire du code

Rends un **plan court** et attends ma validation. Il doit contenir :

- la réponse à la question du lot B, point 1 : comment retrouver la lettre d'origine ;
- les fichiers touchés par lot ;
- le numéro de migration ;
- les tests prévus.

---

## Lot A — Migration

Fichier `migrations/NNN_quiz_attempt_choice.sql`. Vérifie le numéro contre `main` et contre les
PR ouvertes (`.cursor/rules/foretmap-pr-merge-conflict.mdc`) ; 328 est la migration courante en
base. La migration est idempotente (`ADD COLUMN IF NOT EXISTS`, MariaDB), avec le rollback en
commentaire. Nouvelles colonnes de `user_quiz_attempts`, toutes `NULL` (les 252 lignes
historiques restent sans valeur) :

| Colonne               | Type                                                       | Contenu                                                                                                                     |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `choix_lettre`        | `ENUM('A','B','C','D','E') NULL`                           | Lettre **d'origine** du choix retenu (celle de `quiz_questions`), jamais la position affichée.                              |
| `ordre_presente`      | `VARCHAR(5) NULL`                                          | Ordre d'affichage en lettres d'origine, ex. `CADB` : permet de mesurer un effet de position résiduel.                       |
| `duree_ms`            | `INT UNSIGNED NULL`                                        | Temps entre la présentation (`iat` du jeton) et la réponse, mesuré **côté serveur**, plafonné à la durée de vie du jeton (15 min). |
| `contexte`            | `ENUM('libre','tirage','validation','seance') NULL`        | D'où vient la réponse : quiz libre, tirage, flux de validation (contexte gravé dans le jeton), séance pédagogique.          |
| `question_empreinte`  | `CHAR(12) NULL`                                            | Empreinte courte (SHA-256 tronqué, hex) de l'énoncé, des choix et de la bonne réponse au moment de la présentation.          |

Ajouter l'index `(question_code, question_empreinte, choix_lettre)`.

Pas de nouvelle table, pas de ligne `app_settings`.

### Tests

`tests/quiz-migration-NNN.test.js`, sur le modèle des tests de migration existants : la
migration est idempotente (rejouée deux fois), et les colonnes et l'index existent.

---

## Lot B — Enregistrement à la réponse

1. **Retrouver la lettre d'origine.** Commence par établir, dans le plan, ce que reçoit
   `…/answer`.
   - Si les identifiants de choix présentés **sont** les lettres d'origine (seul l'ordre est
     mélangé), la lettre reçue suffit.
   - S'ils sont opaques ou recalculés, ajoute au jeton ce qu'il faut pour retrouver la lettre,
     **sans** révéler la bonne réponse. Par exemple, l'ordre présenté en clair : il ne dit rien
     de la bonne réponse, qui reste une empreinte HMAC.
   - Charge du jeton GL inchangée.
2. **Ordre de présentation et empreinte** : `…/present` calcule l'ordre affiché et
   `question_empreinte` (fonction pure `lib/quizQuestionFingerprint.js`, testée), puis les grave
   dans le jeton ForêtMap (claims additionnels). `…/answer` les relit **dans le jeton**, jamais
   dans le corps.
3. **Durée** : `now - iat`, en millisecondes, bornée [0, 900 000]. Aucune valeur fournie par le
   client n'est prise en compte.
4. **Contexte** :
   - `validation` si le jeton porte un claim `resource` ;
   - `seance` si une séance active est retenue (même règle que `pedagoSession` dans
     `docs/API.md`) ;
   - `tirage` si la présentation vient de `/api/quiz/draw` (à graver dans le jeton) ;
   - sinon `libre`.
5. L'`INSERT` existant renseigne les cinq colonnes.
   - Aucun changement de la réponse HTTP ni du comportement du verrou.
   - Une réponse refusée (`409` rejeu, `403` verrou) n'écrit toujours rien.
6. `lib/accountMerge.js` reprend les nouvelles colonnes à l'identique lors d'une fusion.

### Tests

`tests/quiz-answer-choice.test.js` :

- une bonne et une mauvaise réponse enregistrent la bonne lettre d'origine, quel que soit le
  mélange (forcer plusieurs ordres) ;
- `ordre_presente` cohérent avec ce qui a été présenté ;
- `duree_ms` mesurée côté serveur et bornée ; une valeur `duree` envoyée par le client est
  ignorée ;
- `contexte` juste dans les quatre cas ;
- l'empreinte change quand un choix est modifié, pas quand seul un feedback change ;
- un rejeu (`409`) n'écrit rien ;
- **GL** : réponses `/api/gl/qcm` et `/api/gl/lore/qcm` identiques à avant (instantané de la
  charge du jeton et du corps de réponse).

---

## Lot C — Statistiques d'items

Étendre `lib/quizQuestionStats.js` et `GET /api/quiz/admin/questions/stats`. Le calcul se fait
en SQL groupé, sans boucle par élève. Pour chaque question, **sur la version courante**
seulement (tentatives dont `question_empreinte` = empreinte actuelle), avec rappel du nombre de
tentatives des versions antérieures :

1. **Répartition des choix** : effectif et pourcentage par lettre, la bonne réponse marquée.
2. **Distracteur attracteur** : un distracteur choisi plus souvent que la bonne réponse. Signe
   d'une conception erronée répandue, ou d'une clé fausse : à relire en priorité.
3. **Distracteur mort** : choisi par moins de 5 % des répondants, à partir de 20 tentatives.
   Il ne trompe personne et rend la question plus facile qu'elle n'en a l'air.
4. **Indice de discrimination** :
   - comparer le taux de réussite à la question des 27 % d'élèves les plus forts et des 27 %
     les plus faibles, la force étant le taux de réussite global de l'élève sur ses autres
     questions ;
   - ne l'afficher qu'à partir de 30 répondants distincts ;
   - signaler une discrimination négative : les forts ratent plus que les faibles, souvent
     une question ambiguë ou une clé fausse.
5. **Temps médian** de réponse, global et pour les bonnes réponses.
6. **Effet de position** (agrégat global, pas par question) : taux de choix selon la position
   affichée, pour vérifier que le mélange neutralise bien la position.
7. Le drapeau `suspect` existant intègre les signaux 2 et 4.

Les seuils (5 %, 20 tentatives, 30 répondants, 27 %) sont des constantes nommées dans le module,
**pas** des réglages admin. Les tentatives historiques sans `choix_lettre` comptent dans le taux
de réussite, pas dans la répartition : la réponse le dit (`choix_connus` / `tentatives`).

### Tests

`tests/quiz-question-stats-choices.test.js` : jeux de tentatives construits à la main pour
chaque signal (attracteur, distracteur mort, discrimination positive, nulle et négative,
seuils), versions multiples, lignes historiques sans lettre.

---

## Lot D — Connecteur MCP et écran du professeur

1. **MCP** : l'action `stats` de `foretmap_quiz` renvoie `distractors.available: true` et, par
   question, la répartition, les attracteurs, les distracteurs morts, la discrimination et le
   temps médian (mêmes fonctions que le lot C, pas de requête dupliquée). Mettre à jour
   `docs/MCP.md`, en retirant la mention « distracteurs non disponibles ». Ce module n'est
   chargé que par `buildServerTools`, jamais par le stdio Cursor.
2. **Écran d'administration d'une question** (hors `src/gl/`) : sous chaque choix, une barre
   horizontale du pourcentage de choix.
   - Badges « attire plus que la bonne réponse » / « personne ne le choisit ».
   - Discrimination et temps médian dans un encart, avec une phrase d'aide en langage simple.
   - Mention « statistiques de la version actuelle : N réponses (M sur les versions
     précédentes) ».
   - Accessible : texte alternatif des barres, contraste, pas d'information portée par la
     couleur seule.
3. **Liste des questions** : tri possible par « suspectes d'abord ».

### Tests

`tests-ui/` (rendu des barres, badges, seuils non atteints affichés comme tels) et
`tests/mcp-domain-quiz.test.js` (champ `distractors`).

---

## Lot E — Données personnelles et documentation

1. Les tentatives sont déjà des données nominatives d'élèves. Les nouvelles colonnes n'ajoutent
   pas d'identifiant, mais la durée de réponse est une donnée comportementale. Vérifie et mets à
   jour :
   - la notice de confidentialité (`privacyNoticeContent.js`, tutoiement pour les élèves) :
     « le choix que tu as fait et le temps mis à répondre servent à améliorer les questions » ;
   - la durée de conservation dans `lib/retention/`, si les tentatives y sont traitées ;
   - `docs/MCP_REGISTRE_TRAITEMENT.md` si les statistiques d'élèves y sont décrites ;
   - les tests de cohérence de la notice (`tests/privacy-notice.test.js`).
   - Les statistiques du lot C sont **agrégées** : aucun nom d'élève n'y apparaît.
2. `docs/API.md` : nouveaux champs de `…/admin/questions/stats` ; claims ForêtMap
   supplémentaires du jeton, en précisant qu'ils ne révèlent pas la bonne réponse et que la
   charge GL est inchangée.
3. `docs/reference/` (côté prof) : comment lire la répartition des choix, et que faire d'un
   attracteur, d'un distracteur mort, d'une discrimination négative.
4. `CHANGELOG.md` sous `[Non publié]`, une entrée par lot.

---

## Organisation

- Branche `feat/quiz-reponse-choisie`, une PR en brouillon, un commit par lot A → E, passage en
  « Ready for review » après le lot E.
- Avant chaque commit : `npm run lint`, `npm run format:check`, `npm test`, `npm run test:ui`.
  Avant la sortie de brouillon : `npm run build`, puis les e2e du quiz s'ils existent.
- Aucun changement de comportement visible pour l'élève (même écran, même réponse).
- Si un point de ce prompt contredit le code ou une règle du dépôt, en particulier sur la forme
  des identifiants de choix ou le contenu du jeton, **arrête-toi et signale-le** au lieu de
  trancher seul.

## Livrable attendu en fin de session

1. Résumé par lot : fichiers modifiés, migration (numéro), tests ajoutés.
2. La réponse retenue au lot B, point 1 (forme des identifiants de choix, claims ajoutés).
3. Recette manuelle en huit lignes au plus :
   - répondre faux puis juste à une question en quiz libre ;
   - vérifier les deux lignes en base (lettre d'origine, ordre, durée, contexte) ;
   - modifier un choix et vérifier que l'empreinte change ;
   - ouvrir l'écran de la question (barres, mention de version) ;
   - interroger `foretmap_quiz stats` depuis Claude ;
   - répondre à un QCM G&L et vérifier que rien n'a changé.
