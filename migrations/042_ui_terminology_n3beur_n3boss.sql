-- Terminologie interface : libellés rôles et permissions (n3beur / n3boss).
-- Idempotent côté rôles : met à jour les profils système connus.

UPDATE roles SET display_name = 'n3boss' WHERE slug = 'prof' AND is_system = 1;
UPDATE roles SET display_name = 'n3beur chevronné' WHERE slug = 'eleve_chevronne' AND is_system = 1;
UPDATE roles SET display_name = 'n3beur avancé' WHERE slug = 'eleve_avance' AND is_system = 1;
UPDATE roles SET display_name = 'n3beur novice' WHERE slug = 'eleve_novice' AND is_system = 1;

UPDATE permissions SET label = 'Accès interface n3boss', description = 'Permet d’ouvrir l’interface n3boss' WHERE `key` = 'teacher.access';
UPDATE permissions SET description = 'Créer un utilisateur unitaire (n3beur/n3boss/admin selon droits)' WHERE `key` = 'users.create';
UPDATE permissions SET description = 'Consulter les stats de tous les n3beurs' WHERE `key` = 'stats.read.all';
UPDATE permissions SET label = 'Export stats', description = 'Exporter les stats n3beurs en CSV' WHERE `key` = 'stats.export';
UPDATE permissions SET label = 'Import n3beurs', description = 'Importer des n3beurs via CSV/XLSX' WHERE `key` = 'students.import';
UPDATE permissions SET label = 'Suppression n3beur', description = 'Supprimer un compte n3beur' WHERE `key` = 'students.delete';

-- Anciennes propositions de tâches (préfixe visible dans les descriptions)
UPDATE tasks
   SET description = REPLACE(description, 'Proposition élève:', 'Proposition n3beur:')
 WHERE description LIKE '%Proposition élève:%';
