-- Danger des fiches espèces : ce qu'une espèce peut faire à un élève qui la touche,
-- la cueille ou la porte à la bouche.
--
-- Pourquoi un champ structuré alors que `lookalike_species` (migration 243) existe déjà :
-- les confusions ne couvrent que le cas « je crois que c'est autre chose ». Le ricin, le
-- laurier-rose, le tabac glauque et la jusquiame sont cartographiés, identifiés sans
-- ambiguïté, et dangereux **quand même**. Le danger propre à l'espèce n'a nulle part où
-- s'écrire, et se retrouve noyé dans `description` quand il est écrit.
--
-- Quatre colonnes :
--   toxicity_level   — gravité, du plus fréquent au plus rare. `aucune` est une valeur
--                      utile : elle distingue « vérifié, sans danger » de « pas encore
--                      regardé » (NULL).
--   hazard_exposure  — par quelle voie. Un SET et non un ENUM : le figuier est à la fois
--                      contact et sève, l'euphorbe ajoute la projection oculaire.
--   hazard_notes     — quelle partie, dans quelles circonstances, quoi faire.
--   hazard_reviewed  — le pré-remplissage ci-dessous n'est PAS une validation. Il est posé
--                      à 0 et l'affichage le signale explicitement tant qu'un enseignant
--                      n'a pas relu la fiche.
--
-- Choix d'affichage assumé (cf. PlantHazardSection) : un danger non validé s'affiche
-- quand même, marqué « à valider ». Masquer un avertissement de toxicité jusqu'à
-- relecture serait le seul choix réellement dangereux des deux.
--
-- Un ALTER par colonne : errno 1060 (colonne déjà présente) est ignoré instruction par
-- instruction par database.js, donc un lot groupé perdrait les colonnes suivantes si la
-- première existait déjà.
ALTER TABLE plants
  ADD COLUMN toxicity_level ENUM('aucune','irritation','toxique','mortel') DEFAULT NULL
    COMMENT 'Gravité du danger pour un élève (aucune / irritation / toxique / mortel)';
ALTER TABLE plants
  ADD COLUMN hazard_exposure SET('ingestion','contact','inhalation','projection_oculaire','piqure_morsure','seve_latex') DEFAULT NULL
    COMMENT 'Voies d''exposition concernées';
ALTER TABLE plants
  ADD COLUMN hazard_notes TEXT DEFAULT NULL
    COMMENT 'Partie dangereuse, circonstances, conduite à tenir';
ALTER TABLE plants
  ADD COLUMN hazard_reviewed TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Danger relu et validé par un enseignant (0 = pré-rempli, à valider)';

-- Index sur la gravité : la liste « fiches dangereuses à valider » du panneau prof et le
-- test de contenu filtrent sur cette colonne.
CREATE INDEX idx_plants_toxicity ON plants (toxicity_level);

-- ---------------------------------------------------------------------------
-- Pré-remplissage — À VALIDER (hazard_reviewed = 0)
--
-- Périmètre volontairement restreint aux cas solidement établis et présents au catalogue.
-- Chaque UPDATE est borné par `toxicity_level IS NULL` : rejouer la migration ne réécrit
-- jamais par-dessus une relecture d'enseignant.
-- ---------------------------------------------------------------------------

-- Mortel — espèces à l'origine d'intoxications humaines documentées.
UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion',
  hazard_notes = 'Graines très toxiques (ricine) : quelques graines mâchées peuvent suffire. Ne jamais manipuler les fruits épineux ni les graines.'
WHERE name = 'Ricin' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion,contact,seve_latex',
  hazard_notes = 'Toute la plante est toxique (oléandrine), y compris le bois sec et la fumée. Ne jamais utiliser une branche comme pique à brochette. Se laver les mains après taille.'
WHERE name = 'Laurier-rose' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion',
  hazard_notes = 'Feuilles toxiques (anabasine). Des intoxications graves surviennent par confusion avec une plante potagère à feuilles charnues.'
WHERE name = 'Tabac glauque' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion',
  hazard_notes = 'Graines et feuilles toxiques (alcaloïdes tropaniques) : délire, troubles cardiaques. Ne pas porter les mains à la bouche après manipulation.'
WHERE name = 'Jusquiame blanche' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion,inhalation',
  hazard_notes = 'Graines toxiques (harmine, harmaline). Des intoxications graves, parfois mortelles, sont documentées au Maroc en usage traditionnel, y compris par les fumées.'
