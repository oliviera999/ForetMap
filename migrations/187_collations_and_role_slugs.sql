-- =====================================================================
-- ForetMap / GL — Hygiène : collations alignées, slugs de rôle réparés.
--
-- 1) COLLATIONS (audit docs/AUDIT_BDD_2026-08.md §5.7)
--    `gl_game_constants` et `gl_game_constant_refs` sont les deux seules tables de la base
--    en `utf8mb4_general_ci` ; les 133 autres sont en `utf8mb4_unicode_ci`. Toute jointure
--    sur une colonne texte entre ces deux mondes lèverait « Illegal mix of collations ».
--    Le risque est dormant (aucun code applicatif ne les lit aujourd'hui) — autant le
--    fermer avant qu'un usage n'apparaisse.
--
--    À noter : la migration 151 qui crée ces tables déclare bien `utf8mb4_unicode_ci`.
--    Qu'elles soient en `general_ci` en production signifie qu'elles y préexistaient
--    (création manuelle — c'est le défaut de phpMyAdmin), et que le `CREATE TABLE IF NOT
--    EXISTS` de la migration a été un no-op silencieux. Cette conversion rattrape donc
--    l'intention de la 151.
--    Aucune clé étrangère n'entre ni ne sort de ces deux tables : la conversion est sûre.
--
-- 2) SLUGS DE RÔLE (§5.5)
--    `el_ve_expert` (« élève expert ») et `n3beur_b_b` (« n3beur bébé ») : la normalisation
--    appliquée SUPPRIMAIT les caractères accentués au lieu de les translittérer. Les
--    `display_name` sont corrects ; seul l'identifiant technique est abîmé — or c'est lui
--    qui apparaît en URL et dans les réponses d'API.
--    La cause est corrigée côté saisie par `src/utils/slugify.js` (décomposition NFD puis
--    retrait des seuls signes combinants), utilisé par le formulaire de création de groupe.
--
--    Les renommages sont conditionnés à la disponibilité du slug cible : sur une base où
--    `eleve_expert` existerait déjà, on ne touche à rien plutôt que de violer
--    `uq_roles_slug`. `roles.slug` n'est référencé par aucune clé étrangère (les liens
--    passent par `roles.id`), et les droits sont ré-hydratés en base à chaque requête :
--    le renommage n'invalide aucune session.
--
-- Idempotent : conversions sans effet au rejeu, UPDATE gardés par NOT EXISTS.
-- =====================================================================

ALTER TABLE gl_game_constants CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE gl_game_constant_refs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE roles r
  LEFT JOIN roles taken ON taken.slug = 'eleve_expert'
   SET r.slug = 'eleve_expert'
 WHERE r.slug = 'el_ve_expert'
   AND taken.id IS NULL;

UPDATE roles r
  LEFT JOIN roles taken ON taken.slug = 'n3beur_bebe'
   SET r.slug = 'n3beur_bebe'
 WHERE r.slug = 'n3beur_b_b'
   AND taken.id IS NULL;
