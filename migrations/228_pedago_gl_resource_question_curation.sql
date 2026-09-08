-- Recuration GL : QCM miroir des notions FM, biomes → écosystèmes, purge pertinence.
-- Idempotent. Suggestions auto restent non bloquantes.

INSERT IGNORE INTO gl_qcm_questions
(question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
 choix_a, choix_b, choix_c, choix_d, choix_e,
 reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
 feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
 notes_pedagogiques, tags, statut, created_at, updated_at)
VALUES
('GQCM9250','foret_caducifoliee','faune',9250,
 'Le merle noir retourne la litière. Quelle lecture est la plus juste ?',
 'Il mange vers, insectes et parfois des baies : omnivore utile, pas un décomposeur',
 'Il fixe l’azote comme un Rhizobium',
 'Il ne se nourrit que de nectar',
 'Il nitrifie l’humus',
 'Il est un nœud-nourriture inerte',
 'A','Merle = omnivore de litière et de baies',
 'cycle 4',2,'⭐⭐ Moyen',
 'Même métier que dans le jardin lycée : il relie le sol (vers) aux buissons à baies.',
 'Oui. Ce n’est pas un champignon décomposeur.',
 'Non. La fixation d’azote est microbienne.',
 'Non. Ce n’est pas un butineur exclusif.',
 'Non. La nitrification n’est pas son rôle.',
 'Non. C’est un organisme, pas une ressource.',
 'Miroir QF9259 / SP0255.','merle, lombric, sureau','actif',NOW(),NOW()),
('GQCM9251','foret_caducifoliee','faune',9251,
 'Carabe doré et hérisson commun chassent souvent…',
 'des escargots ou des limaces au sol',
 'uniquement du nectar de pâquerette',
 'le diazote de l’air',
 'des arbres entiers',
 'la neige de toundra',
 'A','Prédateurs de mollusques de litière',
 'cycle 4',1,'⭐ Facile',
 'Deux alliés, deux silhouettes, le même étage du réseau.',
 'Oui. L’escargot des bois est une proie typique.',
 'Non. Ni l’un ni l’autre n’est un pollinisateur exclusif.',
 'Non. Pas de fixation ici.',
 'Non. Ils ne « mangent » pas les arbres.',
 'Non. Hors biome.',
 'SP0256 / SP0074.','carabe, herisson, escargot','actif',NOW(),NOW()),
('GQCM9252','foret_caducifoliee','faune',9252,
 'Larve de chrysope ou perce-oreille sur une lisière : que font-ils surtout ?',
 'Ils consomment des pucerons (auxiliaires, parfois imparfaits)',
 'Ils photosynthétisent la sève',
 'Ils construisent des nids d’hirondelle',
 'Ils oxydent l’ammonium',
 'Ils sont des nœuds-nourriture',
 'A','Auxiliaires aphidiphages',
 'cycle 4',2,'⭐⭐ Moyen',
 'Le puceron de lisière (SP0274) a plusieurs prédateurs, pas un seul « utile ».',
 'Oui. Même service, deux insectes.',
 'Non. Ils n’ont pas de chlorophylle utile.',
 'Non. Les hirondelles font leurs nids elles-mêmes.',
 'Non. Processus bactérien.',
 'Non. Ce sont des organismes.',
 'SP0267 / SP0257 / SP0274.','chrysope, perce-oreille, puceron','actif',NOW(),NOW()),
('GQCM9253','landes','faune',9253,
 'Dans une mare de lande, daphnie, larve de libellule et gerris…',
 'occupent trois niches : filtreur, prédateur immergé, prédateur de surface',
 'font tous de la nitrification',
 'sont trois plantes aquatiques',
 'n’ont aucun prédateur',
 'hibernent sous la canopée tropicale',
 'A','Trois métiers dans la même mare',
 'cycle 4',2,'⭐⭐ Moyen',
 'Le réseau de la mare n’est pas une seule chaîne.',
 'Oui. Daphnie filtre ; naïade chasse ; gerris patine.',
 'Non. La nitrification reste microbienne.',
 'Non. Ce sont des animaux.',
 'Non. Ils ont eux-mêmes des prédateurs.',
 'Non. Hors biome.',
 'SP0268–SP0270.','daphnie, libellule, gerris','actif',NOW(),NOW()),
