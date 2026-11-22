# Rapport de vérification indépendante : affichage collège simplifié

- **Date** : 22/11/2026.
- **Instance** : http://127.0.0.1:3209, build de production v1.260.0, base `foretmap_test_si_snap`. La base a seulement été lue (SELECT en session `READ ONLY`). Le serveur n'a pas été redémarré.
- **Comptes** : `verif6e` (cycle 3), `verif3e` (cycle 4), `verif2de` (seconde), et la Visite sans compte (bouton « Découvrir le lieu » de l'accueil).
- **Méthode** : Playwright (Chromium), en viewport téléphone 390×844 avec deviceScaleFactor 1. J'ai complété par des appels d'API en `Bearer` et par la lecture du code. Les scripts sont dans le scratchpad de session (`verif/`).

À la connexion, l'API renvoie : `verif6e` → `biodivGroupCurriculumNiveaux: ["cycle3"]`, `verif3e` → `["cycle4"]`, `verif2de` → `["seconde"]`. Les trois comptes ont le rôle « visiteur » et aucune permission.

## Tableau des verdicts

| #   | Point                                                                            | 6e                                        | 3e                  | 2de                   | Visite sans compte                                              |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------- | ------------------- | --------------------- | --------------------------------------------------------------- |
| 1   | Catalogue : groupes, espèces phares en tête, aucun libellé savant                | **ÉCHEC** (partiel)                       | **ÉCHEC** (partiel) | OK (ancien catalogue) | NON VÉRIFIABLE                                                  |
| 2   | Fiche : étiquette simple, groupe d'usage, sans jauges ni sections savantes       | OK                                        | OK                  | OK (fiche complète)   | NON VÉRIFIABLE                                                  |
| 3   | Réseau : espèce de départ, rien hors carte, frugivorie 6e, symbiose 3e seulement | OK                                        | OK (avec réserve)   | OK (réseau complet)   | sans objet (pas d'onglet Réseau)                                |
| 4   | Glossaire : palier par défaut, « Pour aller plus loin », auto-liens              | OK                                        | OK                  | OK (sans barrière)    | NON VÉRIFIABLE                                                  |
| 5   | Quiz : éligibilité par palier (tirage, catégories, verrouillage)                 | **ÉCHEC** sur le verrouillage (tirage OK) | OK                  | OK                    | NON VÉRIFIABLE (pas d'onglet Quiz)                              |
| 6   | Groupes emboîtés : 4 niveaux au plus au collège                                  | OK (4)                                    | OK (4)              | OK (9, arbre complet) | sans objet                                                      |
| 7   | 2de identique à l'ancien affichage                                               | —                                         | —                   | OK                    | —                                                               |
| 8   | Visite = collège (cycle 3)                                                       | —                                         | —                   | —                     | NON VÉRIFIABLE dans l'interface (vérifié par le code seulement) |

## Détail par point

### 1. Catalogue des espèces

**Ce qui marche (6e et 3e)**

- Le catalogue est rangé par groupe d'usage : « 157 êtres vivants en 17 groupes — ouvre un groupe pour le parcourir ».
- Les groupes portent des libellés simples (« Algues brunes et leurs cousins », « Araignées, scorpions, acariens », « Insectes »…). Le filtre « Groupe » n'affiche aucun libellé savant. Captures : `01-verif6e-catalogue.png`, `02-verif3e-catalogue.png`.
- Les espèces phares sont en tête de chaque groupe. Elles correspondent à `is_featured` de `GET /api/maps/foret/species` (17 espèces phares). Exemples :
  - Insectes : Belle-Dame, Coccinelle des friches, Éristale gluant, Libellule écarlate, Machaon, Xylocope violet, puis l'ordre alphabétique (`01b-verif6e-catalogue-insectes.png`, `02b-verif3e-catalogue-insectes.png`) ;
  - Oiseaux : Bulbul, Chardonneret, Moineau ;
  - Plantes à fleurs : Basilic, Laiteron, Mauve, Pourpier.

**Échec (6e et 3e)** : les vignettes du catalogue affichent le **nom scientifique latin**, y compris des familles latines, et la **description savante**. Elles n'utilisent ni l'étiquette simple ni la description collège.

- Familles latines vues dans le catalogue d'un 6e, une fois tous les groupes dépliés :
  - noms en _-idae_ : `Lycosidae` (Lycoses), `Trombidiidae` (Trombidions), `Cyclopidae` (Cyclopes), `Limacidae` (Limace), `Aphididae` (Pucerons) ;
  - autre famille latine : `Cactaceae` (Cactus) ;
  - autres noms latins : `Opiliones`, `Ocimum basilicum`, etc.
- Familles en « -idés » et vocabulaire savant présents dans les descriptions affichées :
  - « Fiche de famille (**Limacidés**)… » (Limace) ;
  - « de la famille des **ténébrionidés** » (Blaps) ;
  - « **Gastéropode** terrestre » (Escargot petit-gris) ;
  - « **Arachnide** au petit corps… » (Faucheux) ;
  - « **Coléoptère** rouge… » (Coccinelle à sept points).
- Exemple Basilic : la vignette montre « Ocimum basilicum » et la description longue. La fiche, elle, montre « une herbe aromatique du potager » et la description collège. Les deux sont donc incohérentes.
- La 3e affiche exactement les mêmes vignettes que la 6e.
- Captures : `01c-verif6e-vignette-Lycoses.png`, `01e-verif6e-vignette-Basilic.png`, `01d-verif6e-vignette-Coccinelle_des_friches.png`, `02c-verif3e-vignette-Coccinelle_des_friches.png`.
- **Reproduction** : se connecter en `verif6e`, aller dans Biodiversité, déplier « Araignées, scorpions, acariens », puis lire la vignette « Lycoses ».
- **Fichier source probable** : `src/components/biodiv/PlantCatalogTile.jsx`. Lignes 65-66 : `scientific = plant.scientific_name` et `description = plant.description`, rendus sans condition (span `biodiv-tile__scientific`, puis `p.biodiv-tile__desc`). Ce composant ne consulte pas `canShow('usage_label')`, `canShow('description_college')` ni aucune clé de la table de visibilité. `PlantCatalogPreview.jsx` (lignes 84-140) applique pourtant ces clés.
- Données : 644 espèces sur 650 ont un `usage_label`, 73 sur 650 ont une `description_college`. Pour les espèces sans description collège, le texte savant reste à traiter côté contenu.

**2de** : catalogue non groupé, comme avant (« 36 / 157 affichés (644 au catalogue) »). Il y a un filtre « Règne » aux libellés savants (« Végétal (Chlorobiontes) », « Animal (Métazoaires) »). Capture `03-verif2de-catalogue.png`.

**Observation (tous profils, hors périmètre)** : le menu « Carte » du catalogue affiche les identifiants techniques (`lyautey`, `n3`, `foret`, `beaulieu`…) et non les noms des cartes (`01-verif6e-catalogue.png`).

### 2. Fiche d'une espèce

**6e et 3e : OK.** Captures `04-verif6e-fiche-Basilic-a/b/c.png` et `05-verif3e-fiche-Basilic-a/b/c.png`.

- Sous le nom, l'étiquette simple « une herbe aromatique du potager » et la description collège.
- Une rubrique « GROUPE : Plantes à fleurs » et un fil réduit « Êtres vivants › Plantes terrestres › Plantes à fleurs ».
- Statut en mots : « Liste rouge : non évaluée ».
- Absents : nom latin, ligne Taxonomie, classification GBIF, section Identité, « Écologie et usages », jauges pH et température, pastille Nutrition.
- Remarque : le bouton « Pour aller plus loin » sous le fil des groupes déplie à la demande la chaîne savante complète (Eucaryotes, Chlorobiontes, embryophytes, angiospermes, Lamiacées), avec un retour « Revenir aux grands groupes » (`04-verif6e-fiche-Basilic-plusloin.png`). C'est un choix explicite de l'élève, pas l'affichage par défaut.
- **Observation** : la rubrique « QUESTIONS QUIZ LIÉES » de la fiche Basilic d'un 6e liste aussi QF0113 et QF0273 (lycée) et QF9260 (palier 2) ; voir le point 5.

**2de : OK, fiche complète comme avant.** Capture `06-verif2de-fiche-Basilic-a…f.png`. On y voit :

- le nom latin « Ocimum basilicum » ;
- les lignes TAXONOMIE (« Végétal (Chlorobiontes) › Angiosperme › Lamiacées › Ocimum ») et « Classification latine (GBIF) » ;
- « UICN NE », les jauges « PH OPTIMAL 6 – 7.5 » et « TEMPÉRATURE IDÉALE », la pastille Nutrition ;
- les sections Identité et « Écologie et usages ».

### 3. Réseau trophique

**6e : OK.** Le réseau ouvre sur « Choisis une espèce de départ », avec les espèces phares de la carte en tête et une recherche (`07-verif6e-reseau-accueil.png`).

- Départ Bulbul des jardins, carte Forêt comestible : seules ses 3 frugivories dans la carte s'affichent, avec le libellé « mange des fruits (frugivorie) » (Bananier, Lantanier, Papayer). Captures `08-verif6e-reseau-Bulbul_des_jardins-graphe.png` et `08b-…-liste.png`.
- Les 6 liens hors carte de `GET /api/food-web?mapId=foret` sont bien exclus : Épervier, Ficus, Figuier commun, Lierre, Mûrier, Poivre rose (`from_in_scope`/`to_in_scope = 0`).
- Départ Fève, « Toutes les cartes », cadrage « Tout » : ni symbiose ni compétition, ni dans le réseau ni dans le filtre « Type d'interaction ». Le filtre propose seulement : décomposition, détritivorie, frugivorie, granivorie, herbivorie, parasitisme, plante hôte, pollinisation, prédation (`10b-verif6e-reseau-F_ve-liste.png`).

**3e : OK, avec réserve.** Départ Fève, « Toutes les cartes », « Tout » : on voit « vit associée à (symbiose) » avec Rhizobium et « est en concurrence avec (compétition) » avec Oxalis pied-de-chèvre (`09b-verif3e-reseau-F_ve-liste.png`).

- **Réserve (contenu)** : dans la base, chaque lien de symbiose a son symbiote hors de la carte. Les liens concernés sont Mycorhizes à Glomus, Rhizobium et Blastophage, tous avec `from_in_scope = 0` sur `n3`, `dayat` et `melah`. Aucun lien de symbiose n'existe sur `foret`, `lyautey`, `sablettes` ni `beaulieu`.
- Conséquence : un 3e ne voit **jamais** de symbiose quand il choisit une carte précise. Sur N³ avec la Fève, la compétition apparaît mais pas la symbiose (`11b-verif3e-reseau-F_ve-liste.png`). La symbiose n'apparaît qu'avec « Toutes les cartes ».
- Le code se comporte comme prévu (règle « hors carte » puis règle de palier). Pour rendre la symbiose visible en 3e sur une carte, il faut rattacher les symbiotes aux cartes.

**2de : OK.** Le réseau complet s'affiche d'emblée, en graphe par niveaux, sans choix de départ (`12-verif2de-reseau-accueil.png`). La liste complète contient les espèces hors carte (Épervier : 7 occurrences, Ficus : 2), la symbiose (6) et la compétition (19) (`12b-verif2de-reseau-liste-complet.png`).

L'API `GET /api/food-web` renvoie la même chose (772 lignes sur `foret`) à tous les comptes et sans compte : le filtrage se fait côté client (`src/components/pedago/foodWebProfileModel.js`).

### 4. Glossaire

`GET /api/glossary/terms` contient 482 termes : 222 « base », 182 « approfondissement », 78 « avance ». La réponse est identique pour les trois comptes.

| Compte | Par défaut                                                                                                                        | Après « Pour aller plus loin »                                                             | Captures                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 6e     | « Termes (222) — 260 termes plus avancés sont rangés à part. » Les 222 termes listés sont tous « base » (comparaison avec l'API). | « Termes (482) — Tous les termes sont affichés », bouton « Revenir aux termes essentiels » | `13-verif6e-glossaire.png`, `13b-…-plus-loin.png` |
| 3e     | « Termes (404) — 78 termes plus avancés… » : 222 base + 182 approfondissement, aucun avancé                                       | 482 termes                                                                                 | `14-verif3e-glossaire.png`, `14b-…-plus-loin.png` |
| 2de    | « Termes (482) », pas de bouton « Pour aller plus loin » (pas de barrière)                                                        | —                                                                                          | `15-verif2de-glossaire.png`                       |

**Auto-liens** (attribut `data-glossary-code` dans les fiches, comparé au niveau du terme dans l'API) :

- 6e : 85 liens relevés sur 10 fiches, **tous « base »**. Sur Belle-Dame, « biomasse » (avancé) n'est pas lié ; sur Éristale, « généraliste » (avancé) et « matière organique » (approfondissement) ne le sont pas.
- 3e : base et approfondissement seulement, par exemple « populations », « parasitoïdes », « lutte biologique », « zoochorie », « matière organique ». **Aucun avancé** : « biomasse » et « généraliste » ne sont pas liés.
- 2de : les trois profondeurs, dont « biomasse » et « généraliste » (avancés).
- Captures : `16-verif6e-autoliens-*.png`, `17-verif3e-autoliens-*.png`, `18-verif2de-autoliens-*.png`, `19-*-autoliens-Belle_Dame.png`.
- Fenêtre de définition : au collège, la définition courte s'affiche d'abord, avec un bouton « Lire la définition complète » (`28-verif6e-popover-Pr_dateur.png`). En 2de, la définition complète s'affiche directement (`29-verif2de-popover-Pr_dateur.png`).

### 5. Quiz

**Ce qu'envoie l'interface** (requêtes observées dans Playwright) :

- 6e : `GET /api/quiz/categories?niveau=college&palierMax=1`, puis au tirage `GET /api/quiz/draw?niveau=college&palierMax=1` ;
- 3e : les mêmes requêtes avec `palierMax=2` ;
- 2de : `GET /api/quiz/categories` et `GET /api/quiz/draw?` sans paramètre.
- Captures `20-…`, `21-…`, `22-*-quiz-accueil.png` et `*b-*-quiz-question.png`.

**Contrôles de l'API**

- `categories?palierMax=1` et `=2` renvoient des compteurs par catégorie (« Le vivant et sa classification » : 33 au palier 1, 38 au palier 2). `palierMax=0` et `palierMax=abc` renvoient `400 {"error":"palierMax invalide"}`.
- Tirages comparés au palier d'entrée effectif calculé en base par `quizQuestionEntryPalierSql`. Les questions actives se répartissent ainsi : collège palier 1 : 330, collège palier 2 : 152, lycée palier 3 : 255.

  | Tirages                                     | Résultat                                         |
  | ------------------------------------------- | ------------------------------------------------ |
  | 80 × `draw?niveau=college&palierMax=1` (6e) | 80 questions de palier 1                         |
  | 60 × `draw?palierMax=1`                     | 60 questions de palier 1                         |
  | 80 × `draw?niveau=college&palierMax=2` (3e) | 48 de palier 1 + 32 de palier 2, aucune de lycée |

  Le tirage est donc **OK**.

- `GET /api/quiz/questions?palierMax=1` ignore le paramètre et renvoie 737 questions, dont 255 de lycée. Ce n'est pas utilisé par l'interface élève du quiz ; c'est à signaler si le catalogue public est censé suivre le palier.

**Verrouillage des fiches : ÉCHEC pour la 6e au regard du critère « aucune question de palier 2 ne verrouille une fiche pour la 6e ».**

- Ce n'est pas observable en direct : le verrouillage est désactivé sur cette instance. `GET /api/learning/gating/challenge?resourceType=plant&resourceRef=4` et `…tutorial…7` renvoient `{"gating_enabled":false,"mode":"off",…}`, et `summary` renvoie `mode:"off"` pour toutes les fiches.
- J'ai donc simulé : la vraie fonction serveur `filterGatingLinksByLevel` (`lib/pedago/eligibility.js`) a reçu les 212 liens réels `resource_question_links` et les paliers d'entrée calculés en base, avec le niveau `resolveLearnerLevel` de chaque profil :
  - **6e (cycle 3)** : 38 fiches sans repli, **29 fiches en repli `college_levels` verrouillées par des questions de palier 2**, 4 fiches non verrouillées (lycée seul). Exemples :
    - plante 4 (Basilic) → QF9260 (p2), ses deux autres questions étant de lycée ;
    - plante 12 → QF0003 (p2) ;
    - plante 129 → QF9251 (p2) ;
    - plante 131 → QF9217 (p2).
  - **3e (cycle 4)** : 0 question de lycée retenue ; 4 fiches gardées seulement par du lycée sont non verrouillées. **OK.**
  - **2de** : aucun filtre. **OK.**
  - **Visite sans compte** : mêmes résultats que la 6e (plafond 1 par la règle de palier, 29 replis `college_levels`). Un invité ne peut de toute façon pas valider (`LOGIN_REQUIRED`).
- **Cause** : `lib/pedago/eligibility.js`, lignes 96-105. Quand aucune question n'est au palier de l'élève, le repli collégien garde les questions de palier ≤ `COLLEGE_MAX_PALIER` (2). C'est conforme au prompt `prompts/C6.md` § 2 et à `docs/API.md` (« jamais au-delà du cycle 4 ») ; c'est le critère de vérification qui demande autre chose. **Il faut arbitrer** : soit le critère est trop strict, soit le repli d'un élève de cycle 3 doit déverrouiller la fiche (comme le repli « lycée seul ») au lieu de poser du palier 2.
- Les tutoriels ne sont pas concernés : chacun a au moins une question de palier 1.

### 6. Groupes emboîtés

- 6e et 3e : 11 espèces choisies dans l'interface, puis « Construire avec la sélection ». L'arbre réduit a une **profondeur de 4** (mesurée par `--nested-depth`).
  - Libellés simples : Êtres vivants › Animaux › Vertébrés › Oiseaux, et Animaux à pattes articulées › Insectes / Araignées, scorpions, acariens.
  - Captures `23-verif6e-groupes-arbre.png` et `24-verif3e-groupes-arbre.png`.
  - « Pour aller plus loin » déplie l'arbre complet (profondeur 9) (`23b-…`, `24b-…-plus-loin.png`).
- API : 15 tirages de 30 espèces au hasard avec `POST /api/clades/activity/subtree` `{profile:"college"}` donnent une profondeur maximale de **4**. Sans profil, elle monte à 10. Aucun libellé savant dans l'arbre collège, hormis « Vertébrés » et « Mollusques », qui sont des mots du programme de collège.
- 2de : arbre complet d'emblée (Eucaryotes, Chlorobiontes, Opisthocontes, Bilatériens, Tétrapodes, Amniotes, Sauropsides…), profondeur 9, sans bouton (`25-verif2de-groupes-arbre.png`). **OK.**

### 7. 2de : affichage identique à l'ancien

**OK** sur tous les points vus :

- catalogue non groupé avec filtre « Règne » (`03`) ;
- fiche complète avec taxonomie, classification GBIF, jauges et Identité (`06`) ;
- réseau complet d'emblée avec les espèces hors carte (`12`, `12b`) ;
- glossaire de 482 termes sans barrière (`15`), auto-liens de toutes profondeurs (`18`, `19`) ;
- quiz sans `palierMax` (`22`) ;
- arbre complet (`25`).

Je n'ai pas comparé à une capture « d'avant » : le jugement repose sur l'absence des briques collège et la présence des sections historiques.

### 8. Visite sans compte

**NON VÉRIFIABLE dans l'interface.**

- La Visite sans compte ne propose que la carte : pas d'onglet Biodiversité, Réseau, Glossaire, Quiz ni Groupes. Les espèces n'y apparaissent que dans le panneau d'une zone ou d'un repère.
- Or `GET /api/visit/content?map_id=…` renvoie `zones: 0, markers: 0` pour **toutes** les cartes (`foret`, `n3`, `melah`, `sablettes`…) : la table `visit_zones` est vide dans l'instantané. La carte affiche « Aucune zone ni repère sur cette carte » (`26-visite-accueil.png`, `26-visite-carte-foret.png`, `27-visite-zone-aromatiques.png`, `27-visite-presentation.png`).
- Le panneau de biodiversité de la Visite (`VisitBiodiversityPanel`) ne peut donc pas s'ouvrir. Il faudrait une base avec `visit_zones` pour conclure.
- **Vérification par le code (pas par l'interface)** :
  - `UnauthenticatedShell.jsx:64` passe `isGuestVisit` à `BiodivPedagoProvider` ;
  - `resolveLearnerLevel({isGuest:true})` donne le profil d'affichage `college` (`catalog_grouped: show`, `meta_sections: hide`) et les règles de cycle 3 : `glossary_depth_max = base`, `quiz_entry_palier_max = 1`, `foodweb_types_cycle4_only = [symbiose, competition]`, comme la 6e.
  - Seule différence : `maxPalier` vaut 2 pour l'invité contre 1 pour la 6e, mais la règle de palier ramène le plafond à 1.

## Synthèse des échecs

1. **Vignettes du catalogue au collège** (6e et 3e) : nom latin, avec familles latines en _-idae_/_-aceae_, et description savante (« Limacidés », « ténébrionidés », « Gastéropode »…). L'étiquette simple et la description collège ne sont pas utilisées. Fichier : `src/components/biodiv/PlantCatalogTile.jsx`, lignes 64-66 et 97-104.
2. **Verrouillage en 6e** : au repli `college_levels`, 29 fiches seraient verrouillées par des questions de palier 2 si le verrouillage était activé. Fichier : `lib/pedago/eligibility.js`, lignes 96-105. Le comportement est conforme au prompt C6 mais contraire au critère : à arbitrer.

## Réserves et observations (non bloquantes)

- La symbiose n'est jamais visible en 3e sur une carte précise, car tous ses symbiotes sont hors carte. C'est un problème de données.
- La fiche d'un 6e liste en « Questions quiz liées » des questions de lycée et de palier 2.
- `GET /api/quiz/questions` ignore `palierMax`.
- Le menu « Carte » du catalogue affiche les identifiants techniques des cartes.
- La rubrique « Pour aller plus loin » de la fiche et des groupes révèle, à la demande, la classification savante complète. C'est voulu.

## Liste des captures (`docs/coordination/college-2026-11/captures/`)

| Fichier                                                                                                                    | Contenu                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `01-verif6e-catalogue.png`                                                                                                 | Catalogue 6e (groupes)                                      |
| `01b-verif6e-catalogue-insectes.png`                                                                                       | Groupe Insectes, espèces phares en tête, nom latin visible  |
| `01c-verif6e-vignette-Lycoses.png`                                                                                         | Vignette « Lycosidae »                                      |
| `01d-verif6e-vignette-Coccinelle_des_friches.png`                                                                          | Vignette avec nom latin et description longue               |
| `01e-verif6e-vignette-Basilic.png`                                                                                         | Vignette « Ocimum basilicum », description non collège      |
| `02-verif3e-catalogue.png`, `02b-verif3e-catalogue-insectes.png`, `02c-verif3e-vignette-Coccinelle_des_friches.png`        | Idem en 3e                                                  |
| `03-verif2de-catalogue.png`                                                                                                | Catalogue 2de non groupé, filtre Règne                      |
| `04-verif6e-fiche-Basilic-a/b/c.png`, `04-verif6e-fiche-Basilic-plusloin.png`                                              | Fiche 6e, puis fil complet à la demande                     |
| `05-verif3e-fiche-Basilic-a/b/c.png`, `05-verif3e-fiche-Basilic-plusloin.png`                                              | Fiche 3e                                                    |
| `06-verif2de-fiche-Basilic-a…f.png`                                                                                        | Fiche 2de complète                                          |
| `07-verif6e-reseau-accueil.png`                                                                                            | Choix de l'espèce de départ                                 |
| `08-verif6e-reseau-Bulbul_des_jardins-graphe.png`, `08b-…-liste.png`                                                       | Frugivorie en 6e, sans espèce hors carte                    |
| `09-verif3e-reseau-F_ve-graphe.png`, `09b-…-liste.png`                                                                     | 3e, Toutes les cartes : symbiose et compétition             |
| `10-verif6e-reseau-F_ve-graphe.png`, `10b-…-liste.png`                                                                     | 6e, Toutes les cartes : ni symbiose ni compétition          |
| `11-verif3e-reseau-F_ve-graphe.png`, `11b-…-liste.png`                                                                     | 3e, N³ : compétition, pas de symbiose (symbiote hors carte) |
| `12-verif2de-reseau-accueil.png`, `12b-verif2de-reseau-liste-complet.png`                                                  | Réseau complet 2de                                          |
| `13-verif6e-glossaire.png`, `13b-verif6e-glossaire-plus-loin.png`                                                          | Glossaire 6e : 222, puis 482                                |
| `14-verif3e-glossaire.png`, `14b-verif3e-glossaire-plus-loin.png`                                                          | Glossaire 3e : 404, puis 482                                |
| `15-verif2de-glossaire.png`                                                                                                | Glossaire 2de : 482                                         |
| `16-verif6e-autoliens-*.png`, `17-verif3e-autoliens-*.png`, `18-verif2de-autoliens-*.png`, `19-*-autoliens-Belle_Dame.png` | Auto-liens par palier                                       |
| `20-verif6e-quiz-accueil.png`, `20b-verif6e-quiz-question.png`                                                             | Quiz 6e                                                     |
| `21-verif3e-quiz-accueil.png`, `21b-verif3e-quiz-question.png`                                                             | Quiz 3e                                                     |
| `22-verif2de-quiz-accueil.png`, `22b-verif2de-quiz-question.png`                                                           | Quiz 2de                                                    |
| `23-verif6e-groupes-accueil.png`, `23-verif6e-groupes-arbre.png`, `23b-verif6e-groupes-plus-loin.png`                      | Groupes 6e : 4 niveaux, puis 9                              |
| `24-verif3e-groupes-*.png`                                                                                                 | Groupes 3e                                                  |
| `25-verif2de-groupes-accueil.png`, `25-verif2de-groupes-arbre.png`                                                         | Groupes 2de : 9 niveaux                                     |
| `26-visite-accueil.png`, `26-visite-carte-foret.png`, `27-visite-zone-aromatiques.png`, `27-visite-presentation.png`       | Visite sans compte : aucune zone                            |
| `28-verif6e-popover-Pr_dateur.png`, `29-verif2de-popover-Pr_dateur.png`                                                    | Fenêtre de définition collège et lycée                      |

## Contre-vérification du point 1 (catalogue), après rebuild

Contexte : le 22/11/2026, le serveur a été relancé sur la même base avec un nouveau build (`/api/version` donne toujours 1.260.0). Seul le point 1 a été refait, pour `verif6e`, `verif3e` et `verif2de`.

**Verdict : 6e OK, 3e OK, 2de OK (inchangé). L'échec n° 1 est levé.**

**6e et 3e (affichage identique)**

- Le catalogue est toujours rangé par groupe : « 157 êtres vivants en 17 groupes ».
- Les espèces phares restent en tête : le groupe Insectes commence par Belle-Dame, puis Coccinelle des friches.
- Chaque vignette affiche désormais l'**étiquette simple** à la place du nom latin, puis la **description collège** quand elle existe. Sinon, aucune description n'est affichée.

| Vignette               | Ce qui est affiché                                        |
| ---------------------- | --------------------------------------------------------- |
| Lycoses                | « des araignées chasseuses du sol »                       |
| Basilic                | « une herbe aromatique du potager » + description collège |
| Pucerons               | « des petits insectes suceurs des plantes »               |
| Limace                 | « une limace des jardins »                                |
| Blaps                  | « des scarabées noirs qui ne volent pas »                 |
| Coccinelle des friches | « une petite coccinelle orangée » + description collège   |

- J'ai déplié les 17 groupes et balayé tout le texte affiché :
  - **0** nom scientifique de `plants.scientific_name` ;
  - **0** mot en _-idés_, _-idae_ ou _-aceae_ ;
  - **0** terme de la liste savante (Chlorobiontes, Téléostéens, Gastéropode, Arachnide, Coléoptère…).
- Les termes « Limacidés », « ténébrionidés » et « Gastéropode » vus au premier passage n'apparaissent plus.

**2de**

- Le catalogue n'est pas groupé, comme avant : « 36 / 157 affichés (644 au catalogue) », avec le filtre « Règne ».
- Les vignettes gardent le nom latin et la description complète : Lycoses → « Lycosidae », Basilic → « Ocimum basilicum », Pucerons → « Aphididae », Limace → « Limacidae », Blaps → « Blaps sp. », Coccinelle → « Hippodamia variegata ».

**Captures**

| Compte | Catalogue                   | Vignettes, dans l'ordre Lycoses, Basilic, Pucerons, Limace, Blaps, Coccinelle des friches |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------- |
| 6e     | `30-verif6e-catalogue.png`  | `30b` à `30g-verif6e-vignette-*.png`                                                      |
| 3e     | `31-verif3e-catalogue.png`  | `31b` à `31g-verif3e-vignette-*.png`                                                      |
| 2de    | `32-verif2de-catalogue.png` | `32b` à `32g-verif2de-vignette-*.png`                                                     |

**Ce qui reste valable du premier passage**

- L'échec n° 2 (verrouillage en 6e par des questions de palier 2, au repli `college_levels`) n'a pas été re-testé et reste ouvert.
- Les réserves non bloquantes sont inchangées, notamment le menu « Carte » qui affiche les identifiants techniques.

> Note SI : seule une sélection de 18 captures est versionnée (les 89 captures et les scripts
> restent dans le bac à sable de la session SI) ; les noms cités ci-dessus et absents du
> dossier font partie des captures non versionnées.
