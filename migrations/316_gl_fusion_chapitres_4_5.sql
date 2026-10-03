-- 316 — G&L : fusion des chapitres 4 (Taïga & désert froid) et 5 (Toundra arctique).
--
-- Décision éditoriale de l'auteur : un seul chapitre 4 « Eurasie continentale », joué sur un
-- seul plateau (image `plateau-4_fond`) : taïga → limite des arbres → toundra en été polaire →
-- nuit polaire. Le désert froid (Gobi) sort du terrain joué ; l'année passe de 5 à 4 plateaux.
-- Le chapitre `toundra-arctique` est mis de côté (sans plateau), comme les chapitres de test.
-- Le Livre de Sélène garde ses 5 pays : `gl_lore_plateaux` et `lib/glBiomePays.js` sont
-- inchangés.
--
-- Plateau peint à 38 dalles (et non 42) : 4 cases de la nuit polaire du tableau éditorial ne
-- sont pas reprises (quiz conservation et vocabulaire de niveau base, « Ours polaire »,
-- « Aurores boréales » ; elles restent dans le chapitre mis de côté). Grammaire obtenue :
-- 1 départ · 14 quiz (8 catégories, 11 approfondissement / 3 base) · 22 comportements ·
-- 1 arrivée ; 22 taïga (dont la charnière 22 « transition ») | 9 été polaire | 7 nuit polaire.
--
-- Données de production seulement : tout est repéré par slug et `order_index`, jamais par id.
-- Sur une base sans ces chapitres (CI, base neuve), chaque requête est sans effet.
--
-- Rejouable : le runner exécute les requêtes une à une, sans transaction, sur une connexion
-- unique (variables de session `@fus_*` posées ici, avant tout usage). Les repères sont
-- construits « en coulisse » (order_index + 100000) puis basculés d'un seul UPDATE ; tant que
-- la bascule n'a pas eu lieu, chaque étape se rejoue sans dommage ; après elle, la garde
-- `@fus_go` coupe toute la partie repères.

