#!/usr/bin/env node
/**
 * Compactage du registre d'aide ForetMap (`content.help.registry`).
 *
 * Historiquement, enregistrer les bulles d'aide écrivait en base l'objet
 * **complet** : la ligne figeait alors tout le corpus, et améliorer un texte dans
 * `data/help.default.json` n'avait plus aucun effet à l'écran. Depuis le dégel,
 * l'écriture ne stocke plus que la **surcharge** — mais une instance déjà en
 * service conserve sa ligne dense tant que personne n'enregistre.
 *
 * Ce script réécrit cette ligne en surcharge, à contenu affiché **identique** :
 * il ne fait que retirer ce qui est déjà égal aux défauts versionnés.
 *
 * Par défaut, dry-run (aucune écriture).
 *
 * Usage:
 *   node scripts/compact-help-registry.js
 *   node scripts/compact-help-registry.js --apply
 *   node scripts/compact-help-registry.js --json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { queryOne, execute, endPool } = require('../database');
const { HELP_REGISTRY_KEY, buildHelpOverride, normalizeHelpConfig } = require('../lib/helpContent');

function parseFlags(argv) {
  const flags = { apply: false, json: false };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--json') flags.json = true;
  }
  return flags;
}

function countLeaves(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.reduce((total, item) => total + countLeaves(item), 0);
  if (typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countLeaves(item), 0);
  }
  return 1;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ? LIMIT 1', [
    HELP_REGISTRY_KEY,
  ]);

  if (!row) {
    const report = { status: 'absent', message: 'Aucune ligne : les défauts sont déjà servis.' };
    console.log(flags.json ? JSON.stringify(report) : `ℹ️  ${report.message}`);
    return;
  }

  let stored;
  try {
    stored = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
  } catch (_) {
    const report = {
      status: 'illisible',
      message: 'value_json illisible — la lecture retombe déjà sur les défauts.',
    };
    console.log(flags.json ? JSON.stringify(report) : `⚠️  ${report.message}`);
    return;
  }

  // Le rendu ne doit pas bouger : on compare la configuration résolue avant / après.
  const before = normalizeHelpConfig(stored);
  const override = buildHelpOverride(stored);
  const after = normalizeHelpConfig(override);

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error(
      '❌ Abandon : le compactage changerait le contenu affiché. Aucun écrit. Signaler ce cas — c’est un bug de la réduction, pas une donnée invalide.',
    );
    process.exitCode = 1;
    return;
  }

  const report = {
    status: 'ok',
    storedLeaves: countLeaves(stored),
    overrideLeaves: countLeaves(override),
    applied: false,
  };

  if (flags.apply) {
    await execute('UPDATE app_settings SET value_json = ?, updated_at = NOW() WHERE `key` = ?', [
      JSON.stringify(override),
      HELP_REGISTRY_KEY,
    ]);
    report.applied = true;
  }

  if (flags.json) {
    console.log(JSON.stringify(report));
    return;
  }

  console.log(
    `${report.applied ? '✅ Compacté' : '🔍 Dry-run'} — ${report.storedLeaves} valeurs stockées → ${report.overrideLeaves} surcharge(s) réelle(s).`,
  );
  if (report.overrideLeaves === 0) {
    console.log(
      '   Aucune personnalisation : le corpus suivra intégralement les défauts du dépôt.',
    );
  }
  if (!report.applied) console.log('   Relancer avec --apply pour écrire.');
}

main()
  .catch((err) => {
    console.error('❌ Échec du compactage :', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof endPool === 'function') await Promise.resolve(endPool()).catch(() => {});
  });
