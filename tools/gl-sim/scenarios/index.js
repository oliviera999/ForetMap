'use strict';

/**
 * Scénarios du banc (§ 7.4). Un scénario = `{ id, description, classe, effectif, surface,
 * plateaux, seances, reglages, profil?, composition?, parallele?, personas?, prof?,
 * assertions?, crochets? }`. Les variantes de grille et les scénarios composés (`equilibrage`,
 * `badges`, `regression-7nov`) sont décrits dans leurs fichiers.
 */

const base = require('./base');
const equilibrage = require('./equilibrage');
const badges = require('./badges');
const regression = require('./regression-7nov');

const SCENARIOS = Object.freeze([...base.SCENARIOS, equilibrage, badges, regression]);

function trouverScenario(id) {
  return SCENARIOS.find((s) => s.id === String(id)) || null;
}

function listerScenarios() {
  return SCENARIOS.map((s) => ({ id: s.id, description: s.description }));
}

module.exports = { SCENARIOS, trouverScenario, listerScenarios };
