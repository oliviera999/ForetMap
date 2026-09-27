'use strict';

/**
 * Ancien carnet d'observations (`observation_logs`) — retiré de l'application.
 *
 * Plan de retrait en trois temps (audit du 25/09/2026, § 3.5, ligne `observation_logs`) :
 *   - T1, cesser de lire : `GET /api/observations/student/:id`, `/all` et `/:id/image` ne
 *     servaient que l'écran `ObservationNotebook`, démonté depuis que l'onglet « Carnet »
 *     ouvre le carnet unifié (`/api/user-journal`), qui a recopié chaque observation ;
 *   - T2, cesser d'écrire : `POST /api/observations` et `DELETE /api/observations/:id` n'ont
 *     plus d'appelant. La suppression effaçait en outre le fichier photo, que l'article de
 *     carnet recopié référence encore (`user_journal_article_assets`) ;
 *   - T3 (`DROP TABLE`) : pas ici — il attend ses contrôles de passage (rapport du lot 307).
 *
 * Les observations d'espèces validées par un enseignant vivent désormais sous
 * `/api/species-observations` (`routes/species-observations.js`, migration 307). Ce routeur
 * répond 410 Gone à toute requête, comme les anciennes routes d'élévation par PIN : un client
 * resté en cache apprend explicitement la disparition au lieu d'un 404 ambigu.
 *
 * Les tables `observation_logs` et `user_journal_observation_map` restent en place : la reprise
 * vers le carnet (`lib/fmUserJournal.js`, `migrateObservationLogsOnce`) les lit encore.
 */

const express = require('express');

const router = express.Router();

const GONE_BODY = Object.freeze({
  error:
    'L’ancien carnet d’observations est retiré : les observations sont dans le carnet, les signalements d’espèces sous /api/species-observations.',
  code: 'OBSERVATIONS_LEGACY_GONE',
});

router.use((req, res) => res.status(410).json(GONE_BODY));

module.exports = router;
module.exports.GONE_BODY = GONE_BODY;
