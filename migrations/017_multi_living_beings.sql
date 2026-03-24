-- Association de plusieurs êtres vivants à une zone ou un repère
ALTER TABLE zones ADD COLUMN living_beings TEXT DEFAULT NULL;
ALTER TABLE map_markers ADD COLUMN living_beings TEXT DEFAULT NULL;

UPDATE zones
SET living_beings = JSON_ARRAY(current_plant)
WHERE (living_beings IS NULL OR living_beings = '')
  AND current_plant IS NOT NULL
  AND TRIM(current_plant) <> '';

UPDATE map_markers
SET living_beings = JSON_ARRAY(plant_name)
WHERE (living_beings IS NULL OR living_beings = '')
  AND plant_name IS NOT NULL
  AND TRIM(plant_name) <> '';

UPDATE schema_version SET version = 17;
