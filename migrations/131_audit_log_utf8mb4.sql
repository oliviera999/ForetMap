-- Dette technique : audit_log en utf8mb4 (accents / emojis)
ALTER TABLE audit_log CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
