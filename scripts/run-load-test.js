'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'load', 'reports');
const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:3000').trim();
const profile = String(process.argv[2] || 'normal').trim().toLowerCase();
const profileToScenarioFile = {
  light: path.join('load', 'artillery-light.yml'),
  normal: path.join('load', 'artillery.yml'),
  stress: path.join('load', 'artillery-stress.yml'),
  /** ~10 VU, pas de bypass rate limit (même IP que tous les clients Artillery). */
  '10vu': path.join('load', 'artillery-10vu.yml'),
};

if (!profileToScenarioFile[profile]) {
  console.error(`Profil inconnu: "${profile}". Profils supportés: light, normal, stress, 10vu.`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join('load', 'reports', `${profile}-${timestamp}.json`);
const latestOutputFile = path.join('load', 'report.json');
const scenarioFile = profileToScenarioFile[profile];
const command = `npx artillery run --target "${baseUrl}" "${scenarioFile}" --output "${outputFile}"`;

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

console.log(`\n[load] Profil: ${profile}`);
console.log(`[load] Base URL: ${baseUrl}`);
console.log(`[load] Scenario: ${scenarioFile}`);
console.log(`[load] Rapport JSON: ${outputFile}\n`);

const result = spawnSync(command, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

const status = typeof result.status === 'number' ? result.status : 1;
if (status !== 0) process.exit(status);

try {
  fs.copyFileSync(path.join(ROOT, outputFile), path.join(ROOT, latestOutputFile));
  console.log(`\n[load] Dernier rapport mis à jour: ${latestOutputFile}`);
} catch (err) {
  console.warn(`[load] Copie vers ${latestOutputFile} impossible: ${err.message}`);
}

process.exit(0);
