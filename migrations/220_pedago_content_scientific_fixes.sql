-- Corrections scientifiques / pédagogiques (contenu uniquement).
-- Idempotent : UPDATE ciblés par code + INSERT IGNORE. Aucun ALTER.
-- 219 est déjà pris (Moodle) : ce lot commence à 220.

UPDATE glossary_terms
SET definition_courte='Variété du vivant à plusieurs niveaux : diversité génétique, diversité des espèces et diversité des écosystèmes.',
    definition_complete='La biodiversité désigne la diversité du vivant. Elle peut être étudiée à l’échelle de la diversité génétique au sein des populations, de la diversité des espèces et de la diversité des écosystèmes. Une biodiversité élevée peut contribuer au fonctionnement et à la résilience des écosystèmes, sans garantir à elle seule une résistance à toute perturbation.',
    updated_at=NOW()
WHERE glossary_code='FM0002';

UPDATE glossary_terms
SET definition_complete='Une biocénose est l’ensemble des populations d’organismes vivant dans un même biotope et leurs relations. Elle comprend notamment des producteurs, consommateurs, décomposeurs et autres organismes, mais la frontière entre catégories fonctionnelles dépend du contexte.',
    updated_at=NOW()
WHERE glossary_code='FM0004';

UPDATE glossary_terms
SET definition_courte='Ensemble d’organismes reliés par des relations alimentaires ; certaines chaînes commencent par un producteur, d’autres par de la matière organique morte.',
    definition_complete='Une chaîne alimentaire représente une succession de relations trophiques. Une chaîne de pâturage peut commencer par un producteur vivant ; une chaîne détritique commence par de la matière organique morte. Dans un réseau trophique réel, les chaînes sont interconnectées.',
    updated_at=NOW()
WHERE glossary_code='FM0010';

UPDATE glossary_terms
SET definition_courte='Organisme, notamment de nombreux champignons et microorganismes, qui dégrade la matière organique morte.',
    definition_complete='Les décomposeurs minéralisent et transforment la matière organique morte. Les détritivores, comme les vers de terre ou certains cloportes, fragmentent et ingèrent cette matière et facilitent sa décomposition, mais ne sont pas synonymes de décomposeurs.',
    updated_at=NOW()
WHERE glossary_code='FM0015';

UPDATE glossary_terms
SET definition_courte='Oxydation biologique de l’ammonium en nitrite puis du nitrite en nitrate.',
    definition_complete='La nitrification comporte généralement deux étapes : oxydation de l’ammonium en nitrite, puis du nitrite en nitrate. Des microorganismes différents peuvent réaliser ces étapes ; certaines lignées de Nitrospira peuvent effectuer une nitrification complète.',
    updated_at=NOW()
WHERE glossary_code='FM0021';

UPDATE glossary_terms
SET definition_courte='Équilibre entre NH4+ et NH3 dans l’eau ; la proportion de NH3 augmente notamment avec le pH et la température.',
    definition_complete='L’ammonium NH4+ et l’ammoniac NH3 sont deux formes en équilibre. La fraction NH3 augmente lorsque le pH et la température augmentent et cette forme est généralement plus toxique pour les poissons. Il est donc incorrect de qualifier tout ammonium de toxique indépendamment du contexte.',
    updated_at=NOW()
WHERE glossary_code='FM0022';

UPDATE glossary_terms
SET definition_courte='Ion azoté NO3- fréquemment assimilé par les plantes et pouvant être réduit par dénitrification.',
    definition_complete='Le nitrate est une forme minérale de l’azote souvent absorbée par les plantes. Il est un produit de la nitrification mais n’est pas un produit final universel du cycle de l’azote : il peut être assimilé, lessivé ou réduit notamment par dénitrification.',
    updated_at=NOW()
WHERE glossary_code='FM0023';

