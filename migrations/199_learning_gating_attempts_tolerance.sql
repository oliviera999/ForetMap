-- =====================================================================
-- Conditionnement des lectures — tolérance d'essais avant verrou (ForetMap).
--
-- Jusqu'ici, la PREMIÈRE mauvaise réponse à une question bloquante verrouillait
-- la ressource entière pour `learning.gating.retry_cooldown_days` jours (3 par
-- défaut). Un élève qui se trompe une fois sur cinq questions perdait tout, pour
-- trois jours. À l'inverse, régler le délai à 0 supprimait toute vérification :
-- il suffisait de réessayer jusqu'à tomber juste.
--
-- Ce compteur permet un entre-deux : `learning.gating.allowed_wrong_attempts`
-- essais ratés tolérés, puis verrou. Défaut 0 → comportement strictement
-- inchangé pour les installations existantes.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). Pré-requis : migration 165.
-- =====================================================================

ALTER TABLE resource_gating_cooldowns
  ADD COLUMN IF NOT EXISTS wrong_attempts INT UNSIGNED NOT NULL DEFAULT 0;

-- Miroir GL : colonne ajoutée pour garder les deux tables symétriques. Le runtime
-- GL ne s'en sert pas encore (ses réglages sont séparés, cf. lib/glSettings.js).
ALTER TABLE gl_resource_gating_cooldowns
  ADD COLUMN IF NOT EXISTS wrong_attempts INT UNSIGNED NOT NULL DEFAULT 0;