('GQCM9254','landes','faune',9254,
 'Hirondelle rustique le jour, pipistrelle la nuit : que chassent-elles au-dessus de la mare ?',
 'Des insectes volants, dont des moustiques adultes',
 'Uniquement des daphnies au fond',
 'L’azote dissous',
 'Des glands de chêne',
 'Des lichens de toundra',
 'A','Prédateurs aériens, deux relèves',
 'cycle 4',1,'⭐ Facile',
 'Les larves restent dans l’eau ; les adultes, dans l’air.',
 'Oui. Jour / nuit, même proie ailée.',
 'Non. Les daphnies restent dans l’eau.',
 'Non. Ils n’absorbent pas l’azote comme une plante.',
 'Non. Hors régime.',
 'Non. Hors biome.',
 'SP0258 / SP0271 / SP0273.','hirondelle, pipistrelle, moustique','actif',NOW(),NOW()),
('GQCM9255','foret_caducifoliee','ecosystemes',9255,
 'Les mycorhizes à Glomus, dans une clairière, c’est surtout…',
 'un partenariat : le champignon élargit l’absorption, la plante cède des sucres',
 'un prédateur de merles',
 'un engrais de synthèse',
 'une liane tropicale',
 'un feuillet du Carnet de Sélène',
 'A','Symbiose racinaire (Glomus)',
 'cycle 4',2,'⭐⭐ Moyen',
 'Pendant du Rhizobium : ici un champignon, plutôt phosphore et eau.',
 'Oui. Labourer ou un fongicide casse ce réseau.',
 'Non. Ce n’est pas une prédation.',
 'Non. Ce n’est pas un produit en sac.',
 'Non. Hors biome et hors règne.',
 'Non. Rien à voir avec le lore.',
 'SP0261.','glomus, mycorhize, symbiose','actif',NOW(),NOW()),
('GQCM9256','foret_caducifoliee','faune',9256,
 'Pourquoi le lombric commun n’est-il pas le même « métier » qu’un ver de compost ?',
 'Lumbricus creuse des galeries profondes ; Eisenia reste dans la matière organique de surface',
 'Ce sont toujours le même animal',
 'Le lombric ne mange que des pucerons',
 'Eisenia oxyde l’ammonium',
 'Les deux hibernent dans la savane',
 'A','Anecis vs compost',
 'cycle 4',2,'⭐⭐ Moyen',
 'Deux vers, deux milieux — comme dans le catalogue ForetMap.',
 'Oui. Galeries verticales vs tas de litière.',
 'Non. Les fiches sont séparées exprès.',
 'Non. Ni l’un ni l’autre n’est un prédateur de pucerons.',
 'Non. Nitrification microbienne.',
 'Non. Hors biome.',
 'SP0262.','lombric, eisenia, sol','actif',NOW(),NOW()),
('GQCM9257','foret_caducifoliee','flore',9257,
 'Sureau noir, pâquerette, plantain, violette des bois : pourquoi les garder dans un biome forestier ?',
 'Nectar, baies ou litière — des ressources pour la faune, sans sortir de la lisière',
 'Ils remplacent tous les prédateurs',
 'Ils nitrifient la rivière',
 'Ce sont des poissons de mare',
 'Ils n’ont aucun rôle',
 'A','Sauvages utiles de lisière',
 'cycle 4',1,'⭐ Facile',
 'Même idée que le jardin lycée : nectar et baies sur place.',
 'Oui. Le merle mange les baies de sureau ; les fleurs nourrissent les butineurs.',
 'Non. Ils n’« avalent » pas les prédateurs.',
 'Non. Pas leur rôle.',
 'Non. Ce sont des plantes.',
 'Non. Ils structurent le réseau de lisière.',
 'SP0263–SP0266.','sureau, paquerette, violette','actif',NOW(),NOW()),
