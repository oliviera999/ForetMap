-- Chantier collège (novembre 2026), flux D4 : clés de détermination courtes.
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d4-migration.js à partir de
-- data/college-2026-11/d4/cles-courtes.json : ne pas modifier à la main.
--
-- Crée, au niveau « college » et publiées :
--   - araignees-college (7 couplets ; « Pour aller plus loin » : araignees)
--   - papillons-college (7 couplets ; « Pour aller plus loin » : papillons)
--   - traces-mammiferes-melah-college (7 couplets ; « Pour aller plus loin » : traces-mammiferes-melah)
--   - arbres-palmiers-college (8 couplets ; « Pour aller plus loin » : arbres-palmiers)
--   - amphibiens-reptiles-melah-college (6 couplets ; « Pour aller plus loin » : amphibiens-reptiles-melah)
--   - oiseaux-eau-daya-college (7 couplets ; « Pour aller plus loin » : oiseaux-daya)
-- Les clés complètes restent intactes (aucun UPDATE, aucun DELETE).
--
-- Idempotence : chaque clé n'est créée que si sa clé de renvoi, sa carte, ses clades et
-- chacune de ses fiches (nom + nom scientifique) existent ; sinon elle est sautée en entier.
-- Couplets, propositions et espèces des groupes sont gardés par clé naturelle (slug et titre
-- de la clé, numéro du couplet, rang de la proposition) : un rejeu n'ajoute rien.
-- Contrainte chk_idkey_lead_outcome respectée : nom de groupe (result_label) sur les seules
-- issues « groupe », jamais sur un clade. created_by reste NULL.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Clé « araignees-college » (renvoi : araignees) — 7 couplets, 20 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'araignees-college', 'Araignées et autres animaux à 8 pattes (version courte)',
       'Version courte de la clé des araignées, pour le collège. On regarde d''abord la forme du corps, puis la toile ou la façon de chasser. Chaque résultat s''arrête au groupe ou à l''espèce commune ; la clé complète, proposée à la fin, permet d''aller jusqu''à l''espèce.',
       NULL, 'Tous les sites : bâtiments, jardins, compost, berges et matorral', 'college', 1, NULL, 'loupe',
       'On observe l''animal là où il se trouve, sans contact : à la loupe tenue au-dessus ou sur une photo. Un scorpion peut tuer un enfant : on recule aussitôt et on prévient un adulte, même s''il semble mort. On ne soulève jamais une pierre à la main et on ne glisse pas les doigts dans un trou. Une tique se signale à un adulte, qui la retire. En cas de piqûre ou de morsure : centre antipoison du Maroc (0801 000 180).',
       0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'araignees-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'araignees')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'arachnides')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'araignees')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Scorpions (Buthidés)' AND x.scientific_name <=> 'Buthidae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Pseudoscorpion' AND x.scientific_name <=> 'Chelifer cancroides')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Solifuges' AND x.scientific_name <=> 'Solifugae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Faucheux' AND x.scientific_name <=> 'Opiliones')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Oribates' AND x.scientific_name <=> 'Oribatida')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Acarien prédateur du compost' AND x.scientific_name <=> 'Macrocheles sp.')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Trombidions' AND x.scientific_name <=> 'Trombidiidae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Tique brune du chien' AND x.scientific_name <=> 'Rhipicephalus sanguineus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Tétranyque tisserand' AND x.scientific_name <=> 'Tetranychus urticae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Pholque phalangide' AND x.scientific_name <=> 'Pholcus phalangioides')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Pholque de Pluche' AND x.scientific_name <=> 'Holocnemus pluchei')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Veuve brune' AND x.scientific_name <=> 'Latrodectus geometricus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Stéatode noble' AND x.scientific_name <=> 'Steatoda nobilis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Épeire de l''Opuntia' AND x.scientific_name <=> 'Cyrtophora citricola')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Ségestrie florentine' AND x.scientific_name <=> 'Segestria florentina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Argiope' AND x.scientific_name <=> 'Argiope bruennichi')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Argiope à bandes' AND x.scientific_name <=> 'Argiope trifasciata')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Argiope lobée' AND x.scientific_name <=> 'Argiope lobata')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Épeire des joncs' AND x.scientific_name <=> 'Larinioides suspicax')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Saltique des murs' AND x.scientific_name <=> 'Menemerus semilimbatus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Plexippe de Paykull' AND x.scientific_name <=> 'Plexippus paykulli')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Saltique d''Adanson' AND x.scientific_name <=> 'Hasarius adansoni')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Lycoses' AND x.scientific_name <=> 'Lycosidae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Thomise' AND x.scientific_name <=> 'Xysticus cristatus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Thomise enflée' AND x.scientific_name <=> 'Thomisus onustus');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number UNION ALL SELECT 7 AS number) n
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Deux pinces bien visibles à l''avant du corps, comme un crabe.',
       'Piège : l''araignée-crabe tient ses pattes avant écartées comme des pinces, mais ce sont des pattes, pointues au bout.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Corps d''une seule pièce, rond ou ovale, sans taille fine.',
       'Les 8 pattes sont attachées sur les côtés du corps.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 1, proposition 3 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Corps en deux parties reliées par une taille fine : une araignée.',
       'Vue de dessus, la taille fine est souvent cachée sous l''arrière du corps, mais on voit bien deux parties.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 2, proposition 1 → espèce Scorpions (Buthidés)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Longue queue relevée, terminée par un aiguillon (un dard) : un scorpion.',
       'Danger : on recule tout de suite et on prévient un adulte. Les scorpions noirs et jaunes de la région sont très venimeux.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Scorpions (Buthidés)' AND pp.scientific_name <=> 'Buthidae'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 2, proposition 2 → espèce Pseudoscorpion
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Pas de queue, minuscule (quelques millimètres), dans le compost ou la litière.',
       'C''est un pseudoscorpion : malgré ses pinces, il est inoffensif.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Pseudoscorpion' AND pp.scientific_name <=> 'Chelifer cancroides'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 2, proposition 3 → espèce Solifuges
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Pas de queue, grand (1 à 7 cm), velu, il court très vite.',
       'C''est un solifuge (ou galéode) des terrains secs : il n''a pas de venin, mais il mord fort. On garde ses distances.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Solifuges' AND pp.scientific_name <=> 'Solifugae'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 1 → espèce Faucheux
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Huit pattes très longues et fines, bien plus longues que le corps.',
       'C''est un faucheux : ce n''est pas une araignée. Il ne fait jamais de toile.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Faucheux' AND pp.scientific_name <=> 'Opiliones'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 3, proposition 2 → groupe Acariens et tiques (5 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Pattes courtes, corps minuscule, rond ou en forme de pépin.',
       'Ce sont des acariens : certains vivent dans le compost, d''autres sur les feuilles. La tique, qui boit le sang des animaux, en fait partie.',
       NULL,
       NULL,
       'groupe', 'arachnides', 'Acariens et tiques',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Oribates' AS name, 'Oribatida' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Acarien prédateur du compost' AS name, 'Macrocheles sp.' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Trombidions' AS name, 'Trombidiidae' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Tique brune du chien' AS name, 'Rhipicephalus sanguineus' AS scientific_name, 3 AS ord
        UNION ALL SELECT 'Tétranyque tisserand' AS name, 'Tetranychus urticae' AS scientific_name, 4 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 1 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Elle se tient dans sa toile, ou dans un abri de soie au bord.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 4, proposition 2 → couplet 7
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Elle n''a pas de toile : elle court, saute ou attend sans bouger.',
       'Un simple fil de soie laissé derrière elle ne compte pas comme une toile.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 7),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 1 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Toile ronde comme une roue de vélo, avec des rayons et une spirale.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → groupe Araignées à toile en désordre : pholques, veuves et stéatodes (4 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Toile en désordre, faite de fils tendus dans tous les sens.',
       'Les pholques, aux pattes très longues, pendent souvent au plafond. Prudence : la morsure d''une veuve (gros ventre rond et luisant) peut être grave ; on reste à distance.',
       NULL,
       NULL,
       'groupe', 'araignees', 'Araignées à toile en désordre : pholques, veuves et stéatodes',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Pholque phalangide' AS name, 'Pholcus phalangioides' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Pholque de Pluche' AS name, 'Holocnemus pluchei' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Veuve brune' AS name, 'Latrodectus geometricus' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Stéatode noble' AS name, 'Steatoda nobilis' AS scientific_name, 3 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 3 → groupe Araignées à toile serrée (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Toile serrée en nappe ou en dôme, ou tube de soie dans un mur.',
       'Dans un tube de soie, on ne glisse jamais les doigts : la ségestrie mord.',
       NULL,
       NULL,
       'groupe', 'araignees', 'Araignées à toile serrée',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Épeire de l''Opuntia' AS name, 'Cyrtophora citricola' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Ségestrie florentine' AS name, 'Segestria florentina' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 1 → groupe Argiopes (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Grande araignée, tête en bas au centre, ventre rayé de jaune, de noir ou d''argent.',
       'Son corps mesure 1,5 à 2,5 cm. Un ruban de soie en zigzag barre souvent la toile.',
       NULL,
       NULL,
       'groupe', 'araignees', 'Argiopes',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Argiope' AS name, 'Argiope bruennichi' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Argiope à bandes' AS name, 'Argiope trifasciata' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Argiope lobée' AS name, 'Argiope lobata' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 2 → espèce Épeire des joncs
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Plus petite, brune, avec un dessin en forme de feuille sur le dos.',
       'Sa toile est tendue entre les joncs, au bord de l''eau. Loin de l''eau, d''autres épeires lui ressemblent : choisis alors la proposition suivante.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Épeire des joncs' AND pp.scientific_name <=> 'Larinioides suspicax'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → clade araignees
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Autre araignée à toile ronde.',
       'Plusieurs autres araignées à toile ronde vivent ici sans être encore décrites dans les fiches : photographie-la sans la déranger.',
       NULL,
       NULL,
       'clade', 'araignees', NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 7, proposition 1 → groupe Araignées sauteuses (saltiques) (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Elle avance par petits bonds ; deux énormes yeux ronds à l''avant de la tête.',
       'Elle se tourne souvent pour te regarder. On les voit au soleil, sur les murs et les rebords de fenêtres.',
       NULL,
       NULL,
       'groupe', 'araignees', 'Araignées sauteuses (saltiques)',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Saltique des murs' AS name, 'Menemerus semilimbatus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Plexippe de Paykull' AS name, 'Plexippus paykulli' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Saltique d''Adanson' AS name, 'Hasarius adansoni' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 2 → espèce Lycoses
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Elle court vite au sol sur de longues pattes, corps brun ou gris.',
       'C''est une lycose : elle chasse à la course. La femelle porte parfois son cocon au bout du corps, ou ses petits sur le dos.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Lycoses' AND pp.scientific_name <=> 'Lycosidae'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 7, proposition 3 → groupe Araignées-crabes (thomises) (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Elle attend immobile, ses longues pattes avant écartées comme un crabe.',
       'Elle guette sur une fleur ou au sol et saisit les insectes qui passent. Certaines prennent la couleur de la fleur.',
       NULL,
       NULL,
       'groupe', 'araignees', 'Araignées-crabes (thomises)',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Thomise' AS name, 'Xysticus cristatus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Thomise enflée' AS name, 'Thomisus onustus' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 4 → clade araignees
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Autre araignée sans toile, souvent cachée le jour sous un abri.',
       'On ne soulève jamais une pierre ou une écorce à la main : un scorpion peut s''y cacher.',
       NULL,
       NULL,
       'clade', 'araignees', NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'araignees')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'araignees-college' AND k.title = 'Araignées et autres animaux à 8 pattes (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- ---------------------------------------------------------------------------
-- Clé « papillons-college » (renvoi : papillons) — 7 couplets, 25 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'papillons-college', 'Quel est ce papillon ? (version courte)',
       'Version courte de la clé des papillons, pour le collège. On regarde d''abord comment il butine et la forme de ses antennes, puis la couleur et les dessins des ailes. Chaque résultat s''arrête au groupe ou à l''espèce commune ; la clé complète, proposée à la fin, permet d''aller plus loin.',
       NULL, 'Tous les sites : lycée, forêt comestible, n³, Beaulieu, plage des Sablettes, daya, oued Melah', 'college', 1, NULL, NULL,
       'On observe le papillon sans le capturer et sans contact : ses ailes sont couvertes de minuscules écailles qui s''arrachent facilement, et un papillon abîmé vole mal. On s''approche lentement, sans projeter son ombre sur lui, et on le photographie de dessus et de dessous.',
       0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'papillons-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'papillons')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'lepidopteres')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Moro-sphinx' AND x.scientific_name <=> 'Macroglossum stellatarum')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sphinx livournien' AND x.scientific_name <=> 'Hyles livornica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sphinx phénix' AND x.scientific_name <=> 'Hippotion celerio')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sphinx du liseron' AND x.scientific_name <=> 'Agrius convolvuli')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Machaon' AND x.scientific_name <=> 'Papilio machaon')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Flambé ibérique' AND x.scientific_name <=> 'Iphiclides feisthamelii')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Souci' AND x.scientific_name <=> 'Colias croceus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Marbré de vert' AND x.scientific_name <=> 'Pontia daplidice')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Piéride du sisymbre' AND x.scientific_name <=> 'Euchloe belemia')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Piéride du chou' AND x.scientific_name <=> 'Pieris brassicae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Piéride de la rave' AND x.scientific_name <=> 'Pieris rapae')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Vulcain' AND x.scientific_name <=> 'Vanessa atalanta')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Belle-Dame' AND x.scientific_name <=> 'Vanessa cardui')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Monarque' AND x.scientific_name <=> 'Danaus plexippus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Petit monarque' AND x.scientific_name <=> 'Danaus chrysippus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mégère' AND x.scientific_name <=> 'Lasiommata megera')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Tircis' AND x.scientific_name <=> 'Pararge aegeria')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Myrtil' AND x.scientific_name <=> 'Maniola jurtina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Azuré de la bugrane' AND x.scientific_name <=> 'Polyommatus celina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Azuré porte-queue' AND x.scientific_name <=> 'Lampides boeticus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Azuré de Lang' AND x.scientific_name <=> 'Leptotes pirithous')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Azuré de la surelle' AND x.scientific_name <=> 'Zizeeria knysna')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Brun des pélargoniums' AND x.scientific_name <=> 'Cacyreus marshalli')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Cuivré commun' AND x.scientific_name <=> 'Lycaena phlaeas')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Hespérie almoravide' AND x.scientific_name <=> 'Carcharodus tripolina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Phalène sacrée' AND x.scientific_name <=> 'Rhodometra sacraria')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Écaille du myosotis' AND x.scientific_name <=> 'Utetheisa pulchella')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Gamma' AND x.scientific_name <=> 'Autographa gamma');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number UNION ALL SELECT 7 AS number) n
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Il butine en vol sur place, les ailes si rapides qu''elles paraissent floues.',
       'C''est un sphinx, un papillon de nuit dont certains volent le jour. On le prend souvent pour un petit oiseau.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Antennes fines terminées par une petite boule, comme une allumette.',
       'C''est un papillon de jour. Au repos, il serre souvent ses ailes dressées au-dessus du dos.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 1, proposition 3 → couplet 7
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Antennes sans boule au bout : fines comme des fils, en plume ou en pointe.',
       'C''est un papillon « de nuit », même si certains s''envolent des herbes en plein jour.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 7),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 2, proposition 1 → espèce Moro-sphinx
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Ailes arrière orange visibles en vol ; il butine en plein jour.',
       'C''est le moro-sphinx. Il revient chaque jour aux mêmes fleurs.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Moro-sphinx' AND pp.scientific_name <=> 'Macroglossum stellatarum'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 2, proposition 2 → groupe Sphinx aux ailes roses (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Plus grand, ailes arrière roses et noires ; il vole surtout au crépuscule.',
       'Le sphinx livournien a une bande crème en biais sur les ailes avant ; le sphinx phénix, une fine ligne argentée.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Sphinx aux ailes roses',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Sphinx livournien' AS name, 'Hyles livornica' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Sphinx phénix' AS name, 'Hippotion celerio' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 2, proposition 3 → espèce Sphinx du liseron
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Très grand, gris comme une écorce, abdomen (arrière du corps) rayé de rose.',
       'Sa trompe très longue atteint le nectar des fleurs en tube profond.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Sphinx du liseron' AND pp.scientific_name <=> 'Agrius convolvuli'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 1 → groupe Machaon et flambé (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Grand papillon portant une ou deux queues au bas des ailes arrière.',
       'Le machaon est jaune pâle aux nervures noires ; le flambé, blanc crème rayé de noir comme un zèbre.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Machaon et flambé',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Machaon' AS name, 'Papilio machaon' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Flambé ibérique' AS name, 'Iphiclides feisthamelii' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 3, proposition 2 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Ailes blanches, parfois tachées de noir ou marbrées de vert dessous.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 3 → espèce Souci
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Jaune orangé bordé de noir ; dessous vert pâle avec un point argenté.',
       'C''est le souci. Il se pose presque toujours ailes fermées.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Souci' AND pp.scientific_name <=> 'Colias croceus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 4 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Moyen ou grand, orange, rouge ou brun, couvert de taches ou de ronds.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 3, proposition 5 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Petit (ailes ouvertes, moins de 3,5 cm), bleu, brun ou orange cuivré.',
       'Pour estimer sa taille sans le déranger, compare-le à la fleur où il est posé.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

-- couplet 4, proposition 1 → groupe Marbré de vert ou piéride du sisymbre (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Dessous des ailes arrière marbré ou rayé de vert et de blanc.',
       'Ce « vert » est un mélange d''écailles noires et jaunes. La clé complète sépare les deux espèces.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Marbré de vert ou piéride du sisymbre',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Marbré de vert' AS name, 'Pontia daplidice' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Piéride du sisymbre' AS name, 'Euchloe belemia' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 2 → groupe Piéride du chou ou piéride de la rave (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Dessous jaune pâle uni ; bout de l''aile avant noir ou gris dessus.',
       'Leurs chenilles mangent les feuilles de chou du potager.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Piéride du chou ou piéride de la rave',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Piéride du chou' AS name, 'Pieris brassicae' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Piéride de la rave' AS name, 'Pieris rapae' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 1 → espèce Vulcain
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Fond noir velouté, traversé d''une bande rouge orangé.',
       'C''est le vulcain.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Vulcain' AND pp.scientific_name <=> 'Vanessa atalanta'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → espèce Belle-Dame
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Fond orange saumon couvert de taches noires.',
       'C''est la belle-dame, une grande voyageuse qui traverse la Méditerranée.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Belle-Dame' AND pp.scientific_name <=> 'Vanessa cardui'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 3 → groupe Monarque ou petit monarque (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Très grand et orange, au vol lent et plané.',
       'Le monarque a des nervures noires épaisses, comme un vitrail ; le petit monarque, des ailes presque unies.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Monarque ou petit monarque',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Monarque' AS name, 'Danaus plexippus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Petit monarque' AS name, 'Danaus chrysippus' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 4 → groupe Papillons à ocelles : mégère, tircis, myrtil (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Un rond noir à point blanc, comme un œil, près de la pointe de l''aile.',
       'Ce rond qui ressemble à un œil s''appelle un ocelle.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Papillons à ocelles : mégère, tircis, myrtil',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 3 AND l.outcome = 'groupe'
  JOIN (SELECT 'Mégère' AS name, 'Lasiommata megera' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Tircis' AS name, 'Pararge aegeria' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Myrtil' AS name, 'Maniola jurtina' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 1 → groupe Azurés et brun des pélargoniums (5 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Dessus bleu ou brun ; dessous gris ou beige, à points ou fines lignes.',
       'Ces petits papillons se posent presque toujours ailes fermées : regarde le dessous. Certains portent une fine queue au bas de l''aile arrière.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Azurés et brun des pélargoniums',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Azuré de la bugrane' AS name, 'Polyommatus celina' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Azuré porte-queue' AS name, 'Lampides boeticus' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Azuré de Lang' AS name, 'Leptotes pirithous' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Azuré de la surelle' AS name, 'Zizeeria knysna' AS scientific_name, 3 AS ord
        UNION ALL SELECT 'Brun des pélargoniums' AS name, 'Cacyreus marshalli' AS scientific_name, 4 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 2 → espèce Cuivré commun
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Ailes avant orange cuivré brillant, semées de points noirs.',
       'C''est le cuivré commun. Il se pose souvent ailes ouvertes au soleil.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Cuivré commun' AND pp.scientific_name <=> 'Lycaena phlaeas'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → groupe Hespéries (1 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Corps trapu, grosse tête, vol très rapide en zigzag.',
       'Une seule hespérie est décrite dans les fiches, l''hespérie almoravide ; d''autres vivent au Maroc.',
       NULL,
       NULL,
       'groupe', 'lepidopteres', 'Hespéries',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Hespérie almoravide' AS name, 'Carcharodus tripolina' AS scientific_name, 0 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Corps épais en fuseau, ailes repliées en triangle pointu sur le dos.',
       'C''est un sphinx au repos.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 7, proposition 2 → espèce Phalène sacrée
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Petit, jaune paille, traversé en biais par une ligne rose.',
       'C''est la phalène sacrée. Elle s''envole des herbes basses en plein jour.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Phalène sacrée' AND pp.scientific_name <=> 'Rhodometra sacraria'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 7, proposition 3 → espèce Écaille du myosotis
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Ailes avant blanc crème, semées de petits points rouges et noirs.',
       'C''est l''écaille du myosotis. En vol, elle paraît blanchâtre.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Écaille du myosotis' AND pp.scientific_name <=> 'Utetheisa pulchella'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 7, proposition 4 → espèce Gamma
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Ailes gris-brun marquées au centre d''un petit signe argenté en « y ».',
       'C''est le gamma. Il butine aussi le jour, les pattes posées sur la fleur.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Gamma' AND pp.scientific_name <=> 'Autographa gamma'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 7, proposition 5 → clade lepidopteres
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Autre papillon de nuit.',
       'Il existe des centaines de papillons de nuit à Casablanca : photographie-le de dessus et signale-le.',
       NULL,
       NULL,
       'clade', 'lepidopteres', NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'papillons')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'papillons-college' AND k.title = 'Quel est ce papillon ? (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

-- ---------------------------------------------------------------------------
-- Clé « traces-mammiferes-melah-college » (renvoi : traces-mammiferes-melah) — 7 couplets, 24 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'traces-mammiferes-melah-college', 'Qui est passé par là ? Traces des mammifères (version courte)',
       'Version courte de la clé des traces de mammifères de la vallée de l''oued Melah, pour le collège. On choisit d''abord le type d''indice (empreinte, crotte ou autre indice), puis sa forme. Un même animal peut être trouvé par plusieurs indices. La clé complète, proposée à la fin, permet d''aller jusqu''à l''espèce.',
       'melah', 'Chemins, berges boueuses, matorral et pâturages (vallée de l''oued Melah)', 'college', 1, NULL, 'loupe',
       'On observe sans contact : une crotte, un os ou un piquant se regarde à la loupe et se photographie, et reste où il est. Les crottes de renard, de chacal et de chien peuvent transmettre des parasites graves : on se lave les mains après la sortie. On ne met jamais la main ni un bâton dans un terrier, et on ne reste pas devant l''entrée.',
       1
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'traces-mammiferes-melah-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'traces-mammiferes-melah')
   AND EXISTS (SELECT 1 FROM maps x WHERE x.id = 'melah')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'mammiferes')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'glires')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'carnivores')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Âne' AND x.scientific_name <=> 'Equus asinus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Cheval Barbe' AND x.scientific_name <=> 'Equus caballus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mulet' AND x.scientific_name <=> 'Equus asinus × Equus caballus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sanglier' AND x.scientific_name <=> 'Sus scrofa')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Vache' AND x.scientific_name <=> 'Bos taurus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mouton (race Sardi)' AND x.scientific_name <=> 'Ovis aries')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Chèvre' AND x.scientific_name <=> 'Capra hircus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Lièvre du Cap' AND x.scientific_name <=> 'Lepus capensis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Lapin de garenne' AND x.scientific_name <=> 'Oryctolagus cuniculus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Renard roux' AND x.scientific_name <=> 'Vulpes vulpes')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Loup doré africain (chacal)' AND x.scientific_name <=> 'Canis lupaster')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Chien' AND x.scientific_name <=> 'Canis familiaris')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Genette commune' AND x.scientific_name <=> 'Genetta genetta')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mangouste ichneumon' AND x.scientific_name <=> 'Herpestes ichneumon')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Hérisson d’Algérie' AND x.scientific_name <=> 'Atelerix algirus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Belette' AND x.scientific_name <=> 'Mustela nivalis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Porc-épic à crête' AND x.scientific_name <=> 'Hystrix cristata');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number UNION ALL SELECT 7 AS number) n
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Une empreinte : la marque d''un pied dans la boue ou le sable.',
       'Les plus belles se trouvent le matin, dans la boue des berges et des flaques.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Une crotte, ou un tas de crottes.',
       'On la regarde à la loupe, sans contact.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 1, proposition 3 → couplet 7
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Un autre indice : piquant, terrier, ou terre retournée.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 7),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 2, proposition 1 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Empreinte de sabot : une marque dure, d''un seul bloc ou fendue en deux.',
       'Le sabot est un ongle très épais qui entoure le bout du doigt.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 2, proposition 2 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Empreinte de doigts : plusieurs petites marques séparées.',
       'Souvent, une marque de griffe se voit devant chaque doigt.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 1 → groupe Âne, mulet ou cheval (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Sabot d''un seul bloc, en forme de U, souvent marqué d''un fer.',
       'Le sabot de l''âne est petit et plus long que large ; celui du cheval est grand et presque rond.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Âne, mulet ou cheval',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Âne' AS name, 'Equus asinus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Cheval Barbe' AS name, 'Equus caballus' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Mulet' AS name, 'Equus asinus × Equus caballus' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 3, proposition 2 → espèce Sanglier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Sabot fendu, avec deux petites marques en arrière (les gardes).',
       'Les gardes sont deux petits doigts placés en arrière du sabot : chez le sanglier, ils s''impriment dans la boue.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Sanglier' AND pp.scientific_name <=> 'Sus scrofa'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 3 → groupe Vache, chèvre ou mouton (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Sabot fendu en deux moitiés, sans marques en arrière.',
       'Grand sabot aux moitiés arrondies : vache. Petit sabot aux moitiés pointues : chèvre ou mouton.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Vache, chèvre ou mouton',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Vache' AS name, 'Bos taurus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Mouton (race Sardi)' AS name, 'Ovis aries' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Chèvre' AS name, 'Capra hircus' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 1 → groupe Lièvre ou lapin (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Marques floues groupées par quatre : deux grandes côte à côte, deux petites.',
       'Leurs pattes couvertes de poils ne laissent pas de marques nettes. Le lièvre fait de longs bonds ; le lapin, des bonds courts qui mènent aux terriers.',
       NULL,
       NULL,
       'groupe', 'glires', 'Lièvre ou lapin',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Lièvre du Cap' AS name, 'Lepus capensis' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Lapin de garenne' AS name, 'Oryctolagus cuniculus' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 2 → groupe Renard, chacal ou chien (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Quatre doigts griffus, symétriques, devant un gros coussinet (coussin de peau nue).',
       'La clé complète les sépare par la taille et la forme de l''empreinte.',
       NULL,
       NULL,
       'groupe', 'carnivores', 'Renard, chacal ou chien',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Renard roux' AS name, 'Vulpes vulpes' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Loup doré africain (chacal)' AS name, 'Canis lupaster' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Chien' AS name, 'Canis familiaris' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 3 → groupe Genette ou mangouste (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Petite empreinte ronde ou de travers, de 2,5 à 4,5 cm.',
       'La genette laisse une empreinte ronde, sans marques de griffes ; la mangouste, une empreinte de travers aux griffes bien marquées.',
       NULL,
       NULL,
       'groupe', 'carnivores', 'Genette ou mangouste',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Genette commune' AS name, 'Genetta genetta' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Mangouste ichneumon' AS name, 'Herpestes ichneumon' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 4 → groupe Hérisson, belette ou porc-épic (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Cinq doigts, ou large plante de pied marquée jusqu''au talon.',
       'Minuscule (1 à 2 cm) : belette. Petite main en étoile : hérisson. Grande (5 à 9 cm) : porc-épic.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Hérisson, belette ou porc-épic',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 3 AND l.outcome = 'groupe'
  JOIN (SELECT 'Hérisson d’Algérie' AS name, 'Atelerix algirus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Belette' AS name, 'Mustela nivalis' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Porc-épic à crête' AS name, 'Hystrix cristata' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 1 → espèce Vache
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Bouse : grande galette ronde et plate.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Vache' AND pp.scientific_name <=> 'Bos taurus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → groupe Âne, mulet ou cheval (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Crottin : grosses boules pleines de brins d''herbe, en tas.',
       NULL,
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Âne, mulet ou cheval',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Âne' AS name, 'Equus asinus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Cheval Barbe' AS name, 'Equus caballus' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Mulet' AS name, 'Equus asinus × Equus caballus' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 3 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Petites billes ou petites olives, séparées, en tas ou en grappe.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 5, proposition 4 → groupe Carnivores : renard, chacal, chien, genette, mangouste, belette (6 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Boudin contenant des poils, des petits os ou des plumes.',
       'Les carnivores mangent surtout d''autres animaux : on voit des restes de leurs proies dans leurs crottes.',
       NULL,
       NULL,
       'groupe', 'carnivores', 'Carnivores : renard, chacal, chien, genette, mangouste, belette',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 3 AND l.outcome = 'groupe'
  JOIN (SELECT 'Renard roux' AS name, 'Vulpes vulpes' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Loup doré africain (chacal)' AS name, 'Canis lupaster' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Chien' AS name, 'Canis familiaris' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Genette commune' AS name, 'Genetta genetta' AS scientific_name, 3 AS ord
        UNION ALL SELECT 'Mangouste ichneumon' AS name, 'Herpestes ichneumon' AS scientific_name, 4 AS ord
        UNION ALL SELECT 'Belette' AS name, 'Mustela nivalis' AS scientific_name, 5 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 5 → espèce Hérisson d’Algérie
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Petit boudin noir et brillant, plein d''éclats d''insectes.',
       'Le hérisson mange beaucoup de coléoptères : les éclats brillants sont des morceaux de leurs ailes dures.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Hérisson d’Algérie' AND pp.scientific_name <=> 'Atelerix algirus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

-- couplet 6, proposition 1 → espèce Lapin de garenne
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Billes rondes et mates, en tas, près des terriers.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Lapin de garenne' AND pp.scientific_name <=> 'Oryctolagus cuniculus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 6, proposition 2 → espèce Lièvre du Cap
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Billes un peu aplaties, éparpillées, loin des terriers.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Lièvre du Cap' AND pp.scientific_name <=> 'Lepus capensis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → groupe Chèvre ou mouton (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Petites olives lisses et noires, nombreuses sur les chemins des troupeaux.',
       'Les crottes de chèvre et de mouton se ressemblent trop pour être séparées.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Chèvre ou mouton',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Mouton (race Sardi)' AS name, 'Ovis aries' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Chèvre' AS name, 'Capra hircus' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 4 → espèce Porc-épic à crête
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Grosses olives (2 à 4 cm), près d''un grand terrier ou de piquants.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Porc-épic à crête' AND pp.scientific_name <=> 'Hystrix cristata'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 7, proposition 1 → groupe Hérisson ou porc-épic (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Un piquant tombé au sol.',
       'Piquant court (moins de 3 cm) : hérisson. Long piquant rayé de noir et de blanc : porc-épic, qui le perd sans jamais le lancer.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Hérisson ou porc-épic',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Hérisson d’Algérie' AS name, 'Atelerix algirus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Porc-épic à crête' AS name, 'Hystrix cristata' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 2 → groupe Lapin, porc-épic, renard ou chacal (4 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Un trou de terrier qui s''enfonce sous la terre.',
       'Nombreux trous rapprochés : lapins. Grand trou entre des rochers, avec des piquants : porc-épic.',
       NULL,
       NULL,
       'groupe', 'mammiferes', 'Lapin, porc-épic, renard ou chacal',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Lapin de garenne' AS name, 'Oryctolagus cuniculus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Porc-épic à crête' AS name, 'Hystrix cristata' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Renard roux' AS name, 'Vulpes vulpes' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Loup doré africain (chacal)' AS name, 'Canis lupaster' AS scientific_name, 3 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 3 → espèce Sanglier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'De grandes plaques de terre retournée, comme labourée.',
       'Le sanglier retourne le sol avec son groin pour trouver racines, vers et larves.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Sanglier' AND pp.scientific_name <=> 'Sus scrofa'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'traces-mammiferes-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'traces-mammiferes-melah-college' AND k.title = 'Qui est passé par là ? Traces des mammifères (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- ---------------------------------------------------------------------------
-- Clé « arbres-palmiers-college » (renvoi : arbres-palmiers) — 8 couplets, 30 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'arbres-palmiers-college', 'Les arbres et les palmiers (version courte)',
       'Version courte de la clé des arbres et des palmiers du lycée et de la forêt comestible, pour le collège. On regarde le tronc, puis la forme des feuilles. Chaque résultat s''arrête au groupe ou à l''espèce commune ; la clé complète, proposée à la fin, permet d''aller plus loin.',
       NULL, 'Lycée Lyautey et forêt comestible', 'college', 1, NULL, NULL,
       'On observe l''arbre sans casser de rameau ni arracher de feuille : la sève du figuier irrite la peau au soleil, et le laurier-rose est très toxique. On garde ses distances avec les épines du figuier de Barbarie.',
       0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'arbres-palmiers-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'arbres-palmiers')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'arecacees')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'rosacees')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Pin d’Alep' AND x.scientific_name <=> 'Pinus halepensis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Filao' AND x.scientific_name <=> 'Casuarina equisetifolia')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Figuier de Barbarie' AND x.scientific_name <=> 'Opuntia ficus-indica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Palmier de Chine' AND x.scientific_name <=> 'Trachycarpus fortunei')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Palmier de Romanzoff' AND x.scientific_name <=> 'Syagrus romanzoffiana')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Palmier des Canaries' AND x.scientific_name <=> 'Phoenix canariensis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Palmier-dattier' AND x.scientific_name <=> 'Phoenix dactylifera')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Bananier' AND x.scientific_name <=> 'Musa sp.')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Papayer' AND x.scientific_name <=> 'Carica papaya')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Ginkgo' AND x.scientific_name <=> 'Ginkgo biloba')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Jacaranda' AND x.scientific_name <=> 'Jacaranda mimosifolia')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Gommier' AND x.scientific_name <=> 'Senegalia senegal')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Caroubier' AND x.scientific_name <=> 'Ceratonia siliqua')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Faux-poivrier' AND x.scientific_name <=> 'Schinus molle')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Poivre rose' AND x.scientific_name <=> 'Schinus terebinthifolia')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Olivier' AND x.scientific_name <=> 'Olea europaea')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Eucalyptus' AND x.scientific_name <=> 'Eucalyptus sp.')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Figuier commun' AND x.scientific_name <=> 'Ficus carica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Arganier' AND x.scientific_name <=> 'Argania spinosa')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Laurier-rose' AND x.scientific_name <=> 'Nerium oleander')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Manguier' AND x.scientific_name <=> 'Mangifera indica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Néflier du Japon' AND x.scientific_name <=> 'Eriobotrya japonica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Ficus' AND x.scientific_name <=> 'Ficus microcarpa')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Goyavier' AND x.scientific_name <=> 'Psidium guajava')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Citronnier' AND x.scientific_name <=> 'Citrus limon')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Laurier-sauce' AND x.scientific_name <=> 'Laurus nobilis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Grenadier' AND x.scientific_name <=> 'Punica granatum')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mûrier' AND x.scientific_name <=> 'Morus alba')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Prunier' AND x.scientific_name <=> 'Prunus domestica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Abricotier' AND x.scientific_name <=> 'Prunus armeniaca')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Cognassier' AND x.scientific_name <=> 'Cydonia oblonga');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number UNION ALL SELECT 7 AS number UNION ALL SELECT 8 AS number) n
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Un seul tronc sans branches, avec un bouquet de très grandes feuilles au sommet.',
       'Le « tronc » des palmiers s''appelle un stipe ; celui du bananier est fait de feuilles emboîtées.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → groupe Pin d'Alep ou filao (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Feuilles en aiguilles, ou fins rameaux verts qui y ressemblent.',
       'Le pin a de vraies aiguilles groupées par deux et des pommes de pin. Le filao a de fins rameaux faits de petits morceaux emboîtés.',
       NULL,
       NULL,
       'groupe', NULL, 'Pin d''Alep ou filao',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Pin d’Alep' AS name, 'Pinus halepensis' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Filao' AS name, 'Casuarina equisetifolia' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 1, proposition 3 → espèce Figuier de Barbarie
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Grosses raquettes vertes et charnues, couvertes de petites épines.',
       'C''est un cactus : les raquettes sont des tiges aplaties.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Figuier de Barbarie' AND pp.scientific_name <=> 'Opuntia ficus-indica'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 1, proposition 4 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Un tronc qui se divise en branches, avec des feuilles plates.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 2, proposition 1 → espèce Palmier de Chine
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Feuilles en éventail.',
       'Le palmier nain (doum), en touffes basses sans tronc, a lui aussi des feuilles en éventail.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Palmier de Chine' AND pp.scientific_name <=> 'Trachycarpus fortunei'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 2, proposition 2 → groupe Palmiers à palmes (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Feuilles en longues plumes (les palmes).',
       'Stipe fin et lisse : palmier de Romanzoff. Stipe très épais : palmier des Canaries. Rejets au pied : palmier-dattier.',
       NULL,
       NULL,
       'groupe', 'arecacees', 'Palmiers à palmes',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 1 AND l.outcome = 'groupe'
  JOIN (SELECT 'Palmier de Romanzoff' AS name, 'Syagrus romanzoffiana' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Palmier des Canaries' AS name, 'Phoenix canariensis' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Palmier-dattier' AS name, 'Phoenix dactylifera' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 2, proposition 3 → espèce Bananier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Feuilles entières géantes, souvent déchirées par le vent.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Bananier' AND pp.scientific_name <=> 'Musa sp.'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 2, proposition 4 → espèce Papayer
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Feuilles découpées comme une main ; fruits collés au tronc.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Papayer' AND pp.scientific_name <=> 'Carica papaya'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 3, proposition 1 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Chaque feuille est faite de plusieurs petites feuilles (folioles) sur une même tige.',
       'On parle de feuille composée.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 3, proposition 2 → espèce Ginkgo
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Feuilles en éventail, souvent fendues au milieu.',
       'Le ginkgo est un arbre très ancien : ses ancêtres vivaient déjà au temps des dinosaures.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Ginkgo' AND pp.scientific_name <=> 'Ginkgo biloba'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 3 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Chaque feuille est d''une seule pièce.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 4, proposition 1 → groupe Jacaranda ou gommier (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Folioles minuscules et très nombreuses, comme une fougère.',
       'Fleurs mauves en clochettes, pas d''épines : jacaranda. Rameaux épineux, fleurs crème : gommier.',
       NULL,
       NULL,
       'groupe', NULL, 'Jacaranda ou gommier',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Jacaranda' AS name, 'Jacaranda mimosifolia' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Gommier' AS name, 'Senegalia senegal' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 2 → espèce Caroubier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, '4 à 10 grandes folioles rondes et luisantes ; longues gousses brunes.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Caroubier' AND pp.scientific_name <=> 'Ceratonia siliqua'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 4, proposition 3 → groupe Faux-poivrier ou poivre rose (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Folioles étroites ou vernissées ; grappes de petits fruits roses ou rouges.',
       'Feuillage fin et retombant : faux-poivrier. Folioles larges et luisantes : poivre rose.',
       NULL,
       NULL,
       'groupe', NULL, 'Faux-poivrier ou poivre rose',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Faux-poivrier' AS name, 'Schinus molle' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Poivre rose' AS name, 'Schinus terebinthifolia' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 1 → espèce Olivier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Feuilles étroites, gris-vert dessus et argentées dessous.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Olivier' AND pp.scientific_name <=> 'Olea europaea'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → espèce Eucalyptus
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Écorce qui part en lanières ; feuilles pendantes en forme de faucille.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Eucalyptus' AND pp.scientific_name <=> 'Eucalyptus sp.'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 3 → espèce Figuier commun
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Grandes feuilles rêches, découpées en 3 à 5 parties profondes.',
       'Sa sève blanche irrite la peau au soleil.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Figuier commun' AND pp.scientific_name <=> 'Ficus carica'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 5, proposition 4 → espèce Arganier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Tronc tortueux, rameaux piquants, petites feuilles en bouquets.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Arganier' AND pp.scientific_name <=> 'Argania spinosa'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 5, proposition 5 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Autres feuilles d''une seule pièce.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

-- couplet 6, proposition 1 → espèce Laurier-rose
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Feuilles par trois au même niveau ; grosses fleurs roses ou blanches.',
       'Le laurier-rose est très toxique dans toutes ses parties.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Laurier-rose' AND pp.scientific_name <=> 'Nerium oleander'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 6, proposition 2 → couplet 7
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Feuilles épaisses et luisantes, présentes toute l''année.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 7),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → couplet 8
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Feuilles minces, qui tombent en hiver.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 8),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 7, proposition 1 → espèce Manguier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Feuilles très longues (15 à 35 cm), étroites, en forme de lance.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Manguier' AND pp.scientific_name <=> 'Mangifera indica'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 7, proposition 2 → espèce Néflier du Japon
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Grandes feuilles gaufrées, au bord denté, duveteuses et rousses dessous.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Néflier du Japon' AND pp.scientific_name <=> 'Eriobotrya japonica'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 7, proposition 3 → espèce Ficus
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Racines qui pendent des branches, ou petites figues rondes sur les rameaux.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Ficus' AND pp.scientific_name <=> 'Ficus microcarpa'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 7, proposition 4 → espèce Goyavier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Feuilles par deux face à face ; écorce cuivrée qui s''écaille.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Goyavier' AND pp.scientific_name <=> 'Psidium guajava'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 7, proposition 5 → groupe Citronnier ou laurier-sauce (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Feuilles moyennes, une par une ; fleurs blanches parfumées ou petites fleurs jaunâtres.',
       'Rameaux souvent épineux et citrons : citronnier. Bord des feuilles ondulé, pas d''épines : laurier-sauce.',
       NULL,
       NULL,
       'groupe', NULL, 'Citronnier ou laurier-sauce',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 4 AND l.outcome = 'groupe'
  JOIN (SELECT 'Citronnier' AS name, 'Citrus limon' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Laurier-sauce' AS name, 'Laurus nobilis' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 8, proposition 1 → espèce Grenadier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Feuilles par deux face à face ; fleurs rouge orangé.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Grenadier' AND pp.scientific_name <=> 'Punica granatum'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 8
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 8, proposition 2 → espèce Mûrier
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Feuilles luisantes et dentées, entières ou découpées sur un même rameau.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Mûrier' AND pp.scientific_name <=> 'Morus alba'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 8
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 8, proposition 3 → groupe Prunier, abricotier ou cognassier (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Autres feuilles, une par une : arbre fruitier à noyau ou à pépins.',
       'Feuilles ovales et pointues : prunier. Feuilles en cœur : abricotier. Feuilles duveteuses dessous, grandes fleurs roses : cognassier.',
       NULL,
       NULL,
       'groupe', 'rosacees', 'Prunier, abricotier ou cognassier',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'arbres-palmiers')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 8
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 8
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Prunier' AS name, 'Prunus domestica' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Abricotier' AS name, 'Prunus armeniaca' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Cognassier' AS name, 'Cydonia oblonga' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'arbres-palmiers-college' AND k.title = 'Les arbres et les palmiers (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- ---------------------------------------------------------------------------
-- Clé « amphibiens-reptiles-melah-college » (renvoi : amphibiens-reptiles-melah) — 6 couplets, 20 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'amphibiens-reptiles-melah-college', 'Amphibiens et reptiles de l''oued Melah (version courte)',
       'Version courte de la clé des amphibiens et des reptiles de la vallée de l''oued Melah, pour le collège. On sépare d''abord la peau nue des amphibiens de la peau à écailles des reptiles, puis on regarde la forme du corps, les pattes et les dessins. La clé complète, proposée à la fin, permet d''aller jusqu''à l''espèce.',
       'melah', 'Oued, berges, murets, rochers et matorral (vallée de l''oued Melah)', 'college', 1, NULL, 'jumelles',
       'On observe de loin, aux jumelles ou sur une photo, sans contact ni capture. La peau des amphibiens est fragile, et celle du crapaud produit un liquide irritant pour les yeux. Un serpent dont on ne voit pas l''œil de près peut être une vipère, très venimeuse : on recule doucement et on prévient un adulte. Les tortues et le caméléon sont protégés : on les laisse où ils sont.',
       0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'amphibiens-reptiles-melah-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'amphibiens-reptiles-melah')
   AND EXISTS (SELECT 1 FROM maps x WHERE x.id = 'melah')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'amphibiens')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'squamates')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Pleurodèle de Waltl' AND x.scientific_name <=> 'Pleurodeles waltl')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Crapaud de Maurétanie' AND x.scientific_name <=> 'Sclerophrys mauritanica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Crapaud vert d''Afrique du Nord' AND x.scientific_name <=> 'Bufotes boulengeri')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Rainette méridionale' AND x.scientific_name <=> 'Hyla meridionalis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Grenouille verte d''Afrique du Nord' AND x.scientific_name <=> 'Pelophylax saharicus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Discoglosse peint du Maroc' AND x.scientific_name <=> 'Discoglossus scovazzi')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Trogonophis' AND x.scientific_name <=> 'Trogonophis wiegmanni')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Émyde lépreuse' AND x.scientific_name <=> 'Mauremys leprosa')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Tortue mauresque' AND x.scientific_name <=> 'Testudo graeca')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Couleuvre vipérine' AND x.scientific_name <=> 'Natrix maura')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Couleuvre de Montpellier' AND x.scientific_name <=> 'Malpolon monspessulanus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Couleuvre fer-à-cheval' AND x.scientific_name <=> 'Hemorrhois hippocrepis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Tarente de Maurétanie' AND x.scientific_name <=> 'Tarentola mauritanica')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Hémidactyle verruqueux' AND x.scientific_name <=> 'Hemidactylus turcicus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Caméléon commun' AND x.scientific_name <=> 'Chamaeleo chamaeleon')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Seps à écailles nombreuses' AND x.scientific_name <=> 'Chalcides polylepis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Psammodrome algire' AND x.scientific_name <=> 'Psammodromus algirus');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number) n
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Peau nue, sans écailles, et pas de queue : une grenouille ou un crapaud.',
       'Ce sont des amphibiens : leur peau nue doit rester humide.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → espèce Pleurodèle de Waltl
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Peau nue, longue queue aplatie comme une rame, dans une mare ou un fossé.',
       'C''est le pleurodèle, un amphibien à queue qui vit surtout dans l''eau.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Pleurodèle de Waltl' AND pp.scientific_name <=> 'Pleurodeles waltl'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 1, proposition 3 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Peau couverte d''écailles sèches, ou corps dans une carapace : un reptile.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 2, proposition 1 → groupe Crapauds (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Peau sèche couverte de verrues ; deux gros bourrelets derrière les yeux.',
       'Grandes taches brun-rouge : crapaud de Maurétanie. Taches vert olive : crapaud vert.',
       NULL,
       NULL,
       'groupe', 'amphibiens', 'Crapauds',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Crapaud de Maurétanie' AS name, 'Sclerophrys mauritanica' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Crapaud vert d''Afrique du Nord' AS name, 'Bufotes boulengeri' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 2, proposition 2 → espèce Rainette méridionale
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Petite grenouille vert vif, aux doigts terminés par des pastilles.',
       'C''est la rainette : ses pastilles collantes lui permettent de grimper aux tiges.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Rainette méridionale' AND pp.scientific_name <=> 'Hyla meridionalis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 2, proposition 3 → groupe Grenouilles (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Grenouille à peau lisse, qui saute dans l''eau au moindre bruit.',
       'La grenouille verte a deux plis de peau le long du dos ; le discoglosse, au museau pointu, n''en a pas.',
       NULL,
       NULL,
       'groupe', 'amphibiens', 'Grenouilles',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Grenouille verte d''Afrique du Nord' AS name, 'Pelophylax saharicus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Discoglosse peint du Maroc' AS name, 'Discoglossus scovazzi' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 3, proposition 1 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Corps enfermé dans une carapace : une tortue.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 3, proposition 2 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Corps très allongé, sans pattes, aux yeux bien visibles : un serpent.',
       'Piège : le seps, un lézard aux pattes minuscules, ressemble à un serpent.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 3 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Quatre pattes et une queue : un lézard ou un gecko.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 4 → espèce Trogonophis
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Corps annelé comme un ver, sans pattes, sous les pierres.',
       'C''est le trogonophis, un reptile qui creuse le sol : ce n''est ni un ver ni un serpent.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Trogonophis' AND pp.scientific_name <=> 'Trogonophis wiegmanni'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 4, proposition 1 → espèce Émyde lépreuse
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Carapace plate, cou rayé de jaune, dans l''eau ou sur la berge.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Émyde lépreuse' AND pp.scientific_name <=> 'Mauremys leprosa'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 4, proposition 2 → espèce Tortue mauresque
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Carapace très bombée, jaune-brun tachée de noir, à terre.',
       'Espèce protégée : on la photographie sans la déplacer.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Tortue mauresque' AND pp.scientific_name <=> 'Testudo graeca'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 1 → clade squamates
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Le rond noir de l''œil (la pupille) est en fente, ou invisible de loin.',
       'Une pupille en fente signale souvent une vipère : on recule doucement et on prévient un adulte.',
       NULL,
       NULL,
       'clade', 'squamates', NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → espèce Couleuvre vipérine
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Pupille ronde ; dos taché en zigzag ; dans l''eau ou sur la berge.',
       'C''est la couleuvre vipérine : elle imite la vipère, mais elle est inoffensive.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Couleuvre vipérine' AND pp.scientific_name <=> 'Natrix maura'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 3 → groupe Couleuvres (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Pupille ronde ; dessin sans zigzag ; le plus souvent loin de l''eau.',
       'Grand serpent presque uni : couleuvre de Montpellier. Grandes taches rondes : couleuvre fer-à-cheval.',
       NULL,
       NULL,
       'groupe', 'squamates', 'Couleuvres',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Couleuvre de Montpellier' AS name, 'Malpolon monspessulanus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Couleuvre fer-à-cheval' AS name, 'Hemorrhois hippocrepis' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 1 → groupe Geckos (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Gecko trapu et aplati, qui grimpe aux murs, souvent la nuit.',
       'Gris-brun couvert de petites bosses : tarente. Rose pâle presque transparent : hémidactyle.',
       NULL,
       NULL,
       'groupe', 'squamates', 'Geckos',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Tarente de Maurétanie' AS name, 'Tarentola mauritanica' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Hémidactyle verruqueux' AS name, 'Hemidactylus turcicus' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 2 → espèce Caméléon commun
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Corps aplati sur les côtés, yeux qui bougent chacun de leur côté.',
       'C''est le caméléon, une espèce protégée.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Caméléon commun' AND pp.scientific_name <=> 'Chamaeleo chamaeleon'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → espèce Seps à écailles nombreuses
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Corps cylindrique, luisant comme vernis, aux pattes très courtes.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Seps à écailles nombreuses' AND pp.scientific_name <=> 'Chalcides polylepis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 6, proposition 4 → espèce Psammodrome algire
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Lézard brun-olive à longue queue, deux lignes claires sur le dos.',
       NULL,
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Psammodrome algire' AND pp.scientific_name <=> 'Psammodromus algirus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 6, proposition 5 → clade squamates
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Autre lézard.',
       'D''autres lézards vivent dans la région : photographie-le de loin et signale-le.',
       NULL,
       NULL,
       'clade', 'squamates', NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'amphibiens-reptiles-melah')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'amphibiens-reptiles-melah-college' AND k.title = 'Amphibiens et reptiles de l''oued Melah (version courte)'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

-- ---------------------------------------------------------------------------
-- Clé « oiseaux-eau-daya-college » (renvoi : oiseaux-daya) — 7 couplets, 26 propositions
-- ---------------------------------------------------------------------------

INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,
                     created_by, tool_required, safety_note, allows_multiple_paths)
