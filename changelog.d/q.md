### Ajouté — Quiz : réponse choisie et analyse des distracteurs (flux Q)

- **Lot A — migration `quiz_attempt_choice`** : cinq colonnes `NULL` sur `user_quiz_attempts`
  (`choix_lettre` lettre d'origine du choix retenu, `ordre_presente` ordre affiché en lettres
  d'origine, `duree_ms` temps de réponse mesuré côté serveur, `contexte` libre / tirage /
  validation / séance, `question_empreinte` empreinte de version de la question) et l'index
  `(question_code, question_empreinte, choix_lettre)`. Les tentatives historiques restent sans
  valeur. Référentiel des ENUM : `QUIZ_ANSWER_LETTER_ENUM` couvre aussi `choix_lettre`, nouveau
  `QUIZ_ATTEMPT_CONTEXTE_ENUM`. Test `tests/quiz-migration-attempt-choice.test.js`.
- **Lot B — enregistrement à la réponse** : `POST /api/quiz/questions/:code/answer` renseigne
  les cinq colonnes, toutes lues dans le jeton de présentation vérifié (jamais dans le corps).
  Lettre d'origine et ordre : `choiceLetters`, déjà porté par le jeton. Nouvelles revendications
  ForetMap du jeton (aucune ne révèle la bonne réponse ; charge G&L inchangée) : `qfp` (HMAC de
  l'empreinte de version, liée au `jti`), `pat` (instant de présentation), `org` et `ses`
  (étiquettes déclarées par le client : `?origine=tirage`, `?pedagoSession=` sur `…/present`,
  séance retenue seulement si le serveur la confirme active). Empreinte : nouveau module pur
  `lib/quizQuestionFingerprint.js` (énoncé, choix, bonne réponse ; pas les feedbacks) ; `NULL`
  si la question a changé entre présentation et réponse. Le client annonce le tirage et la
  séance ; réponse HTTP et écran élève inchangés. Rejeu (409) et verrou (403) n'écrivent
  toujours rien. Tests `quiz-question-fingerprint`, `quiz-answer-choice`.
