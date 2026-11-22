# Journal du flux Q — Quiz : réponse choisie et analyse des distracteurs

Branche `orch/q`, base `foretmap_test_q`, port 3203. Source : `prompt_claude_code_quiz_reponse_choisie.md`
(lots A à E), avec les mises à jour de `q.md` et le tronc commun.

## Plan court (soumis à l'orchestrateur, 22/11/2026)

### Constat de lecture (le code a bougé depuis la source)

- La logique de `routes/quiz.js` a été extraite (piste B2) : règles dans
  `lib/pedago/quizService.js` (`presentQuizQuestion`, `checkAndRecordAnswer`), SQL dans
  `lib/pedago/quizRepository.js` (`insertAttempt`). La route ne garde que HTTP. Ces deux
  fichiers ne sont pas listés dans le périmètre de `q.md` : **demande d'extension** (ils
  portent ce que la source appelle « `routes/quiz.js` »).
- Gardes G&L déjà en place : `tests/quiz-gl-charge-inchangee.test.js` (charge de présentation,
  revendications du jeton, corps de réponse de `/api/gl/qcm` et `/api/gl/lore/qcm`, par les
  routes) et `tests/qcm-shared-payload-snapshot.test.js` (fonctions partagées). Je m'appuie
  dessus et les complète.
- `lib/accountMerge.js` déplace `user_quiz_attempts` par `UPDATE … SET user_id` (découverte
  par clé étrangère `fk_uqa_user`) : les nouvelles colonnes suivent la ligne sans changement de
  code. Je n'y touche pas ; un test le prouve.
- `lib/retention/` ne traite pas les tentatives de quiz (elles vivent et meurent avec le compte,
  `ON DELETE CASCADE`) : rien à y changer.

### Réponse au lot B, point 1 — retrouver la lettre d'origine

`…/answer` reçoit `{ presentationToken, choiceId }` où `choiceId` est l'**index** (0..n-1) dans
la liste mélangée : identifiant opaque, recalculé à chaque présentation. Mais le jeton porte
**déjà**, pour les deux produits, `choiceLetters` (lettres d'origine dans l'ordre affiché, ex.
`["C","A","D","B"]`), et `verifyPresentationAnswer` renvoie déjà `selectedLetter =
choiceLetters[choiceId]`. Donc :

- `choix_lettre` = `selectedLetter` (déjà calculé, aucune nouvelle revendication) ;
- `ordre_presente` = `choiceLetters.join('')` (déjà dans le jeton) ;
- la bonne réponse reste une empreinte HMAC (`answerHash`) ; rien de neuf n'est révélé.

**Écart de prudence signalé — empreinte de version** : la source demande de graver
`question_empreinte` (SHA-256 tronqué de l'énoncé, des choix **et de la bonne réponse**) dans le
jeton. Or le jeton est signé, pas chiffré : le client connaît l'énoncé et les choix, il
calculerait l'empreinte pour A, B, C, D, E et lirait la bonne réponse. Je grave donc à la place
`qfp` = HMAC-SHA256(`JWT_SECRET`, `jti|empreinte`) tronqué. À la réponse, le serveur recalcule
l'empreinte de la ligne courante : si le HMAC concorde, c'est la version présentée → stockée ;
sinon (question modifiée pendant les 15 min) → `question_empreinte = NULL` (tentative hors
statistiques de version, mais comptée dans le taux de réussite). La valeur stockée reste un
SHA-256 tronqué en clair, comparable à l'empreinte actuelle (`lib/quizQuestionFingerprint.js`,
pur) et stable même si `JWT_SECRET` change.

