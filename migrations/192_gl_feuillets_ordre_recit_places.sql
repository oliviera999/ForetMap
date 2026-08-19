-- =====================================================================
-- GL — Positions dans le récit : les trois actes du copiste, et cinq scènes
-- remises à leur place.
--
-- `ordre_recit` est l'ordre de LECTURE du carnet, et il suit le voyage : la moyenne
-- monte régulièrement d'un plateau à l'autre (plateau 1 ≈ 41, 2 ≈ 47, 3 ≈ 65,
-- 4 ≈ 83, 5 ≈ 129). C'est cette échelle qui sert de repère ici.
--
-- [A] LES TROIS ACTES. Ils portaient 210, 693 et 2050 — hors échelle, donc rejetés
--     à la fin de toute lecture. Leur texte dit lui-même où ils vont :
--       * « CHACUN POUR SA PEAU » s'adresse au joueur « à ta première case » et décrit
--         une Sélène qui « se débrouille seule » → tout début, premier pays ;
--       * « LE BÂTON » commente une scène précise : « au premier pays elle grimpait à
--         son arbre […] là elle se couche dans la boue et fait un pont de son dos » —
--         c'est `ep-VII-tourb-2` (« Les landes. À plat. »), dans la tourbière ;
--       * « LA MÊME CORDE » parle depuis l'après : « elle est arrivée au bout […] le
--         dernier pas, elle l'a pas fait », puis tend le carnet au lecteur et conclut
--         « Tourne la page. Quelqu'un, après toi, la tournera. » → le tout dernier mot,
--         après la clôture (147) et les deux feuillets vierges (148, 149).
--
-- [B] CINQ SCÈNES MAL REPOSITIONNÉES PAR LA MIGRATION 178. Elle a ramené des valeurs
--     à 80 0xx dans l'échelle en soustrayant 80000. C'était juste pour `ordre_voyage`
--     (`plateau × 1000 + rang`, le rang étant local au plateau), mais faux pour
--     `ordre_recit` : le rang local devenait une position globale, et deux scènes des
--     landes se retrouvaient au milieu des tropiques. On les replace dans la portion
--     de récit de leur milieu, juste après la page du biome correspondant :
--       * landes (page à 73) : la tourbière ;
--       * taïga : la ligne de feu, auprès de sa version d'origine (`ep-VII-feu`, 96) ;
--       * désert froid (page à 102) : la rechute.
--
-- Les collisions d'`ordre_recit` sont sans effet : le corpus en compte déjà une
-- douzaine, et ce champ ordonne une lecture, il n'identifie rien.
--
-- Idempotente : chaque UPDATE est borné à la valeur qu'il corrige.
-- =====================================================================

-- [A] Les trois actes, dans l'échelle du récit.
UPDATE gl_lore_feuillets SET ordre_recit = 14  WHERE feuillet_code = 'cop-acte1' AND ordre_recit = 210;
UPDATE gl_lore_feuillets SET ordre_recit = 76  WHERE feuillet_code = 'cop-acte2' AND ordre_recit = 693;
UPDATE gl_lore_feuillets SET ordre_recit = 150 WHERE feuillet_code = 'cop-acte3' AND ordre_recit = 2050;

-- [B] Les cinq scènes, dans la portion de récit de leur milieu.
UPDATE gl_lore_feuillets SET ordre_recit = 74  WHERE feuillet_code = 'ep-VII-tourb-1' AND ordre_recit = 23;
UPDATE gl_lore_feuillets SET ordre_recit = 75  WHERE feuillet_code = 'ep-VII-tourb-2' AND ordre_recit = 26;
UPDATE gl_lore_feuillets SET ordre_recit = 96  WHERE feuillet_code = 'ep-VII-feu-1'   AND ordre_recit = 33;
UPDATE gl_lore_feuillets SET ordre_recit = 97  WHERE feuillet_code = 'ep-VII-feu-2'   AND ordre_recit = 36;
UPDATE gl_lore_feuillets SET ordre_recit = 105 WHERE feuillet_code = 'ep-VII-rechute' AND ordre_recit = 65;
