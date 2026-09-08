'use strict';

/**
 * Seuils de sécurité calculés sur le plan, avant toute écriture (section 12.2).
 * Un dépassement n'est jamais contourné automatiquement : `force` explicite, journalisé.
 */

function pct(part, whole) {
  if (!whole) return part > 0 ? Infinity : 0;
  return (part / whole) * 100;
}

function fmtPct(value) {
  return value === Infinity ? '∞' : `${Math.round(value * 10) / 10} %`;
}

/**
 * @param {object} args
 * @param {object} args.plan résultat de `buildPlan`
 * @param {object} args.settings réglages chargés (`thresholds`)
 * @param {object} args.local état local (`activeStudentCount`)
 * @returns {{ blocked: boolean, breaches: Array<{ key: string, value: number, limit: number|string, message: string }> }}
 */
function evaluateThresholds({ plan, settings, local }) {
  const t = settings.thresholds || {};
  const students = Number(local.activeStudentCount || 0);
  const breaches = [];

  const creations = plan.counts.creations;
  const creationPct = pct(creations, students);
  if (creations > 0 && creationPct > Number(t.createPct)) {
    breaches.push({
      key: 'create_pct',
      value: creations,
      limit: `${t.createPct} %`,
      message: `${creations} compte(s) à créer, soit ${fmtPct(creationPct)} des ${students} élève(s) actifs — seuil ${t.createPct} %`,
    });
  }

  const deactivations = plan.counts.deactivations;
  const deactivateLimit = Math.min(
    Number(t.deactivateAbs),
    (students * Number(t.deactivatePct)) / 100,
  );
  if (deactivations > 0 && deactivations >= deactivateLimit) {
    breaches.push({
      key: 'deactivate',
      value: deactivations,
      limit: `${t.deactivatePct} % ou ${t.deactivateAbs}`,
      message: `${deactivations} désactivation(s) prévue(s) — seuil ${t.deactivatePct} % de ${students} élève(s) ou ${t.deactivateAbs} (le plus petit : ${Math.round(deactivateLimit * 10) / 10})`,
    });
  }

  const nameMatches = plan.counts.nameMatches;
  const namePct = pct(nameMatches, plan.counts.membersProcessed);
  if (nameMatches > 0 && namePct > Number(t.namematchPct)) {
    breaches.push({
      key: 'namematch_pct',
      value: nameMatches,
      limit: `${t.namematchPct} %`,
      message: `${nameMatches} rapprochement(s) par nom, soit ${fmtPct(namePct)} des ${plan.counts.membersProcessed} membre(s) traités — seuil ${t.namematchPct} %`,
    });
  }

  const outboundRemovals = plan.counts.outboundRemovals + (plan.counts.mirrorRemovals || 0);
  if (outboundRemovals > 0 && outboundRemovals > Number(t.outboundRemoveAbs)) {
    breaches.push({
      key: 'outbound_remove_abs',
      value: outboundRemovals,
      limit: t.outboundRemoveAbs,
      message: `${outboundRemovals} retrait(s) à pousser vers Moodle — seuil ${t.outboundRemoveAbs}`,
    });
  }

  for (const emptied of plan.emptiedCohorts || []) {
    breaches.push({
      key: 'cohort_emptied',
      value: 0,
      limit: emptied.previousCount,
      message: `La cohorte ${emptied.cohort} comptait ${emptied.previousCount} membre(s) à l’exécution précédente et revient vide`,
    });
  }

  return { blocked: breaches.length > 0, breaches };
}

module.exports = { evaluateThresholds };
