'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const profiles = ['light', 'normal', 'stress'];

function run(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

function main() {
  for (const profile of profiles) {
    console.log(`\n===== Scenario ${profile} =====`);
    const runCode = run(`node scripts/run-load-test.js ${profile}`);
    if (runCode !== 0) process.exit(runCode);

    const reportCode = run(
      `node scripts/render-load-report.js "load/report.json" "load/reports/${profile}-summary.md"`
    );
    if (reportCode !== 0) process.exit(reportCode);
  }

  console.log('\nTous les scénarios de charge sont terminés.');
}

main();
