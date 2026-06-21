-- Dette technique : AUTO_INCREMENT aligné sur MAX(id)+1
SET @roles_ai := (SELECT COALESCE(MAX(id), 0) + 1 FROM roles);
SET @sql_roles := CONCAT('ALTER TABLE roles AUTO_INCREMENT = ', @roles_ai);
PREPARE stmt_roles FROM @sql_roles;
EXECUTE stmt_roles;
DEALLOCATE PREPARE stmt_roles;

SET @tutorials_ai := (SELECT COALESCE(MAX(id), 0) + 1 FROM tutorials);
SET @sql_tutorials := CONCAT('ALTER TABLE tutorials AUTO_INCREMENT = ', @tutorials_ai);
PREPARE stmt_tutorials FROM @sql_tutorials;
EXECUTE stmt_tutorials;
DEALLOCATE PREPARE stmt_tutorials;
