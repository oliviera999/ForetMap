#!/usr/bin/env node
'use strict';

/**
 * Libère le port HTTP d'écoute pour les e2e (évite un serveur Node obsolète avec reuseExistingServer).
 * Windows : netstat + taskkill. Autres : fuser si disponible, sinon no-op.
 */
const port = Number(process.env.E2E_KILL_PORT || process.env.PORT || 3000, 10);
const { spawnSync } = require('child_process');

function main() {
  if (String(process.env.CI || '').toLowerCase() === 'true') process.exit(0);
  if (!Number.isFinite(port) || port <= 0) process.exit(0);
  if (process.platform !== 'win32') {
    // Linux : `fuser -k PORT/tcp` si disponible. macOS / autres : no-op (voir README e2e).
    spawnSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    process.exit(0);
  }
  const netstat = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8' });
  const out = String(netstat.stdout || '');
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', pid, '/F', '/T'], { stdio: 'ignore' });
  }
}

main();
