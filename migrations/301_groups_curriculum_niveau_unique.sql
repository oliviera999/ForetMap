-- Niveaux de l'apprenant : une seule échelle, et `groups.curriculum_niveau` comme colonne de
-- niveau des groupes (décisions du mainteneur du 25/09/2026, questions 4 et 5 ; audit
-- docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md, § 1.3.1, § 3.2.1 et § 3.5).
--
-- ---------------------------------------------------------------------------------------
-- PLAN DE CONCEPTION
-- ---------------------------------------------------------------------------------------
--
-- 1. Une seule échelle côté apprenant : les niveaux du programme (`cycle3`, `cycle4`,
--    `seconde`, `premiere_spe`, `es_premiere`, `terminale_spe`, `es_terminale`) plus
--    `universite`. Collège, lycée et université ne sont plus que des regroupements
--    d'affichage, déduits du niveau (lib/pedagoScales.js, `etapeForLearnerNiveau`).
--
-- 2. Source de vérité, par porteur :
--    - élève : aucune colonne propre. Son niveau se calcule (lib/pedago/learnerLevel.js,
--      `resolveLearnerLevel`, miroir src/utils/learnerLevel.js) ; le plus spécifique
--      l'emporte : aperçu du professeur > séance en cours > classe > anciens réglages ;
--    - groupe : `groups.curriculum_niveau` (cette migration l'étend à `universite`), hérité
--      par les sous-groupes ; plusieurs classes : le plus haut niveau l'emporte ;
--    - séance : `pedago_sessions.level` (public visé) précisé par `config_json.notionNiveau`
--      quand celui-ci reste dans la même étape (« cycle 4 » pour une séance collège). La
--      séance en cours **impose** son niveau, verrouillage compris ; le serveur le sait par
--      le paramètre `pedagoSession`, qu'il ne croit que si l'élève a une exécution de cette
--      séance démarrée et non terminée (`pedago_session_runs`) ;
--    - carte et établissement : `maps.pedago_level` et le réglage
--      `ui.biodiv.pedago_level_default` ne sont plus que des **replis**, lus quand ni séance
--      ni classe ne donnent de niveau.
--
-- 3. Étape d'affichage : celle du niveau (cycles 3 et 4 → Collège, seconde → terminale →
--    Lycée, université → Université) ; à défaut de niveau, l'ancienne règle (le plus simple
--    des `pedago_level` de groupe et de carte, sinon le défaut de l'établissement).
--
-- 4. Préférence de l'élève (`users.biodiv_pedago_level`) : elle ne règle que l'**affichage**
--    et ne peut que le simplifier, sauf réglage `ui.biodiv.pedago_pref_can_raise`. Elle ne
--    change jamais les questions posées pour valider une fiche : le verrouillage suit le
--    niveau (classe ou séance), pas un confort d'affichage.
--
-- 5. Encore lus en repli : `groups.pedago_level`, `maps.pedago_level`, le défaut de
--    l'établissement. Rien n'est supprimé ici.
--
-- 6. Retrait en trois temps, plus tard (§ 3.5 de l'audit) :
--    - `groups.pedago_level` — T1 : le résolveur cesse de le lire quand
--      `SELECT COUNT(*) FROM groups WHERE pedago_level IS NOT NULL AND curriculum_niveau IS NULL`
--      vaut 0 ; T2 : retrait du champ dans le formulaire et `PATCH /api/groups/:id` ;
--      T3 : `DROP COLUMN` après sauvegarde vérifiée ;
--    - `maps.pedago_level` — T1 : décider s'il reste un repli (visite d'une carte sans
--      classe) ; T2 : retrait de l'écran des cartes ; T3 : `DROP COLUMN` si
--      `SELECT COUNT(*) FROM maps WHERE pedago_level IS NOT NULL` = 0 ;
--    - `pedago_sessions.level` — garde son rôle de public visé tant que les badges le lisent ;
--      à terme, un niveau de séance sur l'échelle unique remplacerait le couple
--      (`level`, `notionNiveau`).
--
-- ---------------------------------------------------------------------------------------
-- CE QUE FAIT CETTE MIGRATION
-- ---------------------------------------------------------------------------------------
--
-- a) `groups.curriculum_niveau` accepte `universite` (un club ou un groupe de formation
--    au-delà du lycée), ajouté en fin d'ENUM : aucune valeur existante ne bouge.
--
-- b) Elle pose `curriculum_niveau` sur les groupes dont le **nom** ne laisse aucun doute,
--    avec la règle de lib/pedago/groupNiveauFromName.js (`autoCurriculumNiveauForGroup`),
--    motifs recopiés à l'identique. Garde-fous :
--    - seulement les classes et les unités, et seulement si le niveau est encore vide ;
--    - un seul niveau évoqué par le nom (`601-602` → cycle 3 ; `6e-5e` → rien) ;
--    - première et terminale seulement si le nom dit la voie (spécialité ou enseignement
--      scientifique) ;
--    - pas de valeur qui contredirait un ancien réglage d'affichage (`pedago_level`).
--    Le préfixe d'année des cohortes Moodle (`26#601`) est ignoré ; `26#6` (l'unité des
--    6ᵉ) vaut cycle 3.
--
-- Idempotent : l'ENUM redéclaré à l'identique ne change rien, et la pose ne touche que des
-- valeurs NULL (second passage : 0 ligne). Aucune suppression, aucune table `gl_*`.
--
-- Mesure sur la base de recette anonymisée (v297, 32 groupes, 0 niveau avant) : 27 groupes
-- reçoivent `cycle3` (26 classes `26#6xx`, `26#6xx-6xx`, `60x` et l'unité `26#6`) ; 5 restent
-- vides — `26#n3` et l'équipe `n3beurs 2025` (aucun niveau dans le nom), un groupe de test
-- automatisé et deux groupes `test`. Élèves actifs : 428 sur 463 ont désormais un niveau de
-- classe (cycle 3) ; les 35 autres gardent le repli (défaut de l'établissement, Collège).

ALTER TABLE `groups`
  MODIFY COLUMN curriculum_niveau ENUM(
    'cycle3',
    'cycle4',
    'seconde',
    'premiere_spe',
    'terminale_spe',
    'es_premiere',
    'es_terminale',
    'universite'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL
    COMMENT 'Niveau de la classe, échelle unique de l''apprenant (NULL = hériter du groupe parent)';

UPDATE `groups` g
  JOIN (
    SELECT f.id,
           CASE
             WHEN f.c3 + f.c4 + f.sec + f.prem + f.term + f.univ <> 1 THEN NULL
             WHEN f.c3 = 1 THEN 'cycle3'
             WHEN f.c4 = 1 THEN 'cycle4'
             WHEN f.sec = 1 THEN 'seconde'
             WHEN f.univ = 1 THEN 'universite'
             WHEN f.spe = f.es THEN NULL
             WHEN f.prem = 1 THEN IF(f.spe = 1, 'premiere_spe', 'es_premiere')
             ELSE IF(f.spe = 1, 'terminale_spe', 'es_terminale')
           END AS niveau
      FROM (
        SELECT n.id,
               (n.nom REGEXP '(^|[^a-z0-9])(cm[12]|6(e|eme|ieme)[a-z0-9]{0,2}|6[a-z]|6[0-9]{2}|sixiemes?)([^a-z0-9]|$)'
                 OR n.nom REGEXP '(^|[^a-z0-9])cycle[^a-z0-9]*3([^a-z0-9]|$)'
                 OR n.court = '6') AS c3,
               (n.nom REGEXP '(^|[^a-z0-9])([345](e|eme|ieme)[a-z0-9]{0,2}|[345][a-z]|[345][0-9]{2}|cinquiemes?|quatriemes?|troisiemes?)([^a-z0-9]|$)'
                 OR n.nom REGEXP '(^|[^a-z0-9])cycle[^a-z0-9]*4([^a-z0-9]|$)'
                 OR n.court IN ('3', '4', '5')) AS c4,
               (n.nom REGEXP '(^|[^a-z0-9])(2(nde|de|nd)[a-z0-9]{0,2}|2[0-9]{2}|secondes?)([^a-z0-9]|$)'
                 OR n.court = '2') AS sec,
               (n.nom REGEXP '(^|[^a-z0-9])(1(re|ere)[a-z0-9]{0,2}|1[0-9]{2}|premieres?)([^a-z0-9]|$)'
                 OR n.court = '1') AS prem,
               (n.nom REGEXP '(^|[^a-z0-9])(tle|terminales?)[a-z0-9]{0,2}([^a-z0-9]|$)') AS term,
               (n.nom REGEXP '(^|[^a-z0-9])(universites?|univ|licences?|masters?)([^a-z0-9]|$)') AS univ,
               (n.nom REGEXP '(^|[^a-z0-9])(spe|specialite|svt)([^a-z0-9]|$)') AS spe,
               (n.nom REGEXP '(^|[^a-z0-9])(scientifique|ens[^a-z0-9]*sci)([^a-z0-9]|$)') AS es
          FROM (
            SELECT m.id, m.nom, TRIM(REGEXP_REPLACE(m.nom, '^[0-9]{2,4} *# *', '')) AS court
              FROM (
                -- Même normalisation que `normalizeGroupName` : minuscules, exposants
                -- (`6ᵉ`, `1ʳᵉ`, `2ⁿᵈᵉ`) et degré (`6°1`), puis accents du français.
                SELECT id,
                       TRIM(
                         REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
                         REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
                           REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                             LOWER(name),
                             'ᵉ', 'e'), 'ʳ', 'r'), 'ᵈ', 'd'), 'ⁿ', 'n'), '°', 'e'),
                           '[àáâãäå]', 'a'), '[ç]', 'c'), '[èéêë]', 'e'), '[ìíîï]', 'i'),
                           '[ñ]', 'n'), '[òóôõö]', 'o'), '[ùúûü]', 'u'), '[ýÿ]', 'y')
                       ) AS nom
                  FROM `groups`
                 WHERE curriculum_niveau IS NULL
                   AND kind IN ('class', 'unit')
              ) m
          ) n
      ) f
  ) x ON x.id = g.id
   SET g.curriculum_niveau = x.niveau
 WHERE g.curriculum_niveau IS NULL
   AND x.niveau IS NOT NULL
   AND (
     g.pedago_level IS NULL
     OR g.pedago_level = CASE
       WHEN x.niveau IN ('cycle3', 'cycle4') THEN 'college'
       WHEN x.niveau = 'universite' THEN 'universite'
       ELSE 'lycee'
     END
   );
