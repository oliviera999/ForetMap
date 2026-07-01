-- Attribution des feuillets : qui (quel joueur) a découvert le feuillet pour l'équipe,
-- et par quel canal (source consultable). Alimente l'affichage « Découvert par … » dans
-- le carnet et le socle d'acquisition ③ (consultation gatée → feuillet d'équipe attribué).
-- `discovered_source` est volontairement en texte libre (pas d'ENUM) pour rester facile à
-- étendre sans migration à chaque nouveau canal.
ALTER TABLE gl_game_feuillet_states
  ADD COLUMN IF NOT EXISTS discovered_by_player_id VARCHAR(64) DEFAULT NULL AFTER unlocked_via,
  ADD COLUMN IF NOT EXISTS discovered_by_name VARCHAR(120) DEFAULT NULL AFTER discovered_by_player_id,
  ADD COLUMN IF NOT EXISTS discovered_source VARCHAR(48) DEFAULT NULL AFTER discovered_by_name;