-- [0] Repérage et gardes.
SET @fus_ch_e = (SELECT id FROM gl_chapters WHERE slug = 'eurasie-continentale' LIMIT 1);
SET @fus_ch_t = (SELECT id FROM gl_chapters WHERE slug = 'toundra-arctique' LIMIT 1);
SET @fus_done = (
  SELECT COUNT(*) FROM gl_chapter_markers
   WHERE chapter_id = @fus_ch_e AND order_index = 220 AND label = 'Le dernier arbre'
);
-- Sources du chapitre mis de côté (il reste intact : c'est la source stable des copies).
SET @fus_src_t = (
  SELECT COUNT(DISTINCT order_index) FROM gl_chapter_markers
   WHERE chapter_id = @fus_ch_t
     AND order_index IN (30, 110, 130, 190, 230, 250, 260, 280, 290, 300, 320, 330, 360, 380, 410, 420)
);
-- Repères de la taïga repris en place (leurs ids sont conservés).
SET @fus_kept_e = (
  SELECT COUNT(DISTINCT order_index) FROM gl_chapter_markers
   WHERE chapter_id = @fus_ch_e
     AND order_index IN (10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 150, 160, 170, 180, 200, 210)
);
-- « Refuge sami » (E190) : à sa place d'origine, ou déjà en coulisse (100130).
SET @fus_refuge = (
  SELECT COUNT(*) FROM gl_chapter_markers
   WHERE chapter_id = @fus_ch_e AND order_index IN (190, 100130)
);
-- Aucune équipe ne doit stationner sur un repère supprimé (sinon : rien n'est fait).
SET @fus_teams = (
  SELECT COUNT(*) FROM gl_teams t
    JOIN gl_chapter_markers m ON m.id = t.position_marker_id
   WHERE m.chapter_id = @fus_ch_e
     AND (m.order_index = 130 OR (m.order_index >= 220 AND m.order_index < 100000))
);
SET @fus_go = IF(
  @fus_ch_e IS NOT NULL AND @fus_ch_t IS NOT NULL AND @fus_done = 0
    AND @fus_src_t = 16 AND @fus_kept_e = 19 AND @fus_refuge >= 1 AND @fus_teams = 0,
  1, 0
);

-- [1] Coulisse : « Refuge sami » descend en case 13 (order_index 130).
UPDATE gl_chapter_markers
   SET order_index = 100130, x_pct = 26.2, y_pct = 75.7, sous_biome_slug = 'taiga'
 WHERE chapter_id = @fus_ch_e AND order_index = 190 AND @fus_go = 1
 ORDER BY id
 LIMIT 1;

-- [2] Coulisse : les 16 cases de la toundra, copiées du chapitre mis de côté.
INSERT INTO gl_chapter_markers
  (chapter_id, x_pct, y_pct, event_type, label, description, sous_biome_slug, effet_mecanique,
   qcm_categorie_slug, qcm_question_code, event_config_json, display_mode, emoji, icon_url,
   order_index, created_at)
SELECT @fus_ch_e, c.x, c.y, t.event_type, COALESCE(c.label, t.label), COALESCE(c.descr, t.description),
       c.sb, t.effet_mecanique, t.qcm_categorie_slug, t.qcm_question_code, t.event_config_json,
       t.display_mode, t.emoji, t.icon_url, 100000 + c.ord, NOW()
  FROM (
  SELECT 230 AS src, 230 AS ord, 57.1 AS x, 57.7 AS y, 'toundra_ete' AS sb, CAST(NULL AS CHAR(180)) AS label, CAST(NULL AS CHAR(255)) AS descr
  UNION ALL
  SELECT 30, 240, 58.3, 50.1, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 250, 250, 58.6, 42.8, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 260, 260, 58.9, 35.4, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 130, 270, 60.7, 28.6, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 280, 280, 64.1, 25.0, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 190, 290, 68.2, 24.6, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 300, 300, 71.9, 28.0, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 110, 310, 74.6, 33.2, 'toundra_ete', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 320, 320, 76.5, 39.5, 'toundra_hiver', CAST(NULL AS CHAR(180)), 'Le soleil se couche et ne se relève plus. Le blanc avale tout.'
  UNION ALL
  SELECT 330, 330, 78.1, 45.8, 'toundra_hiver', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 290, 340, 82.0, 47.9, 'toundra_hiver', 'La tempête blanche', 'Le blizzard efface tout à un pas. Attachez-vous, criez, avancez ensemble.'
  UNION ALL
  SELECT 380, 350, 85.9, 45.4, 'toundra_hiver', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 360, 360, 89.3, 42.1, 'toundra_hiver', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 410, 370, 91.4, 35.9, 'toundra_hiver', CAST(NULL AS CHAR(180)), CAST(NULL AS CHAR(255))
  UNION ALL
  SELECT 420, 380, 91.9, 28.8, 'toundra_hiver', 'L''étoile fixe', 'Au bout du monde, au-dessus de vous, une étoile qui ne bouge pas.'
  ) c
  JOIN gl_chapter_markers t
    ON t.chapter_id = @fus_ch_t
   AND t.order_index = c.src
   AND t.id = (
     SELECT MIN(t2.id) FROM gl_chapter_markers t2
      WHERE t2.chapter_id = @fus_ch_t AND t2.order_index = c.src
   )
 WHERE @fus_go = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers x
      WHERE x.chapter_id = @fus_ch_e AND x.order_index = 100000 + c.ord
   );

-- [3] Coulisse : les deux cases nouvelles. Sans effet mécanique (config NULL) : « L'homme
-- assis » est une épreuve de parole sans points, « Le dernier arbre » la charnière du chapitre.
INSERT INTO gl_chapter_markers
  (chapter_id, x_pct, y_pct, event_type, label, description, sous_biome_slug, event_config_json,
   display_mode, emoji, order_index, created_at)
SELECT @fus_ch_e, 42.4, 63.9, 'behavior', 'L''homme assis',
       'Dans un dernier coin vert, un homme assis t''offre le thé et te conseille de t''arrêter là. Sur les faits, il n''a pas tort. Dis pourquoi ton équipe repart.',
       'taiga', NULL, 'emoji', '🍵', 100190, NOW()
  FROM DUAL
 WHERE @fus_go = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers x WHERE x.chapter_id = @fus_ch_e AND x.order_index = 100190
   );

