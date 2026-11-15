-- =====================================================================
-- 349 — G&L « Tenir à deux » : lien de classe permanent (lot 2, étape 2.2).
--
-- Un lien par classe, valable jusqu'à sa régénération : le prof imprime une fois le QR et le
-- code de la classe ; une tablette le scanne (ou saisit le code), puis touche la mascotte de
-- son équipe pour ouvrir une session d'équipe (`gl_guest_tokens`, migration 348).
-- `token_hash` : SHA-256 du jeton porté par l'URL (`gl.html?classe=<jeton>`). `code` : huit
-- caractères sans caractères ambigus (ni 0 / O, ni 1 / I / L), à saisir à la main.
-- Aucune donnée d'élève.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_class_links (
  class_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  code CHAR(8) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (class_id),
  UNIQUE KEY uq_gl_class_links_token (token_hash),
  UNIQUE KEY uq_gl_class_links_code (code),
  CONSTRAINT fk_gl_class_links_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
