-- Suivi du lancer de dés par équipe et par tour (mode classique).

ALTER TABLE `gl_teams`
  ADD COLUMN `last_dice_round_number` int unsigned NOT NULL DEFAULT 0
    COMMENT 'Dernier tour où l''équipe a lancé les dés (0 = jamais)'
    AFTER `last_move_round_number`;
