import { z } from 'zod';

/**
 * Zod 4 sonde `Function('')` pour compiler ses validateurs d'objets ; sous la CSP imposée
 * (`script-src` sans `'unsafe-eval'`), la sonde échoue proprement mais le navigateur émet un
 * signalement de violation à chaque chargement. `jitless` désactive la sonde et la compilation.
 * Réglage lu à la **construction** des schémas : ce module doit être le premier import de
 * chaque point d'entrée.
 * Source : https://zod.dev/api#jitless (Zod, licence MIT).
 */
z.config({ jitless: true });
