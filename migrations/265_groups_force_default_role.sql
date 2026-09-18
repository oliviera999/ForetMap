-- Profil de groupe imposé : le profil par défaut d'un groupe n'était qu'un **plancher**.
-- La montée automatique par tâches validées (`syncStudentPrimaryRoleFromProgress`) et les
-- gardes anti-rétrogradation de `lib/groupRole.js` (`progression_preserved`,
-- `eleve_preserved_over_visitor`) reprenaient toujours la main : impossible de tenir une
-- classe sur un profil choisi (une classe de passage maintenue en « Visiteur », une classe
-- entière ouverte d'emblée en « n3beur avancé »).
--
-- `force_default_role = 1` rend le profil par défaut du groupe **autoritaire** : il s'applique
-- même en baisse, et la progression automatique n'y touche plus. Les profils hors échelle
-- n3beur (n3boss, admin, prof de classe, profil sur mesure) restent protégés — le drapeau
-- n'est pas un moyen de rétrograder un encadrant membre du groupe.
--
-- Sans effet tant que le groupe n'a pas de `default_role_id` : forcer « la règle automatique »
-- n'aurait pas de sens (l'API refuse la combinaison, cf. `routes/groups.js`).
--
-- Idempotent : errno 1060 (ER_DUP_FIELDNAME) est ignoré par le lanceur de migrations.
ALTER TABLE `groups`
  ADD COLUMN force_default_role TINYINT(1) NOT NULL DEFAULT 0 AFTER grants_n3beur_access;