INSERT INTO gl_chapter_markers
  (chapter_id, x_pct, y_pct, event_type, label, description, sous_biome_slug, event_config_json,
   display_mode, emoji, order_index, created_at)
SELECT @fus_ch_e, 53.8, 62.4, 'behavior', 'Le dernier arbre',
       'Sous le dernier épicéa, un campement abandonné : un foyer froid, un carnet ouvert. Au-delà, plus un seul arbre.',
       'transition', NULL, 'emoji', '🌲', 100220, NOW()
  FROM DUAL
 WHERE @fus_go = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers x WHERE x.chapter_id = @fus_ch_e AND x.order_index = 100220
   );

-- [4] Retrait des repères non repris : « Halte sous les épicéas » (130) et l'ancien chemin du
-- désert froid (220 à 420). Les cases en coulisse (>= 100000) ne sont pas touchées.
DELETE FROM gl_chapter_markers
 WHERE chapter_id = @fus_ch_e AND @fus_go = 1
   AND (order_index = 130 OR (order_index >= 220 AND order_index < 100000));

-- [5] Taïga reprise en place : nouvelles coordonnées sur le plateau peint, sous-biome taiga.
UPDATE gl_chapter_markers m
  JOIN (
  SELECT 10 AS ord, 12.1 AS x, 21.4 AS y
  UNION ALL
  SELECT 20, 15.8, 18.4
  UNION ALL
  SELECT 30, 19.8, 17.3
  UNION ALL
  SELECT 40, 23.8, 18.6
  UNION ALL
  SELECT 50, 27.2, 22.3
  UNION ALL
  SELECT 60, 29.3, 28.5
  UNION ALL
  SELECT 70, 30.4, 35.3
  UNION ALL
  SELECT 80, 29.5, 42.3
  UNION ALL
  SELECT 90, 27.9, 48.8
  UNION ALL
  SELECT 100, 26.4, 55.3
  UNION ALL
  SELECT 110, 25.3, 61.8
  UNION ALL
  SELECT 120, 25.1, 68.9
  UNION ALL
  SELECT 140, 29.1, 80.3
  UNION ALL
  SELECT 150, 32.7, 82.4
  UNION ALL
  SELECT 160, 35.9, 78.8
  UNION ALL
  SELECT 170, 37.3, 72.8
  UNION ALL
  SELECT 180, 39.1, 67.1
  UNION ALL
  SELECT 200, 46.1, 63.0
  UNION ALL
  SELECT 210, 49.9, 63.0
  ) c ON c.ord = m.order_index
   SET m.x_pct = c.x, m.y_pct = c.y, m.sous_biome_slug = 'taiga'
 WHERE m.chapter_id = @fus_ch_e AND @fus_go = 1;

UPDATE gl_chapter_markers
   SET label = 'Bivouac boréal'
 WHERE chapter_id = @fus_ch_e AND order_index = 10 AND @fus_go = 1;

UPDATE gl_chapter_markers
   SET label = 'Ligne de feu',
       description = 'Un incendie court de cime en cime. Tu te mets à l''abri derrière une bande de terre nue.'
 WHERE chapter_id = @fus_ch_e AND order_index = 140 AND @fus_go = 1;

-- [6] Bascule : les cases en coulisse prennent leur place, d'un seul UPDATE (atomique).
UPDATE gl_chapter_markers
   SET order_index = order_index - 100000
 WHERE chapter_id = @fus_ch_e AND order_index >= 100000 AND @fus_go = 1;