UPDATE glossary_terms
SET definition_courte='Ensemble des conditions biotiques et abiotiques dans lesquelles vit un organisme.',
    definition_complete='En écologie, l’environnement inclut le milieu physique et chimique ainsi que les autres organismes. Il faut distinguer ce concept d’une interaction biotique, qui décrit une relation ou un effet entre organismes.',
    updated_at=NOW()
WHERE glossary_code='FM0164';

UPDATE glossary_terms
SET definition_courte='Fraction d’énergie transférée d’un niveau trophique au suivant ; la valeur de 10 % est une approximation pédagogique.',
    definition_complete='L’efficacité de transfert entre niveaux trophiques varie fortement selon les organismes et les écosystèmes. La règle des 10 % est une approximation historique utile pour raisonner, pas une constante biologique.',
    updated_at=NOW()
WHERE glossary_code='FM0204';

UPDATE glossary_terms
SET definition_courte='Molécule de transfert d’énergie utilisée par de nombreuses réactions cellulaires.',
    definition_complete='L’ATP est une molécule de transfert d’énergie. Il est continuellement produit et consommé et ne constitue pas un stockage énergétique à long terme. Il intervient notamment dans la synthèse, le transport actif et les mouvements cellulaires.',
    updated_at=NOW()
WHERE glossary_code='FM0210';

UPDATE glossary_terms
SET definition_courte='Capacité d’un écosystème ou d’une population à se rétablir après une perturbation.',
    definition_complete='La résilience correspond à la capacité d’un système à absorber une perturbation puis à retrouver tout ou partie de ses fonctions. Elle se distingue de la résistance, qui décrit plutôt la faible variation pendant la perturbation.',
    updated_at=NOW()
WHERE glossary_code='FM0229';

UPDATE glossary_terms
SET definition_courte='Enrichissement excessif d’un milieu aquatique en nutriments, pouvant entraîner des proliférations biologiques et une baisse de l’oxygène.',
    definition_complete='L’eutrophisation est liée notamment à des apports excessifs d’azote et de phosphore. Elle peut favoriser des proliférations d’algues ou de plantes ; leur décomposition peut accroître la consommation d’oxygène et provoquer une hypoxie.',
    updated_at=NOW()
WHERE glossary_code='FM0243';

UPDATE glossary_terms
SET definition_complete='Le purin d’ortie est une préparation obtenue par macération/fermentation d’orties dans l’eau. Sa composition dépend fortement de la préparation. Certaines utilisations sont traditionnelles, mais il ne faut pas le présenter comme un fongicide dont l’efficacité serait universellement démontrée.',
    updated_at=NOW()
WHERE glossary_code='FM0279';

UPDATE glossary_terms
SET definition_complete='Le biochar est une matière carbonée produite par pyrolyse de biomasse dans des conditions limitées en oxygène. Ses effets sur les sols dépendent fortement de la matière première, de la température de production, du sol et de la dose ; ils ne sont pas automatiquement positifs.',
    updated_at=NOW()
WHERE glossary_code='FM0280';

UPDATE glossary_terms
SET definition_courte='Rapport entre la pression partielle de vapeur d’eau et la pression de vapeur saturante à une température donnée, exprimé en pourcentage.',
    definition_complete='L’humidité relative dépend à la fois de la quantité de vapeur d’eau et de la température. À quantité de vapeur constante, elle augmente lorsque la température diminue. Elle ne peut pas être correctement interprétée par une simple addition de température et de pourcentage.',
    updated_at=NOW()
WHERE glossary_code='FM0283';

UPDATE gl_glossary_terms
SET definition_courte='Ensemble des éléments biotiques et abiotiques qui entourent un organisme et influencent sa vie.',
    definition_complete='L’environnement d’un organisme comprend des facteurs abiotiques (température, eau, lumière, pH, salinité, sol, etc.) et des facteurs biotiques (autres organismes, ressources, concurrents, prédateurs, partenaires). « Environnement » désigne donc un contexte écologique et non une interaction biotique.',
    exemple='Pour un renard arctique : température, neige, disponibilité des proies, prédateurs, parasites et autres organismes.',
    updated_at=NOW()
