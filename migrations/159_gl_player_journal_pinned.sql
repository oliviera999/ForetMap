-- Épinglage des entrées du carnet personnel du joueur (articles ET imports).
-- Une entrée épinglée (`pinned = 1`) est mise en avant dans l'affichage du carnet.
-- Colonnes ajoutées de façon idempotente (motif `ADD COLUMN IF NOT EXISTS`, cf. 157),
-- avec un index secondaire `(player_id, pinned)` pour filtrer les épinglées d'un joueur.
--
-- NB numérotation : le suffixe demandé était « 157_gl_player_journal_pinned » mais le
-- numéro 157 (et 158) sont déjà pris (157_gl_feuillet_attribution, 158_gl_lore_feuillet_preview_fields).
-- Le runner de migrations suit la version par NUMÉRO (`schema_version.version`) : un second
-- fichier « 157_* » serait ignoré (num <= current). On utilise donc le prochain numéro libre : 159.

ALTER TABLE gl_player_journal_articles
  ADD COLUMN IF NOT EXISTS pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER body_markdown,
  ADD KEY IF NOT EXISTS idx_gl_pja_player_pinned (player_id, pinned);

ALTER TABLE gl_player_journal_imports
  ADD COLUMN IF NOT EXISTS pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER title,
  ADD KEY IF NOT EXISTS idx_gl_pji_player_pinned (player_id, pinned);