-- Toutes les étapes suivantes ne valent que pour un chapitre effectivement fusionné.
SET @fus_ok = (
  SELECT COUNT(*) FROM gl_chapter_markers
   WHERE chapter_id = @fus_ch_e AND order_index = 220 AND label = 'Le dernier arbre'
);

-- [7] Quiz : le pool prend le biome de la case (mode `sous_biome`), plus celui du chapitre —
-- sinon une case de taïga piocherait des questions de toundra.
UPDATE gl_chapter_markers
   SET event_config_json = JSON_SET(event_config_json, '$.question.pool.biomeMode', 'sous_biome')
 WHERE chapter_id = @fus_ch_e AND @fus_ok = 1
   AND event_type IN ('quiz', 'question')
   AND JSON_VALID(event_config_json)
   AND JSON_CONTAINS_PATH(event_config_json, 'one', '$.question.pool')
   AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.question.set')), 'biome') = 'biome';

-- Quiz encore décrit par les seules colonnes historiques (config vide, tirage aléatoire) :
-- même configuration que `migrateLegacyMarkerQcmConfig`, en mode `sous_biome`.
UPDATE gl_chapter_markers
   SET event_config_json = JSON_OBJECT(
     'version', 2,
     'question', JSON_OBJECT(
       'set', 'biome', 'mode', 'random', 'fixedQuestionCode', NULL,
       'pool', JSON_OBJECT(
         'biomeMode', 'sous_biome', 'biomeSlugs', JSON_ARRAY(),
         'categorieSlugs', JSON_ARRAY(qcm_categorie_slug), 'niveaux', JSON_ARRAY(),
         'difficulteMin', NULL, 'difficulteMax', NULL, 'searchQuery', '',
         'selectedQuestionCodes', JSON_ARRAY()
       )
     )
   )
 WHERE chapter_id = @fus_ch_e AND @fus_ok = 1
   AND event_type IN ('quiz', 'question')
   AND (event_config_json IS NULL OR TRIM(event_config_json) = '')
   AND (qcm_question_code IS NULL OR TRIM(qcm_question_code) = '');

-- Case 25 (quiz écologie, ex-T250) : niveau base → approfondissement.
UPDATE gl_chapter_markers
   SET event_config_json = JSON_SET(event_config_json, '$.question.pool.niveaux', JSON_ARRAY('approfondissement'))
 WHERE chapter_id = @fus_ch_e AND order_index = 250 AND @fus_ok = 1
   AND event_type IN ('quiz', 'question')
   AND JSON_VALID(event_config_json)
   AND JSON_CONTAINS_PATH(event_config_json, 'one', '$.question.pool');

-- [8] Chapitre fusionné : titre inchangé ; biome, récit, biotope, biocénose.
UPDATE gl_chapters
   SET biome = 'Taïga & toundra arctique (été et nuit polaires)',
       story_markdown = '![Le dernier campement de Selene](scene:1)
*Le dernier campement de Selene.*

## Chapitre 4 — Eurasie continentale
### *Le Détricotage, puis l''Effacement*

> Page de Selene — son écriture devient fébrile.

Le froid commande tout. D''abord l''immense taïga, ceinture sombre de conifères ; puis la limite des arbres, où la forêt s''arrête net ; puis la toundra, rase jusqu''à l''océan gelé. C''est le chapitre le plus long et le plus rude du voyage.

**Votre enjeu.** Assister à un **effondrement en chaîne** : un lac gèle trop tôt, les poissons manquent, les oiseaux partent, les renards dépérissent. Un fil lâche, et cent suivent. C''est la démonstration vivante de l''**interdépendance** du vivant.

**La rencontre.** Dans un dernier coin vert, un homme assis vous offre le thé. Il vous conseille de vous arrêter là. Sur les faits, il n''a pas tort. Ce sera à vous de dire pourquoi vous repartez.

