#!/usr/bin/env node
'use strict';

/**
 * Prépare la **partie de démonstration** G&L depuis la ligne de commande :
 *
 *   npm run gl:demo:seed            # crée ce qui manque, garde la partie existante
 *   npm run gl:demo:seed -- --reset # efface et recrée la partie (joueurs fictifs conservés)
 *
 * Même logique que le bouton « Préparer la démo » de la console MJ (`lib/gl/demoGame.js`).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const logger = require('../lib/logger');

async function main() {
  const reset = process.argv.includes('--reset');
  const { ensureGlDemoGame } = require('../lib/gl/demoGame');
  const result = await ensureGlDemoGame({ actorId: 'script:gl-demo-seed', reset });
  logger.info(
    {
      classId: result.classId,
      gameId: result.gameId,
      chapterId: result.chapterId,
      teamIds: result.teamIds,
      players: result.playerIds.length,
      created: result.created,
      reset,
    },
    'partie de démonstration prête',
  );
  process.stdout.write(
    `Partie de démonstration #${result.gameId} (classe #${result.classId}, ${result.playerIds.length} joueurs fictifs)${result.created ? ' — créée' : ' — déjà en place'}\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'préparation de la démonstration impossible');
    process.stderr.write(`${err?.message || err}\n`);
    process.exit(1);
  });
