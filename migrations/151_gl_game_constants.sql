-- =====================================================================
-- ForetMap / GL — Constantes de game design + traçabilité vers questions lore
-- Régularisation de deux tables créées manuellement en production, hors
-- pipeline de migrations. On les recrée ici à l'identique pour garantir la
-- reproductibilité (base neuve = prod) et la traçabilité du game design.
--
--   gl_game_constants      : 14 constantes de game design GL (plateau, cases,
--                            soins, gemmes...), source documentaire de référence.
--   gl_game_constant_refs  : 13 liens souples constante -> question lore (QCM),
--                            traçabilité des constantes utilisées dans les énoncés.
--
-- IMPORTANT : source DOCUMENTAIRE uniquement, NON câblée au runtime (aucune
-- lecture par une route/API, aucun comportement métier modifié). Régularisation
-- pour la cohérence des environnements.
-- Pas de FK sur question_code : refs souples tolérant l'évolution rapide du
-- contenu QCM (même approche que migration 144). Pas d'ALTER de collation sur
-- l'existant ; collation projet utf8mb4_unicode_ci.
-- Idempotent (CREATE TABLE IF NOT EXISTS, INSERT IGNORE).
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_game_constants (
  const_key VARCHAR(48) NOT NULL,
  const_value VARCHAR(64) NOT NULL,
  unit VARCHAR(32) DEFAULT NULL,
  description VARCHAR(255) DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (const_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_constant_refs (
  const_key VARCHAR(48) NOT NULL,
  question_dataset VARCHAR(16) NOT NULL DEFAULT 'qcm_lore',
  question_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (const_key, question_dataset, question_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14 constantes de game design (descriptions sans accents, telles qu'en prod).
INSERT IGNORE INTO gl_game_constants (const_key, const_value, unit, description) VALUES
  ('categories_qcm','8','categories','Categories de questions QCM'),
  ('demi_plateaux_par_plateau','2','demi','Demi-plateaux par plateau'),
  ('gemmes_arrivee','3','gemmes','Gemmes bonus pour la 1re equipe a l Arrivee'),
  ('nb_cases_plateau','42','cases','Nombre de cases par plateau'),
  ('nb_plateaux_jouables','5','plateaux','Plateaux / chapitres jouables'),
  ('position_arrivee','42','case','Position de la case Arrivee'),
  ('position_depart','1','case','Position de la case Depart'),
  ('position_frontiere','22','case','Position de la case Frontiere'),
  ('quiz_par_demi_plateau','8','cases','Cases question par demi-plateau (une par categorie)'),
  ('soin_frontiere','1','coeurs','Coeurs soignes en franchissant la Frontiere'),
  ('souffle_par_demi_plateau','1','cases','Cases Souffle (effet negatif) par demi-plateau'),
  ('sous_biomes_par_plateau','2','sous-biomes','Sous-biomes par plateau'),
  ('trame_gnome_pv','1','coeurs','Coeurs gagnes (Gnome) sur une case Trame'),
  ('trame_licorne_gems','1','gemmes','Gemmes gagnees (Licorne) sur une case Trame');

-- 13 liens constante -> question lore (refs souples, sans FK).
INSERT IGNORE INTO gl_game_constant_refs (const_key, question_dataset, question_code) VALUES
  ('categories_qcm','qcm_lore','LQCM0116'),
  ('demi_plateaux_par_plateau','qcm_lore','LQCM0108'),
  ('gemmes_arrivee','qcm_lore','LQCM0107'),
  ('nb_cases_plateau','qcm_lore','LQCM0105'),
  ('nb_plateaux_jouables','qcm_lore','LQCM0045'),
  ('position_arrivee','qcm_lore','LQCM0107'),
  ('position_frontiere','qcm_lore','LQCM0106'),
  ('quiz_par_demi_plateau','qcm_lore','LQCM0116'),
  ('soin_frontiere','qcm_lore','LQCM0106'),
  ('souffle_par_demi_plateau','qcm_lore','LQCM0129'),
  ('sous_biomes_par_plateau','qcm_lore','LQCM0108'),
  ('trame_gnome_pv','qcm_lore','LQCM0063'),
  ('trame_licorne_gems','qcm_lore','LQCM0064');
