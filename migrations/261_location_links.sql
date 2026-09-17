-- Liens documentaires d'un lieu (zone / repère), avec audience propre.
-- Voir `lib/locationLinks.js`, `lib/locationAudience.js` et
-- `docs/reference/foretmap/carte-et-zones.md`.
--
-- Pourquoi une table plutôt qu'un lien écrit dans la description : jusqu'ici la granularité de
-- confidentialité était **le bloc** — description publique d'un côté, complément réservé de
-- l'autre. Poser « ce lien-ci pour les profs, celui-là pour tout le monde » obligeait à couper
-- le texte en deux. Chaque lien porte donc ici sa propre audience, lue par le serveur avant
-- l'envoi : un lien hors audience ne quitte jamais la base (la liste est filtrée par
-- `projectLocationAudienceForViewer`, comme `restricted_note`).
--
-- `audience_role_slugs` vide = lien visible par tous ceux qui voient déjà le lieu.
-- L'URL est validée à l'écriture (`normalizeLocationLinkUrl`) : même politique que le rendu
-- Markdown (`src/shared/platform/markdown.js`) — externe `http(s)`, page de l'application
-- (`/tutoriels/3`), ou contact (`mailto:` / `tel:`).
--
-- Pas de clé étrangère : la cible est polymorphe (`zones` ou `map_markers`), comme
-- `map_route_steps`. Le nettoyage à la suppression d'un lieu est fait par les routeurs
-- (`routes/zones.js`, `routes/map.js`) — cf. `deleteLocationLinks`.
--
-- Idempotent : `CREATE TABLE IF NOT EXISTS`.

CREATE TABLE IF NOT EXISTS location_links (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_kind ENUM('zone','marker') NOT NULL
    COMMENT 'Type de lieu porteur (polymorphe, comme map_route_steps.target_type)',
  location_id VARCHAR(64) NOT NULL COMMENT 'zones.id ou map_markers.id',
  label VARCHAR(160) NOT NULL COMMENT 'Texte affiché sur le bouton',
  url VARCHAR(2048) NOT NULL COMMENT 'Cible validée : http(s), chemin /interne, mailto:, tel:',
  audience_role_slugs TEXT DEFAULT NULL
    COMMENT 'JSON de slugs de rôles ; vide/NULL = visible par tous ceux qui voient le lieu',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_location_links_target (location_kind, location_id, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
