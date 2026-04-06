-- Tutoriels de visite : clé composite (map_id, tutorial_id) pour une sélection par plan.

ALTER TABLE visit_tutorials ADD COLUMN map_id VARCHAR(32) NOT NULL DEFAULT 'foret';

ALTER TABLE visit_tutorials DROP PRIMARY KEY;

ALTER TABLE visit_tutorials ADD PRIMARY KEY (map_id, tutorial_id);

ALTER TABLE visit_tutorials ADD CONSTRAINT fk_visit_tutorials_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT;