WHERE glossary_code='GL0084';

UPDATE gl_glossary_terms
SET definition_complete='Les reptiles sont des ectothermes : leur température corporelle dépend fortement des conditions thermiques du milieu et de leurs comportements de thermorégulation. Ils ne sont pas limités aux régions chaudes et l’expression « à sang froid » est à éviter dans un contenu scientifique.',
    definition_courte='Animal ectotherme dont la température corporelle dépend en partie des échanges avec le milieu et de sa régulation comportementale ou physiologique.',
    updated_at=NOW()
WHERE terme='reptile';

UPDATE gl_glossary_terms
SET definition_courte='Ensemble de mécanismes permettant à un organisme de contrôler ou stabiliser sa température corporelle.',
    definition_complete='La thermorégulation regroupe les mécanismes comportementaux, physiologiques et parfois morphologiques qui permettent à un organisme de maintenir une température compatible avec son fonctionnement. Les ectothermes utilisent notamment des comportements de recherche ou d’évitement de sources de chaleur.',
    updated_at=NOW()
WHERE terme='thermorégulation';

UPDATE gl_glossary_terms
SET definition_complete='En aquaponie, les déchets azotés issus des animaux sont transformés par des microorganismes puis une partie de l’azote minéral peut être assimilée par les plantes. Le système est un couplage entre aquaculture et culture végétale ; il nécessite une gestion de l’oxygène, du pH, des nutriments et des débits et n’est pas automatiquement équilibré.',
    updated_at=NOW()
WHERE terme='aquaponie';

UPDATE gl_glossary_terms
SET definition_complete='La biodiversité peut favoriser certaines fonctions écologiques et certaines formes de stabilité, mais l’effet dépend du système, des espèces présentes et de la perturbation considérée. Il faut éviter de présenter la biodiversité comme une garantie automatique contre tous les ravageurs ou maladies.',
    updated_at=NOW()
WHERE terme='biodiversité';

UPDATE gl_glossary_terms
SET definition_complete='Un biome est une grande unité écologique définie notamment par le climat et la végétation dominante. Les limites et catégories de biomes dépendent du système de classification utilisé ; ils ne sont pas simplement des synonymes d’écosystèmes.',
    updated_at=NOW()
WHERE terme='biome';

