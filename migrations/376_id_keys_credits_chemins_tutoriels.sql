SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Clés de détermination : crédit des images de propositions, chemins multiples voulus,
-- lien clé ↔ tutoriel (chantier des contenus du 20/11/2026).
--
-- 1. `id_key_leads.image_credit` / `image_licence` : auteur et licence de l'image d'une
--    proposition, affichés sous l'image. NULL = non renseigné (l'écran de gestion le signale).
--
-- 2. `id_keys.allows_multiple_paths` : à 1, l'auteur a voulu qu'une même espèce soit
--    atteinte par plusieurs feuilles (clé de traces : empreinte, crotte, terrier mènent au
--    même animal). Le contrôle `id_key_dead_paths` ne le signale alors plus. Posé à 1 pour la
--    clé `traces-mammiferes-melah`, désignée par son slug : sans effet si elle n'existe pas.
--
-- 3. `id_key_tutorials` : tutoriels à lire avant de commencer une clé (usage de la loupe,
--    des jumelles…), dans l'ordre de `sort_order`. Aucun lien n'est posé ici.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, UPDATE gardé sur
-- l'ancienne valeur. Ni vue, ni trigger, ni donnée personnelle.
-- =====================================================================

ALTER TABLE id_key_leads
  ADD COLUMN IF NOT EXISTS image_credit VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Auteur ou source de l''image de la proposition'
    AFTER image_url,
  ADD COLUMN IF NOT EXISTS image_licence VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Licence de l''image (CC BY-SA 4.0…)'
    AFTER image_credit;

ALTER TABLE id_keys
  ADD COLUMN IF NOT EXISTS allows_multiple_paths TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = une même espèce atteinte par plusieurs feuilles est voulue (non signalée par l''audit)';

UPDATE id_keys
   SET allows_multiple_paths = 1
 WHERE slug = 'traces-mammiferes-melah'
   AND allows_multiple_paths = 0;

CREATE TABLE IF NOT EXISTS id_key_tutorials (
  key_id INT UNSIGNED NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, tutorial_id),
  KEY idx_id_key_tutorials_tutorial (tutorial_id),
  CONSTRAINT fk_id_key_tutorials_key FOREIGN KEY (key_id)
    REFERENCES id_keys (id) ON DELETE CASCADE,
  CONSTRAINT fk_id_key_tutorials_tutorial FOREIGN KEY (tutorial_id)
    REFERENCES tutorials (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tutoriels à lire avant de commencer une clé de détermination';
