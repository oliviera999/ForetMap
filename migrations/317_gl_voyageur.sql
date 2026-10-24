-- 317 — G&L : le voyageur (niveau à deux regards + grimoire personnel).
--
-- Le niveau du voyageur est CALCULÉ à partir de l'existant (acquis, QCM réussis, feuillets,
-- articles du journal) : aucune table de points. Seule la consommation des sortilèges du
-- grimoire est stockée : une ligne par joueur et par sortilège, avec le nombre de points du
-- voyageur au moment du dernier lancer. La charge revient quand le joueur a gagné assez de
-- nouveaux points (`lib/glVoyageur.js`) — pas de minuteur.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + réglage posé sans écraser une valeur existante.

CREATE TABLE IF NOT EXISTS gl_voyageur_spell_uses (
  player_id INT UNSIGNED NOT NULL,
  spell_code VARCHAR(32) NOT NULL,
  uses_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_points INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_at DATETIME DEFAULT NULL,
  last_target VARCHAR(160) DEFAULT NULL,
  PRIMARY KEY (player_id, spell_code),
  CONSTRAINT fk_gl_voyageur_spell_uses_player FOREIGN KEY (player_id)
    REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('modules.voyageur_enabled', 'true', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