INSERT IGNORE INTO gl_glossary_terms
(glossary_code,terme,variantes,categorie,niveau,definition_courte,definition_complete,exemple,etymologie,present_dans_qcm,illustration_idee,all_biomes,statut,created_at,updated_at)
VALUES
('GL9001','décomposeur','décomposeurs','ecosysteme','base','Organisme qui transforme la matière organique morte et contribue à sa minéralisation.','De nombreux champignons et microorganismes dégradent la matière organique morte. Ils libèrent progressivement des composés plus simples et contribuent au recyclage de la matière.','Champignons et bactéries du sol dégradant une feuille morte.',NULL,NULL,'Champignon + bactérie autour d’une feuille morte',1,'actif',NOW(),NOW()),
('GL9002','détritivore','détritivores','ecologie','base','Organisme qui ingère de la matière organique morte ou des détritus.','Les détritivores fragmentent et consomment de la matière organique morte. Ils facilitent souvent le travail des décomposeurs, mais ne sont pas eux-mêmes synonymes de décomposeurs.','Ver de terre consommant de la litière.',NULL,NULL,'Ver de terre dans la litière',1,'actif',NOW(),NOW()),
('GL9003','nitrification','nitrifiants','ecosysteme','approfondissement','Oxydation microbienne de l’ammonium en nitrite puis du nitrite en nitrate.','La nitrification est une étape du cycle de l’azote réalisée par différents microorganismes. Elle transforme des formes réduites de l’azote en formes plus oxydées.','NH4+ → NO2- → NO3-.',NULL,NULL,'Schéma du cycle de l’azote',1,'actif',NOW(),NOW()),
('GL9004','dénitrification','dénitrifiants','ecosysteme','approfondissement','Réduction microbienne des nitrates et nitrites, pouvant conduire à N2 et N2O.','La dénitrification se produit souvent lorsque l’oxygène disponible est faible. Elle peut contribuer au retour de l’azote vers l’atmosphère sous forme de N2, avec production possible de N2O.','NO3- → NO2- → N2O → N2.',NULL,NULL,'Cycle de l’azote avec retour vers l’atmosphère',1,'actif',NOW(),NOW()),
('GL9005','réseau trophique','réseau alimentaire','ecologie','base','Ensemble de chaînes alimentaires interconnectées dans un écosystème.','Un réseau trophique représente plusieurs relations alimentaires simultanées. Une même espèce peut avoir plusieurs proies et plusieurs prédateurs.','Dans une prairie, une plante peut être consommée par plusieurs herbivores eux-mêmes consommés par plusieurs prédateurs.',NULL,NULL,'Réseau avec plusieurs flèches trophiques',1,'actif',NOW(),NOW()),
('GL9006','flux d’énergie','flux énergétique','ecosysteme','approfondissement','Transfert d’énergie entre niveaux trophiques avec dissipation sous forme de chaleur.','L’énergie disponible pour les organismes diminue à chaque transfert trophique. Une partie importante est dissipée sous forme de chaleur lors du métabolisme.','Une partie seulement de l’énergie fixée par une plante est disponible pour l’herbivore.',NULL,NULL,'Pyramide d’énergie',1,'actif',NOW(),NOW()),
('GL9007','sélection naturelle','sélection','evolution','approfondissement','Processus évolutif où des différences héréditaires influencent le succès reproducteur.','Lorsque des variations héréditaires influencent la survie ou la reproduction dans un environnement donné, leur fréquence peut changer au fil des générations. La sélection n’a pas de but prédéterminé.','Résistance à un insecticide lorsque certains individus possèdent une variation héréditaire favorable.',NULL,NULL,'Population avant/après sélection',1,'actif',NOW(),NOW()),
('GL9008','dérive génétique','dérive','evolution','approfondissement','Variation aléatoire des fréquences alléliques, particulièrement importante dans les petites populations.','La dérive génétique résulte du hasard des transmissions d’allèles. Elle peut réduire la diversité génétique ou fixer des allèles sans que ceux-ci procurent nécessairement un avantage adaptatif.','Effet fondateur ou réduction brutale d’une population.',NULL,NULL,'Population avec disparition aléatoire d’allèles',1,'actif',NOW(),NOW()),
('GL9009','résilience écologique','résilience','ecosysteme','approfondissement','Capacité d’un système écologique à retrouver certaines fonctions après une perturbation.','La résilience dépend des caractéristiques du système et de la nature de la perturbation. Elle ne signifie pas nécessairement un retour exact à l’état initial.','Une prairie recolonisant progressivement une zone après une perturbation.',NULL,NULL,'Succession après perturbation',1,'actif',NOW(),NOW()),
('GL9010','espèce exotique envahissante','EEE','ecologie','base','Espèce introduite hors de son aire naturelle qui s’établit et provoque des impacts.','Une espèce introduite n’est pas automatiquement envahissante. Le terme EEE implique une introduction hors de l’aire naturelle, un établissement et une expansion accompagnés d’impacts écologiques, économiques ou sanitaires.','Une plante introduite qui se répand rapidement et modifie le fonctionnement d’un milieu.',NULL,NULL,'Carte d’introduction et expansion',1,'actif',NOW(),NOW());