**Le rebondissement.** Sous le dernier arbre, vous atteignez le **dernier campement de Selene**. Son carnet s''arrête là, au milieu d''une phrase. Elle est repartie vers le pôle **sans son carnet**, en hâte — vers quoi ? fuyant quoi ? Et le carnet que vous portez se met à s''effacer **plus vite**. Derrière vous, le miroir du retour se trouble.

**Au-delà des arbres.** La toundra fleurit sous un soleil qui ne se couche plus. Profitez-en : un jour, il se couche, et ne se relève pas.

*Tonalité : urgence, émerveillement bref, mystère à son comble.*',
       biotope_markdown = '![La taïga](/uploads/media-library/image/gl-biome-taiga-scene-voyage.png)
*La taïga.*

![La toundra — été polaire](/uploads/media-library/image/gl-biome-toundra-scene-ete.png)
*La toundra — été polaire.*

![La toundra — nuit polaire](/uploads/media-library/image/gl-biome-toundra-scene-ours-blanc.png)
*La toundra — nuit polaire.*

## Le biotope — milieu de vie

### Taïga
La plus vaste forêt du monde, une ceinture sombre de conifères qui fait presque le tour de la Terre (*forêt boréale*). L''hiver y dure et y mord ; l''été n''est qu''une parenthèse brève et fraîche (*climat subarctique*). Au sol, le froid ralentit tout : un tapis de mousses et d''aiguilles se défait avec une lenteur infinie (*décomposition* très lente).

### La limite des arbres
Plus au nord, la forêt s''éclaircit, les épicéas rapetissent et se tordent, puis s''arrêtent net. Ce n''est pas un hasard : là où l''été est trop court et trop frais (le mois le plus chaud reste sous dix degrés), un arbre n''a plus le temps de fabriquer assez de bois pour grandir. Et sous ses racines, le sol ne dégèle plus en profondeur.

### Toundra — été polaire
Trop de froid, trop de vent, et sous les pieds une terre gelée en permanence qui ne dégèle qu''en surface l''été (*pergélisol*) : c''est une plaine rase qui s''étend jusqu''à l''océan glacé (*biome polaire*). Il y tombe moins d''eau que dans bien des déserts : la toundra est un *désert polaire*. En été, le soleil ne se couche plus ; profitant de cette lumière sans fin, toute la plaine se met à fleurir en quelques semaines.

### Toundra — nuit polaire
Puis le soleil se couche et ne revient plus : durant des semaines, c''est la *nuit polaire* et le thermomètre plonge sous moins quarante. La toundra fleurie n''est plus qu''une étendue blanche, soudée à la mer par la glace (*banquise*). Certaines nuits, le ciel s''embrase de voiles verts et roses (*aurores boréales*).',
       biocenose_markdown = '## La biocénose — communauté du vivant

### Taïga
Sapins et épicéas dressent des cimes étroites dont les branches laissent glisser la neige (*adaptation* au froid) et gardent leurs aiguilles toute l''année (*conifères* persistants). L''ours brun engraisse l''été pour dormir l''hiver (*hibernation*) ; le lynx suit les lièvres dans la neige ; l''élan brise la glace des marais pour brouter. Survivre, ici, c''est savoir attendre.

### Toundra — été polaire
La vie doit tout faire vite, car l''été ne dure qu''un souffle. Des tapis de mousses, de lichens et de minuscules fleurs surgissent ; des nuées d''oiseaux viennent nicher et se gaver d''insectes (*migration*). Les lemmings pullulent, et derrière eux viennent renards et harfangs (*chaîne alimentaire*). Les rennes parcourent la plaine en quête de lichen, suivis de loin par les loups.

### Toundra — nuit polaire
Tout ce qui pouvait fuir est parti. Mais l''ours blanc n''hiberne pas : il chasse le phoque sur la banquise (*prédateur*), et le renard polaire, blanchi par la saison, dispute les restes (*charognard*). Sous la neige, les lemmings creusent leurs galeries à l''abri du gel. Tout retient son souffle en attendant le retour de la lumière.

