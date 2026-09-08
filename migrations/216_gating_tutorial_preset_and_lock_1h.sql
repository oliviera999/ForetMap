-- =====================================================================
-- Conditionnement par QCM — deux décisions livrées en base.
--
-- 1. VERROU À 1 H. Le défaut du code passe de 6 h à 1 h
--    (`DEFAULT_RETRY_COOLDOWN_HOURS`, lib/shared/cooldownDurationCore.js). Mais
--    `getSettingValue` ne matérialise pas les défauts : une installation qui porte déjà
--    une valeur enregistrée — dont les 72 h que la migration 213 a mécaniquement
--    converties depuis l'ancien réglage « 3 jours » — aurait gardé l'ancien délai sans
--    que rien ne le signale. Les deux clés de site sont donc alignées ici.
--
-- 2. TUTORIELS PLUS EXIGEANTS. Jusqu'ici, AUCUN préréglage par type n'était livré :
--    tutoriels, fiches espèces et termes de glossaire suivaient tous le site, soit une
--    seule bonne réponse et un seul essai. Un tutoriel se lit pourtant en plusieurs
--    minutes et porte plus de matière qu'un terme de glossaire. Ce préréglage
--    (`resource_ref = '*'`, la ligne que lit `loadTypePolicy`) lui demande deux bonnes
--    réponses, avec de quoi rester jouable :
--      - `mode = 'threshold'`, `required_correct = 2` : deux réussites au lieu d'une.
--        Borné et dégressif — `requiredCorrectCount` ramène le seuil au nombre de
--        questions réellement rattachées, donc un tutoriel qui n'en porte qu'une en
--        pose une, sans impasse ;
--      - `cooldown_scope = 'question'` : l'erreur ne ferme que la question ratée, l'élève
--        poursuit sur les autres. Sans ce contrepoids, exiger deux réponses ET verrouiller
--        toute la fiche à la première erreur rendrait le tutoriel injouable.
--    La TOLÉRANCE reste héritée (NULL), donc zéro erreur comme partout. Elle avait d'abord
--    été fixée à 1 ici, ce qui produisait l'inverse du but recherché : un tutoriel ne
--    portant qu'UNE question bloquante (le seuil se ramenant alors à 1) aurait offert deux
--    essais là où une fiche espèce n'en offre qu'un — plus permissif, pas plus exigeant.
--    Le reste (délai, sévérité, questions par session) reste à NULL = hérité du site :
--    changer le site continue de se propager aux tutoriels.
--
-- Ce préréglage ne conditionne RIEN à lui seul : l'interrupteur `learning.gating.enabled`
-- reste éteint par défaut, et il faut des questions approuvées ET cochées « bloquantes ».
--
-- Idempotent. Le préréglage est semé par INSERT IGNORE — un professeur qui l'aura
-- ajusté ensuite ne le verra jamais réécrit. Pré-requis : 203 et 213 (colonnes).
-- =====================================================================

-- 1. Délai du verrou : 1 h côté site, pour les deux produits.
INSERT INTO app_settings (`key`, scope, value_json)
VALUES ('learning.gating.retry_cooldown_hours', 'teacher', '1')
ON DUPLICATE KEY UPDATE value_json = '1', updated_at = NOW();

INSERT INTO gl_settings (`key`, value_json)
VALUES ('gating.retry_cooldown_hours', '1')
ON DUPLICATE KEY UPDATE value_json = '1', updated_at = NOW();

-- 2. Préréglage du type « tutorial » (ForetMap). `enabled = 1` reproduit ce qu'écrit
--    l'écran « Préréglages par type » : la cascade ne lit pas `enabled` sur une ligne de
--    type (seule la ligne d'une fiche peut dispenser), mais la valeur reste cohérente
--    avec ce qu'un enregistrement depuis l'interface produirait.
INSERT IGNORE INTO resource_gating_policy
  (resource_type, resource_ref, mode, required_correct, enabled,
   allowed_wrong_attempts, max_questions_per_session, retry_cooldown_hours,
   cooldown_scope, lock_mode, granularity)
VALUES
  ('tutorial', '*', 'threshold', 2, 1,
   NULL, NULL, NULL,
   'question', NULL, NULL);
