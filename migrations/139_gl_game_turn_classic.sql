-- Système de tour « mode classique » : remplace la rotation séquentielle (une seule équipe
-- active) par des tours globaux. Le MJ lance un tour ; toutes les équipes jouent et peuvent
-- avancer leur mascotte une fois par tour. Sortilèges en auto ou soumis à l'approbation du MJ.

-- 1) Suivi du tour courant sur la partie.
ALTER TABLE `gl_games`
  ADD COLUMN `current_round_number` int unsigned NOT NULL DEFAULT 0
    COMMENT 'Numéro du tour courant (0 = aucun tour lancé)'
    AFTER `current_team_id`,
  ADD COLUMN `current_round_started_at` datetime DEFAULT NULL
    COMMENT 'Horodatage de lancement du tour courant'
    AFTER `current_round_number`;

-- 2) Consommation du déplacement de mascotte par tour, côté équipe.
ALTER TABLE `gl_teams`
  ADD COLUMN `last_move_round_number` int unsigned NOT NULL DEFAULT 0
    COMMENT 'Dernier tour où l''équipe a déplacé sa mascotte (0 = jamais)';

-- 3) Historique des tours (audit / timeline / replay).
CREATE TABLE IF NOT EXISTS `gl_game_rounds` (
  `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `game_id` int unsigned NOT NULL,
  `round_number` int unsigned NOT NULL,
  `started_by` varchar(64) DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  UNIQUE KEY `uq_gl_game_rounds_game_round` (`game_id`, `round_number`),
  INDEX `idx_gl_game_rounds_game` (`game_id`),
  CONSTRAINT `fk_gl_game_rounds_game` FOREIGN KEY (`game_id`) REFERENCES `gl_games`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Type de sortilège : pilote l'approbation MJ et le périmètre solo/collectif.
ALTER TABLE `gl_spells`
  ADD COLUMN `approval_mode` enum('auto','mj_required') NOT NULL DEFAULT 'auto'
    COMMENT 'auto = lancement immédiat ; mj_required = validation MJ avant débit'
    AFTER `statut`,
  ADD COLUMN `cast_scope` enum('solo','collective','any') NOT NULL DEFAULT 'any'
    COMMENT 'solo = un seul contributeur ; collective = ≥2 contributeurs ; any = libre'
    AFTER `approval_mode`;

-- 5) Brouillons de sortilèges : support de l'état « en attente de validation MJ ».
--    status stocke désormais aussi 'pending_approval' et 'rejected' (colonne VARCHAR, pas d'enum à étendre).
ALTER TABLE `gl_spell_cast_drafts`
  ADD COLUMN `approval_required` tinyint(1) NOT NULL DEFAULT 0
    COMMENT '1 = soumis à validation MJ avant débit'
    AFTER `status`,
  ADD COLUMN `submitted_at` datetime DEFAULT NULL
    COMMENT 'Horodatage de soumission pour validation MJ'
    AFTER `cast_at`,
  ADD COLUMN `decided_by_actor_type` varchar(16) DEFAULT NULL
    AFTER `submitted_at`,
  ADD COLUMN `decided_by_actor_id` varchar(64) DEFAULT NULL
    AFTER `decided_by_actor_type`,
  ADD COLUMN `decided_at` datetime DEFAULT NULL
    AFTER `decided_by_actor_id`;

-- 6) Réglages par défaut (idempotents) : acteur du déplacement et mode d'approbation des sorts.
INSERT IGNORE INTO `gl_settings` (`key`, `value_json`, `updated_at`) VALUES
  ('gameplay.mascot_move_actor', '"mj"', NOW()),
  ('gameplay.spell_cast_approval_mode', '"per_spell"', NOW());

-- 7) Permission « déplacer sa mascotte » accordée au profil joueur (idempotent).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_key`, `requires_elevation`)
SELECT r.id, 'gl.mascot.position', 0 FROM `roles` r WHERE r.slug = 'gl_player';
