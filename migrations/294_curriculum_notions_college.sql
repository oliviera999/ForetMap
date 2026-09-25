-- Notions de collège supplémentaires et rattachement des questions de définition du glossaire.
--
-- Le constat (audit du 25/09/2026, § 1.3.1 ; décision Q6 du mainteneur : « créer davantage de
-- notions »). Le référentiel ne comptait que 12 notions, dont 2 par cycle de collège :
--   * 60 questions de niveau collège (catégories potager, agroécologie, eau, cycle de l'azote,
--     populations) ne portaient **que** des notions de lycée : un tirage « cycle 3 » ou
--     « cycle 4 » ne les proposait jamais, une séance de collège non plus ;
--   * les 47 questions `glossaire_definitions` n'avaient **aucune** notion : elles ne sortaient
--     dans aucune séance.
--
-- Quatre notions de collège, formulées d'après les attendus de fin de cycle des programmes
-- (cycle 3 : Sciences et technologie, « Le vivant, sa diversité et les fonctions qui le
-- caractérisent » ; cycle 4 : SVT, « La planète Terre, l'environnement et l'action humaine »),
-- rattachées aux catégories concernées. Les questions de définition reçoivent les notions de la
-- catégorie de leur terme (`glossary_category_notions`), en `ajout`.
--
-- La garde de palier (lib/pedagoScales.js, `contentMayInheritNotion`) s'applique toujours : une
-- question de lycée n'hérite pas de ces notions de collège.
-- Idempotent : ON DUPLICATE KEY UPDATE (libellés), INSERT IGNORE (rattachements), UPDATE par id.
-- Aucune donnée personnelle ; aucune table `gl_*`.

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order) VALUES
  ('C3-MATORG', 'cycle3', 'Sciences et technologie',
   'Le vivant, sa diversité et les fonctions qui le caractérisent',
   'Expliquer l’origine de la matière organique des êtres vivants et son devenir (besoins des végétaux, décomposition)',
   20),
  ('C3-DEVREPRO', 'cycle3', 'Sciences et technologie',
   'Le vivant, sa diversité et les fonctions qui le caractérisent',
   'Décrire comment les êtres vivants se développent et deviennent aptes à se reproduire',
   30),
  ('C3-ALIM', 'cycle3', 'Sciences et technologie',
   'Le vivant, sa diversité et les fonctions qui le caractérisent',
   'Expliquer l’origine des aliments et les techniques mises en œuvre pour les produire et les conserver',
   40),
  ('C4-RESS', 'cycle4', 'SVT',
   'La planète Terre, l’environnement et l’action humaine',
   'Exploitation de ressources naturelles par l’être humain (eau, sol) ; comportements responsables face à l’environnement',
   70)
ON DUPLICATE KEY UPDATE
  niveau = VALUES(niveau), discipline = VALUES(discipline), theme = VALUES(theme),
  notion = VALUES(notion), sort_order = VALUES(sort_order);

-- Ordre d'affichage : du cycle 3 à la terminale, avec de la place entre deux notions.
UPDATE curriculum_notions
   SET sort_order = CASE id
     WHEN 'C3-VIV' THEN 0
     WHEN 'C3-ENV' THEN 10
     WHEN 'C4-TERRE' THEN 50
     WHEN 'C4-VIV' THEN 60
     WHEN '2-BIODIV' THEN 100
     WHEN '2-ORGA' THEN 110
     WHEN '2-AGRO' THEN 120
     WHEN '1-ECO' THEN 200
     WHEN 'T-DOM' THEN 300
     WHEN 'ES1-SOLEIL' THEN 400
     WHEN 'EST-VIVANT' THEN 500
     WHEN 'EST-CLIMAT' THEN 510
   END
 WHERE id IN ('C3-VIV', 'C3-ENV', 'C4-TERRE', 'C4-VIV', '2-BIODIV', '2-ORGA', '2-AGRO',
              '1-ECO', 'T-DOM', 'ES1-SOLEIL', 'EST-VIVANT', 'EST-CLIMAT');

-- Catégories de quiz : les questions de collège trouvent une notion de collège. Jointure sur
-- les catégories présentes (clé étrangère) : une base où l'une manquerait ne casse pas.
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, v.notion_id
  FROM quiz_categories c
  JOIN (
  SELECT 'pratiques_potager' AS slug, 'C3-ALIM' AS notion_id
  UNION ALL SELECT 'pratiques_potager', 'C3-MATORG'
  UNION ALL SELECT 'pratiques_potager', 'C4-RESS'
  UNION ALL SELECT 'semis_recolte', 'C3-DEVREPRO'
  UNION ALL SELECT 'sol_compost', 'C3-MATORG'
  UNION ALL SELECT 'sol_compost', 'C4-RESS'
  UNION ALL SELECT 'eau_arrosage', 'C3-MATORG'
  UNION ALL SELECT 'eau_arrosage', 'C4-RESS'
  UNION ALL SELECT 'agroecologie_permaculture', 'C3-ALIM'
  UNION ALL SELECT 'agroecologie_permaculture', 'C4-RESS'
  UNION ALL SELECT 'cycle_azote_aquaponie', 'C3-MATORG'
  UNION ALL SELECT 'cycle_azote_aquaponie', 'C4-RESS'
  UNION ALL SELECT 'plantes_biologie', 'C3-MATORG'
  UNION ALL SELECT 'plantes_biologie', 'C3-DEVREPRO'
  UNION ALL SELECT 'energie_matiere', 'C3-MATORG'
  UNION ALL SELECT 'populations_equilibres', 'C4-VIV'
  UNION ALL SELECT 'environnement_durable', 'C4-RESS'
  ) v ON v.slug = c.slug;

-- Catégories du glossaire : même rattachement pour les termes voisins.
INSERT IGNORE INTO glossary_category_notions (categorie, notion_id) VALUES
  ('sol', 'C3-MATORG'),
  ('sol', 'C4-RESS'),
  ('agroecologie', 'C3-ALIM'),
  ('agroecologie', 'C4-RESS'),
  ('eau_aquaponie', 'C4-RESS'),
  ('cycle_de_vie', 'C3-DEVREPRO'),
  ('flore', 'C3-MATORG');

-- Questions de définition : les notions de la catégorie de leur terme (lien glossaire approuvé).
-- Un `ajout` passe outre la garde de palier : on l'applique donc ici, à la main — une question
-- de lycée ne reçoit pas de notion de collège (même règle que `contentMayInheritNotion`).
INSERT IGNORE INTO quiz_question_notions (question_code, notion_id, mode)
SELECT DISTINCT q.question_code, gcn.notion_id, 'ajout'
  FROM quiz_questions q
  JOIN resource_question_links r
    ON r.question_code = q.question_code
   AND r.resource_type = 'glossary'
   AND r.status = 'approved'
  JOIN glossary_terms g ON g.glossary_code = r.resource_ref
  JOIN glossary_category_notions gcn ON gcn.categorie = g.categorie
  JOIN curriculum_notions n ON n.id = gcn.notion_id
 WHERE q.categorie_slug = 'glossaire_definitions'
   AND NOT (q.niveau = 'lycee' AND n.niveau IN ('cycle3', 'cycle4'));