('GQCM9258','foret_mediterraneenne','faune',9258,
 'La pipistrelle commune des garrigues chasse surtout…',
 'des insectes volants au crépuscule (moustiques, papillons de nuit)',
 'des glands au fond d’une mare',
 'du lichen de toundra exclusivement',
 'le diazote atmosphérique',
 'des feuilles de chêne-liège uniquement',
 'A','Insectivore nocturne méditerranéen',
 'cycle 4',1,'⭐ Facile',
 'Même service que l’hirondelle, autre horaire, autre biome.',
 'Oui. Fissure de mur + ciel du village.',
 'Non. Elle ne plonge pas pour des glands.',
 'Non. Hors aire.',
 'Non. Pas une bactérie.',
 'Non. Ce n’est pas un écureuil.',
 'SP0271.','pipistrelle, moustique, mediterranee','actif',NOW(),NOW());

-- QCM d’un biome → ressource écosystème (slug biome).
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'qcm', 'ecosystem', q.biome_slug, q.question_code, 'import', 'approved', 1
  FROM gl_qcm_questions q
  INNER JOIN gl_biomes b ON b.slug = q.biome_slug
 WHERE q.statut = 'actif'
   AND q.biome_slug IS NOT NULL
   AND q.biome_slug <> '';

-- Espèces : le nom commun (assez long) figure dans l’énoncé ou la bonne réponse.
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'qcm', 'species', s.species_code, q.question_code, 'import', 'approved', 1
  FROM gl_species s
  INNER JOIN gl_qcm_questions q
    ON q.statut = 'actif'
   AND (
     q.question LIKE CONCAT('%', s.nom_commun, '%')
     OR IFNULL(q.reponse_texte, '') LIKE CONCAT('%', s.nom_commun, '%')
     OR q.choix_a LIKE CONCAT('%', s.nom_commun, '%')
   )
 WHERE s.statut = 'actif'
   AND CHAR_LENGTH(TRIM(s.nom_commun)) >= 6;

-- Paires explicites du lot (codes SP0255+).
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
VALUES
  ('qcm','species','SP0255','GQCM9250','import','approved',1),
  ('qcm','species','SP0262','GQCM9250','import','approved',1),
  ('qcm','species','SP0263','GQCM9250','import','approved',1),
  ('qcm','species','SP0256','GQCM9251','import','approved',1),
  ('qcm','species','SP0074','GQCM9251','import','approved',1),
  ('qcm','species','SP0272','GQCM9251','import','approved',1),
  ('qcm','species','SP0267','GQCM9252','import','approved',1),
  ('qcm','species','SP0257','GQCM9252','import','approved',1),
  ('qcm','species','SP0274','GQCM9252','import','approved',1),
  ('qcm','species','SP0268','GQCM9253','import','approved',1),
  ('qcm','species','SP0269','GQCM9253','import','approved',1),
  ('qcm','species','SP0270','GQCM9253','import','approved',1),
  ('qcm','species','SP0258','GQCM9254','import','approved',1),
  ('qcm','species','SP0271','GQCM9254','import','approved',1),
  ('qcm','species','SP0273','GQCM9254','import','approved',1),
  ('qcm','species','SP0261','GQCM9255','import','approved',1),
  ('qcm','species','SP0262','GQCM9256','import','approved',1),
  ('qcm','species','SP0263','GQCM9257','import','approved',1),
  ('qcm','species','SP0264','GQCM9257','import','approved',1),
  ('qcm','species','SP0265','GQCM9257','import','approved',1),
  ('qcm','species','SP0266','GQCM9257','import','approved',1),
  ('qcm','species','SP0271','GQCM9258','import','approved',1),
  ('qcm','glossary','GL9005','GQCM9250','import','approved',1);

