#!/usr/bin/env node
'use strict';

/**
 * Empreinte du schéma (flux F7) : régénérer la version versionnée ou comparer une base à elle.
 *
 *   node scripts/schema-fingerprint.js            # compare la base (DB_NAME) à sql/schema_fingerprint.json
 *   node scripts/schema-fingerprint.js --write    # régénère sql/schema_fingerprint.json depuis la base
 *   node scripts/schema-fingerprint.js --out f.json        # écrit l'empreinte de la base dans f.json
 *   node scripts/schema-fingerprint.js --expected f.json   # compare la base à f.json
 *   node scripts/schema-fingerprint.js --json     # sortie JSON complète (écarts détaillés)
 *
 * `--write` se joue sur une base **fraîche et à jour** (`npm run db:init` sur une base vide, ou
 * la base de test du poste) : il refuse une base dont des migrations sont en attente. Il
 * n'écrit que le fichier, jamais la base.
 *
 * Lecture seule côté base (information_schema). Jamais bloquant : code 0 même avec des écarts
 * (1 = base injoignable ou erreur, 2 = `--write` refusé).
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

/**
 * JSON au format Prettier du dépôt (sinon `npm run format:check` tombe sur le fichier régénéré).
 * Prettier n'est qu'une dépendance de développement : sans lui, JSON indenté brut.
 */
async function formatJson(doc, target) {
  const raw = `${JSON.stringify(doc, null, 2)}\n`;
  try {
    const prettier = require('prettier');
    const config = (await prettier.resolveConfig(target)) || {};
    return await prettier.format(raw, { ...config, parser: 'json' });
  } catch {
    return raw;
  }
}

async function main() {
  const database = require('../database');
  const fp = require('../lib/schemaFingerprint');
  const { getMigrationStatus, listMigrationFiles } = require('../lib/migrationStatus');
  let code = 0;
  try {
    const write = process.argv.includes('--write');
    const out = argValue('--out');
    if (write || out) {
      const status = await getMigrationStatus(database);
      if (write && !status.upToDate) {
        console.error(
          `[schema-fingerprint] base pas à jour (version ${status.current}, en attente : ` +
            `${status.pending.join(', ') || 'aucune'}) : npm run db:migrate d'abord.`,
        );
        code = 2;
        return;
      }
      const files = listMigrationFiles();
      const doc = fp.buildFingerprintDocument(await fp.readSchemaFingerprint(database), {
        migration: write ? files[files.length - 1] || null : null,
      });
      const target = out || fp.DEFAULT_FINGERPRINT_PATH;
      fs.writeFileSync(target, await formatJson(doc, target));
      console.log(
        `[schema-fingerprint] ${Object.keys(doc.tables).length} tables, ${doc.views.length} vues → ${target}`,
      );
      return;
    }
    const expectedPath = argValue('--expected') || fp.DEFAULT_FINGERPRINT_PATH;
    const status = await getMigrationStatus(database).catch(() => ({ current: null }));
    const drift = await fp.getSchemaDrift(database, {
      fingerprintPath: expectedPath,
      currentVersion: status.current,
    });
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(drift, null, 2));
    } else if (!drift.available) {
      console.log(`[schema-fingerprint] contrôle indisponible : ${drift.reason}`);
    } else if (drift.ok) {
      console.log('[schema-fingerprint] aucun écart avec le schéma attendu.');
    } else {
      console.log(`[schema-fingerprint] ${drift.total} écart(s) avec le schéma attendu :`);
      for (const line of drift.messages) console.log(`  - ${line}`);
      if (drift.stale) {
        console.log('  (base en retard sur les migrations : une partie des écarts est attendue)');
      }
    }
  } catch (err) {
    console.error(`[schema-fingerprint] erreur : ${err.message}`);
    code = 1;
  } finally {
    await database.endPool().catch(() => {});
    process.exitCode = code;
  }
}

main();
