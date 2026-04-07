-- Tutoriels de visite : clé composite (map_id, tutorial_id) pour une sélection par plan.
-- InnoDB refuse DROP PRIMARY KEY tant que fk_visit_tutorials_tutorial indexe tutorial_id via le PK :
-- on retire d'abord les FK, puis on recrée la PK et les contraintes.

ALTER TABLE visit_tutorials ADD COLUMN map_id VARCHAR(32) NOT NULL DEFAULT 'foret';

ALTER TABLE visit_tutorials DROP FOREIGN KEY fk_visit_tutorials_tutorial;

ALTER TABLE visit_tutorials DROP FOREIGN KEY fk_visit_tutorials_map;

ALTER TABLE visit_tutorials DROP PRIMARY KEY;

ALTER TABLE visit_tutorials ADD PRIMARY KEY (map_id, tutorial_id);

ALTER TABLE visit_tutorials ADD CONSTRAINT fk_visit_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE;

ALTER TABLE visit_tutorials ADD CONSTRAINT fk_visit_tutorials_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT;