UPDATE quiz_questions
SET question='Par quoi peut commencer une chaîne alimentaire ?',
    choix_a='Par un producteur vivant ou, dans une chaîne détritique, par de la matière organique morte',
    reponse_correcte='A',
    reponse_texte='Par un producteur vivant ou, dans une chaîne détritique, par de la matière organique morte',
    feedback_correct='Exact. Une chaîne de pâturage peut commencer par un producteur ; une chaîne détritique commence par de la matière organique morte.',
    feedback_a='Exact. Une chaîne de pâturage peut commencer par un producteur ; une chaîne détritique commence par de la matière organique morte.',
    notes_pedagogiques='Évite l’affirmation trop absolue « toujours producteur ».',
    updated_at=NOW()
WHERE question_code='QF0010';

UPDATE quiz_questions
SET question='Quel ensemble décrit le mieux le rôle des décomposeurs ?',
    choix_a='Ils dégradent la matière organique morte et contribuent à la libération de matière minérale',
    reponse_correcte='A',
    reponse_texte='Ils dégradent la matière organique morte et contribuent à la libération de matière minérale',
    feedback_correct='Exact. De nombreux champignons et microorganismes assurent une part importante de la décomposition.',
    feedback_a='Exact. Les champignons et de nombreuses bactéries sont des décomposeurs ; les vers et cloportes sont plutôt des détritivores.',
    notes_pedagogiques='Corrige la confusion initiale qui classait vers et cloportes comme décomposeurs.',
    updated_at=NOW()
WHERE question_code='QF0011';

UPDATE quiz_questions
SET question='Quelle affirmation est la plus juste à propos du transfert d’énergie entre niveaux trophiques ?',
    choix_a='Il est faible et variable ; la règle des 10 % est une approximation pédagogique',
    choix_b='Il est toujours exactement égal à 10 %',
    choix_c='Toute l’énergie est conservée sous forme de biomasse',
    choix_d='L’énergie augmente à chaque niveau trophique',
    reponse_correcte='A',
    reponse_texte='Il est faible et variable ; la règle des 10 % est une approximation pédagogique',
    feedback_correct='Exact. L’efficacité de transfert varie selon les organismes et les écosystèmes.',
    feedback_a='Exact. La règle des 10 % est une approximation utile, pas une constante.',
    feedback_b='Non. 10 % est une règle pédagogique approximative.',
    feedback_c='Non. Une grande partie de l’énergie est dissipée sous forme de chaleur.',
    feedback_d='Non. L’énergie disponible diminue généralement fortement à chaque transfert.',
    notes_pedagogiques='Évite de transformer la règle des 10 % en loi biologique.',
    updated_at=NOW()
WHERE question_code='QF0012';

UPDATE gl_species
SET nom_scientifique='Tamarix sp.',
    description_courte='Genre d’arbustes ou petits arbres halophiles comprenant plusieurs espèces adaptées aux milieux secs ou salés.'
WHERE species_code='SP0015' AND (nom_scientifique='Tamarix' OR nom_scientifique IS NULL OR nom_scientifique='Tamarix sp.');

UPDATE gl_species
SET nom_scientifique='Marantochloa sp.',
    description_courte='Genre de Marantacées tropicales ; l’identification à l’espèce nécessite des caractères complémentaires.'
WHERE species_code='SP0045' AND (nom_scientifique='Marantochloa' OR nom_scientifique='Marantochloa sp.');

UPDATE gl_species
SET nom_scientifique='Phrynocephalus sp.',
    description_courte='Genre de lézards agamidés des régions arides d’Eurasie.',
    endemique='Non'
WHERE species_code='SP0221' AND (nom_scientifique='Phrynocephalus' OR nom_scientifique='Phrynocephalus sp.');

UPDATE gl_species
SET nom_scientifique='Calligonum sp.',
    description_courte='Genre d’arbustes adaptés aux milieux arides d’Eurasie et d’Afrique du Nord.'
WHERE species_code='SP0227' AND (nom_scientifique='Calligonum' OR nom_scientifique='Calligonum sp.');

