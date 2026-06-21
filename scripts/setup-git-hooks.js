'use strict';

// Active les hooks Git versionnés du dépôt (dossier `.githooks/`) après `npm install`.
// Exécuté par le script npm `prepare`. No-op silencieux hors dépôt Git (install via tarball, CI sans .git…).

const { execFileSync } = require('child_process');

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
} catch (_) {
  process.exit(0); // pas un dépôt Git : rien à faire
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('[hooks] core.hooksPath = .githooks (pre-commit lint + format actif)');
} catch (_) {
  // git absent ou config en échec : ne pas casser l'installation
}
