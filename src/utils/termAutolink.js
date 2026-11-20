/**
 * Réexportation de compatibilité : le noyau des auto-liens vit désormais dans
 * `src/shared/glossary/termAutolinkCore.js` (miroir CJS `lib/shared/termAutolinkCore.js`).
 */
export {
  createTermAutolink,
  SKIP_TAGS,
  VOID_TAGS,
  HOMOGRAPH_FORMS,
  HOMOGRAPH_NOUN_MARKERS,
  isBlockedHomograph,
} from '../shared/glossary/termAutolinkCore.js';
