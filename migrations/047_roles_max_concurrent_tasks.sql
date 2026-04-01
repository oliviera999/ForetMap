-- Plafond d'inscriptions simultanées (tâches non validées) par profil RBAC.
-- NULL = hériter du réglage global tasks.student_max_active_assignments ; 0 = pas de limite pour ce profil.
ALTER TABLE roles
  ADD COLUMN max_concurrent_tasks INT UNSIGNED NULL DEFAULT NULL;
