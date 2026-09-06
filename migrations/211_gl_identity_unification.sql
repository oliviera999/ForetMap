-- Unification des identités Gnomes & Licornes → `users` (docs/AUDIT_COMPTES_2026-09.md, direction B).
--
-- Avant : trois magasins de secrets (`users.password_hash`, `gl_players.password_hash`,
-- `gl_admins` déléguant à `users`), un hash copié à la création et jamais propagé ensuite, un
-- lien `gl_players.linked_foretmap_user_id` sans clé étrangère (liens pendants, comptes miroirs
-- orphelins). Après : `users` est la SEULE source des secrets et de l'état de compte
-- (mot de passe, e-mail, `google_sub`, `password_must_reset`, `token_epoch`) ; `gl_players`
-- ne garde que le gameplay (classe, équipe, PV/PP, pseudo de jeu) et pointe vers `users` par
-- une vraie clé étrangère.
--
-- Idempotente : chaque étape est gardée par INFORMATION_SCHEMA. Les déplacements de données
-- ne s'exécutent qu'à la PREMIÈRE application (présence de `gl_players.password_hash`).

-- ---------------------------------------------------------------------------------------
-- 1. users : colonnes d'état de compte
-- ---------------------------------------------------------------------------------------
SET @usersHasMustReset = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_must_reset'
);
SET @sql = IF(
  @usersHasMustReset = 0,
  'ALTER TABLE users ADD COLUMN password_must_reset TINYINT(1) NOT NULL DEFAULT 0 AFTER auth_provider',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @usersHasGoogleSub = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_sub'
);
SET @sql = IF(
  @usersHasGoogleSub = 0,
  'ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) DEFAULT NULL AFTER password_must_reset',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @usersHasGoogleSubIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_google_sub'
);
SET @sql = IF(
  @usersHasGoogleSubIndex = 0,
  'CREATE UNIQUE INDEX uq_users_google_sub ON users (google_sub)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- `token_epoch` : incrémenté à chaque changement de mot de passe ; un JWT dont le claim
-- `tokenEpoch` diffère est refusé à l'hydratation (révocation immédiate des sessions).
SET @usersHasTokenEpoch = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_epoch'
);
SET @sql = IF(
  @usersHasTokenEpoch = 0,
  'ALTER TABLE users ADD COLUMN token_epoch INT UNSIGNED NOT NULL DEFAULT 0 AFTER google_sub',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------
-- 2. gl_players : première application ? (la colonne `password_hash` n'existe qu'avant)
-- ---------------------------------------------------------------------------------------
SET @glFirstRun = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND COLUMN_NAME = 'password_hash'
);
SET @glHasMustReset = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND COLUMN_NAME = 'password_must_reset'
);
SET @glHasEmail = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND COLUMN_NAME = 'email'
);
SET @glHasGoogleSub = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND COLUMN_NAME = 'google_sub'
);

-- 2a. Liens pendants (compte ForetMap supprimé sans purge du joueur) → NULL, sinon la clé
--     étrangère de l'étape 3 ne peut pas être posée. Le backfill au démarrage recrée le compte.
UPDATE gl_players p
  LEFT JOIN users u ON u.id = p.linked_foretmap_user_id
   SET p.linked_foretmap_user_id = NULL
 WHERE p.linked_foretmap_user_id IS NOT NULL AND u.id IS NULL;

-- 2b. Un compte ForetMap ne peut être lié qu'à UN joueur : on garde le plus ancien.
UPDATE gl_players p
  INNER JOIN (
    SELECT linked_foretmap_user_id AS uid, MIN(id) AS keep_id
      FROM gl_players
     WHERE linked_foretmap_user_id IS NOT NULL
     GROUP BY linked_foretmap_user_id
    HAVING COUNT(*) > 1
  ) d ON d.uid = p.linked_foretmap_user_id
   SET p.linked_foretmap_user_id = NULL
 WHERE p.id <> d.keep_id;

