'use strict';

/**
 * Extension de fichier déduite d'une data-URL d'image.
 *
 * Le même petit contrôle existait en cinq exemplaires (`lib/authRouteHelpers.js`,
 * `lib/glProfile.js`, `lib/studentRouteHelpers.js`, `lib/plantsRouteHelpers.js`,
 * `lib/tutorialRouteHelpers.js`) : cinq expressions régulières à garder d'accord entre
 * elles. Elles vivent désormais ici, chaque module conservant son export d'origine.
 *
 * La liste des types est **fermée** : c'est elle qui décide de l'extension écrite sur
 * disque, donc de ce que le navigateur exécutera en servant le fichier. Un `image/svg+xml`
 * — qui porte du script — n'y figure volontairement pas, ni pour un avatar ni pour une
 * photo. Une data-URL non reconnue renvoie `null`, et l'appelant refuse l'upload.
 */

/** Avatars (profil élève, prof, joueur GL) : formats matriciels courants du Web. */
const AVATAR_IMAGE_TYPES = Object.freeze(['png', 'jpeg', 'jpg', 'webp']);

/** Illustrations (plantes, tutoriels) : les avatars, plus les formats d'archive/photo. */
const CONTENT_IMAGE_TYPES = Object.freeze([...AVATAR_IMAGE_TYPES, 'gif', 'bmp', 'avif']);

/**
 * @param {string} dataUrl data-URL `data:image/<type>;base64,…`
 * @param {readonly string[]} allowedTypes sous-types MIME acceptés
 * @returns {string|null} extension (`jpeg` normalisé en `jpg`), ou `null` si non reconnue
 */
function detectImageExtension(dataUrl, allowedTypes) {
  const match = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(String(dataUrl || ''));
  if (!match) return null;
  const type = String(match[1]).toLowerCase();
  if (!allowedTypes.includes(type)) return null;
  return type === 'jpeg' ? 'jpg' : type;
}

/** Extension d'une data-URL d'avatar (png/jpeg/webp), `null` si le format est refusé. */
function detectAvatarExtension(dataUrl) {
  return detectImageExtension(dataUrl, AVATAR_IMAGE_TYPES);
}

/** Extension d'une data-URL d'illustration (avatars + gif/bmp/avif), `null` si refusée. */
function detectImageExtensionFromDataUrl(dataUrl) {
  return detectImageExtension(dataUrl, CONTENT_IMAGE_TYPES);
}

module.exports = {
  AVATAR_IMAGE_TYPES,
  CONTENT_IMAGE_TYPES,
  detectImageExtension,
  detectAvatarExtension,
  detectImageExtensionFromDataUrl,
};