![Coupe de la taïga : la rivière et la fourmilière](/uploads/media-library/image/gl-coupe-taiga-riviere.png)
*Coupe de la taïga : la rivière et la fourmilière.*

![Coupe de la neige et du sol gelé (pergélisol)](/uploads/media-library/image/gl-coupe-toundra-neige-sol.png)
*Coupe de la neige et du sol gelé (pergélisol).*'
 WHERE id = @fus_ch_e AND @fus_ok = 1;

-- Sortilèges : une seule phrase change, celle des visages du Souffle (« Sur ce plateau, … »,
-- jusqu'au premier point). Le reste du texte est conservé. Sans cette phrase : rien n'est fait.
SET @fus_sorts = (SELECT sortileges_markdown FROM gl_chapters WHERE id = @fus_ch_e AND @fus_ok = 1);
SET @fus_sorts_p = IF(@fus_sorts IS NULL, 0, LOCATE('Sur ce plateau', @fus_sorts));
SET @fus_sorts_e = IF(@fus_sorts_p > 0, LOCATE('.', @fus_sorts, @fus_sorts_p), 0);
UPDATE gl_chapters
   SET sortileges_markdown = CONCAT(
     LEFT(@fus_sorts, @fus_sorts_p - 1),
     'Sur ce plateau, le **Souffle** prend deux visages : *Le Détricotage* dans la taïga, puis *L''Effacement* au-delà des arbres.',
     SUBSTRING(@fus_sorts, @fus_sorts_e + 1)
   )
 WHERE id = @fus_ch_e AND @fus_ok = 1 AND @fus_sorts_p > 0 AND @fus_sorts_e > 0
   AND LOCATE('*L''Effacement* au-delà des arbres', sortileges_markdown) = 0;

-- Biomes : taïga (0) et toundra (10) ; le désert froid sort du chapitre.
DELETE FROM gl_chapter_biomes
 WHERE chapter_id = @fus_ch_e AND biome_slug = 'desert_froid' AND @fus_ok = 1;

INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
SELECT @fus_ch_e, b.slug, IF(b.slug = 'taiga', 0, 10)
  FROM gl_biomes b
 WHERE b.slug IN ('taiga', 'toundra') AND @fus_ok = 1
ON DUPLICATE KEY UPDATE order_index = VALUES(order_index);

-- [9] Chapitre « Toundra arctique » mis de côté : sans plateau, rangé en fin de liste. Ses
-- repères, zones, textes et biomes ne bougent pas (il ne sert plus que de source).
UPDATE gl_chapters
   SET title = 'Chapitre 5 — Toundra arctique (mis de côté)',
       plateau_number = NULL,
       order_index = 900
 WHERE id = @fus_ch_t AND @fus_ok = 1;

-- [10] Zones du royaume du chapitre fusionné (polygones en % sur le plateau peint, sans
-- chevauchement) : Taïga = dalles 1–22, été polaire = 23–31, nuit polaire = 32–38.
DELETE FROM gl_kingdom_zones
 WHERE chapter_id = @fus_ch_e AND label = 'Désert froid' AND @fus_ok = 1;

UPDATE gl_kingdom_zones
   SET points_json = '[{"x":3,"y":5},{"x":55.5,"y":5},{"x":55.5,"y":95},{"x":3,"y":95}]'
 WHERE chapter_id = @fus_ch_e AND label = 'Taïga' AND @fus_ok = 1;

INSERT INTO gl_kingdom_zones (chapter_id, label, points_json, color, created_at, updated_at)
SELECT @fus_ch_e, 'Taïga', '[{"x":3,"y":5},{"x":55.5,"y":5},{"x":55.5,"y":95},{"x":3,"y":95}]', '#166534', NOW(), NOW()
  FROM DUAL
 WHERE @fus_ok = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_kingdom_zones x WHERE x.chapter_id = @fus_ch_e AND x.label = 'Taïga'
   );

