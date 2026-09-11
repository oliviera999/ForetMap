-- Filet CI après 225 : le hérisson commun, cité par le réseau GL mais jamais inséré.
--
-- Migration 225 sème les interactions par JOIN sur `nom_commun` : toute ligne dont un nom
-- manque au moment où elle passe est silencieusement abandonnée. `Hérisson commun` (SP0074)
-- est référencé par 225 et 228 mais créé par aucune migration versionnée — il n'existe qu'en
-- production. Sur une base neuve, ses deux liaisons trophiques sont donc perdues.
--
-- Même patron que 229 (« filet CI après 225–228 ») : créer l'espèce absente, puis rejouer les
-- seules lignes d'interaction qui la concernent. Idempotent, et sans effet en production où
-- SP0074 existe déjà.

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
    'SP0074' AS species_code, 'foret_caducifoliee' AS biome_slug, 'faune' AS type,
    'Hérisson commun' AS nom_commun, 'Erinaceus europaeus' AS nom_scientifique,
    'species' AS taxon_rank, 'Mammifères' AS groupe, 'Érinacéidés' AS famille,
    'Auxiliaire nocturne des haies : consomme limaces, escargots et vers' AS role_ecologique,
    'Insectivore opportuniste' AS regime_alimentaire,
    'Petit mammifère à piquants des lisières et des haies ; chasse au sol la nuit et hiberne l’hiver.' AS description_courte,
    'Il lui faut des passages au ras du sol : une haie continue vaut mieux qu’un grillage jusqu’à terre.' AS anecdote,
    'https://fr.wikipedia.org/wiki/Erinaceus_europaeus' AS wikipedia_url,
    'actif' AS statut, NOW() AS created_at, NOW() AS updated_at
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM gl_species g
   WHERE g.species_code = v.species_code OR g.nom_commun = v.nom_commun
);

INSERT INTO gl_species_interactions (from_species_id, to_species_id, interaction_type, description)
SELECT f.id, t.id, v.itype, v.descr
FROM (
  SELECT 'Hérisson commun' AS fname, 'Lombric commun' AS tname, 'predation' AS itype,
    'Régime nocturne : vers et escargots' AS descr
  UNION ALL SELECT 'Hérisson commun', 'Escargot des bois', 'predation',
    'Ouvre les coquilles au bord des haies'
) AS v
JOIN gl_species f ON f.nom_commun = v.fname
JOIN gl_species t ON t.nom_commun = v.tname
WHERE NOT EXISTS (
  SELECT 1 FROM gl_species_interactions si
  WHERE si.from_species_id = f.id AND si.to_species_id = t.id AND si.interaction_type = v.itype
);
