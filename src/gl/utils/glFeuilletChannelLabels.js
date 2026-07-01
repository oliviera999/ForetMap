// Libellés FR lisibles des canaux d'acquisition des feuillets (côté admin).
// Aligné sur lib/glFeuilletChannelClassify.js (identifiants renvoyés par l'API).

const STATIC_LABELS = {
  zone: 'Zone carte',
  'biome-pool': 'Pool biome',
  'plateau-pool': 'Pool plateau',
  'pays-pool': 'Pool pays',
  orphan: 'Orphelin',
  'lien:espece': 'Lien espèce',
  'lien:espece_pays': 'Lien espèce (pays)',
  'lien:intro_pays': 'Lien intro pays',
};

/** Libellé lisible d'un identifiant de canal (ex. 'lien:espece_pays' → 'Lien espèce (pays)'). */
export function channelLabel(channel) {
  if (!channel) return '—';
  if (STATIC_LABELS[channel]) return STATIC_LABELS[channel];
  if (channel.startsWith('lien:')) return `Lien ${channel.slice(5)}`;
  return channel;
}

/** true si le canal correspond à un feuillet non atteignable (orphelin). */
export function isOrphanChannel(channel) {
  return channel === 'orphan';
}
