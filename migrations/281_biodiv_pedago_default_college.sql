-- Défaut établissement biodiversité = Collège ; préférence perso ne peut que simplifier.
-- Idempotent : pose les clés si absentes ; force le défaut site à college (cadrage pédagogique).

INSERT INTO app_settings (`key`, scope, value_json)
VALUES ('ui.biodiv.pedago_level_default', 'public', '"college"')
ON DUPLICATE KEY UPDATE value_json = '"college"', scope = 'public';

INSERT INTO app_settings (`key`, scope, value_json)
VALUES ('ui.biodiv.pedago_pref_can_raise', 'public', 'false')
ON DUPLICATE KEY UPDATE
  value_json = IF(value_json IS NULL OR value_json = '', 'false', value_json),
  scope = 'public';
