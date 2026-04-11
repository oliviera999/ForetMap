-- Découvertes d’espèces attestées (engagement utilisateur connecté, catalogue plants)
CREATE TABLE IF NOT EXISTS user_plant_discoveries (
  user_id VARCHAR(64) NOT NULL,
  plant_id INT UNSIGNED NOT NULL,
  acknowledged_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, plant_id),
  INDEX idx_user_plant_discoveries_plant (plant_id),
  CONSTRAINT fk_user_plant_discoveries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_plant_discoveries_plant FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
