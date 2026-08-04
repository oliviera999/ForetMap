-- Surcouche éditable de la documentation de référence fonctionnelle GL
-- (`docs/reference/gl/*.md`), consultable et modifiable depuis Contenus → Doc de référence.
--
-- Le fichier Markdown versionné dans Git reste la base : une ligne n'existe ici que si le
-- document a été modifié depuis l'application. « Réinitialiser » supprime la ligne et rend
-- la main au fichier. Aucun seed : une table vide = tous les documents servis depuis Git.

CREATE TABLE IF NOT EXISTS gl_reference_docs (
  slug VARCHAR(80) NOT NULL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  body_markdown LONGTEXT NOT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
