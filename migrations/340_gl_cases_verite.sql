-- =====================================================================
-- 340 — G&L « Tenir à deux » : vérité des cases (ce que l'élève lit = ce que le moteur applique).
--
-- Bilan du 7 novembre 2026 : des cases annoncent à l'élève des effets que le moteur n'applique
-- pas (le texte affiché venait de `effet_mecanique`, champ d'auteur, alors que le moteur exécute
-- `event_config_json.effects`). Depuis cette migration, en mode tenir, le texte affiché est
-- **calculé** depuis l'effet appliqué (`src/shared/glTenirCaseEffetCore.js`) ; `effet_mecanique`
-- reste un champ d'auteur visible du MJ dans le studio de plateau. On le rend donc exact.
--
-- Idempotente et respectueuse des retouches : chaque UPDATE est gardé par l'ANCIENNE valeur
-- exacte (`WHERE id = ? AND effet_mecanique = '<ancien>'`, ou par la sous-chaîne JSON exacte
-- de la branche pour les effets) — une case retouchée entre-temps par l'équipe pédagogique n'est
-- jamais écrasée. Aucun DROP, aucune suppression de case, aucune géométrie modifiée.
-- Contrôle de contenu : tests/content/gl-marker-promises.test.js ; audit `gl_marker_promises`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Arrivées (plateaux 1 à 4) : la prime de 3 gemmes a été neutralisée par la migration 330
--    (deltaGems = 0) ; le texte le promettait encore.
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET effet_mecanique = 'Arrivée au camp. La première équipe reçoit l''honneur des Éclaireurs ; ensuite, ses jets portent la caravane.'
 WHERE id IN (41, 76, 111, 233)
   AND effet_mecanique = 'Arrivée. L''équipe qui atteint cette case en premier gagne 3 gemmes bonus.';

-- ---------------------------------------------------------------------
-- 2. Défis d'équipe : aucune branche conditionnelle n'existe dans le moteur ; « Sinon : -1 cœur »
--    promettait une perte en cas d'échec (garde-fou § 1.4 : l'erreur ne punit jamais).
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET effet_mecanique = 'Mini-défi proposé par le professeur (mime, dessin, énigme). Ni gain ni perte : on le relève pour l''équipe.'
 WHERE id IN (23, 40, 58, 75, 93, 110, 128, 232)
   AND effet_mecanique = 'Si réussi : +1 gemme. Sinon : -1 cœur.';

-- ---------------------------------------------------------------------
-- 3. Cases « behavior » sans effet (péripétie, C5) : « Passe ton tour » n'était pas appliqué.
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET effet_mecanique = 'Une péripétie à relever ensemble.'
 WHERE id IN (13, 38, 69, 104)
   AND effet_mecanique = 'Passe ton tour';

-- ---------------------------------------------------------------------
-- 4. Pertes neutres hors Souffle (C4) : le moteur ne retire rien ; le texte annonçait une perte.
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET effet_mecanique = 'Le biome éprouve la caravane : on s''abrite, puis on repart.'
 WHERE id = 52 AND effet_mecanique = '-1 cœur';

UPDATE gl_chapter_markers
   SET effet_mecanique = 'Le biome éprouve la caravane : on s''abrite, puis on repart.'
 WHERE id = 122 AND effet_mecanique = 'Passe ton tour, -1 cœur';

UPDATE gl_chapter_markers
   SET effet_mecanique = 'Le biome éprouve la caravane : on s''abrite, puis on repart.'
 WHERE id = 229 AND effet_mecanique = '-2 cœurs';

-- ---------------------------------------------------------------------
-- 5. Trame du plateau 4 : les libellés des branches annonçaient « +2 » ; la règle § 4 donne +1
--    de la ressource du peuple à chaque membre, quels que soient les deltas écrits.
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       'Gnome : tu réintroduis l''espèce manquante → +2 cœurs.',
       'Gnome : tu réintroduis l''espèce manquante → +1 cœur.')
 WHERE id = 124 AND event_config_json LIKE '%Gnome : tu réintroduis l''espèce manquante → +2 cœurs.%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       'Licorne : tu cartographies le réseau pour le sauver → +2 gemmes.',
       'Licorne : tu cartographies le réseau pour le sauver → +1 gemme.')
 WHERE id = 124 AND event_config_json LIKE '%Licorne : tu cartographies le réseau pour le sauver → +2 gemmes.%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       'Gnome : tu redessines le vivant qu''elle décrivait → +2 cœurs.',
       'Gnome : tu redessines le vivant qu''elle décrivait → +1 cœur.')
 WHERE id = 231 AND event_config_json LIKE '%Gnome : tu redessines le vivant qu''elle décrivait → +2 cœurs.%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       'Licorne : tu réécris le savoir, transmissible → +2 gemmes.',
       'Licorne : tu réécris le savoir, transmissible → +1 gemme.')
 WHERE id = 231 AND event_config_json LIKE '%Licorne : tu réécris le savoir, transmissible → +2 gemmes.%';

