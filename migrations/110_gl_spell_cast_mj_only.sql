-- Option : seul le MJ (staff) peut lancer les sortilèges (pas les joueurs)

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.spell_cast_mj_only', 'false', NULL, NOW())
ON DUPLICATE KEY UPDATE
  updated_at = updated_at;