-- « Toundra — été polaire » : popover, images et musiques repris de la zone « Toundra — été polaire » du
-- chapitre mis de côté (qui garde la sienne).
INSERT INTO gl_kingdom_zones
  (chapter_id, label, description, points_json, color, created_at, updated_at, music_url,
   music_volume, popover_markdown, popover_images_json, music_urls_json)
SELECT @fus_ch_e, 'Toundra — été polaire', z.description, '[{"x":55.5,"y":5},{"x":68,"y":5},{"x":79,"y":30},{"x":77,"y":36.5},{"x":73.5,"y":38},{"x":72,"y":60},{"x":78,"y":95},{"x":55.5,"y":95}]',
       COALESCE(z.color, '#ca8a04'), NOW(), NOW(), z.music_url, COALESCE(z.music_volume, 0.700),
       z.popover_markdown, z.popover_images_json, z.music_urls_json
  FROM (SELECT 1 AS one) d
  LEFT JOIN gl_kingdom_zones z
    ON z.chapter_id = @fus_ch_t AND z.label = 'Toundra — été polaire'
 WHERE @fus_ok = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_kingdom_zones x WHERE x.chapter_id = @fus_ch_e AND x.label = 'Toundra — été polaire'
   )
 ORDER BY z.id
 LIMIT 1;

UPDATE gl_kingdom_zones
   SET points_json = '[{"x":55.5,"y":5},{"x":68,"y":5},{"x":79,"y":30},{"x":77,"y":36.5},{"x":73.5,"y":38},{"x":72,"y":60},{"x":78,"y":95},{"x":55.5,"y":95}]'
 WHERE chapter_id = @fus_ch_e AND label = 'Toundra — été polaire' AND @fus_ok = 1;

-- « Toundra — nuit polaire » : popover, images et musiques repris de la zone « Toundra — hiver polaire » du
-- chapitre mis de côté (qui garde la sienne).
INSERT INTO gl_kingdom_zones
  (chapter_id, label, description, points_json, color, created_at, updated_at, music_url,
   music_volume, popover_markdown, popover_images_json, music_urls_json)
SELECT @fus_ch_e, 'Toundra — nuit polaire', z.description, '[{"x":68,"y":5},{"x":97,"y":5},{"x":97,"y":95},{"x":78,"y":95},{"x":72,"y":60},{"x":73.5,"y":38},{"x":77,"y":36.5},{"x":79,"y":30}]',
       COALESCE(z.color, '#1e3a8a'), NOW(), NOW(), z.music_url, COALESCE(z.music_volume, 0.700),
       z.popover_markdown, z.popover_images_json, z.music_urls_json
  FROM (SELECT 1 AS one) d
  LEFT JOIN gl_kingdom_zones z
    ON z.chapter_id = @fus_ch_t AND z.label = 'Toundra — hiver polaire'
 WHERE @fus_ok = 1
   AND NOT EXISTS (
     SELECT 1 FROM gl_kingdom_zones x WHERE x.chapter_id = @fus_ch_e AND x.label = 'Toundra — nuit polaire'
   )
 ORDER BY z.id
 LIMIT 1;

UPDATE gl_kingdom_zones
   SET points_json = '[{"x":68,"y":5},{"x":97,"y":5},{"x":97,"y":95},{"x":78,"y":95},{"x":72,"y":60},{"x":73.5,"y":38},{"x":77,"y":36.5},{"x":79,"y":30}]'
 WHERE chapter_id = @fus_ch_e AND label = 'Toundra — nuit polaire' AND @fus_ok = 1;

