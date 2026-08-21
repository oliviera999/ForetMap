/**
 * Fabrique mutualisée des auto-liens de termes GL (glossaire SVT + glossaire lore).
 *
 * L'implémentation a été extraite dans `./termAutolink.js` (tronc commun partagé
 * avec le serveur ForetMap via le miroir CJS `lib/term-autolink/`) : ce module ne
 * conserve que la réexportation, pour ne pas casser les imports GL existants
 * (`glGlossaryAutolink.js`, `glLoreGlossaryAutolink.js`, tests UI).
 */

export { createTermAutolink, SKIP_TAGS, VOID_TAGS } from './termAutolink.js';