UPDATE gl_species
SET adaptations_cles='Fourrure blanche en hiver, pattes larges adaptées à la neige et aux sols meubles ; reste actif durant l’hiver.',
    anecdote='Le lièvre arctique reste actif pendant l’hiver : il ne doit pas être présenté comme un animal hibernant.'
WHERE species_code='SP0051';

UPDATE gl_species
SET endemique='Non',
    adaptations_cles='Fourrure dense et sombre, corps compact et comportement adapté aux hivers froids ; activité hivernale.',
    anecdote='La zibeline est largement répartie en Eurasie septentrionale et ne doit pas être présentée comme strictement endémique de Sibérie ni comme hibernante.'
WHERE species_code='SP0146';

UPDATE gl_species
SET anecdote='L’échinacée est traditionnellement utilisée dans certaines préparations contre le rhume. Les résultats des essais cliniques sont hétérogènes et l’efficacité dépend notamment de la préparation utilisée.'
WHERE species_code='SP0204';

UPDATE gl_species
SET anecdote='Le pronghorn a coexisté avec des prédateurs aujourd’hui disparus, dont Miracinonyx. Sa grande vitesse est le résultat de son histoire évolutive ; il faut éviter de présenter comme démontrée une causalité simple entre ce prédateur disparu et toutes ses adaptations.'
WHERE species_code='SP0192';

UPDATE gl_species
SET description_courte='Liane ligneuse tropicale du genre Tetracera.',
    anecdote='Le nom vernaculaire « liane à eau » ne constitue pas une garantie de potabilité. Une eau extraite d’une plante ne doit pas être considérée comme sûre sans traitement ou analyse appropriée.'
WHERE species_code='SP0043';

UPDATE gl_qcm_questions
SET question='Pourquoi « Tamarix » seul ne désigne-t-il pas une espèce précise ?',
    choix_a='Parce que Tamarix est un genre ; on écrit Tamarix sp. lorsque l’espèce n’est pas identifiée',
    choix_b='Parce que Tamarix est une famille animale',
    choix_c='Parce que tous les noms botaniques sont en français',
    choix_d='Parce qu’un genre ne peut jamais être utilisé scientifiquement',
    choix_e='Parce que Tamarix désigne uniquement une variété',
    reponse_correcte='A',
    reponse_texte='Parce que Tamarix est un genre ; on écrit Tamarix sp. lorsque l’espèce n’est pas identifiée',
    feedback_correct='Exact. Tamarix est un genre. Sans épithète d’espèce, on précise « sp. ».',
    feedback_a='Exact. Tamarix est un genre. Sans épithète d’espèce, on précise « sp. ».',
    feedback_b='Non. Tamarix est un genre botanique.',
    feedback_c='Non. Les noms scientifiques ne sont pas de simples traductions françaises.',
    feedback_d='Non. Un genre est une unité taxonomique valide.',
    feedback_e='Non. Il ne s’agit pas simplement d’une variété.',
    notes_pedagogiques='Ne pas confondre genre et espèce.',
    updated_at=NOW()
WHERE question_code='GQCM0675';

-- Descriptions de « décomposition » trop larges (type ENUM inchangé)
UPDATE gl_species_interactions si
  JOIN gl_species s ON s.id = si.from_species_id
SET si.description='Nécrophagie : consommation de cadavres, distincte de la minéralisation par champignons et microbes.'
WHERE si.interaction_type='decomposition'
  AND (
    s.nom_commun LIKE '%renard%' OR s.nom_commun LIKE '%sanglier%' OR s.nom_commun LIKE '%hyène%'
    OR s.nom_commun LIKE '%hyene%' OR s.nom_commun LIKE '%loup%' OR s.nom_commun LIKE '%chacal%'
    OR s.nom_commun LIKE '%ours%' OR s.nom_commun LIKE '%vautour%'
  );
