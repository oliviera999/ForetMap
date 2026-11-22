### Ajouté — Quiz : réponse choisie et analyse des distracteurs (flux Q)

- **Lot A — migration `quiz_attempt_choice`** : cinq colonnes `NULL` sur `user_quiz_attempts`
  (`choix_lettre` lettre d'origine du choix retenu, `ordre_presente` ordre affiché en lettres
  d'origine, `duree_ms` temps de réponse mesuré côté serveur, `contexte` libre / tirage /
  validation / séance, `question_empreinte` empreinte de version de la question) et l'index
  `(question_code, question_empreinte, choix_lettre)`. Les tentatives historiques restent sans
  valeur. Référentiel des ENUM : `QUIZ_ANSWER_LETTER_ENUM` couvre aussi `choix_lettre`, nouveau
  `QUIZ_ATTEMPT_CONTEXTE_ENUM`. Test `tests/quiz-migration-attempt-choice.test.js`.
