-- Réglage plateforme : champs révélés en aperçu d'un feuillet NON découvert.
-- Par défaut, un feuillet n'est pas lisible tant qu'il n'a pas été trouvé sur la
-- carte (traversée d'une zone…). Le joueur n'en voit que le titre + les champs
-- listés ici. Défaut : incipit seul. Idempotent (ne réécrase pas une valeur admin).
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('gameplay.lore_feuillet_preview_fields', '["incipit"]', NULL, NOW())
ON DUPLICATE KEY UPDATE
  updated_at = updated_at;