WHERE name = 'Harmel' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'mortel', hazard_exposure = 'ingestion',
  hazard_notes = 'Graines et feuilles très toxiques (alcaloïdes diterpéniques). Plante ornementale : pas de cueillette, pas de bouquet porté à la bouche.'
WHERE name = 'Pied-d''alouette d''Ajax' AND toxicity_level IS NULL;

-- Toxique — ingestion dangereuse, sans létalité couramment rapportée aux doses accessibles.
UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion,contact,seve_latex,projection_oculaire',
  hazard_notes = 'Latex blanc corrosif : brûlures de la peau et, en cas de projection, lésions graves de l''œil. Ne jamais casser une tige à hauteur de visage ; rincer longuement en cas de contact.'
WHERE name IN ('Euphorbe', 'Euphorbe en faux', 'Euphorbe maritime') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion,contact',
  hazard_notes = 'Baies toxiques ; la sève provoque des dermites chez les personnes sensibles.'
WHERE name = 'Lierre' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Bulbe toxique (lycorine) : vomissements. Ne pas confondre un bulbe d''ornement avec un bulbe potager.'
WHERE name IN ('Narcisse de Broussonet', 'Narcisse tardif', 'Nivéole d''automne', 'Lis de mer')
  AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Fruits verts toxiques (solanine). Seuls les fruits parfaitement mûrs de certaines espèces sont consommés — s''abstenir en contexte scolaire.'
WHERE name IN ('Morelle de Sodome', 'Morelle velue') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Feuilles et tiges toxiques (solanine) : seul le fruit mûr se mange. Ne jamais faire d''infusion de fanes.'
WHERE name IN ('Tomate', 'Aubergine') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Favisme : chez les personnes porteuses d''un déficit en G6PD — fréquent sur le pourtour méditerranéen — l''ingestion de fèves crues ou peu cuites déclenche une anémie aiguë. Prévenir avant toute dégustation.'
WHERE name = 'Fève' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Alcaloïdes pyrrolizidiniques : toxicité hépatique par ingestion répétée. Jamais en tisane.'
WHERE name IN ('Héliotrope d''Europe', 'Vipérine de Boissier') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Graines et gousses toxiques (alcaloïdes de type cytisine).'
WHERE name IN ('Cytise mou', 'Rétam') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Saponines : toxiques par ingestion, irritantes pour les muqueuses.'
WHERE name IN ('Molène sinuée', 'Vaccaire', 'Mouron rouge / bleu', 'Mouron bleu')
  AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Toute la plante est toxique ; toxicité bien documentée chez le bétail.'
WHERE name IN ('Grande férule', 'Myoporum', 'Verbésine', 'Iris de Barbarie', 'Mercuriale ambiguë')
  AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Baies toxiques.'
WHERE name IN ('Fragon à feuilles', 'Lyciet d''Europe') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Graines toxiques (alcaloïdes). Plante grimpante ornementale, pas une plante à graines comestibles.'
WHERE name = 'Volubilis' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Racine et feuilles toxiques à dose élevée ; usage médicinal traditionnel qui ne se transpose pas en cueillette libre.'
WHERE name IN ('Withania somnifère', 'Withania arbustive') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Feuillage et huile essentielle toxiques par ingestion (thuyone pour le thuya, cinéole pour l''eucalyptus). Aucune infusion maison.'
WHERE name IN ('Thuya de Berbérie', 'Eucalyptus') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion,contact',
  hazard_notes = 'Graines toxiques ; la pulpe du fruit provoque des dermites de contact.'
WHERE name = 'Ginkgo' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'ingestion',
  hazard_notes = 'Toxique pour les animaux domestiques ; ingestion à éviter chez l''humain.'
WHERE name = 'Arbre de jade' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'toxique', hazard_exposure = 'inhalation',
  hazard_notes = 'Spores d''Aspergillus fumigatus : inhalées en masse lors du retournement d''un compost chaud, elles provoquent des atteintes pulmonaires. Retourner le compost au vent, masque conseillé pour les élèves sensibles ou asthmatiques.'
WHERE name = 'Aspergillus du compost' AND toxicity_level IS NULL;

-- Irritation — mécanique, urticante, allergisante ou photosensibilisante.
UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact,seve_latex',
  hazard_notes = 'Le latex de la figue et des rameaux est photosensibilisant : au soleil, il provoque des brûlures durables. Cueillir tôt le matin, rincer les avant-bras.'
