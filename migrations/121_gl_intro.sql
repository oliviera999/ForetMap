-- Intro cinématique GL (écran de lancement avant connexion)
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('modules.intro_enabled', 'true', 'seed', NOW())
ON DUPLICATE KEY UPDATE
  value_json = VALUES(value_json),
  updated_by = VALUES(updated_by),
  updated_at = NOW();