SELECT 'oiseaux-eau-daya-college', 'Les oiseaux d''eau de la daya',
       'Clé collège des oiseaux d''eau de la daya de Dar Bouazza : ceux qui nagent, ceux qui marchent dans l''eau peu profonde, les mouettes et les goélands. On regarde d''abord ce que fait l''oiseau, puis la forme de son bec et ses couleurs. Les clés plus détaillées de la daya sont proposées à la fin pour aller plus loin.',
       'dayat', 'Plan d''eau, berges et vasières de la daya (depuis les chemins)', 'college', 1, NULL, 'jumelles',
       'On observe de loin, aux jumelles ou à la longue-vue, sans quitter les chemins ni entrer dans les roselières. Au printemps, plusieurs oiseaux pondent à même le sol : on ne s''approche jamais d''un nid. Un oiseau qui crie en tournant au-dessus du groupe protège ses petits : on s''éloigne. On reste loin du bord de l''eau.',
       0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'oiseaux-eau-daya-college')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'oiseaux-daya')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'oiseaux-eau-daya')
   AND EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = 'limicoles-daya')
   AND EXISTS (SELECT 1 FROM maps x WHERE x.id = 'dayat')
   AND EXISTS (SELECT 1 FROM clades x WHERE x.id = 'oiseaux')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Martin-pêcheur d''Europe' AND x.scientific_name <=> 'Alcedo atthis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Grèbe castagneux' AND x.scientific_name <=> 'Tachybaptus ruficollis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Canard souchet' AND x.scientific_name <=> 'Spatula clypeata')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Canard colvert' AND x.scientific_name <=> 'Anas platyrhynchos')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Nette rousse' AND x.scientific_name <=> 'Netta rufina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Fuligule nyroca' AND x.scientific_name <=> 'Aythya nyroca')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sarcelle marbrée' AND x.scientific_name <=> 'Marmaronetta angustirostris')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sarcelle d''été' AND x.scientific_name <=> 'Spatula querquedula')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Spatule blanche' AND x.scientific_name <=> 'Platalea leucorodia')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Ibis falcinelle' AND x.scientific_name <=> 'Plegadis falcinellus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Échasse blanche' AND x.scientific_name <=> 'Himantopus himantopus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Œdicnème criard' AND x.scientific_name <=> 'Burhinus oedicnemus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Petit gravelot' AND x.scientific_name <=> 'Charadrius dubius')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Gravelot à collier interrompu' AND x.scientific_name <=> 'Charadrius alexandrinus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Bécasseau variable' AND x.scientific_name <=> 'Calidris alpina')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Bécassine des marais' AND x.scientific_name <=> 'Gallinago gallinago')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Chevalier culblanc' AND x.scientific_name <=> 'Tringa ochropus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Chevalier gambette' AND x.scientific_name <=> 'Tringa totanus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Aigrette garzette' AND x.scientific_name <=> 'Egretta garzetta')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Héron garde-bœufs' AND x.scientific_name <=> 'Bubulcus ibis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Héron cendré' AND x.scientific_name <=> 'Ardea cinerea')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Crabier chevelu' AND x.scientific_name <=> 'Ardeola ralloides')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Bihoreau gris' AND x.scientific_name <=> 'Nycticorax nycticorax')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Blongios nain' AND x.scientific_name <=> 'Ixobrychus minutus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Sterne naine' AND x.scientific_name <=> 'Sternula albifrons')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Mouette rieuse' AND x.scientific_name <=> 'Chroicocephalus ridibundus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Goéland leucophée' AND x.scientific_name <=> 'Larus michahellis')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Goéland brun' AND x.scientific_name <=> 'Larus fuscus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Goéland d''Audouin' AND x.scientific_name <=> 'Ichthyaetus audouinii')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Foulque macroule' AND x.scientific_name <=> 'Fulica atra')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Foulque caronculée' AND x.scientific_name <=> 'Fulica cristata')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Gallinule poule-d''eau' AND x.scientific_name <=> 'Gallinula chloropus')
   AND EXISTS (SELECT 1 FROM plants x WHERE x.name = 'Talève sultane' AND x.scientific_name <=> 'Porphyrio porphyrio');

