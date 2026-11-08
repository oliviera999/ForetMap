'use strict';

const { resolveMarkerEventConfig, isEffectMarker } = require('./glMarkerEventConfig');
const {
  peopleKeyOf,
  resolveMarkerBranchCore,
  resolveTenirCaseEffet,
  formatTenirCaseEffet,
} = require('./shared/glTenirCaseEffetCore');

function resolveTeamPeopleKey(teamType) {
  return peopleKeyOf(teamType);
}

function resolveMarkerEffects(marker, teamType) {
  return resolveMarkerBranchCore(marker, teamType);
}

function formatEffectDeltaSummary(effect) {
  if (!effect) return '';
  const parts = [];
  if (effect.deltaPv) {
    parts.push(
      `${effect.deltaPv > 0 ? '+' : ''}${effect.deltaPv} cœur${Math.abs(effect.deltaPv) > 1 ? 's' : ''}`,
    );
  }
  if (effect.deltaGems) {
    parts.push(
      `${effect.deltaGems > 0 ? '+' : ''}${effect.deltaGems} gemme${Math.abs(effect.deltaGems) > 1 ? 's' : ''}`,
    );
  }
  if (effect.deltaMove) {
    parts.push(
      `${effect.deltaMove > 0 ? '+' : ''}${effect.deltaMove} case${Math.abs(effect.deltaMove) > 1 ? 's' : ''}`,
    );
  }
  if (effect.passTurn) parts.push('passe le tour');
  return parts.join(', ');
}

/**
 * Résumé de l'effet d'une case pour une équipe.
 *
 * - Jeu classique (sans option `tenir`) : texte d'auteur `effet_mecanique` + libellé de la
 *   branche + deltas, inchangé.
 * - **Mode « Tenir à deux »** (`options.tenir`) : le texte est **calculé depuis l'effet
 *   réellement appliqué** (`src/shared/glTenirCaseEffetCore.js`) et n'est jamais lu dans
 *   `effet_mecanique`, champ d'auteur réservé au studio de plateau.
 *
 * @param {object} marker
 * @param {string|null} teamType
 * @param {{ tenir?: boolean, casesPositives?: string, sentierActif?: boolean, peripetie?: boolean }} [options]
 */
function formatMarkerEffectSummary(marker, teamType, options = {}) {
  if (options?.tenir) {
    return formatTenirCaseEffet(resolveTenirCaseEffet(marker, teamType, options), {
      peripetie: options.peripetie === true,
    });
  }
  const lines = [];
  const mecanique = String(marker?.effet_mecanique || '').trim();
  if (mecanique) lines.push(mecanique);

  const resolved = resolveMarkerEffects(marker, teamType);
  if (resolved?.label) lines.push(resolved.label);
  const deltaText = formatEffectDeltaSummary(resolved);
  if (deltaText && !lines.some((l) => l.includes(deltaText))) {
    lines.push(deltaText);
  }
  return lines.filter(Boolean).join(' — ');
}

function hasApplicableMarkerEffects(marker) {
  if (!marker) return false;
  if (String(marker.effet_mecanique || '').trim()) return true;
  return isEffectMarker(marker);
}

/**
 * Charge utile d'arrivée sur une case (`POST …/present-arrival`, moteur du tour).
 * En mode tenir, `effetMecanique` est `null` et `resolvedEffect` porte les deltas appliqués :
 * l'élève ne lit que la vérité du moteur.
 */
function buildMarkerArrivalPayload(marker, team, options = {}) {
  const teamType = team?.type ?? team?.team_type ?? null;
  const eventConfig = resolveMarkerEventConfig(marker);
  if (options?.tenir) {
    const effet = resolveTenirCaseEffet(marker, teamType, options);
    const resolvedEffect = {
      branch: effet.branch,
      label: effet.label,
      deltaPv: effet.healthDelta,
      deltaGems: effet.powerDelta,
      deltaMove: effet.moveDelta,
      passTurn: effet.passTurn,
      tonalite: effet.tonalite,
      sentier: effet.sentier,
    };
    return {
      markerId: Number(marker.id),
      label: marker.label,
      description: marker.description,
      eventType: marker.event_type,
      sousBiomeSlug: marker.sous_biome_slug ?? null,
      effetMecanique: null,
      effectSummary: formatTenirCaseEffet(effet, { peripetie: options.peripetie === true }),
      resolvedEffect,
      eventMeta: eventConfig?.eventMeta ?? null,
      hasEffects: effet.applique,
      passTurn: effet.passTurn,
      tenir: true,
    };
  }
  const resolved = resolveMarkerEffects(marker, teamType);
  return {
    markerId: Number(marker.id),
    label: marker.label,
    description: marker.description,
    eventType: marker.event_type,
    sousBiomeSlug: marker.sous_biome_slug ?? null,
    effetMecanique: marker.effet_mecanique ?? null,
    effectSummary: formatMarkerEffectSummary(marker, teamType),
    resolvedEffect: resolved,
    eventMeta: eventConfig?.eventMeta ?? null,
    hasEffects: hasApplicableMarkerEffects(marker),
    passTurn: Boolean(resolved?.passTurn),
  };
}

module.exports = {
  resolveTeamPeopleKey,
  resolveMarkerEffects,
  formatEffectDeltaSummary,
  formatMarkerEffectSummary,
  hasApplicableMarkerEffects,
  buildMarkerArrivalPayload,
};