-- Feuillets rattachés aux zones de toundra du chapitre mis de côté : ils suivent la zone
-- homologue du chapitre fusionné (sinon ils ne se déclencheraient plus jamais en partie).
UPDATE gl_lore_feuillets f
  JOIN gl_kingdom_zones zt ON zt.id = f.kingdom_zone_id AND zt.chapter_id = @fus_ch_t
  JOIN gl_kingdom_zones ze
    ON ze.chapter_id = @fus_ch_e
   AND ze.label = CASE zt.label
                    WHEN 'Toundra — été polaire' THEN 'Toundra — été polaire'
                    WHEN 'Toundra — hiver polaire' THEN 'Toundra — nuit polaire'
                  END
   SET f.kingdom_zone_id = ze.id
 WHERE @fus_ok = 1;

-- [11] QCM lore : le pool d'un repère se dérive de `ch{plateau_number}`. Les questions du
-- récit `ch5` passent en `ch4`, numérotées à la suite de celles de `ch4` dans leur catégorie
-- (clé unique chapitre × catégorie × numéro) ; le scope `ch5` reste, marqué mis de côté.
UPDATE gl_qcm_lore_questions q
  LEFT JOIN (
    SELECT categorie_slug, MAX(numero_dans_categorie) AS mx
      FROM gl_qcm_lore_questions
     WHERE chapitre_slug = 'ch4'
     GROUP BY categorie_slug
  ) m ON m.categorie_slug = q.categorie_slug
   SET q.chapitre_slug = 'ch4',
       q.numero_dans_categorie = q.numero_dans_categorie + COALESCE(m.mx, 0)
 WHERE q.chapitre_slug = 'ch5' AND @fus_ok = 1;

UPDATE gl_qcm_lore_scopes
   SET nom = 'Eurasie continentale',
       description = 'Taïga & toundra. Le Détricotage, puis l''Effacement.'
 WHERE slug = 'ch4' AND @fus_ok = 1;

UPDATE gl_qcm_lore_scopes
   SET nom = CONCAT(nom, ' (mis de côté)')
 WHERE slug = 'ch5' AND @fus_ok = 1 AND nom NOT LIKE '%(mis de côté)';

-- [12] Feuillets du Livre de Sélène (corpus de production). Raccourcir = passer en inactif,
-- jamais supprimer. `lien_pays`, `ordre_voyage` et `ordre_recit` ne changent pas : l'ordre de
-- lecture du récit reste identique.
UPDATE gl_lore_feuillets
   SET statut = 'inactif'
 WHERE @fus_ok = 1
   AND feuillet_code IN (
     'ren-dfroid-01', 'ren-dfroid-02', 'sort-dfroid-01', 'cop-bio-dfroid',
     'ep-VII-feu-1', 'ep-VII-feu-2', 'ep-VIII-04b',
     'ep-III-04', 'ep-III-07', 'rep-II-09', 'ep-III-02',
     'vierge-P4', 'vierge-P5b', 'ep-quot-2'
   );

-- Feuillets narratifs du « désert froid » qui ne parlent pas du Gobi : rattachés à la taïga.
-- `page-dfroid` (« la page d'un pays où vous n'irez pas ») garde son biome : elle reste
-- atteignable par le plateau 4.
UPDATE gl_lore_feuillets
   SET biome_slug = 'taiga'
 WHERE @fus_ok = 1 AND biome_slug = 'desert_froid'
   AND feuillet_code IN (
     'ep-I-12', 'ep-III-01', 'ep-seuil-4', 'ep-VI-08', 'ep-VII-07', 'ep-VII-08',
     'ep-VIII-01', 'ep-VIII-02', 'ep-VIII-05', 'ep-VII-rechute'
   );

UPDATE gl_lore_feuillets
   SET titre = 'Les grands froids. J''ai recompté.'
 WHERE feuillet_code = 'ep-VII-rechute' AND @fus_ok = 1;

-- Plus de plateau 5 joué : ses feuillets actifs passent au plateau 4.
UPDATE gl_lore_feuillets
   SET plateau_number = 4
 WHERE plateau_number = 5 AND statut = 'actif' AND @fus_ok = 1;
