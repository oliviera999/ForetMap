-- Épinglage des entrées du carnet personnel du joueur (articles ET imports).
-- Une entrée épinglée (`pinned = 1`) est mise en avant dans l'affichage du carnet.
-- Colonnes ajoutées de façon idempotente (motif `ADD COLUMN IF NOT EXISTS`, cf. 157),
-- avec un index secondaire `(player_id, pinned)` pour filtrer les épinglées d'un joueur.
--
-- NB numérotation : le runner de migrations suit la version par NUMÉRO
-- (`schema_version.version`) ; deux fichiers de même numéro entraîneraient un saut
-- silencieux (num <= current). Les numéros 157/158/159 étant déjà pris
-- (157_gl_feuillet_attribution, 158_gl_lore_feuillet_preview_fields,
-- 159_gl_feuillet_copbio_biome_backfill), on utilise le prochain numéro libre : 160.

ALTER TABLE gl_player_journal_articles
  ADD COLUMN IF NOT EXISTS pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER body_markdown,
  ADD KEY IF NOT EXISTS idx_gl_pja_player_pinned (player_id, pinned);

ALTER TABLE gl_player_journal_imports
  ADD COLUMN IF NOT EXISTS pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER title,
  ADD KEY IF NOT EXISTS idx_gl_pji_player_pinned (player_id, pinned);
