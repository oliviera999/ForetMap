-- Élargit le motif de politique n3 : toute cohorte dont l'`idnumber` contient « n3 »,
-- sans exiger le préfixe d'année (`26#…`). Ne touche que le motif historique livré par défaut.

UPDATE app_settings
   SET value_json = REPLACE(
         REPLACE(value_json, '"pattern": "^{year}#n3$"', '"pattern": "n3"'),
         '"pattern":"^{year}#n3$"',
         '"pattern":"n3"'
       ),
       updated_at = NOW()
 WHERE `key` = 'integration.moodle.policies'
   AND value_json LIKE '%^{year}#n3$%';
