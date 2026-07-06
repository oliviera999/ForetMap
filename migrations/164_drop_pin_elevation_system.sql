-- Suppression du système d'élévation par PIN (mode « sudo » prof).
-- Un utilisateur connecté possède désormais directement toutes les permissions de son rôle :
-- la dimension d'élévation disparaît (plus de PIN, plus de session « élevée »).
--
-- Idempotence : le runner (database.js) est version-tracké (table schema_version) — cette
-- migration ne s'applique qu'une fois, après 025/034/139 qui créent puis alimentent la colonne
-- requires_elevation. Un éventuel rejeu est toléré (errno 1091 « colonne absente » ignoré).
DROP TABLE IF EXISTS role_pin_secrets;
DROP TABLE IF EXISTS elevation_audit;
ALTER TABLE role_permissions DROP COLUMN requires_elevation;
