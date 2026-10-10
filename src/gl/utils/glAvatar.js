import { buildUploadedAvatarUrl } from '../../shared/profile/avatarUrl.js';
import { withAppBase } from '../../shared/appBase.js';

/**
 * Avatar par défaut G&L : **encore** chargé chez le service DiceBear. ForetMap dessine désormais
 * les siens côté serveur (`GET /api/users/:id/default-avatar`) ; G&L n'a pas suivi (chantier
 * distinct, comptes et routes propres au jeu). Le constructeur, retiré du module partagé, vit
 * donc ici, à l'identique — c'est l'unique exception tolérée par
 * `tests/no-third-party-avatar-guard.test.js`.
 */
function buildDicebearAvatarUrl(seed, style = 'adventurer-neutral') {
  const safeSeed = encodeURIComponent(String(seed || 'foretmap'));
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${safeSeed}&radius=50`;
}

export function getGlAvatarUrl(profile, auth = null) {
  const uploadedRel = buildUploadedAvatarUrl(profile?.avatar_path);
  const uploadedUrl = uploadedRel ? withAppBase(uploadedRel) : null;
  if (uploadedUrl) return uploadedUrl;
  const seed =
    profile?.pseudo ||
    profile?.display_name ||
    profile?.email ||
    auth?.displayName ||
    auth?.userId ||
    'gl';
  return buildDicebearAvatarUrl(seed);
}
