-- Observations espèce (plusieurs confirmations par utilisateur et par fiche plants)
-- Remplace user_plant_discoveries (une ligne max par couple user/plant).

CREATE TABLE IF NOT EXISTS user_plant_observation_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plant_id INT UNSIGNED NOT NULL,
  observed_at VARCHAR(32) NOT NULL,
  INDEX idx_upoe_user_plant (user_id, plant_id),
  INDEX idx_upoe_plant (plant_id),
  CONSTRAINT fk_upoe_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upoe_plant FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at)
SELECT user_id, plant_id, acknowledged_at FROM user_plant_discoveries;

DROP TABLE IF EXISTS user_plant_discoveries;
