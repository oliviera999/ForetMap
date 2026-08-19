-- =====================================================================
-- ForetMap — `audit_log.occurred_at` recalé en UTC sur `created_at`.
--
-- Contexte (audit docs/AUDIT_BDD_2026-08.md §4.4). `audit_log` porte DEUX horodatages du
-- même événement :
--   * `created_at`  VARCHAR(32), ISO-8601 UTC   — `2026-08-18T14:56:14.999Z`
--   * `occurred_at` DATETIME, heure locale      — `2026-08-18 16:56:15`
-- Mesuré sur l'export du 18/08/2026 : un écart de +2 h sur 921 lignes (heure d'été) et
-- +1 h sur 225 (heure d'hiver) — soit exactement l'offset Europe/Paris. Neuf lignes de
-- plus présentaient des écarts aberrants (5 h, 25 h, 27 h, 94 h) : celles rétro-remplies
-- lors de l'ajout de la colonne, dont `occurred_at` est simplement FAUX.
--
-- `created_at` fait foi (il porte son fuseau). Cette migration en dérive `occurred_at`
-- pour toutes les lignes, ce qui aligne la colonne sur UTC et corrige au passage les neuf
-- lignes rétro-remplies. `LEFT(..., 19)` écarte les millisecondes, que `STR_TO_DATE` ne
-- saurait pas lire dans ce motif.
--
-- Aucun effet visible : `occurred_at` n'est lu par aucune fonctionnalité (l'écran d'audit
-- affiche `created_at`, src/components/audit-views.jsx:75). Le côté écriture est corrigé
-- dans le même lot — routes/audit.js pose désormais `UTC_TIMESTAMP()` et non `NOW()`.
--
-- Idempotent : au rejeu, la condition ne trouve plus aucune ligne à corriger.
-- =====================================================================

UPDATE audit_log
   SET occurred_at = STR_TO_DATE(
         LEFT(REPLACE(REPLACE(created_at, 'T', ' '), 'Z', ''), 19),
         '%Y-%m-%d %H:%i:%s')
 WHERE created_at IS NOT NULL
   AND created_at LIKE '____-__-__T__:__:__%'
   AND (
         occurred_at IS NULL
      OR occurred_at <> STR_TO_DATE(
           LEFT(REPLACE(REPLACE(created_at, 'T', ' '), 'Z', ''), 19),
           '%Y-%m-%d %H:%i:%s')
   );
