-- =====================================================================
-- Fresques (moteur « cartes + flèches cause → effet + correction », premier jeu : La Fresque
-- du Climat – version Enfant). Voir `lib/fresqueBoards.js`, `routes/fresques.js`,
-- `docs/FRESQUE_ARCHITECTURE.md` et `docs/reference/foretmap/fresque-du-climat.md`.
--
-- 1. `fresque_boards` — un plateau par propriétaire (élève `user:<id>` ou équipe
--    `team:<groupId>`, groupe `groups.kind = 'team'`) et par jeu (`deck_id`, dossier versionné
--    de `public/fresques/`). L'état complet de l'élève (cartes, flèches, post-it, indices,
--    étape, niveau, vue) vit dans `state_json` (≤ 64 Ko, validé par le cœur partagé) ; les
--    colonnes de suivi sont dénormalisées pour la vue prof. `active_owner_key` vaut
--    `owner_key` tant que le plateau est actif et NULL une fois archivé (« Recommencer ») :
--    l'unicité (`deck_id`, `active_owner_key`) garantit UN plateau actif par propriétaire et
--    par jeu, tout en gardant les anciens consultables. `edit_revision` : verrou optimiste
--    (`lib/editRevision.js`, 409 `edit_conflict`) entre deux appareils.
-- 2. `fresque_board_events` — journal des gestes (carte posée, flèche, post-it, indice, point
--    d'étape, lot ouvert, niveau, fin), calculé côté serveur en comparant les états, avec
--    l'auteur : base du mode collectif. Pas de journal des déplacements.
--
-- Conservation : données d'élèves. Suppression en cascade avec le compte (FK) ; journal
-- purgé après 12 mois et plateaux archivés après 12 mois sans modification
-- (`scripts/purge-audit-logs.js`, catégorie « historiques » de la purge planifiée).
-- Idempotente : CREATE TABLE IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS fresque_boards (
  id CHAR(36) NOT NULL PRIMARY KEY,
  deck_id VARCHAR(64) NOT NULL COMMENT 'Dossier du jeu (public/fresques/<deck_id>/)',
  owner_type ENUM('user','team') NOT NULL,
  owner_user_id VARCHAR(64) DEFAULT NULL,
  owner_group_id VARCHAR(64) DEFAULT NULL,
  owner_key VARCHAR(80) NOT NULL COMMENT 'user:<id> ou team:<groupId>',
  active_owner_key VARCHAR(80) DEFAULT NULL COMMENT '= owner_key si actif, NULL si archivé',
  level VARCHAR(16) NOT NULL DEFAULT 'explorateur',
  step VARCHAR(16) NOT NULL DEFAULT 'decouvrir',
  lot_reached TINYINT UNSIGNED NOT NULL DEFAULT 1,
  state_json MEDIUMTEXT NOT NULL,
  cards_placed TINYINT UNSIGNED NOT NULL DEFAULT 0,
  links_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  links_found SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  hints_used SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('in_progress','completed','archived') NOT NULL DEFAULT 'in_progress',
  edit_revision INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) DEFAULT NULL,
  UNIQUE KEY uq_fresque_boards_active_owner (deck_id, active_owner_key),
  INDEX idx_fresque_boards_owner_user (owner_user_id, deck_id),
  INDEX idx_fresque_boards_owner_group (owner_group_id, deck_id),
  INDEX idx_fresque_boards_status_updated (status, updated_at),
  CONSTRAINT fk_fresque_boards_user FOREIGN KEY (owner_user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_fresque_boards_group FOREIGN KEY (owner_group_id)
    REFERENCES `groups` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fresque_board_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  board_id CHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  type VARCHAR(32) NOT NULL,
  payload_json TEXT DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_fresque_board_events_board (board_id, id),
  INDEX idx_fresque_board_events_created (created_at),
  CONSTRAINT fk_fresque_board_events_board FOREIGN KEY (board_id)
    REFERENCES fresque_boards (id) ON DELETE CASCADE,
  CONSTRAINT fk_fresque_board_events_actor FOREIGN KEY (actor_user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
