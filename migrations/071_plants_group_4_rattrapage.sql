-- Rattrapage : colonne group_4 + backfill si la BDD était déjà en version ≥ 070
-- sans exécution de la migration 069 (ajout fichier ultérieur).
-- Idempotence : errno 1060 sur ADD COLUMN ; UPDATEs idempotents sur le contenu.
ALTER TABLE plants ADD COLUMN group_4 VARCHAR(255) DEFAULT NULL;

UPDATE plants
SET group_4 = NULLIF(TRIM(group_3), '')
WHERE group_1 LIKE '%Végétal%'
  AND group_3 IS NOT NULL
  AND TRIM(group_3) <> '';

UPDATE plants
SET group_4 = CASE
  WHEN LOWER(TRIM(SUBSTRING_INDEX(TRIM(scientific_name), ' ', 1))) IN ('×', 'x')
    THEN NULLIF(
      TRIM(SUBSTRING_INDEX(TRIM(SUBSTRING(TRIM(scientific_name), LOCATE(' ', TRIM(scientific_name)) + 1)), ' ', 1)),
      ''
    )
  ELSE NULLIF(TRIM(SUBSTRING_INDEX(TRIM(scientific_name), ' ', 1)), '')
END
WHERE group_1 LIKE '%Animal%'
  AND scientific_name IS NOT NULL
  AND TRIM(scientific_name) <> '';
