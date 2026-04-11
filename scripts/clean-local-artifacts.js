#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));

const runTestsCleanup = args.has('--tests');
const runLoadCleanup = args.has('--load');
const noModeProvided = !runTestsCleanup && !runLoadCleanup;

const shouldCleanTests = runTestsCleanup || noModeProvided;
const shouldCleanLoad = runLoadCleanup || noModeProvided;

const deletedEntries = [];

function isTrackedByGit(relativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: projectRoot,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function removePath(relativePath, options = {}) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  if (options.skipIfTracked && isTrackedByGit(relativePath)) {
    return;
  }

  fs.rmSync(fullPath, { recursive: true, force: true });
  deletedEntries.push(relativePath);
}

function cleanTestsArtifacts() {
  removePath('playwright-report');
  removePath('test-results');
  removePath('blob-report');
  removePath('startup.log');
  removePath('startup-diag.log');
}

function cleanLoadArtifacts() {
  const loadReportsDir = path.join(projectRoot, 'load', 'reports');
  if (fs.existsSync(loadReportsDir)) {
    const entries = fs.readdirSync(loadReportsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      // Matches reports like normal-2026-04-11T12-00-00.000Z.json
      if (/T.*\.json$/i.test(entry.name)) {
        const relativeFilePath = path.join('load', 'reports', entry.name);
        removePath(relativeFilePath, { skipIfTracked: true });
      }
    }
  }
}

if (shouldCleanTests) {
  cleanTestsArtifacts();
}

if (shouldCleanLoad) {
  cleanLoadArtifacts();
}

if (deletedEntries.length === 0) {
  console.log('Aucun artefact local a supprimer.');
  process.exit(0);
}

console.log('Artefacts locaux supprimes:');
for (const entry of deletedEntries) {
  console.log(`- ${entry}`);
}