**Revendications ForetMap ajoutées** (jeton `fm_quiz_present` seulement, option facultative de
`presentQuestion` ; sans elle, charge identique à aujourd'hui → G&L inchangé) :
`qfp` (HMAC de l'empreinte), `pat` (instant de présentation en ms, pour une durée plus fine que
`iat` en secondes ; repli `iat*1000`), `org: 'tirage'` (si la présentation suit un tirage),
`ses` (séance annoncée). La lecture se fait par une option facultative de
`verifyPresentationAnswer` (`withPresentationMeta`) qui ajoute une clé `presentation` au
résultat **seulement si demandée** (forme G&L figée inchangée).

**Durée** : `now − pat` (repli `iat`), bornée [0, 900 000] ms ; tout champ du corps ignoré.

**Contexte** (priorité) : `validation` si le jeton porte `resource` ; sinon `seance` si `ses`
est une séance active de ce compte (`loadActivePedagoSession`, même règle que `pedagoSession`,
vérifiée à la réponse quand le compte est connu) ; sinon `tirage` si `org` ; sinon `libre`.

**Point bloquant hors périmètre — client** : le tirage (`/draw`) et la présentation sont deux
requêtes, et le client n'annonce ni l'un ni la séance à `…/present`. Sans changement client,
`tirage` et `seance` ne seraient jamais enregistrés. Côté serveur : `…/present` accepte
`?origine=tirage` et `?pedagoSession=` (simples étiquettes statistiques, jamais une décision).
Côté client (deux lignes, aucune réponse HTTP ni écran changés) : `src/services/quizApi.js`
(`presentQuizQuestion(code, { origine })` + `withPedagoSessionParam`) et
`src/hooks/useQuizSession.js` (passer `origine: 'tirage'` après `drawQuizQuestion`).
**Demande d'extension** pour ces deux fichiers ; à défaut, je livre le serveur et note le client
« À faire par l'intégration ».

### Fichiers par lot

- **A — Migration `quiz_attempt_choice`** (numéro de travail 388, premier libre) :
  `migrations/388_quiz_attempt_choice.sql` (5 colonnes `NULL`, `ADD COLUMN IF NOT EXISTS`, index
  `idx_uqa_question_version_choice (question_code, question_empreinte, choix_lettre)` en
  `CREATE INDEX IF NOT EXISTS`, rollback en commentaire, `SET NAMES` en tête) ;
  `tests/quiz-migration-attempt-choice.test.js` (fichier trouvé par suffixe ; rejouée deux fois ;
  colonnes, types, index ; aucune ligne `app_settings`). Rejeu deux fois sur la base fraîche et
  sur la copie anonymisée (`foretmap_test_q_dump`, supprimée ensuite).
  `sql/schema_foretmap.sql` → « À faire par l'intégration ».
- **B — Enregistrement** : `lib/quizQuestionFingerprint.js` (nouveau, pur) ; `lib/qcmChoices.js`
  (options facultatives `fmClaims` / `withPresentationMeta`) ; `lib/pedago/quizService.js`
  (présentation : claims ; réponse : lettre, ordre, durée, contexte, empreinte) ;
  `lib/pedago/quizRepository.js` (`insertAttempt` à 9 colonnes) ; `routes/quiz.js` (passage de
  la requête si besoin) ; client (si extension accordée). Tests : `tests/quiz-question-fingerprint.test.js`,
  `tests/quiz-answer-choice.test.js` (lettre juste/fausse sous plusieurs mélanges forcés via
  `Math.random` simulé, ordre, durée bornée et `duree` du corps ignorée, quatre contextes,
  empreinte sensible aux choix et pas aux feedbacks, question modifiée entre présentation et
  réponse → empreinte NULL, rejeu 409 et verrou 403 n'écrivent rien, fusion de comptes garde les
  colonnes, **G&L** : charge de présentation, revendications du jeton et corps de réponse de
  `/api/gl/qcm` et `/api/gl/lore/qcm` identiques) ; compléments à `quiz-gl-charge-inchangee` /
  `qcm-shared-payload-snapshot` si besoin.
- **C — Statistiques d'items** : `lib/quizQuestionStats.js` (nouvelles fonctions FM
  `loadFmChoiceStats`, `computeChoiceSignals`, `computeDiscrimination`, `computePositionEffect`,
  constantes nommées 5 % / 20 / 30 / 27 % ; `decorate` et `listGlQuestionStats` inchangés) ;
  `lib/pedago/quizService.js` (`getQuestionSuccessStats` enrichi : par question `version`,
  `choix_connus`, `tentatives`, `tentatives_versions_anterieures`, `repartition`,
  `attracteurs`, `distracteurs_morts`, `discrimination`, `temps_median_ms`, `suspect`
  intégrant attracteur et discrimination négative ; agrégat `effet_position`). SQL groupé
  (par question × empreinte × lettre ; par question × élève pour la discrimination ; par
  position), empreinte courante calculée en JS par le module pur. Test :
  `tests/quiz-question-stats-choices.test.js` (jeux construits à la main pour chaque signal,
  seuils, versions multiples, lignes historiques sans lettre).
