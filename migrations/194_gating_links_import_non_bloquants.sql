-- =====================================================================
-- Conditionnement par QCM — les liens generes AUTOMATIQUEMENT ne bloquent plus.
--
-- Contexte (docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md, constat F2) : la migration 144/145 et
-- chaque import de QCM creent des liens « ressource <-> question » par rapprochement de
-- mots-cles, en `origin = 'import'`, `status = 'approved'` et `is_gating = 1`. Personne ne les
-- a demandes : le jour ou un admin allume l'interrupteur global, des dizaines de termes de
-- glossaire deviendraient conditionnes d'un coup, avec verrou de 3 jours a la premiere erreur.
--
-- Regle retenue : un conditionnement ne s'applique que la ou un humain a coche « bloquant ».
-- Les liens machine restent en base (valeur documentaire : ils disent quelle question parle de
-- quelle ressource, et l'ecran des liens les affiche), mais `is_gating = 0`. Le code qui les
-- (re)genere insere desormais directement `is_gating = 0` (lib/glQcmImport.js,
-- lib/glQcmLoreImport.js, lib/fmQuizImport.js, lib/glQcmCrud.js, lib/glQcmLoreCrud.js,
-- lib/fmQuizCrud.js) — cette migration ne fait que rattraper l'existant.
--
-- Ne touche JAMAIS `origin = 'manual'` (saisi par un MJ) ni les autres origines : un MJ qui a
-- explicitement rendu un lien bloquant le garde.
-- Idempotent (deuxieme passage : 0 ligne affectee). Pre-requis : 144 (FM) et 145 (GL).
-- =====================================================================

UPDATE resource_question_links
   SET is_gating = 0
 WHERE origin = 'import' AND is_gating = 1;

UPDATE gl_resource_question_links
   SET is_gating = 0
 WHERE origin = 'import' AND is_gating = 1;
