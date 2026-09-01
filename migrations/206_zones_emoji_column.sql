-- Audit UI 2026-09 (C4) : emoji de zone en colonne dédiée, au lieu du seul préfixe
-- fragile dans `zones.name` (détection dépendante d'une espace et de la liste configurée).
-- Le nom conserve son préfixe pour la compatibilité d'affichage ; la colonne devient la
-- source de vérité du plan, de la fiche et des filtres, alimentée à chaque écriture de
-- zone (dérivée du préfixe quand le client ne l'envoie pas). Idempotent.

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS emoji VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'Emoji d''étiquette de la zone ; NULL/'''' = replis sur le préfixe du nom';