WHERE name = 'Figuier commun' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Glochides : minuscules épines barbelées, presque invisibles, très difficiles à retirer de la peau. Gants épais obligatoires, ne jamais cueillir à mains nues.'
WHERE name IN ('Figuier de Barbarie', 'Oponce', 'Cactus') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Poils urticants : brûlure immédiate au contact, sans gravité mais douloureuse.'
WHERE name IN ('Ortie dioïque', 'Ortie membraneuse') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'inhalation',
  hazard_notes = 'Pollen très allergisant, cause majeure de rhinite au Maroc ; floraison longue.'
WHERE name = 'Pariétaire de Mauritanie' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Épines ou piquants : blessures mécaniques. Gants et manches longues pour l''entretien.'
WHERE name IN (
  'Chardon-Marie', 'Chardon à capitules denses', 'Centaurée chausse-trappe', 'Échinops rude',
  'Scolyme d''Espagne (guernina)', 'Scolyme maculé', 'Jonc piquant', 'Asperge épineuse',
  'Jujubier sauvage (sder)', 'Bougainvillier', 'Salsepareille'
) AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Dermite de contact fréquente (famille des Anacardiacées, parenté avec le sumac vénéneux).'
WHERE name IN ('Faux-poivrier', 'Poivre rose', 'Sumac à trois feuilles', 'Sumac blanc (tizrha)')
  AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Sève vésicante : rougeurs et cloques au contact prolongé.'
WHERE name IN (
  'Dentelaire d''Europe', 'Plumbago', 'Renoncule aquatique', 'Renoncule bulleuse',
  'Glaïeul commun', 'Inule visqueuse'
) AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'ingestion,contact',
  hazard_notes = 'Cristaux d''oxalate de calcium : brûlure de la bouche à la mastication, irritation au contact de la sève.'
WHERE name IN ('Arisarum', 'Schefflera arboricole nora', 'Ficus') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Photosensibilisant : le contact suivi d''une exposition au soleil provoque des rougeurs.'
WHERE name = 'Millepertuis tomenteux' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact,projection_oculaire',
  hazard_notes = 'Capsaïcine : brûlure intense si les mains passent des graines aux yeux. Se laver les mains après manipulation.'
WHERE name IN ('Piment', 'Poivron') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'piqure_morsure',
  hazard_notes = 'Piqûre douloureuse en cas de manipulation ou de nid dérangé. Rare mais possible : réaction allergique grave — signaler tout élève allergique avant la sortie.'
WHERE name IN (
  'Guêpe poliste', 'Guêpe maçonne', 'Philanthe apivore', 'Scolie des jardins',
  'Abeille domestique', 'Abeille charpentière', 'Xylocope violet', 'Fourmi moissonneuse'
) AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Cellules urticantes des tentacules : brûlure au toucher. Observer sans toucher.'
WHERE name IN ('Anémone tomate', 'Anémone verte') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact',
  hazard_notes = 'Piquants : blessures profondes si l''on pose la main ou le pied dessus. Chaussures fermées en estran.'
WHERE name IN ('Oursin noir', 'Oursin violet', 'Porc-épic à crête') AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'piqure_morsure',
  hazard_notes = 'Morsure possible si l''animal est saisi : espèce non venimeuse, mais elle se défend. Observer sans capturer.'
WHERE name = 'Couleuvre vipérine' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'contact,inhalation',
  hazard_notes = 'Déjections : germes pathogènes. Gants pour le ramassage, lavage des mains systématique.'
WHERE name = 'Crottes et fientes' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'irritation', hazard_exposure = 'inhalation',
  hazard_notes = 'Spores libérées au retournement : éternuements et gêne respiratoire chez les élèves sensibles.'
WHERE name IN ('Actinomycète du compost', 'Moisissure noire du pain') AND toxicity_level IS NULL;

-- Sans danger connu — posé explicitement sur quelques espèces cueillies et consommées,
-- pour que `aucune` se distingue de « pas encore regardé ». Le laurier-sauce est le cas
-- qui compte : c'est le sosie comestible du laurier-rose.
UPDATE plants SET toxicity_level = 'aucune', hazard_exposure = NULL,
  hazard_notes = 'Feuille de cuisine sans danger. Attention à la confusion avec le laurier-rose, mortel : la feuille de laurier-sauce est odorante quand on la froisse, celle du laurier-rose ne l''est pas.'
WHERE name = 'Laurier-sauce' AND toxicity_level IS NULL;

UPDATE plants SET toxicity_level = 'aucune'
WHERE name IN (
  'Menthe', 'Romarin', 'Thym', 'Basilic', 'Persil', 'Ciboulette', 'Sauge', 'Coriandre',
  'Fraisier', 'Framboisier', 'Grenadier', 'Olivier', 'Caroubier'
) AND toxicity_level IS NULL;
