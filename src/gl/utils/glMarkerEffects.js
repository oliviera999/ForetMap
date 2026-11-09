import { isEffectMarker } from './glMarkerEventConfig.js';
import {
  peopleKeyOf,
  resolveMarkerBranchCore,
  resolveTenirCaseEffet,
  formatTenirCaseEffet,
} from '../../shared/glTenirCaseEffetCore.js';

export function resolveTeamPeopleKey(teamType) {
  return peopleKeyOf(teamType);
}

export function resolveMarkerEffects(marker, teamType) {
  return resolveMarkerBranchCore(marker, teamType);
}

export function formatEffectDeltaSummary(effect) {
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
 * Résumé de l'effet d'une case. En mode « Tenir à deux » (`options.tenir`), le texte est
 * calculé depuis l'effet réellement appliqué (noyau partagé) et jamais lu dans
 * `effet_mecanique` ; hors mode tenir, rien ne change.
 */
export function formatMarkerEffectSummary(marker, teamType, options = {}) {
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

export function hasApplicableMarkerEffects(marker) {
  if (!marker) return false;
  if (String(marker.effet_mecanique || '').trim()) return true;
  return isEffectMarker(marker);
}

export function shouldPresentMarkerOnArrival(marker) {
  if (!marker) return false;
  return isEffectMarker(marker) || hasApplicableMarkerEffects(marker);
}
