-- Espèces / êtres vivants associés à une tâche (JSON tableau de noms, comme zones/repères)
ALTER TABLE tasks ADD COLUMN living_beings TEXT DEFAULT NULL;
