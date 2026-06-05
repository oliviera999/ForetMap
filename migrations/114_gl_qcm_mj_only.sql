-- Option : seul le MJ (staff) peut présenter et valider les QCM en partie (pas les joueurs)

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.qcm_mj_only', 'false', NULL, NOW())
ON DUPLICATE KEY UPDATE
  updated_at = updated_at;
