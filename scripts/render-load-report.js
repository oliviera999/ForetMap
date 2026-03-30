'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPathArg = String(process.argv[2] || 'load/report.json').trim();
const summaryPathArg = String(process.argv[3] || 'load/report-summary.md').trim();
const reportPath = path.isAbsolute(reportPathArg) ? reportPathArg : path.join(ROOT, reportPathArg);
const summaryPath = path.isAbsolute(summaryPathArg) ? summaryPathArg : path.join(ROOT, summaryPathArg);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function n(value) {
  return Number.isFinite(value) ? value : 0;
}

function pct(part, total) {
  if (!total) return '0.00';
  return ((part / total) * 100).toFixed(2);
}

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error(`Rapport introuvable: ${reportPathArg}. Lancez d'abord un test de charge.`);
    process.exit(1);
  }

  const report = readJson(reportPath);
  const counters = report?.aggregate?.counters || {};
  const summaries = report?.aggregate?.summaries || {};
  const rates = report?.aggregate?.rates || {};

  const requests = n(counters['http.requests']);
  const responses = n(counters['http.responses']);
  const codes2xx = n(counters['http.codes.200']);
  const codes429 = n(counters['http.codes.429']);
  const codes5xx = Object.keys(counters)
    .filter((k) => /^http\.codes\.5\d\d$/.test(k))
    .reduce((acc, key) => acc + n(counters[key]), 0);
  const vusersCreated = n(counters['vusers.created']);
  const vusersCompleted = n(counters['vusers.completed']);
  const vusersFailed = n(counters['vusers.failed']);
  const rps = n(rates['http.request_rate']);
  const rt = summaries['http.response_time'] || {};

  const lines = [
    '# Rapport de charge ForetMap',
    '',
    `- Requêtes: ${requests}`,
    `- Réponses: ${responses}`,
    `- 200: ${codes2xx} (${pct(codes2xx, responses)} %)`,
    `- 429: ${codes429} (${pct(codes429, responses)} %)`,
    `- 5xx: ${codes5xx} (${pct(codes5xx, responses)} %)`,
    `- VUs créés: ${vusersCreated}`,
    `- VUs terminés: ${vusersCompleted}`,
    `- VUs en échec: ${vusersFailed}`,
    `- Débit moyen: ${rps}/sec`,
    `- Latence moyenne: ${n(rt.mean)} ms`,
    `- P95: ${n(rt.p95)} ms`,
    `- P99: ${n(rt.p99)} ms`,
    '',
    `_Source: \`${reportPathArg}\`_`,
    '',
  ];

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');
  console.log(`Résumé généré: ${path.relative(ROOT, summaryPath) || summaryPath}`);
}

main();
