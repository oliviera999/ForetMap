-- Filet CI après 225–228 : espèces citées dans le réseau GL mais jamais insérées,
-- rejeu des liens écosystème / verrouillage approved. Idempotent.

INSERT INTO gl_species (
  species_code, biome_slug, type, nom_commun, nom_scientifique, taxon_rank,
  groupe, famille, role_ecologique, regime_alimentaire, description_courte,
  anecdote, wikipedia_url, statut, created_at, updated_at
)
SELECT v.species_code, v.biome_slug, v.type, v.nom_commun, v.nom_scientifique, v.taxon_rank,
       v.groupe, v.famille, v.role_ecologique, v.regime_alimentaire, v.description_courte,
       v.anecdote, v.wikipedia_url, v.statut, v.created_at, v.updated_at
FROM (
  SELECT
    'SP0275' AS species_code, 'foret_caducifoliee' AS biome_slug, 'flore' AS type,
    'Jacinthe des bois' AS nom_commun, 'Hyacinthoides non-scripta' AS nom_scientifique,
    'species' AS taxon_rank, 'Plantes à fleurs' AS groupe, 'Asparagacées' AS famille,
    'Bulbeuse de sous-bois, souvent mycorhizée' AS role_ecologique,
    'Autotrophe' AS regime_alimentaire,
    'Tapis bleu des hêtraies au printemps ; les Glomus l’aident à prélever phosphore et eau.' AS description_courte,
    'Cueillir les tapis vides le sous-bois pour plusieurs années.' AS anecdote,
    'https://fr.wikipedia.org/wiki/Hyacinthoides_non-scripta' AS wikipedia_url,
    'actif' AS statut, NOW() AS created_at, NOW() AS updated_at
  UNION ALL SELECT
    'SP0276', 'foret_caducifoliee', 'flore',
    'Muguet', 'Convallaria majalis', 'species',
    'Plantes à fleurs', 'Asparagacées',
    'Rhizomateuse d’ombre, associée aux champignons du sol',
    'Autotrophe',
    'Feuilles en navette et clochettes ; toxique, à laisser au bois.',
    'Le 1er mai on l’offre : dans le sous-bois, on la laisse.',
    'https://fr.wikipedia.org/wiki/Muguet_de_mai',
    'actif', NOW(), NOW()
) AS v
WHERE NOT EXISTS (SELECT 1 FROM gl_species g WHERE g.species_code = v.species_code);

INSERT INTO gl_species_interactions (from_species_id, to_species_id, interaction_type, description)
SELECT f.id, t.id, v.itype, v.descr
FROM (
  SELECT 'Mycorhizes à Glomus' AS fname, 'Jacinthe des bois' AS tname, 'symbiose' AS itype,
    'Bulbeuse de sous-bois associée aux Glomus' AS descr
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Muguet', 'symbiose',
    'Sous-bois : champignon et racines'
) AS v
JOIN gl_species f ON f.nom_commun = v.fname
JOIN gl_species t ON t.nom_commun = v.tname
WHERE NOT EXISTS (
  SELECT 1 FROM gl_species_interactions si
  WHERE si.from_species_id = f.id AND si.to_species_id = t.id AND si.interaction_type = v.itype
);

INSERT IGNORE INTO gl_resource_question_links
  (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'qcm', 'ecosystem', q.biome_slug, q.question_code, 'import', 'approved', 1
  FROM gl_qcm_questions q
  INNER JOIN gl_biomes b ON b.slug = q.biome_slug
 WHERE q.statut = 'actif'
   AND q.question_code REGEXP '^GQCM9[12][0-9]{2}$'
   AND q.biome_slug IS NOT NULL
   AND q.biome_slug <> '';

UPDATE gl_resource_question_links
   SET is_gating = 1
 WHERE status = 'approved'
   AND origin IN ('import', 'generated', 'manual')
   AND question_code REGEXP '^GQCM9[12][0-9]{2}$';

UPDATE resource_question_links
   SET is_gating = 1
 WHERE status = 'approved'
   AND origin IN ('import', 'generated', 'manual')
   AND question_code REGEXP '^QF9[12][0-9]{2}$';
