-- =====================================================================
-- ForetMap / GL — Marché : les cœurs ne sont plus échangeables par défaut
--
-- Les cœurs et les gemmes partagent aujourd'hui le même Marché. Dès lors que
-- les cœurs portent une signification de conduite (cf. refonte de l'équilibrage
-- G&L), un cœur perdu peut être racheté — ou simplement offert — par un
-- camarade, ce qui annule la portée du retrait. Une monnaie s'échange, une
-- sanction non.
--
-- Nouveau réglage global `gameplay.market_hearts_enabled` :
--   false (défaut) → seules les gemmes circulent sur le Marché ;
--   true           → comportement historique (cœurs + gemmes).
--
-- Le défaut est volontairement `false` y compris pour les bases existantes :
-- c'est le comportement sûr, et il reste réversible d'un clic dans les
-- Réglages GL. Les échanges déjà finalisés ne sont pas touchés.
-- Idempotent (INSERT ... ON DUPLICATE KEY UPDATE sans écriture de valeur).
-- =====================================================================

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.market_hearts_enabled', 'false', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
