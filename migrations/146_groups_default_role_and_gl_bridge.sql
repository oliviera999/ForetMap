-- Profil par défaut par groupe + pont GL classes ↔ groupes ForetMap

ALTER TABLE `groups`
  ADD COLUMN default_role_id INT UNSIGNED DEFAULT NULL AFTER parent_group_id,
  ADD COLUMN grants_n3beur_access TINYINT(1) NOT NULL DEFAULT 0 AFTER default_role_id,
  ADD INDEX idx_groups_default_role (default_role_id),
  ADD CONSTRAINT fk_groups_default_role FOREIGN KEY (default_role_id) REFERENCES roles(id) ON DELETE SET NULL;

ALTER TABLE gl_classes
  ADD COLUMN foretmap_group_id VARCHAR(64) DEFAULT NULL AFTER school,
  ADD INDEX idx_gl_classes_foretmap_group (foretmap_group_id),
  ADD CONSTRAINT fk_gl_classes_foretmap_group FOREIGN KEY (foretmap_group_id) REFERENCES `groups`(id) ON DELETE SET NULL;

-- Miroir : chaque classe GL existante sans groupe lié reçoit un groupe ForetMap
INSERT INTO `groups` (id, slug, name, description, kind, parent_group_id, default_role_id, grants_n3beur_access, is_active, created_by, created_at, updated_at)
SELECT
  UUID(),
  CONCAT('gl-class-', c.id),
  c.name,
  CONCAT('Groupe auto-créé depuis la classe GL #', c.id),
  'class',
  NULL,
  (SELECT id FROM roles WHERE slug = 'visiteur' LIMIT 1),
  0,
  IF(c.is_active = 1, 1, 0),
  NULL,
  NOW(),
  NOW()
FROM gl_classes c
WHERE c.foretmap_group_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `groups` g WHERE g.slug = CONCAT('gl-class-', c.id)
  );

UPDATE gl_classes c
INNER JOIN `groups` g ON g.slug = CONCAT('gl-class-', c.id)
SET c.foretmap_group_id = g.id
WHERE c.foretmap_group_id IS NULL;