-- ---------------------------------------------------------------------
-- 6. Cases Souffle dont une branche dit « passe ton tour » sans le faire : `passTurn: true`,
--    puisque le Souffle s'applique tel quel (règle § 4) et que les cinq autres cases Souffle qui
--    l'annoncent le font déjà. Gardé par la sous-chaîne exacte de la branche (libellé + deltas).
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Licorne : un signe que tu ne sais pas lire encore → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false',
       '"label":"Licorne : un signe que tu ne sais pas lire encore → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":true')
 WHERE id = 11 AND event_config_json LIKE '%"label":"Licorne : un signe que tu ne sais pas lire encore → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Gnome : l''inquiétude te noue → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false',
       '"label":"Gnome : l''inquiétude te noue → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":true')
 WHERE id = 28 AND event_config_json LIKE '%"label":"Gnome : l''inquiétude te noue → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Licorne : plus rien ne t''inspire → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false',
       '"label":"Licorne : plus rien ne t''inspire → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":true')
 WHERE id = 63 AND event_config_json LIKE '%"label":"Licorne : plus rien ne t''inspire → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Gnome : le silence te glace → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false',
       '"label":"Gnome : le silence te glace → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":true')
 WHERE id = 81 AND event_config_json LIKE '%"label":"Gnome : le silence te glace → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Licorne : impossible de te concentrer → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false',
       '"label":"Licorne : impossible de te concentrer → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":true')
 WHERE id = 98 AND event_config_json LIKE '%"label":"Licorne : impossible de te concentrer → passe ton tour.","deltaPv":0,"deltaGems":0,"deltaMove":0,"passTurn":false%';

UPDATE gl_chapter_markers
   SET event_config_json = REPLACE(event_config_json,
       '"label":"Licorne : c''est un nom que tu perds → −1 gemme et passe ton tour.","deltaPv":0,"deltaGems":-1,"deltaMove":0,"passTurn":false',
       '"label":"Licorne : c''est un nom que tu perds → −1 gemme et passe ton tour.","deltaPv":0,"deltaGems":-1,"deltaMove":0,"passTurn":true')
 WHERE id = 221 AND event_config_json LIKE '%"label":"Licorne : c''est un nom que tu perds → −1 gemme et passe ton tour.","deltaPv":0,"deltaGems":-1,"deltaMove":0,"passTurn":false%';

-- ---------------------------------------------------------------------
-- 7. Garde-fou § 1.1 (le Souffle n'est jamais personnifié) : « La Grise » est l'ancien nom du
--    Souffle, interdit dans toute chaîne visible d'un élève (`findForbiddenString`). Le libellé
--    de la case 46 (plateau 2) le portait encore.
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers
   SET label = 'Le terne s''étend'
 WHERE id = 46 AND label = 'La Grise s''étend';

-- ---------------------------------------------------------------------
-- 8. Cartes question des plateaux 1 à 4 : « Bonne réponse : +1 gemme » (ou +2) ; aucune gemme
--    n'est créditée par une question de case, ni en classique (pas de branche conditionnelle)
--    ni en « Tenir à deux » (règle § 4 : +1 case et relance, aucune ressource, aucun score).
-- ---------------------------------------------------------------------
UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters c ON c.id = m.chapter_id
   SET m.effet_mecanique = 'Question sur le biome. Bonne réponse : l''équipe avance d''une case et relance le dé (une relance par tour). Pas encore : rien ne change, on repart.'
 WHERE c.plateau_number BETWEEN 1 AND 4
   AND m.event_type IN ('quiz', 'question')
   AND m.effet_mecanique IN ('Bonne réponse : +1 gemme. Mauvaise réponse : rien.', 'Bonne réponse : +2 gemme. Mauvaise réponse : rien.');
