-- Rangs des paliers de progression n3beur sur mesure, alignés sur leurs seuils.
--
-- Le constat (audit du 25/09/2026, question 11). Trois paliers créés depuis la console ont
-- gardé le rang par défaut du formulaire (150), sans rapport avec leur seuil de tâches :
--   n3beur bébé     (0 tâche)    rang 150 — au-dessus de « novice » (2 tâches, rang 100) ;
--   n3beur expert   (40 tâches)  rang 150 — sous « chevronné » (15 tâches, rang 300) ;
--   n3beur ultime   (100 tâches) rang 150 — idem.
-- Or la règle « le profil le plus élevé l'emporte » (lib/effectiveRole.js) compare les rangs :
-- un groupe qui confère « avancé » (200) masquait un « expert » mérité, et un expert ne
-- pouvait déléguer qu'en deçà de 150.
--
-- Le correctif : des rangs croissants avec le seuil, sous le personnel (320) — sinon le compte
-- ne serait plus traité comme un élève (lib/shared/n3beurRolesCore.js). Chaque mise à jour est
-- gardée par la valeur par défaut (rang 150) et le seuil attendu : un rang réglé à la main
-- n'est jamais écrasé, et une base sans ces paliers n'est pas touchée.
-- Les profils effectifs déjà calculés se remettent à jour à la prochaine action de l'élève
-- (`recomputeUserRole` dans lib/tasks/studentActionContext.js).
-- Idempotent : un second passage ne trouve plus de rang 150. Aucune table `gl_*`.

UPDATE roles SET `rank` = 90
 WHERE slug = 'n3beur_bebe' AND `rank` = 150 AND min_done_tasks = 0;

UPDATE roles SET `rank` = 310
 WHERE slug = 'eleve_expert' AND `rank` = 150 AND min_done_tasks = 40;

UPDATE roles SET `rank` = 315
 WHERE slug = 'n3beur_ultime' AND `rank` = 150 AND min_done_tasks = 100;
