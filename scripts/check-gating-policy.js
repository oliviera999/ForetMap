#!/usr/bin/env node
/**
 * Lit et affiche la politique de conditionnement RÉELLEMENT en base (ForetMap + G&L).
 *
 * Pourquoi ce script : les défauts du code ne sont pas matérialisés en base
 * (`getSettingValue` renvoie le défaut quand la clé est absente). Impossible, donc, de
 * savoir depuis le code seul si une installation applique le défaut livré ou une valeur
 * enregistrée un jour dans les réglages — et un délai de verrou hérité de l'ancien réglage
 * en jours (72 h) ne se voit nulle part tant qu'un élève ne se trompe pas.
 *
 * Strictement en LECTURE : aucun UPDATE, aucun INSERT.
 *
 * Usage : npm run gating:check
 * Sortie : code 0 si tout est lisible, 1 si la base est injoignable.
 */
require('dotenv').config();

const { queryAll, queryOne } = require('../database');
const gatingCore = require('../lib/shared/gatingSettingsCore');
const {
  DEFAULT_RETRY_COOLDOWN_HOURS,
  formatHoursLabel,
} = require('../lib/shared/cooldownDurationCore');
const { resolveEffectiveGatingPolicy } = require('../lib/shared/gatingPolicyLayersCore');

/** Valeurs brutes des réglages d'un produit, par NOM LOGIQUE, avec l'origine de chacune. */
async function readSiteSettings(product) {
  const table = product === 'gl' ? 'gl_settings' : 'app_settings';
  const keys = gatingCore.gatingKeysFor(product);
  if (keys.length === 0) return { raw: {}, stored: new Set() };
  const rows = await queryAll(
    `SELECT \`key\`, value_json FROM ${table} WHERE \`key\` IN (${keys.map(() => '?').join(', ')})`,
    keys,
  );
  const raw = {};
  const stored = new Set();
  for (const row of rows) {
    const name = gatingCore.gatingNameForKey(product, row.key);
    if (!name) continue;
    stored.add(name);
    try {
      raw[name] = JSON.parse(row.value_json);
    } catch (_) {
      raw[name] = String(row.value_json).replace(/"/g, '');
    }
  }
  return { raw, stored };
}

function printSite(product, settings, stored) {
  console.log(`\n${product === 'gl' ? 'Gnomes & Licornes' : 'ForetMap'} — réglages du site`);
  for (const name of Object.keys(settings)) {
    const origin = stored.has(name) ? 'enregistré en base' : 'défaut du code';
    console.log(`  ${name.padEnd(36)} ${String(settings[name]).padEnd(12)} (${origin})`);
  }
}

/** Le délai effectif du site est-il bien celui qu'on attend ? */
function checkLock(product, settings) {
  const hours = Number(settings.retryCooldownHours);
  const label = formatHoursLabel(hours);
  if (hours === DEFAULT_RETRY_COOLDOWN_HOURS) {
    console.log(`  → verrou : ${label}. Conforme au défaut livré.`);
    return true;
  }
  console.log(
    `  → verrou : ${label} — DIFFÉRENT du défaut livré (${formatHoursLabel(DEFAULT_RETRY_COOLDOWN_HOURS)}).`,
  );
  console.log(
    `     Une valeur enregistrée l'emporte sur le défaut. Corrigez-la dans Réglages → ` +
      `Validation des lectures, ou en base (${product === 'gl' ? 'gl_settings' : 'app_settings'}).`,
  );
  return false;
}

/** Préréglages par type (`resource_ref = '*'`) et exceptions par fiche. */
async function printPolicies(product, settings) {
  const table = product === 'gl' ? 'gl_resource_gating_policy' : 'resource_gating_policy';
  const rows = await queryAll(
    `SELECT * FROM ${table} ORDER BY resource_type ASC, resource_ref ASC`,
  );
  const presets = rows.filter((r) => String(r.resource_ref) === '*');
  const perResource = rows.filter((r) => String(r.resource_ref) !== '*');

  console.log(`\n  Préréglages par type : ${presets.length || 'aucun'}`);
  for (const row of presets) {
    const effective = resolveEffectiveGatingPolicy({
      typePolicy: row,
      site: settings,
      product,
      resourceType: row.resource_type,
    });
    console.log(
      `    ${String(row.resource_type).padEnd(14)} mode=${effective.mode} ` +
        `requis=${effective.requiredCorrect} erreurs tolérées=${effective.allowedWrongAttempts} ` +
        `verrou=${effective.retryCooldownLabel} portée=${effective.cooldownScope} ` +
        `sévérité=${effective.lockMode}`,
    );
  }
  // Une exception par fiche est invisible depuis les réglages du site : c'est le cas où
  // « le verrou est bien à 1 h » peut être vrai partout sauf sur une fiche précise.
  const withDelay = perResource.filter(
    (r) => r.retry_cooldown_hours != null || r.retry_cooldown_days != null,
  );
  console.log(`  Exceptions par fiche : ${perResource.length || 'aucune'}`);
  if (withDelay.length > 0) {
    console.log(`    dont ${withDelay.length} qui fixent leur propre délai de verrou :`);
    for (const row of withDelay) {
      const hours =
        row.retry_cooldown_hours != null
          ? Number(row.retry_cooldown_hours)
          : Number(row.retry_cooldown_days) * 24;
      console.log(`      ${row.resource_type}/${row.resource_ref} → ${formatHoursLabel(hours)}`);
    }
  }
}

/** Verrous en cours : ce que des élèves subissent en ce moment. */
async function printActiveLocks(product) {
  const table = product === 'gl' ? 'gl_resource_gating_cooldowns' : 'resource_gating_cooldowns';
  const row = await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE locked_until > NOW()`).catch(
    () => null,
  );
  console.log(`  Verrous actifs en ce moment : ${row ? Number(row.n) : '?'}`);
}

async function main() {
  console.log('Politique de conditionnement — état réel en base');
  console.log(`Défaut livré pour le verrou : ${formatHoursLabel(DEFAULT_RETRY_COOLDOWN_HOURS)}`);
  let ok = true;
  for (const product of ['fm', 'gl']) {
    const { raw, stored } = await readSiteSettings(product);
    const settings = gatingCore.buildGatingSettings(raw, product);
    printSite(product, settings, stored);
    if (!checkLock(product, settings)) ok = false;
    await printPolicies(product, settings);
    await printActiveLocks(product);
  }
  console.log('');
  return ok;
}

main()
  .then((ok) => {
    console.log(ok ? 'OK — le verrou du site est au défaut livré des deux côtés.' : 'À vérifier.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Lecture impossible :', err.message || err);
    process.exit(1);
  });
