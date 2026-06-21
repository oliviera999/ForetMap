-- Mode de déplacement plateau : libre (MJ) ou chemin numéroté (dés → repère suivant).

ALTER TABLE `gl_games`
  ADD COLUMN `board_movement_mode` enum('free','numbered_path') DEFAULT NULL
    COMMENT 'NULL = déplacement libre MJ (défaut historique)'
    AFTER `lore_heart_rewards_enabled`,
  ADD COLUMN `board_path_start_index` tinyint(3) unsigned DEFAULT NULL
    COMMENT 'Repère de départ (0 ou 1) en mode numbered_path'
    AFTER `board_movement_mode`;