-- 2c. Mot de passe : le compte miroir (`auth_provider = 'gl_bridge'`) n'a jamais été touché
--     depuis ForetMap, le hash GL est donc le plus récent → il devient LE mot de passe.
--     Pour un vrai compte ForetMap lié, on garde son hash ; le hash GL survit en
--     `legacy_password_hash` et sera adopté à la première connexion réussie avec lui.
SET @sql = IF(
  @glFirstRun > 0,
  'UPDATE users u INNER JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      SET u.password_hash = p.password_hash, u.updated_at = NOW()
    WHERE u.auth_provider = ''gl_bridge'' AND p.password_hash IS NOT NULL AND p.password_hash <> ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2d. Drapeau « doit changer son mot de passe » → users.
SET @sql = IF(
  @glFirstRun > 0 AND @glHasMustReset > 0,
  'UPDATE users u INNER JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      SET u.password_must_reset = p.password_must_reset
    WHERE p.password_must_reset = 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2e. E-mail GL → users.email quand le compte n'en a pas et que l'adresse est libre.
SET @sql = IF(
  @glFirstRun > 0 AND @glHasEmail > 0,
  'UPDATE users u
     INNER JOIN gl_players p ON p.linked_foretmap_user_id = u.id
     LEFT JOIN users x ON LOWER(x.email) = LOWER(p.email)
      SET u.email = LOWER(p.email), u.updated_at = NOW()
    WHERE u.email IS NULL AND p.email IS NOT NULL AND TRIM(p.email) <> '''' AND x.id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2f. google_sub GL → users.google_sub (si libre).
SET @sql = IF(
  @glFirstRun > 0 AND @glHasGoogleSub > 0,
  'UPDATE users u
     INNER JOIN gl_players p ON p.linked_foretmap_user_id = u.id
     LEFT JOIN users x ON x.google_sub = p.google_sub
      SET u.google_sub = p.google_sub, u.updated_at = NOW()
    WHERE u.google_sub IS NULL AND p.google_sub IS NOT NULL AND TRIM(p.google_sub) <> '''' AND x.id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2g. password_hash → legacy_password_hash (nullable). Les hashs déjà adoptés (2c) sont vidés.
SET @sql = IF(
  @glFirstRun > 0,
  'ALTER TABLE gl_players CHANGE COLUMN password_hash legacy_password_hash VARCHAR(255) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @glFirstRun > 0,
  'UPDATE gl_players p INNER JOIN users u ON u.id = p.linked_foretmap_user_id
      SET p.legacy_password_hash = NULL
    WHERE u.auth_provider = ''gl_bridge''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2h. email → legacy_email (index unique retiré ; vidé quand repris dans users).
SET @glHasEmailIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND INDEX_NAME = 'uq_gl_players_email'
);
SET @sql = IF(@glHasEmailIndex > 0, 'ALTER TABLE gl_players DROP INDEX uq_gl_players_email', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @glHasEmail > 0,
  'ALTER TABLE gl_players CHANGE COLUMN email legacy_email VARCHAR(255) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @glHasEmail > 0,
  'UPDATE gl_players p INNER JOIN users u ON u.id = p.linked_foretmap_user_id
      SET p.legacy_email = NULL
    WHERE p.legacy_email IS NOT NULL AND LOWER(u.email) = LOWER(p.legacy_email)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2i. Colonnes désormais portées par users.
SET @sql = IF(@glHasGoogleSub > 0, 'ALTER TABLE gl_players DROP COLUMN google_sub', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@glHasMustReset > 0, 'ALTER TABLE gl_players DROP COLUMN password_must_reset', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------
-- 3. Lien joueur → compte : unique et garanti par clé étrangère
-- ---------------------------------------------------------------------------------------
SET @glHasLinkedIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND INDEX_NAME = 'uq_gl_players_linked_user'
);
SET @sql = IF(
  @glHasLinkedIndex = 0,
  'CREATE UNIQUE INDEX uq_gl_players_linked_user ON gl_players (linked_foretmap_user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Supprimer le compte ForetMap emporte le profil de jeu (les FK RESTRICT des contributions
-- de sortilège restent prioritaires : la suppression applicative les détecte et répond 409).
SET @glHasUserFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players'
     AND CONSTRAINT_NAME = 'fk_gl_players_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @glHasUserFk = 0,
  'ALTER TABLE gl_players ADD CONSTRAINT fk_gl_players_user FOREIGN KEY (linked_foretmap_user_id) REFERENCES users(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
