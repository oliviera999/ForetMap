-- Carnet personnel GL : plus de limite explicite par défaut.
-- Le défaut applicatif devient 0 = illimité (caractères et illustrations).
-- On bascule à 0 les installations encore réglées sur l'ancien défaut seedé
-- (20000 caractères / 30 illustrations) ; toute valeur déjà personnalisée par
-- un MJ/admin est conservée telle quelle.

UPDATE gl_settings
   SET value_json = '0', updated_at = NOW()
 WHERE `key` = 'gameplay.player_journal_max_chars'
   AND CAST(value_json AS CHAR) IN ('20000', '"20000"');

UPDATE gl_settings
   SET value_json = '0', updated_at = NOW()
 WHERE `key` = 'gameplay.player_journal_max_assets'
   AND CAST(value_json AS CHAR) IN ('30', '"30"');
