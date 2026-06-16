#!/usr/bin/env node
/**
 * Audit des clés _keys.json vs slugs attendus par le code GL.
 * Usage: node scripts/audit-gl-media-keys.mjs [chemin/_keys.json]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  auditGlMediaKeys,
  formatAuditReport,
  loadKeysIndexFromFile,
} = require('../lib/glMediaKeysAudit.js');

const keysPath =
  process.argv[2] || path.join(__dirname, '..', 'uploads', 'media-library', '_keys.json');

const index = loadKeysIndexFromFile(keysPath);
const report = auditGlMediaKeys(index, { keysPath });
console.log(formatAuditReport(report));
process.exitCode = report.missing.length > 0 ? 1 : 0;
