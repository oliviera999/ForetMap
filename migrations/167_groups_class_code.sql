-- F2-A — code de classe : un groupe peut porter un code d'inscription court que
-- l'élève saisit au moment de créer son compte pour rejoindre directement le
-- groupe (et recevoir le rôle n3beur si le groupe le confère).
ALTER TABLE `groups`
  ADD COLUMN class_code VARCHAR(16) DEFAULT NULL AFTER grants_n3beur_access,
  ADD UNIQUE KEY uq_groups_class_code (class_code);
