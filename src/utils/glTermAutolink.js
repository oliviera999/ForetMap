/**
 * Fabrique mutualisée des auto-liens de termes GL (glossaire SVT + glossaire lore).
 *
 * L'implémentation vit dans le noyau unique `src/shared/glossary/termAutolinkCore.js`
 * (partagé avec le serveur via le miroir CJS `lib/shared/termAutolinkCore.js`) : ce module ne
 * conserve que la réexportation, pour ne pas casser les imports GL existants
 * (`glGlossaryAutolink.js`, `glLoreGlossaryAutolink.js`, tests UI).
 */

export { createTermAutolink, SKIP_TAGS, VOID_TAGS } from './termAutolink.js';
