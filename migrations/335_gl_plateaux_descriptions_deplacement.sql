-- =====================================================================
-- 335 — G&L plateaux 1 à 4 : descriptions des cases de déplacement (simulation du 7 novembre 2026).
--
-- Neuf cases « Éclaircie bienvenue », « Passage dégagé », « Coup de chance » (+2) et « Fruit
-- sauvage » (+1) portaient encore la description d'anciennes cases question (« sauras-tu nommer
-- la bête ? », « Identifie-la »…), lues par les élèves sur des cases de déplacement. Le kapokier
-- de « Fruit sauvage » était faux : baobab (Adansonia) et kapokier (Ceiba) sont deux arbres
-- distincts, et le baobab n'est pas un arbre de jungle.
--
-- Idempotente et respectueuse des retouches : chaque UPDATE est gardé par l'ANCIEN texte
-- (`WHERE id = ? AND description = '<ancien>'`) — une description modifiée entre-temps par
-- l'équipe pédagogique n'est jamais écrasée. Aucun DROP, aucune suppression de case.
-- La case 217 (plateau 1, doublon d'order_index 350 avec la case 35) passe à 355.
-- Contrôle de contenu : tests/content/gl-markers-coherence.test.js.
-- =====================================================================

UPDATE gl_chapter_markers
   SET description = 'La canopée s''entrouvre : un rai de soleil éclaire le sentier. Vous filez dans la lumière.'
 WHERE id = 182 AND description = 'Un cri perce la canopée : sauras-tu nommer la bête ?';

UPDATE gl_chapter_markers
   SET description = 'Des éléphants de forêt ont ouvert un couloir dans les fourrés. Vous l''empruntez.'
 WHERE id = 184 AND description = 'Une plante grimpe vers la lumière. Identifie-la.';

UPDATE gl_chapter_markers
   SET description = 'Une piste tracée par des milliers de sabots file droit devant. Vous la suivez.'
 WHERE id = 183 AND description = 'Qui mange qui dans la plaine ? Démêle le réseau.';

UPDATE gl_chapter_markers
   SET description = 'Tu trouves une mangue sauvage (Irvingia) tombée au sol, mûre et nourrissante : les éléphants de forêt en raffolent et sèment ses graines.'
 WHERE id = 17 AND description = 'Tu trouves un fruit de baobab kapokier mûr et nourrissant.';

UPDATE gl_chapter_markers
   SET description = 'Un sentier de berger longe la crête, bordé de thym et de ciste. Vous gagnez du terrain.'
 WHERE id = 190 AND description = 'Le maquis est fragile : que protéger, comment ?';

UPDATE gl_chapter_markers
   SET description = 'Le vent a balayé le sable : un reg dur et plat s''ouvre devant vous. Vous avancez à grands pas.'
 WHERE id = 191 AND description = 'Une bête survit ici sans boire. Laquelle ?';

UPDATE gl_chapter_markers
   SET description = 'Un chêne tombé a ouvert une trouée de lumière ; le sous-bois s''y dégage. Vous passez.'
 WHERE id = 196 AND description = 'Avant l''ombre des feuilles, une fleur se hâte. Nomme-la.';

UPDATE gl_chapter_markers
   SET description = 'Le brouillard se lève d''un coup sur la lande : le chemin apparaît, net, jusqu''à l''horizon.'
 WHERE id = 197 AND description = 'Le bon mot pour ce milieu ouvert et acide ?';

UPDATE gl_chapter_markers
   SET description = 'Une rivière gelée trace une route blanche entre les épicéas. Vous la suivez sur la glace.'
 WHERE id = 205 AND description = 'Hiver mordant, été bref : nomme ce climat.';

-- Case 217 (copie de la carte question conservation, plateau 1) : doublon d'order_index 350
-- avec la case 35 → 355 (entre 350 et 360). Gardé par l'ancienne valeur et le chapitre.
UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters c ON c.id = m.chapter_id
   SET m.order_index = 355
 WHERE m.id = 217 AND m.order_index = 350 AND c.plateau_number = 1
   AND EXISTS (SELECT 1 FROM (SELECT id FROM gl_chapter_markers WHERE id = 35 AND order_index = 350) AS autre);
