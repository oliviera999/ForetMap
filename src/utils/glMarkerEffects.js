import {
  resolveMarkerEventConfig,
  usesPeopleSpecificEffects,
  isEffectMarker,
} from './glMarkerEventConfig.js';

function resolveTeamPeopleKey(teamType) {
  const t = String(teamType || '').trim().toLowerCase();
  if (t === 'gnome') return 'gnome';
  if (t === 'unicorn' || t === 'licorne') return 'unicorn';
  return null;
}

export function resolveMarkerEffects(marker, teamType) {
  const cfg = resolveMarkerEventConfig(marker);
  const effects = cfg?.effects || null;
  if (!effects) return null;

  const peopleKey = resolveTeamPeopleKey(teamType);
  const usePeople = usesPeopleSpecificEffects(marker) && peopleKey;

  if (usePeople && effects[peopleKey]) {
    return { branch: peopleKey, ...effects[peopleKey] };
  }
  if (effects.neutral) {
    return { branch: 'neutral', ...effects.neutral };
  }
  if (peopleKey && effects[peopleKey]) {
    return { branch: peopleKey, ...effects[peopleKey] };
  }
  const firstKey = Object.keys(effects)[0];
  return firstKey ? { branch: firstKey, ...effects[firstKey] } : null;
}

export function formatEffectDeltaSummary(effect) {
  if (!effect) return '';
  const parts = [];
  if (effect.deltaPv) {
    parts.push(`${effect.deltaPv > 0 ? '+' : ''}${effect.deltaPv} cœur${Math.abs(effect.deltaPv) > 1 ? 's' : ''}`);
  }
  if (effect.deltaGems) {
    parts.push(`${effect.deltaGems > 0 ? '+' : ''}${effect.deltaGems} gemme${Math.abs(effect.deltaGems) > 1 ? 's' : ''}`);
  }
  if (effect.deltaMove) {
    parts.push(`${effect.deltaMove > 0 ? '+' : ''}${effect.deltaMove} case${Math.abs(effect.deltaMove) > 1 ? 's' : ''}`);
  }
  if (effect.passTurn) parts.push('passe le tour');
  return parts.join(', ');
}

export function formatMarkerEffectSummary(marker, teamType) {
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