- **D — MCP et écran prof** : `lib/mcp/domains/quiz.js` (`distractors.available: true` +
  détail par question, via les fonctions du lot C, adaptateur `db.raw`) ;
  `lib/mcp/tools/domains/quiz.js` (description) ; `docs/MCP.md`. Écran :
  `src/components/pedago/admin/FMQuizQuestionEditorPanel.jsx` (référence `questionStats`,
  `fieldRenderers` des `choix_a…e` avec barre accessible et badges, encart discrimination /
  temps médian / mention de version, tri « Suspectes d'abord ») + nouveau
  `src/components/pedago/admin/FMQuizChoiceStats.jsx` + styles par tokens dans `src/index.css`
  (section quiz). Changement partagé minimal et rétrocompatible :
  `src/shared/qcm/QuestionEditorPanel.jsx` passe `{ refs }` en 3ᵉ argument de `clientSort`
  (ignoré par les tris G&L existants). Tests : `tests-ui/FMQuizChoiceStats.test.jsx`,
  `tests/mcp-domain-quiz.test.js`.
- **E — Données personnelles et doc** : `src/shared/privacy/privacyNoticeContent.js` (phrase
  tutoyée sur le choix et le temps de réponse), `tests/privacy-notice.test.js`,
  `docs/MCP_REGISTRE_TRAITEMENT.md`, `docs/API.md` (champs des stats, claims ForetMap du jeton,
  `?origine=` / `?pedagoSession=` de `…/present`, charge G&L inchangée),
  `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md` (lire la répartition, que faire
  d'un attracteur, d'un distracteur mort, d'une discrimination négative), `changelog.d/q.md`
  (une entrée par lot). `lib/retention/` : inchangé (justifié ci-dessus).

### Demandes à l'orchestrateur

1. Extension de périmètre : `lib/pedago/quizService.js`, `lib/pedago/quizRepository.js`
   (logique et SQL de `routes/quiz.js`) ; `src/services/quizApi.js`, `src/hooks/useQuizSession.js`
   (annonce `origine=tirage` et séance) ; `src/shared/qcm/QuestionEditorPanel.jsx` (3ᵉ argument
   rétrocompatible de `clientSort`) ; `src/index.css` (styles des barres, par tokens).
2. Validation de l'écart « HMAC de l'empreinte dans le jeton au lieu de l'empreinte en clair ».

## Décisions de l'orchestrateur (22/11)

- Plan validé ; écart « HMAC de l'empreinte dans le jeton » validé (à documenter dans
  `docs/API.md` et dans les écarts du résumé final).
- Extensions accordées : `lib/pedago/quizService.js`, `lib/pedago/quizRepository.js`,
  `src/services/quizApi.js`, `src/hooks/useQuizSession.js` (réponse HTTP et écran inchangés ;
  `origine` / `pedagoSession` = étiquettes non fiables, valeur invalide ignorée sans 400),
  `src/shared/qcm/QuestionEditorPanel.jsx` (3ᵉ argument `{ refs }` de `clientSort` seulement,
  test d'ordre G&L inchangé). **Refusé** : `src/index.css` → feuille dédiée importée par
  `FMQuizChoiceStats.jsx`.
- Numéro de travail 388 accepté ; `sql/schema_foretmap.sql` → intégration.

## Avancement

- Suites G&L **avant** : 1952 tests, 0 échec.
- **Lot A fait** : `migrations/388_quiz_attempt_choice.sql`,
  `tests/quiz-migration-attempt-choice.test.js`, `src/shared/enums/pedagoEnums.js` (+ miroir
  `lib/shared/pedagoEnums.js`) — le test du référentiel des ENUM exige une définition pour
  toute colonne ENUM : `QUIZ_ANSWER_LETTER_ENUM.columns` += `user_quiz_attempts.choix_lettre`,
  nouveau `QUIZ_ATTEMPT_CONTEXTE_ENUM` (ajout rétrocompatible d'un module partagé). Rejouée deux
  fois sur la base fraîche et sur la copie anonymisée (268 tentatives, aucune erreur, colonnes
  NULL).

- **Lot B fait** : `lib/quizQuestionFingerprint.js` (nouveau), `lib/qcmChoices.js` (options
  facultatives `extraClaims` / `includeClaims`, `jti` sorti en variable — charge G&L
  identique), `lib/pedago/quizService.js` (revendications `qfp`, `pat`, `org`, `ses` ;
  colonnes calculées à la réponse), `lib/pedago/quizRepository.js` (`insertAttempt` à neuf
  colonnes), `src/services/quizApi.js`, `src/hooks/useQuizSession.js`. Tests :
  `tests/quiz-question-fingerprint.test.js`, `tests/quiz-answer-choice.test.js`, mise à jour
  `tests-ui/services/quizApi.test.js` et `tests-ui/components/pedago/QuizView.test.jsx` (URL
  `…/present?origine=tirage` après un tirage). `lib/accountMerge.js` inchangé (le test de
  fusion prouve que les colonnes suivent). `routes/quiz.js` inchangé (la requête est déjà
  transmise au service).

- **Lot C fait** : `lib/quizQuestionStats.js` (fonctions pures `computeChoiceSignals`,
  `computeDiscrimination`, `computePositionEffect`, `median`, `withItemSignals` ; lectures
  `loadFmItemAnalysis` — 5 requêtes groupées quel que soit le nombre d'élèves — et
  `loadFmPositionEffect` ; `decorate` / `listGlQuestionStats` inchangés),
  `lib/pedago/quizService.js` (`getQuestionSuccessStats` enrichi). Test
  `tests/quiz-question-stats-choices.test.js` (18 cas). Contrôle sur la copie anonymisée :
  139 questions en 52 ms.

- **Lot D fait** : `lib/mcp/domains/quiz.js`, `lib/mcp/tools/domains/quiz.js`, `docs/MCP.md` ;
  écran : `src/components/pedago/admin/FMQuizQuestionEditorPanel.jsx` (référence
  `questionStats`, rendus FM des choix et de la bonne réponse, tri « Suspectes d'abord »),
  nouveaux `FMQuizChoiceStats.jsx`, `fmQuizChoiceStatsModel.js`, `fmQuizChoiceStats.css`
  (feuille dédiée, jetons seulement, largeur de barre par propriété personnalisée) ;
  `src/shared/qcm/QuestionEditorPanel.jsx` (3ᵉ argument `{ refs }` de `clientSort`, `refs` dans
  les dépendances du mémo). Tests : `tests-ui/FMQuizChoiceStats.test.jsx` (formats, tri,
  barres, badges, seuils, tris G&L identiques avec et sans 3ᵉ argument, montage de l'écran),
  `tests/mcp-domain-quiz.test.js`, assertion mise à jour dans `tests/mcp-domain-pedago.test.js`
  (`distractors.available` passe à `true`).
- Environnement : ma base de test n'avait pas les zones de démonstration (`seedData` jamais
  lancé) → `mcp-domain-pedago` échouait avant mes changements ; `seedData()` lancé sur
  `foretmap_test_q`.

- **Lot E fait** : `src/shared/privacy/privacyNoticeContent.js`, `tests/privacy-notice.test.js`,
  `docs/MCP_REGISTRE_TRAITEMENT.md`, `docs/API.md`,
  `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md`. `lib/retention/` inchangé.

## À faire par l'intégration

- `sql/schema_foretmap.sql` : ajouter les cinq colonnes et l'index de la migration
  `quiz_attempt_choice` à `user_quiz_attempts`.
- Renuméroter `migrations/388_quiz_attempt_choice.sql` si C2 prend 388.
- `tests/inline-style-guard.test.js` échoue déjà sur `main` (`src/components/visit-views.jsx` :
  3 styles en ligne pour 2 inventoriés, commit 66baa2d) : hors périmètre, pas de mon fait.
- `docs/reference/exploitation/vos-donnees.md` (hors périmètre) : on peut y ajouter une ligne
  sur le choix fait au quiz et le temps de réponse, en écho à la notice.
- `src/shared/enums/pedagoEnums.js` : surveiller un conflit avec un autre flux qui y ajouterait
  une définition (ajout en fin de bloc quiz).

## Vérifications de fin de flux

- `npm run lint` : 0 erreur (318 avertissements préexistants) ; `npm run format:check` : OK ;
  `sync:shared-cores:check` : OK.
- `npm run test:ui` : 862 fichiers, 6 728 tests, 0 échec.
- `npm test` : 6 953 tests, 2 échecs → (1) `task-taxonomy-literals` : littéral `'seance'`
  (nouveau contexte de tentative) — corrigé : constante `QUIZ_ATTEMPT_CONTEXTE` dans
  `pedagoEnums.js`, utilisée par `quizService.js`, et `'seance'` ajouté aux homonymes admis de
  `pedagoEnums.js` dans `tests/task-taxonomy-literals.test.js` (hors périmètre strict : test de
  garde générique, mécanisme prévu pour ce cas) ; (2) `inline-style-guard` : préexistant sur
  `main` (`visit-views.jsx`), voir « À faire par l'intégration ».
- Suites G&L après : 1 949 tests, 0 échec (avant : 1 952 ; les 3 manquants sont les deux
  suites `ALLOWED_*` de `gl-admin-helpers.test.js`, dont la sortie est coupée par
  `--test-force-exit` dans le lot ; le fichier seul : 21/21).

## FLUX TERMINÉ

- **Fichiers modifiés** : `lib/qcmChoices.js`, `lib/pedago/quizService.js`,
  `lib/pedago/quizRepository.js`, `lib/quizQuestionStats.js`, `lib/quizQuestionFingerprint.js`
  (nouveau), `lib/mcp/domains/quiz.js`, `lib/mcp/tools/domains/quiz.js`,
  `src/shared/enums/pedagoEnums.js` (+ miroir), `src/services/quizApi.js`,
  `src/hooks/useQuizSession.js`, `src/shared/qcm/QuestionEditorPanel.jsx`,
  `src/components/pedago/admin/{FMQuizQuestionEditorPanel.jsx, FMQuizChoiceStats.jsx,
fmQuizChoiceStatsModel.js, fmQuizChoiceStats.css}`, `src/shared/privacy/privacyNoticeContent.js`,
  `docs/API.md`, `docs/MCP.md`, `docs/MCP_REGISTRE_TRAITEMENT.md`,
  `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md`, `changelog.d/q.md`.
- **Migration** : `quiz_attempt_choice` (fichier de travail `388_quiz_attempt_choice.sql`).
- **Tests ajoutés** : `quiz-migration-attempt-choice`, `quiz-question-fingerprint`,
  `quiz-answer-choice`, `quiz-question-stats-choices`, `mcp-domain-quiz`,
  `tests-ui/FMQuizChoiceStats` ; mis à jour : `mcp-domain-pedago`, `privacy-notice`,
  `task-taxonomy-literals`, `tests-ui/services/quizApi`, `tests-ui/components/pedago/QuizView`.
- **Écarts au prompt** : empreinte de version en HMAC dans le jeton (`qfp`), pas en clair
  (validé) ; revendication `pat` (ms) en plus de `iat` ; `tirage` / `seance` annoncés par le
  client (`?origine=tirage`, `?pedagoSession=`) ; `accountMerge.js` et `lib/retention/`
  inchangés (prouvé par test / justifié) ; tests MCP du champ `distractors` dans un nouveau
  `mcp-domain-quiz.test.js`.
- **Points pour Oliv** : les statistiques de choix ne démarrent qu'avec les réponses données
  après le déploiement (les 268 tentatives existantes n'ont pas de lettre) ; la discrimination
  exige 30 élèves distincts par question, donc elle restera longtemps « pas encore calculable »
  sur la plupart des questions.
