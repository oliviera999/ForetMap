-- =====================================================================
-- GL — Réparation du rattachement des contenus aux chapitres
--
-- CONTEXTE. Un contenu GL (espèce, terme de glossaire, question QCM, feuillet)
-- n'a pas de colonne `chapter_id` : son rattachement à un chapitre est **déduit
-- du biome** via `gl_chapter_biomes` (cf. `lib/glFeuilletChapterMembership.js`,
-- `lib/glFeuilletChapterPool.js`, `routes/gl/qcm.js`). Quelques lignes fausses
-- dans cette table suffisent donc à faire apparaître des centaines de ressources
-- sous le mauvais chapitre — sans qu'aucune donnée de contenu ne soit déplacée.
--
-- En base de production, deux dérives cumulées :
--   (a) le chapitre de plateau « Toundra arctique » n'avait **aucun** biome :
--       pool QCM vide (`GET /api/gl/qcm/...?chapterId=` → 400), aucune espèce ni
--       terme de glossaire, pool de feuillets réduit au seul `plateau_number` ;
--   (b) deux chapitres hors plateau (le chapitre de démonstration
--       `foret-magique` semé par la migration 081, et un chapitre bac à sable)
--       portaient des biomes appartenant aux chapitres de plateau — ils
--       captaient donc leurs espèces, QCM, glossaire et feuillets.
--
-- On corrige la **cause** (les liens biome), pas les contenus : aucun feuillet,
-- aucune espèce, aucun repère n'est touché ici. Suppression volontairement
-- écartée : les FK vers `gl_chapters` sont en `ON DELETE CASCADE`
-- (`gl_chapter_markers`, `gl_chapter_spells`, `gl_kingdom_zones`,
-- `gl_chapter_biomes`) — supprimer un chapitre détruirait ses repères et ses
-- zones au lieu de les rendre orphelins.
--
-- Idempotent : [1] n'écrit que pour un chapitre **sans aucun** biome et ignore
-- les doublons ; [2] ne supprime un lien que s'il est déjà porté par un chapitre
-- de plateau. Rejouée, la migration ne fait rien. Sur une base neuve (pas de
-- `gl_lore_plateaux`, pas de chapitre de plateau), elle est sans effet.
-- =====================================================================

-- [1] Chapitre de plateau sans aucun biome → biomes du plateau correspondant.
--     Source de vérité : `gl_lore_plateaux.biomes_slugs` (liste « a; b »), croisée
--     avec le catalogue `gl_biomes` pour n'insérer que des slugs existants (la FK
--     `fk_gl_chapter_biomes_biome` l'exige de toute façon). `order_index` reprend
--     la position dans la liste (0, 10, …), comme `syncChapterBiomes()`.
--     Garde `NOT EXISTS` : un chapitre qui a déjà au moins un biome garde son
--     paramétrage tel quel — la migration ne réécrit jamais un choix éditorial.
INSERT IGNORE INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
SELECT c.id,
       b.slug,
       (FIND_IN_SET(b.slug, REPLACE(REPLACE(p.biomes_slugs, ' ', ''), ';', ',')) - 1) * 10
  FROM gl_chapters c
  INNER JOIN gl_lore_plateaux p ON p.plateau_number = c.plateau_number
  INNER JOIN gl_biomes b
          ON FIND_IN_SET(b.slug, REPLACE(REPLACE(p.biomes_slugs, ' ', ''), ';', ',')) > 0
 WHERE c.plateau_number IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM gl_chapter_biomes cb WHERE cb.chapter_id = c.id);

-- [2] Chapitre **hors plateau** portant un biome déjà porté par un chapitre de
--     plateau → lien retiré. Le biome appartient au voyage de Selene ; le laisser
--     sur un chapitre de démonstration ou de test y fait remonter tout le corpus
--     du biome (espèces, QCM, glossaire, feuillets) et le compte deux fois dans
--     la vue d'ensemble admin des feuillets.
--     Garde : le lien n'est retiré **que si** un chapitre de plateau porte le même
--     biome. Un chapitre hors plateau qui a son propre biome, non partagé (chapitre
--     bonus, hors-série), conserve donc intégralement son rattachement.
--     Ordre : [2] s'appuie sur les liens rétablis par [1] — ne pas inverser.
DELETE cb
  FROM gl_chapter_biomes cb
  INNER JOIN gl_chapters c ON c.id = cb.chapter_id
  INNER JOIN gl_chapter_biomes cb_plateau ON cb_plateau.biome_slug = cb.biome_slug
  INNER JOIN gl_chapters c_plateau
          ON c_plateau.id = cb_plateau.chapter_id
         AND c_plateau.plateau_number IS NOT NULL
 WHERE c.plateau_number IS NULL;
