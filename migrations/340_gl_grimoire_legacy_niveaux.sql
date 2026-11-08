-- 340 — G&L « Tenir à deux » : grimoire hérité en `propose`, bornes de difficulté des cases
-- quiz 251 et 253 du plateau 4.
--
-- 1) Grimoire. Règle § 10 : « Les anciens sorts du tableur restent en base en `propose`, non
--    lançables ». La migration 333 a semé les 25 sorts v2 (`tenir_v2 = 1`, `statut = 'officiel'`)
--    mais a laissé les sorts du tableur historique en `officiel`. Onze sorts sont concernés en
--    production (relevé du 8 novembre 2026, `statut = 'officiel' AND tenir_v2 = 0`) :
--      SL001 Sacrifice · SL003 Soins · SL008 Vitesse · SL009 Silence · SL011 Invisibilité ·
--      SL012 Révélation · SL013 Bonus · SL014 Résurrection · SL015 Grande vitesse ·
--      SL016 Transfert · SL017 Annulation.
--    `lib/glSpellCast.js` refuse déjà un sort `propose` (`SPELL_NOT_OFFICIEL`) ; le passage en
--    `propose` les retire aussi des grimoires affichés et des comptes « officiels » de
--    l'administration, sans rien supprimer (historique des lancers conservé).
--    Idempotent : la clause WHERE ne retient que les sorts encore `officiel` hors v2.
UPDATE gl_spells
   SET statut = 'propose', updated_at = NOW()
 WHERE statut = 'officiel'
   AND (tenir_v2 IS NULL OR tenir_v2 = 0);

-- 2) Cases 251 et 253 (plateau 4 « Eurasie continentale », « Carte question faune » à
--    l'order_index 270 et « Carte question flore » à l'order_index 360) : pool `sous_biome`
--    sans aucune borne de difficulté, alors que toutes leurs voisines de la même catégorie
--    (faune #113 et #115, flore #117 et #119) portent `difficulteMin = 2`. Elles reçoivent la
--    même borne. Garde : l'ancien `event_config_json` exact (format MariaDB, espaces après
--    les deux-points) ; le repère est en plus identifié par son chapitre, son libellé et son
--    `order_index`, jamais par son seul id (une autre base peut porter autre chose en 251).
--    Sur une base sans ces cases (CI, base neuve), la requête est sans effet.
UPDATE gl_chapter_markers m
  JOIN gl_chapters c ON c.id = m.chapter_id
   SET m.event_config_json = JSON_SET(m.event_config_json, '$.question.pool.difficulteMin', 2)
 WHERE c.slug = 'eurasie-continentale'
   AND m.id IN (251, 253)
   AND ((m.order_index = 270 AND m.label = 'Carte question faune')
     OR (m.order_index = 360 AND m.label = 'Carte question flore'))
   AND m.event_config_json = '{"version": 2, "question": {"mode": "random", "fixedQuestionCode": null, "pool": {"biomeMode": "sous_biome", "biomeSlugs": [], "categorieSlugs": [], "niveaux": [], "difficulteMin": null, "difficulteMax": null, "searchQuery": "", "selectedQuestionCodes": []}}}';