-- Purge glossaire GL : terme absent de l’énoncé / bonne réponse / tags.
DELETE rql
  FROM gl_resource_question_links rql
  INNER JOIN gl_qcm_questions q ON q.question_code = rql.question_code
  INNER JOIN gl_glossary_terms g ON g.glossary_code = rql.resource_ref
 WHERE rql.question_dataset = 'qcm'
   AND rql.resource_type = 'glossary'
   AND rql.origin IN ('import', 'generated', 'auto')
   AND rql.status = 'approved'
   AND CHAR_LENGTH(TRIM(g.terme)) >= 5
   AND LOWER(CONCAT_WS(' ', q.question, IFNULL(q.reponse_texte, ''), IFNULL(q.tags, ''), q.choix_a))
       NOT LIKE CONCAT('%', LOWER(g.terme), '%');

-- Reposer les liens glossaire 221 + nouveaux s’ils ont été trop agressivement purgés.
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
VALUES
  ('qcm','glossary','GL9005','GQCM9103','import','approved',1),
  ('qcm','glossary','GL9006','GQCM9103','import','approved',1),
  ('qcm','glossary','GL9001','GQCM9101','import','approved',1),
  ('qcm','glossary','GL0084','GQCM9105','import','approved',1),
  ('qcm','glossary','GL9009','GQCM9106','import','approved',1),
  ('qcm','glossary','GL9010','GQCM9106','import','approved',1),
  ('qcm','species','SP0051','GQCM9101','import','approved',1),
  ('qcm','species','SP0015','GQCM9102','import','approved',1),
  ('qcm','species','SP0043','GQCM9107','import','approved',1),
  ('qcm','species','SP0146','GQCM9108','import','approved',1),
  ('qcm','glossary','GL9005','GQCM9250','import','approved',1);

-- Feuillets : seulement si le titre (assez long) apparaît dans un QCM lore, ou le code dans les tags.
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'qcm_lore', 'feuillet', f.feuillet_code, q.question_code, 'import', 'approved', 1
  FROM gl_lore_feuillets f
  INNER JOIN gl_qcm_lore_questions q
    ON q.statut = 'actif'
   AND CHAR_LENGTH(TRIM(f.titre)) >= 10
   AND (
     q.question LIKE CONCAT('%', f.titre, '%')
     OR IFNULL(q.tags, '') LIKE CONCAT('%', f.feuillet_code, '%')
     OR IFNULL(q.reponse_texte, '') LIKE CONCAT('%', f.titre, '%')
   );

-- Lexique lore : terme présent dans le QCM lore.
INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'qcm_lore', 'lore_glossary', g.lore_code, q.question_code, 'import', 'approved', 1
  FROM gl_lore_glossary_terms g
  INNER JOIN gl_qcm_lore_questions q
    ON q.statut = 'actif'
   AND CHAR_LENGTH(TRIM(g.terme)) >= 6
   AND (
     q.question LIKE CONCAT('%', g.terme, '%')
     OR IFNULL(q.reponse_texte, '') LIKE CONCAT('%', g.terme, '%')
     OR q.choix_a LIKE CONCAT('%', g.terme, '%')
   )
 WHERE g.statut = 'actif';

-- Orphelins évidents.
DELETE rql
  FROM gl_resource_question_links rql
  LEFT JOIN gl_qcm_questions q ON q.question_code = rql.question_code AND rql.question_dataset = 'qcm'
  LEFT JOIN gl_qcm_lore_questions l ON l.question_code = rql.question_code AND rql.question_dataset = 'qcm_lore'
 WHERE q.question_code IS NULL AND l.question_code IS NULL;

-- Approved relu → bloquant ; auto / suggested restent documentaires.
UPDATE gl_resource_question_links
   SET is_gating = 1
 WHERE status = 'approved'
   AND origin IN ('import', 'generated', 'manual');

UPDATE gl_resource_question_links
   SET is_gating = 0
 WHERE status = 'suggested' OR origin = 'auto';
