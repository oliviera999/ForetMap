-- Compléments réservés **multiples** par lieu (zone / repère), chacun avec son audience.
-- Remplace les colonnes `restricted_note*` de `zones`, `map_markers`, `visit_zones` et
-- `visit_markers`. Règles dans `lib/locationNotes.js` et `lib/locationAudience.js`.
--
-- POURQUOI UNE TABLE ENFANT
-- -------------------------
-- 1) Un lieu ne portait qu'UN complément : impossible de dire une chose aux profs de classe,
--    une autre à la 2nde B et une troisième au personnel d'entretien sans choisir un public
--    ou tout ouvrir au plus large. Chaque note porte désormais sa propre audience.
-- 2) Surtout, cela SUPPRIME une duplication. `visit_zones` / `visit_markers` recopiaient les
--    colonnes d'audience du complément depuis la migration 240, et cette copie devait être
--    tenue à jour à la main dans six écritures (`routes/visit/{zones,markers,sync}.js`).
--    Un oubli y rendait publique sur la Visite une note réservée — c'est arrivé, corrigé dans
--    la migration 262. Comme `visit_zones.id = zones.id` (la synchronisation écrit le même
--    identifiant), une table clé sur `(location_kind, location_id)` sert la carte ET la
--    visite avec les mêmes lignes : plus de copie, donc plus de copie à oublier.
--
-- AUDIENCE D'UNE NOTE
-- Vide = « encadrement » (`LOCATION_NOTE_DEFAULT_ROLE_SLUGS` : prof de classe, n3boss,
-- administrateur), c'est-à-dire la sémantique historique du complément réservé : un
-- complément est confidentiel par nature, il ne s'ouvre pas tout seul. C'est la différence
-- assumée avec `location_links`, où une audience vide veut dire « suit le lieu ».
--
-- Pas de clé étrangère : la cible est polymorphe, comme `location_links` et
-- `map_route_steps`. Le nettoyage à la suppression d'un lieu est fait par les routeurs.
--
-- RETRAIT DES ANCIENNES COLONNES
-- Il n'a PAS lieu ici. `sql/schema_foretmap.sql` doit continuer de les déclarer pour que les
-- migrations 236, 240 et 262 rejouent sur une base neuve ; une colonne supprimée ici serait
-- recréée au démarrage suivant par le fichier de schéma. Elles sont donc inscrites dans
-- `LEGACY_SCAFFOLDING_COLUMNS` (`lib/legacySchemaCleanup.js`), qui les retire APRÈS les
-- migrations, à chaque démarrage, de façon idempotente et immunisée contre la résurrection.
--
-- Idempotent : CREATE TABLE IF NOT EXISTS + INSERT gardé par NOT EXISTS.

CREATE TABLE IF NOT EXISTS location_notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_kind ENUM('zone','marker') NOT NULL
    COMMENT 'Type de lieu porteur (polymorphe, comme location_links)',
  location_id VARCHAR(64) NOT NULL
    COMMENT 'zones.id ou map_markers.id — partagé avec visit_zones / visit_markers',
  title VARCHAR(160) NOT NULL DEFAULT ''
    COMMENT 'Intitulé optionnel (« Consigne 2nde B », « Entretien »)',
  body TEXT NOT NULL COMMENT 'Texte Markdown de la note',
  audience_role_slugs TEXT DEFAULT NULL
    COMMENT 'JSON de slugs ; vide = encadrement (prof_classe, prof, admin)',
  audience_group_ids TEXT DEFAULT NULL
    COMMENT 'JSON d''ids de groupes ; en union avec audience_role_slugs',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_location_notes_target (location_kind, location_id, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reprise des compléments existants, sans perte. La garde `NOT EXISTS` rend le rejeu sûr.
-- `title` reste vide : les compléments d'origine n'en avaient pas.
INSERT INTO location_notes
  (location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order)
SELECT 'zone', z.id, '', z.restricted_note, z.restricted_note_role_slugs,
       z.restricted_note_group_ids, 0
  FROM zones z
 WHERE z.restricted_note IS NOT NULL
   AND TRIM(z.restricted_note) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM location_notes n
      WHERE n.location_kind = 'zone' AND n.location_id = z.id
   );

INSERT INTO location_notes
  (location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order)
SELECT 'marker', m.id, '', m.restricted_note, m.restricted_note_role_slugs,
       m.restricted_note_group_ids, 0
  FROM map_markers m
 WHERE m.restricted_note IS NOT NULL
   AND TRIM(m.restricted_note) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM location_notes n
      WHERE n.location_kind = 'marker' AND n.location_id = m.id
   );

-- Compléments posés directement sur la couche visite (jamais synchronisés vers la carte) :
-- ils partagent l'identifiant du lieu, donc la même table les accueille.
INSERT INTO location_notes
  (location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order)
SELECT 'zone', vz.id, '', vz.restricted_note, vz.restricted_note_role_slugs,
       vz.restricted_note_group_ids, 0
  FROM visit_zones vz
 WHERE vz.restricted_note IS NOT NULL
   AND TRIM(vz.restricted_note) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM location_notes n
      WHERE n.location_kind = 'zone' AND n.location_id = vz.id
   );

INSERT INTO location_notes
  (location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order)
SELECT 'marker', vm.id, '', vm.restricted_note, vm.restricted_note_role_slugs,
       vm.restricted_note_group_ids, 0
  FROM visit_markers vm
 WHERE vm.restricted_note IS NOT NULL
   AND TRIM(vm.restricted_note) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM location_notes n
      WHERE n.location_kind = 'marker' AND n.location_id = vm.id
   );
