-- =====================================================================
-- 364 — G&L ensemble unifié, PR 1b, étape 1.9 : lexique (L2).
--
-- L'honneur de la première équipe au camp s'appelle désormais « Avant-garde » (ancien nom :
-- « Éclaireurs »). Les cases d'arrivée des plateaux 1 à 4 le nommaient dans leur description
-- (migration 330) et dans leur promesse (`effet_mecanique`, migration 337) : les deux textes
-- suivent. Les clés techniques (`eclaireurs`, `passeurs`, `eclaireuses`) ne changent pas ; les
-- titres et badges renommés arrivent par les catalogues `titres.json` et `badges.json`
-- (synchronisation par empreinte).
--
-- Idempotente : REPLACE gardé par l'ancien texte exact (une retouche du MJ n'est pas écrasée).
-- =====================================================================

UPDATE gl_chapter_markers
   SET description = REPLACE(description, 'l''honneur des Éclaireurs', 'l''honneur de l''Avant-garde')
 WHERE description LIKE '%l''honneur des Éclaireurs%';

UPDATE gl_chapter_markers
   SET effet_mecanique = REPLACE(effet_mecanique, 'l''honneur des Éclaireurs', 'l''honneur de l''Avant-garde')
 WHERE effet_mecanique LIKE '%l''honneur des Éclaireurs%';
