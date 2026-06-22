-- Réseau trophique : exposer le rôle trophique des espèces dans la vue de
-- lecture, pour permettre le regroupement par niveau (producteur →
-- consommateur → décomposeur) côté frontend. Idempotente (recrée la vue).

DROP VIEW IF EXISTS v_food_web;
CREATE SQL SECURITY INVOKER VIEW v_food_web AS
  SELECT si.id, si.interaction_type,
         pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji,
         pf.trophic_role AS from_role,
         pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji,
         pt.trophic_role AS to_role,
         si.description
    FROM species_interactions si
    JOIN plants pf ON pf.id = si.from_plant_id
    LEFT JOIN plants pt ON pt.id = si.to_plant_id;
