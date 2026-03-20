// Point d'entrée cPanel / Passenger (o2switch).
// Écrit un diagnostic immédiat AVANT tout require applicatif,
// puis charge server.js et lance le boot.
const fs   = require('fs');
const path = require('path');

const diagPath = path.join(__dirname, 'startup-diag.log');
fs.writeFileSync(diagPath, [
  `=== app.js ${new Date().toISOString()} ===`,
  `require.main === module: ${require.main === module}`,
  `argv: ${process.argv.join(' ')}`,
  `node: ${process.version}`,
  `cwd: ${process.cwd()}`,
  `PORT env: ${process.env.PORT}`,
  `NODE_ENV: ${process.env.NODE_ENV}`,
  '',
].join('\n'));

try {
  const { app, boot } = require('./server');
  fs.appendFileSync(diagPath, 'require(./server): OK\n');

  boot();
  fs.appendFileSync(diagPath, 'boot(): OK\n');

  // Export direct de l'app Express (format attendu par Passenger)
  module.exports = app;
} catch (err) {
  fs.appendFileSync(diagPath, `ERREUR: ${err.stack}\n`);
  throw err;
}
