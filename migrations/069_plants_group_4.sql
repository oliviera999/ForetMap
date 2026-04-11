-- Biodiversité : groupe 4 (famille FR pour végétaux = copie de group_3 ; genre pour animaux depuis le nom scientifique).
-- Idempotence gérée côté runner de migrations (errno 1060).
ALTER TABLE plants ADD COLUMN group_4 VARCHAR(255) DEFAULT NULL;

-- Végétaux : dans le catalogue actuel, group_3 porte déjà la famille en français (ex. Solanacées).
UPDATE plants
SET group_4 = NULLIF(TRIM(group_3), '')
WHERE group_1 LIKE '%Végétal%'
  AND group_3 IS NOT NULL
  AND TRIM(group_3) <> '';

-- Animaux : premier épithète du binôme (genre), en sautant un éventuel préfixe hybride × / x seul.
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
