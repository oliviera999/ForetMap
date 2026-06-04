-- Scope roster brouillon sortilège : équipe seule ou partie entière (MJ)

ALTER TABLE gl_spell_cast_drafts
  ADD COLUMN roster_scope VARCHAR(8) NOT NULL DEFAULT 'team'
    COMMENT 'team = roster une équipe ; game = toutes équipes (MJ)'
    AFTER team_id;

CREATE INDEX idx_gl_spell_cast_drafts_game_spell_collecting
  ON gl_spell_cast_drafts (game_id, spell_code, status, roster_scope);