INSERT INTO id_key_couplets (key_id, number)
SELECT k.id, n.number
  FROM id_keys k
  JOIN (SELECT 1 AS number UNION ALL SELECT 2 AS number UNION ALL SELECT 3 AS number UNION ALL SELECT 4 AS number UNION ALL SELECT 5 AS number UNION ALL SELECT 6 AS number UNION ALL SELECT 7 AS number) n
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);

-- couplet 1, proposition 1 → couplet 2
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Il nage sur l''eau, ou plonge depuis la surface.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 2),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 1, proposition 2 → couplet 6
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Oiseau blanc et gris aux longues ailes pointues ; pieds palmés.',
       'Mouettes, goélands et sternes volent au-dessus de l''eau et se posent aussi pour nager.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 6),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 1, proposition 3 → couplet 4
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Il marche dans l''eau peu profonde ou sur la vase, sur des pattes nues.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 4),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 1, proposition 4 → espèce Martin-pêcheur d'Europe
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Petit oiseau bleu-vert brillant, au long bec, qui plonge depuis un perchoir.',
       'C''est le martin-pêcheur. Il est surtout présent en hiver.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Martin-pêcheur d''Europe' AND pp.scientific_name <=> 'Alcedo atthis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 1
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 2, proposition 1 → couplet 3
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Bec plat et large, pattes palmées : un canard.',
       NULL,
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 3),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 2, proposition 2 → couplet 7
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Bec pointu prolongé sur le front par une plaque blanche ou rouge.',
       'Cette plaque de peau nue s''appelle la plaque frontale.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 7),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 2, proposition 3 → espèce Grèbe castagneux
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Petit oiseau rond, sans queue visible, qui plonge sans cesse.',
       'C''est le grèbe castagneux.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Grèbe castagneux' AND pp.scientific_name <=> 'Tachybaptus ruficollis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 2
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 1 → espèce Canard souchet
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Bec énorme, élargi en spatule au bout.',
       'C''est le canard souchet : il filtre l''eau avec son bec.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Canard souchet' AND pp.scientific_name <=> 'Spatula clypeata'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 3, proposition 2 → espèce Canard colvert
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Mâle à tête vert bouteille et collier blanc ; femelle brune.',
       'C''est le canard colvert.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Canard colvert' AND pp.scientific_name <=> 'Anas platyrhynchos'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 3, proposition 3 → espèce Nette rousse
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Mâle à tête rousse et arrondie, au bec rouge vif.',
       'C''est la nette rousse. La femelle est brun clair, aux joues gris pâle.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Nette rousse' AND pp.scientific_name <=> 'Netta rufina'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 3, proposition 4 → groupe Autres canards de la daya (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Autre canard : brun sombre, gris-beige tacheté, ou à sourcil blanc.',
       'Fuligule nyroca, sarcelle marbrée ou sarcelle d''été : la clé détaillée les sépare.',
       NULL,
       NULL,
       'groupe', 'oiseaux', 'Autres canards de la daya',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 3
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 3 AND l.outcome = 'groupe'
  JOIN (SELECT 'Fuligule nyroca' AS name, 'Aythya nyroca' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Sarcelle marbrée' AS name, 'Marmaronetta angustirostris' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Sarcelle d''été' AS name, 'Spatula querquedula' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 4, proposition 1 → couplet 5
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Grand oiseau au long cou, au bec droit et pointu comme un poignard.',
       'C''est un héron ou une aigrette.',
       (SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = 5),
       NULL,
       'couplet', NULL, NULL,
       NULL
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 4, proposition 2 → espèce Spatule blanche
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Grand oiseau blanc au long bec aplati en spatule au bout.',
       'C''est la spatule blanche : elle balaie l''eau de gauche à droite avec son bec.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Spatule blanche' AND pp.scientific_name <=> 'Platalea leucorodia'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 4, proposition 3 → espèce Ibis falcinelle
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Plumage sombre à reflets brillants ; long bec courbé vers le bas.',
       'C''est l''ibis falcinelle.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Ibis falcinelle' AND pp.scientific_name <=> 'Plegadis falcinellus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 4, proposition 4 → espèce Échasse blanche
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Pattes roses très longues ; dos noir, tête et ventre blancs.',
       'C''est l''échasse blanche.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Échasse blanche' AND pp.scientific_name <=> 'Himantopus himantopus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'limicoles-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

-- couplet 4, proposition 5 → groupe Petits échassiers de la vase (limicoles) (7 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 4, 'Petit oiseau brun, gris ou beige, au cou court, qui picore ou fouille la vase.',
       'Les limicoles cherchent vers, larves et petits crustacés dans la vase : gravelots, bécasseau, bécassine, chevaliers, œdicnème.',
       NULL,
       NULL,
       'groupe', 'oiseaux', 'Petits échassiers de la vase (limicoles)',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'limicoles-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 4);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 4
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 4 AND l.outcome = 'groupe'
  JOIN (SELECT 'Œdicnème criard' AS name, 'Burhinus oedicnemus' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Petit gravelot' AS name, 'Charadrius dubius' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Gravelot à collier interrompu' AS name, 'Charadrius alexandrinus' AS scientific_name, 2 AS ord
        UNION ALL SELECT 'Bécasseau variable' AS name, 'Calidris alpina' AS scientific_name, 3 AS ord
        UNION ALL SELECT 'Bécassine des marais' AS name, 'Gallinago gallinago' AS scientific_name, 4 AS ord
        UNION ALL SELECT 'Chevalier culblanc' AS name, 'Tringa ochropus' AS scientific_name, 5 AS ord
        UNION ALL SELECT 'Chevalier gambette' AS name, 'Tringa totanus' AS scientific_name, 6 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 5, proposition 1 → espèce Aigrette garzette
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Tout blanc, élancé ; bec noir, pattes noires et doigts jaunes.',
       'C''est l''aigrette garzette.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Aigrette garzette' AND pp.scientific_name <=> 'Egretta garzetta'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 5, proposition 2 → espèce Héron garde-bœufs
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Tout blanc, petit et trapu, au bec jaune ; souvent près du bétail.',
       'C''est le héron garde-bœufs.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Héron garde-bœufs' AND pp.scientific_name <=> 'Bubulcus ibis'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 5, proposition 3 → espèce Héron cendré
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Très grand et gris, plus grand que les aigrettes.',
       'C''est le héron cendré, surtout présent en hiver.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Héron cendré' AND pp.scientific_name <=> 'Ardea cinerea'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

-- couplet 5, proposition 4 → groupe Petits hérons : crabier, bihoreau, blongios (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 3, 'Héron plus petit, brun, chamois ou noir et blanc.',
       'Ils se cachent souvent dans les roseaux ; la clé détaillée les sépare.',
       NULL,
       NULL,
       'groupe', 'oiseaux', 'Petits hérons : crabier, bihoreau, blongios',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 3);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 5
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 3 AND l.outcome = 'groupe'
  JOIN (SELECT 'Crabier chevelu' AS name, 'Ardeola ralloides' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Bihoreau gris' AS name, 'Nycticorax nycticorax' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Blongios nain' AS name, 'Ixobrychus minutus' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 6, proposition 1 → espèce Sterne naine
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Petite et fine ; calotte noire et front blanc ; plonge en piqué.',
       'C''est la sterne naine, présente au printemps et en été.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Sterne naine' AND pp.scientific_name <=> 'Sternula albifrons'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

-- couplet 6, proposition 2 → espèce Mouette rieuse
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'De la taille d''un pigeon ; bec et pattes rouges.',
       'C''est la mouette rieuse. En été, sa tête est brun chocolat.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Mouette rieuse' AND pp.scientific_name <=> 'Chroicocephalus ridibundus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 6, proposition 3 → groupe Goélands (3 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Grand goéland au bec fort et épais.',
       'Le goéland leucophée, au bec jaune taché de rouge, est le plus commun.',
       NULL,
       NULL,
       'groupe', 'oiseaux', 'Goélands',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 6
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 2 AND l.outcome = 'groupe'
  JOIN (SELECT 'Goéland leucophée' AS name, 'Larus michahellis' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Goéland brun' AS name, 'Larus fuscus' AS scientific_name, 1 AS ord
        UNION ALL SELECT 'Goéland d''Audouin' AS name, 'Ichthyaetus audouinii' AS scientific_name, 2 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 1 → groupe Foulques (2 espèces)
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 0, 'Plumage tout noir ; bec et plaque frontale blancs.',
       'Foulque macroule ou foulque caronculée : la clé détaillée les sépare.',
       NULL,
       NULL,
       'groupe', 'oiseaux', 'Foulques',
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 0);

INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)
SELECT l.id, p.id, v.ord
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = 0 AND l.outcome = 'groupe'
  JOIN (SELECT 'Foulque macroule' AS name, 'Fulica atra' AS scientific_name, 0 AS ord
        UNION ALL SELECT 'Foulque caronculée' AS name, 'Fulica cristata' AS scientific_name, 1 AS ord) v
  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2
                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);

-- couplet 7, proposition 2 → espèce Gallinule poule-d'eau
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 1, 'Plumage brun-noir ; bec rouge à pointe jaune ; ligne blanche sur le flanc.',
       'C''est la gallinule poule-d''eau.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Gallinule poule-d''eau' AND pp.scientific_name <=> 'Gallinula chloropus'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 1);

-- couplet 7, proposition 3 → espèce Talève sultane
INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,
                          outcome, clade_id, result_label, next_key_id)
SELECT c.id, 2, 'Plumage bleu-violet ; gros bec et plaque frontale rouges.',
       'C''est la talève sultane.',
       NULL,
       (SELECT MIN(pp.id) FROM plants pp WHERE pp.name = 'Talève sultane' AND pp.scientific_name <=> 'Porphyrio porphyrio'),
       'espece', NULL, NULL,
       (SELECT nk.id FROM id_keys nk WHERE nk.slug = 'oiseaux-eau-daya')
  FROM id_keys k
  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = 7
 WHERE k.slug = 'oiseaux-eau-daya-college' AND k.title = 'Les oiseaux d''eau de la daya'
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = 2);
