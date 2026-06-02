-- Marché d'échanges GL (cœurs / gemmes entre joueurs d'une même classe)

CREATE TABLE IF NOT EXISTS gl_market_trades (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  player_low_id INT UNSIGNED NOT NULL,
  player_high_id INT UNSIGNED NOT NULL,
  status ENUM('negotiating', 'completed', 'cancelled') NOT NULL DEFAULT 'negotiating',
  frozen_at DATETIME DEFAULT NULL,
  initiator_player_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  INDEX idx_gl_market_trades_class_status (class_id, status, updated_at),
  INDEX idx_gl_market_trades_pair (class_id, player_low_id, player_high_id),
  CONSTRAINT fk_gl_market_trades_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_trades_player_low FOREIGN KEY (player_low_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_trades_player_high FOREIGN KEY (player_high_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_trades_initiator FOREIGN KEY (initiator_player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_market_trade_sides (
  trade_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  offer_health INT UNSIGNED NOT NULL DEFAULT 0,
  offer_power INT UNSIGNED NOT NULL DEFAULT 0,
  accepted TINYINT(1) NOT NULL DEFAULT 0,
  accepted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (trade_id, player_id),
  CONSTRAINT fk_gl_market_trade_sides_trade FOREIGN KEY (trade_id) REFERENCES gl_market_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_trade_sides_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_market_trade_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trade_id INT UNSIGNED NOT NULL,
  author_player_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_market_trade_messages_trade (trade_id, id),
  CONSTRAINT fk_gl_market_trade_messages_trade FOREIGN KEY (trade_id) REFERENCES gl_market_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_trade_messages_author FOREIGN KEY (author_player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('modules.market_enabled', 'false', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
