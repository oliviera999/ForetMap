# Prompt Claude Code (Opus) — Assouplir le profil collège : réseau multi-espèces, fiches repliées, quatre membres, Visite en cycle 4, questions cycle 3

> Établi le 22/11/2026 : prod **v1.263.0**, schéma **387** (dernière migration : `387_users_pedago_content_level.sql`).
> Sources : `claude/audit_restrictions_cycle3_2026-11-22.md` et `claude/lot4_quiz_cycle3_environnement_ravageurs.md` (projet). **Décisions d'Oliv du 22/11** au § 2.
> Une seule session, découpée en lots commités et poussés un par un. À coller tel quel dans Claude Code, avec le fichier du lot 4 joint ou déposé sur la branche.

---

## 1. Rôle, cadre, interdits

Tu interviens sur ForêtMap (`oliviera999/ForetMap`) en développeur senior, expert pédagogique du collège et biologiste. Réponds, commente et documente **en français**. Applique `CLAUDE.md` et `.cursor/rules/` : SQL paramétré, logger Pino, tests dans le même commit que le code, sources uniques (`src/shared/enums/`, `lib/shared/` par `npm run sync:shared-cores`, tests anti-littéraux), styles par tokens, cibles tactiles ≥ 44 px, `.fm-table`, **ne touche pas au champ `version`**, aucune dépendance nouvelle.

Migrations : idempotentes, rejouées **deux fois** sur copie fraîche (zéro erreur, zéro doublon), `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci` en tête, `NOT EXISTS` plutôt que compter sur UNIQUE, `<=>` pour les NULL, gardes sur l'ancienne valeur (`WHERE colonne <=> 'avant'`) pour ne jamais écraser une modification faite dans l'application, vues en `SQL SECURITY INVOKER`, aucun `DEFINER`, **aucun trigger**, aucun `DROP`.

Rédaction (textes de séance, libellés) : jamais d'invitation à cueillir, goûter, toucher, frotter ou manipuler ; aucun fait propre au site inventé ; tutoiement pour l'élève, registre fin ; typographie française (espaces insécables avant `; : ! ?` et dans « »).

**Autorisé sans attendre** : commits, poussée de ta branche, PR **en brouillon** vers `main`, lectures en production par le connecteur (`foretmap_sql_select`, outils `get` / `list`).

**Jamais** : poussée ou fusion sur `main` (release automatique) ; écriture en production par quelque moyen que ce soit (API, connecteur, SQL, `foretmap_ops`) ; déploiement ; réécriture d'historique partagé. **Point d'arrêt** : si une étape semble exiger l'une de ces actions, arrête-toi et demande.

Dépôt public : aucun livrable décrivant une faille de sécurité.

---

## 2. Décisions validées par Oliv (22/11/2026)

1. **Réseau trophique, espèces hors de la carte active** : montrées **grisées et cliquables** (plus jamais retirées au collège), avec la mention « vit ailleurs : <cartes> ».
2. **Sélection de plusieurs espèces** au collège, au lieu d'une seule espèce de départ : on **ajoute et retire d'un simple clic**.
3. **Clic simple sur une espèce du graphe (collège)** : ouvre un **petit panneau** avec deux boutons, « Ajouter à la sélection » / « Retirer de la sélection » et « Voir la fiche ».
4. **Fiche espèce au collège** : les sections complètes (Identité, Écologie et usages) reviennent, **repliées** ; elles ne sont plus masquées.
5. **Groupes emboîtés** : la boîte « quatre membres » (clade `tetrapodes`) est **rétablie** au collège, même si l'arbre passe à 5 niveaux depuis la racine.
6. **Visite sans compte** : palier **cycle 4** (parents et institutionnels), et non plus cycle 3.
7. **Présences confirmées** : sur n3, abeille domestique (28), pucerons (59), mineuse de la tomate (329), escargot petit-gris (89), escargot espagnol (823) ; sur foret, abeille domestique (28) (la carte a des ruches).
8. **Mutualisme** : montré au collège à partir du **cycle 4**, comme la symbiose et la compétition.
9. **Quiz** : `environnement_durable` et `ravageurs_auxiliaires` reçoivent **20 nouvelles questions de cycle 3** (QF9934 à QF9953, fichier du lot 4), plutôt qu'un retri des questions existantes.

Inchangé : lycée, université, vue gestion des profs, et tout ce qui est propre à G&L.

---

## 3. Gnomes & Licornes

`FoodWebGraph.jsx`, `FoodWebGraphElements.jsx`, `FoodWebGraphToolbar.jsx`, `foodWebGraphModel.js`, `foodWebGraphPrefs.js` et `foodWebGraphExport.js` sont **partagés avec G&L** (`src/gl/components/GLFoodWebPanel.jsx`). Tout nouveau comportement y entre **par une prop facultative dont la valeur par défaut reproduit le comportement actuel** (ex. `nodeClickMode = 'isolate'` par défaut, `'panel'` au collège). Les modules quiz partagés (`src/shared/qcm/`, `lib/qcmChoices.js`, `lib/qcmPresentationUse.js`) ne changent pas ; les nouvelles questions sont des données ForêtMap. Lance les suites G&L avant et après chaque lot qui touche un fichier partagé : **zéro régression**. Ne modifie ni `routes/gl/`, ni `src/gl/`, ni `lib/gl*`, ni les tables `gl_*`.

---

## 4. Lot 0 — Reconnaissance (aucun code)

1. Branche `feat/college-assouplissement` depuis `origin/main`. Journal `docs/coordination/college-assouplissement/journal.md` : après chaque lot, fait / reste / prochaine action exacte ; commit **et** poussée.
2. Vérifie l'état : `foretmap_db_status` et `foretmap_ops deploy_status` (schéma attendu 387). Relève la dernière migration sur `main` **et** dans les branches et PR ouvertes ; réserve le premier numéro libre au-delà (`N`, probablement 388) pour la migration de données du lot 6. Vérifie aussi que les codes **QF9934 à QF9953** sont libres en production (toutes valeurs de `statut`) ; sinon, décale la plage et note-le.
3. Lis et résume dans le journal (pas dans la conversation ; délègue les lectures larges à un sous-agent Explore) : `src/shared/pedagoVisibilityCore.js` (+ miroir), `src/utils/biodivPedagoLevel.js`, `src/contexts/BiodivPedagoContext.jsx`, `src/utils/learnerLevel.js` et `lib/pedago/learnerLevel.js`, `src/hooks/useFoodWebProfile.js`, `src/components/pedago/foodWebProfileModel.js`, `FoodWebView.jsx`, `FoodWebStartPicker.jsx`, `useFoodWebStartSpecies.js`, `FoodWebGraph.jsx` (gestion du clic, du focus, de `outOfScope`), `routes/food-web.js`, `lib/biodiv/presenceService.js`, `src/constants/plantMetaSections.js`, `PlantMetaSections.jsx`, `PlantCatalogPreview.jsx`, `PlantSummaryBlocks.jsx`, `lib/clades.js`, `NestedGroupsView.jsx`, `lib/shared/pedagoStepActions.js`, le module MCP de `foretmap_pedago_sessions`, une migration récente qui insère des questions de quiz et des liens `resource_question_links` (ex. `375_contenus_terrain_2026_11_20.sql`), les tests existants de ces zones.
4. Mesure de référence (à rejouer au lot 7), par le connecteur en lecture, avec la définition de présence de `presenceService` : pour chaque carte, nombre de liens et d'espèces avec au moins un lien visible au profil cycle 3 ; nombre de questions collège actives de palier 1 par catégorie.

---

## 5. Lot 1 — Périmètre du réseau : marquer, ne plus masquer

**Serveur** (`routes/food-web.js`) :
1. Les fiches dont `entity_kind` vaut `ressource`, `consortium` ou `groupe_fonctionnel` sont **toujours dans le périmètre** d'une carte ou d'une zone, comme l'extrémité « environnement » (`to_id` nul) : elles ne sont jamais rattachées à une carte (compost, litière, bois mort, biofilm, plancton…). Calcul dans la requête (sous-requête sur `plants.entity_kind`), sans modifier la vue `v_food_web` si possible. Si une modification de vue s'impose : migration `SQL SECURITY INVOKER`, sans `DEFINER`.
2. Pour chaque extrémité hors périmètre, renvoyer `from_elsewhere` / `to_elsewhere` : liste des cartes (id et nom) où l'espèce est présente (même service de présence), vide si aucune. Requête unique, sans N+1 ; vérifie le coût sur la plus grosse carte (dayat, ~790 liens).
3. Tests de route : une ressource liée est dans le périmètre ; `*_elsewhere` correct ; carte sans espèce.

**Client** :
4. Table de visibilité : `foodweb_offmap_species` passe à `show` au collège. **Retire** `hideOffMap` de `foodWebProfile` / `filterItemsForProfile` (code mort ensuite) ; le marquage `outOfScope` existant du graphe fait le grisé.
5. Mention « vit ailleurs : Sablettes, Daya… » (ou « n'est rattachée à aucune carte » si la liste est vide) : infobulle et texte accessible du nœud, panneau du lot 2, liste des liens (vue « Liste »).
6. Supprime `SeedNotice` dans sa forme « relations non montrées à ton niveau, sur cette carte » quand la cause était le hors carte ; garde un message pour le vrai cas « aucune relation enregistrée ».

**Critères** : en cycle 3 sur n3, le ver de compost (49) montre ses liens vers le compost, la litière, les fruits tombés, etc. ; la courgette (6) montre l'abeille domestique (après le lot 6 en base de test, ou grisée avant) ; aucune espèce hors carte n'est retirée au collège.

---

## 6. Lot 2 — Sélection de plusieurs espèces au collège

Remplace le modèle « une espèce de départ » (`FoodWebStartPicker`, `pickSeed`) par une **sélection** :

1. **État** : `selection` = liste ordonnée d'identifiants (hook dédié `useFoodWebSelection`, testé) avec `toggle(id)`, `add(id)`, `remove(id)`, `clear()`. Pré-remplie par la séance (`plantIds`, `highlightPlantId`) ou par « Voir le réseau » d'une fiche ; **toujours modifiable** par l'élève. Conservée au changement de carte (les espèces absentes de la nouvelle carte restent, grisées). Mémoire de session légère par carte (`sessionStorage`, lectures et écritures dans `try/catch`).
2. **Choix initial** (graphe vide) : liste de puces à bascule, un clic ajoute ou retire. Espèces phares de la carte d'abord, puis recherche (nom, sans accents). Candidats calculés sur les liens **filtrés par profil mais avant le cadrage** (correction de l'audit : pollinisateurs et fleurs figuraient seulement après un changement de cadrage). Une espèce sans aucun lien reste trouvable par la recherche, avec la mention « aucune relation enregistrée ».
3. **Barre de sélection** au-dessus du graphe et de la liste : une puce par espèce (emoji, nom, bouton « Retirer » × accessible, nom lu par le lecteur d'écran), bouton « Tout retirer », champ « Ajouter une espèce » (même recherche). Le graphe se recompose à chaque changement, sans bouton « Valider ».
4. **Profondeur** : 0 « Seulement les liens entre mes espèces » (proposée dès 2 espèces), 1 « Leurs voisins directs » (défaut pour une espèce), 2 « La chaîne autour ». Défaut : 1 pour une espèce, 0 pour plusieurs si elles ont des liens mutuels, sinon 1. `itemsAroundSeeds` sert tel quel.
5. **Clic sur un nœud (collège)** : ouvre un **petit panneau** ancré au nœud (popover accessible : focus piégé, Échap ferme, retour du focus au nœud), avec emoji, nom, étiquette simple (`usage_label`), mention « vit ailleurs : … » si grisé, et deux boutons : « Ajouter à la sélection » / « Retirer de la sélection » (libellé selon l'état) et « Voir la fiche ». Clavier : Entrée ouvre le panneau. Dans `FoodWebGraph`, par la prop `nodeClickMode: 'isolate' | 'panel'` (défaut `'isolate'` : lycée et G&L inchangés). Sur mobile, le panneau s'affiche en feuille basse.
6. Les espèces grisées (hors carte) se sélectionnent comme les autres.
7. **Refacto** : `FoodWebStartPicker` devient `FoodWebSelectionPicker` (ou équivalent), `useFoodWebStartSpecies` est fusionné dans le hook de sélection ; `FoodWebView.jsx` reste sous 400 lignes ; logique pure dans `foodWebProfileModel.js` (ou un module `foodWebSelectionModel.js`), testée en Node.

**Critères** : en 6e, on compose « tilapia + tomate + Nitrosomonas » en trois clics, on en retire une d'un clic, depuis la liste comme depuis le graphe ; aucune régression du réseau lycée (Ctrl/⌘ + clic, « Isoler », export PNG/SVG) ni de G&L.

---

## 7. Lot 3 — Cadrage, types, « Pour aller plus loin », séances

1. **Cadrage par défaut au collège : « Tout »** (dans les types du palier). Lycée : inchangé (« Réseau alimentaire »).
2. **Étape de séance `open_foodweb`** : nouveau champ facultatif `preset` (`alimentaire` | `relations` | `all`), validé dans `lib/shared/pedagoStepActions.js`, pris en compte par le contexte de séance, exposé par l'outil MCP `foretmap_pedago_sessions` et documenté dans `docs/API.md` et `docs/MCP.md`.
3. **Énumérations** (`src/shared/enums/biodivEnums.js`, miroir lib) :
   - `mycophagie` entre dans `COLLEGE_INTERACTION_TYPE_ENUM`, libellé simple « mange des champignons » ;
   - `mutualisme` entre dans `COLLEGE_INTERACTION_TYPE_ENUM` **et** dans `CYCLE4_ONLY_INTERACTION_TYPE_ENUM` (décision 8), libellé simple « s'entraident » (mot savant en second, comme les autres). La pollinisation reste visible dès le cycle 3. Mets à jour les tests de la table de visibilité et de `foodWebTypesForPedagoLevel` (6e : sans mutualisme ; 3e : avec).
4. **Barrière douce** : bouton « Pour aller plus loin » dans la barre du réseau au collège. Activé, il montre le réseau complet de la carte (tous types, sélection facultative, comme au lycée) ; « Revenir au réseau simplifié » restaure l'état d'avant. Rien n'est caché définitivement. Clé de visibilité éventuelle dans `pedagoVisibilityCore.js` (pas de test de niveau en dur dans les composants).
5. **« Voir le réseau trophique » depuis une fiche** : ouvre une carte où l'espèce est présente (carte active si elle y est, sinon la première de ses cartes, sinon « Toutes les cartes ») et pré-sélectionne l'espèce.
6. **Textes de séances** (migration du lot 6, gardes sur l'ancienne forme exacte du JSON) :
   - `6e-sol-de-n3`, étape `s3` : consigne réécrite pour la sélection (« Ajoute ton animal à la sélection, puis regarde ce qu'il mange et qui le mange »), export PNG conservé ;
   - `6e-biodiversite-deux-lieux`, étapes `b2` et `b3` : « Affiche ensuite tout le réseau » → « Touche ensuite « Pour aller plus loin » pour voir tout le réseau » ;
   - `6e-pollinisation`, étape `f3` : `preset: 'relations'` ; `6e-regimes-alimentaires` et `6e-sol-de-n3` : `preset: 'alimentaire'`.

---

## 8. Lot 4 — Fiche espèce au collège : sections complètes repliées

1. Table de visibilité : `meta_sections` passe de `hide` à `collapsed` au collège (lycée : comportement actuel). `PlantMetaSections` rend les sections Identité et Écologie et usages **repliées** (`<details>` fermé) quand la valeur est `collapsed`. Les jauges et la pastille Nutrition de l'en-tête restent masquées au collège : leurs valeurs sont dans la section repliée.
2. Le **nom scientifique** reste hors de l'en-tête au collège mais figure dans la section Identité repliée (vérifie qu'il y est bien rendu).
3. **Description** : quand `description_college` existe, elle s'affiche en premier ; la description complète suit dans un bloc replié « Description complète ».
4. **Interactions de la fiche** (`PlantPedagoFetchedSections`) : libellés du profil (`typeLabel` / `interactionTypeLabelSimple` au collège, `interactionTypeLabel` ailleurs) au lieu des codes bruts, pour tous les profils.
5. Tests : rendu aux profils 6e, 3e et 2de ; aucune section masquée au collège ; libellés.

---

## 9. Lot 5 — Visite sans compte en cycle 4

1. `resolveLearnerLevel` (front `src/utils/learnerLevel.js` **et** serveur `lib/pedago/learnerLevel.js`, parité testée) : l'invité reçoit `niveau: 'cycle4'` (étape `college`). Conséquences attendues, à vérifier par tests : glossaire `base` + `approfondissement`, questions de palier 2 éligibles, symbiose, compétition et mutualisme visibles ; affichage collège simplifié inchangé.
2. Mets à jour les commentaires de `pedagoVisibilityCore.js` (« Visite sans compte, élève sans classe… → cycle 3 ») : l'élève sans classe et le compte personnel sans groupe restent en cycle 3 ; seul l'invité change.
3. Tests : palier de l'invité, parité front / serveur, Visite rendue au palier 4.

---

## 10. Lot 6 — Migration de données `N_college_assouplissement.sql`

Données uniquement, idempotente, deux passes sur base fraîche **et** sur une base chargée d'un dump anonymisé récent (demande-le à Oliv si tu n'en as pas ; ne le génère pas toi-même en prod).

1. **Clade `tetrapodes`** : `visible_college = 1`, `label_simple = 'Animaux à quatre membres'`, `attribute_simple = 'Squelette à l''intérieur du corps et quatre membres : pattes, ailes ou nageoires charnues'` ; gardes `visible_college <=> 0`, `label_simple <=> NULL`. Mets à jour le contrôle de profondeur (≤ 4 → ≤ 5 depuis la racine) dans les tests de contenu et la doc de D2 ; vérifie que `collapseForProfile` range bien pipistrelle (320), rougequeue (850) et hémidactyle (840) dans « Animaux à quatre membres » et le tilapia (22) dans « Vertébrés », ce qu'attend la séance `6e-grands-groupes`.
2. **Présences** (décision 7) : lignes `map_species` insérées seulement si absentes (`NOT EXISTS`), `validation_status = 'confirme_site'`, `is_featured = 0` :
   - `map_id = 'n3'`, `plant_id ∈ {28, 59, 329, 89, 823}` ;
   - `map_id = 'foret'`, `plant_id = 28`.
   Ne touche pas aux lignes existantes des autres cartes.
3. **Textes et `preset` des séances** du lot 3 (§ 7.6) : remplacement exact gardé par l'ancienne valeur (`JSON_EXTRACT` ou empreinte `SHA2` de `steps_json`), sans réécrire une séance modifiée entre-temps (journalise un avertissement à la place).
4. **QF9877** (séance `6e-eau-de-nos-lieux`) : notion `C3-ENV` en `ajout` dans `quiz_question_notions` (le bilan d'eau de la daya relève du peuplement des milieux) ; vérifie ensuite que son palier d'entrée vaut 1.
5. **Glossaire** : « matière organique » → `base` (garde `<=> 'approfondissement'`) : notion C3-MAT du cycle 3.
6. **20 nouvelles questions** (décision 9) :
   - copie le bloc JSON du fichier `lot4_quiz_cycle3_environnement_ravageurs.md` dans `data/college-assouplissement/lot4_quiz.json` (source unique), **sans le réécrire** ;
   - script `scripts/college-assouplissement/build-lot4-migration.js` qui contrôle chaque question (4 choix, bonne réponse ≤ 110 % du plus long distracteur, `feedback_<bonne lettre>` à `NULL`, un retour par distracteur, caractères attendus, notions existantes dans `curriculum_notions`, fiches existantes), **convertit les espaces avant `; : ! ?` et à l'intérieur des « » en espaces insécables** comme le reste du corpus, puis génère la partie SQL de la migration ;
   - `quiz_questions` : `INSERT … SELECT … WHERE NOT EXISTS` par `question_code`, `statut = 'actif'`, `niveau = 'college'`, `numero_dans_categorie` selon la convention constatée (partie numérique du code) en vérifiant l'unicité `(categorie_slug, numero_dans_categorie)` ;
   - `quiz_question_notions` : `notions_ajout` en `mode = 'ajout'`, `notions_exclusion` en `mode = 'exclusion'`, gardés par `NOT EXISTS` ;
   - `fiches_liees` : liens **non bloquants** dans `resource_question_links` (`resource_type = 'plant'`, `is_gating = 0`, statut approuvé, origine selon la convention de la migration de référence relevée au lot 0). Si la convention du dépôt interdit ces insertions en migration, ne les écris pas et liste-les dans la PR pour un `POST /api/learning-links` après déploiement ;
   - vérifie après migration que les 20 questions ont un palier d'entrée 1.
7. Tests de contenu (`tests/content/`) : clade et présences ; plus aucune question citée par une séance cycle 3 au palier 2 ; « matière organique » en `base` ; les 20 questions présentes, conformes aux règles du quiz et de palier 1 ; répartition des bonnes réponses du lot (A 3, B 5, C 6, D 6).

---

## 11. Lot 7 — Refactorisation, documentation, vérification

1. **Refacto** : une seule notion de « périmètre » (ressources et extrémité environnement comprises) partagée par la route, `foodWebGraphModel` et le modèle de sélection ; suppression du code mort (`hideOffMap`, ancien `SeedNotice`, `START_SPECIES_LIST_MAX` s'il ne sert plus) ; `FoodWebGraph.jsx` (1 600 lignes) : extrais au moins la gestion du clic de nœud et le panneau dans des modules dédiés. Signale dans la PR la dette repérée hors périmètre sans la traiter.
2. **Documentation** : `docs/` section « Profil collège et paliers » (hors carte grisé, sélection, panneau, « Pour aller plus loin », mutualisme au cycle 4, Visite en cycle 4), `docs/API.md` (champs `*_elsewhere`, `preset`), `docs/MCP.md`, `changelog.d/college-assouplissement.md`.
3. **Suite complète** : lint, format, tests ForêtMap **et** G&L, `test:content`, `test:ui`, `build`, e2e concernés ; migration rejouée deux fois.
4. **Mesure** : rejoue la mesure du lot 0 et mets le tableau avant / après dans la PR (liens et espèces visibles en cycle 3 par carte ; questions de palier 1 par catégorie).
5. **Vérification indépendante** : sous-agent qui n'a pas vu le travail, sur l'application démarrée avec la base de test (dump anonymisé + migration), comptes 6e, 3e, 2de et Visite sans compte, captures Playwright :
   - `6e-sol-de-n3` : le ver de compost a des liens visibles ;
   - `6e-pollinisation` : l'abeille domestique pollinise la courgette, cadrage « Autres relations » appliqué par la séance ;
   - `6e-regimes-alimentaires` : tilapia (biofilm, élodée), caragouille, ténébrion : liens visibles, grisés si hors carte ;
   - sélection : ajouter trois espèces, en retirer une, par la liste et par le panneau du graphe ;
   - « Pour aller plus loin » et retour ; mutualisme absent en 6e, présent en 3e ;
   - fiche : sections Identité et Écologie présentes et repliées, cycle de vie et habitat lisibles (tomate 3, ail 63, lentisque 579) ; description complète accessible sous la description collège ;
   - groupes emboîtés : boîte « Animaux à quatre membres » ;
   - quiz en 6e : catégories `environnement_durable` et `ravageurs_auxiliaires` proposées, questions QF9934 à QF9953 tirées ;
   - Visite : palier 4 ;
   - 2de : réseau et fiche identiques à l'actuel ; G&L : parcours e2e inchangés.
   Corrige ce qui échoue, puis relance.
6. **PR vers `main`, en brouillon** : résumé par lot, migration (numéro), tableau avant / après, résultats de la vérification, écarts au prompt, points ouverts. **Oliv relit et fusionne lui-même.**

---

## 12. Points ouverts pour Oliv (dans la PR, sans bloquer)

1. **Glossaire** : « réseau trophique » (nom de l'onglet), « détritivore », « nom scientifique », « tétrapode » sont en `approfondissement` ; à repasser en `base` ?
2. **Niveau des groupes** : 33 groupes sans `curriculum_niveau`, à renseigner dans l'application (liste transmise à Oliv le 22/11).
3. **73 fiches sans carte** (71 taxons, 2 consortiums) : à rattacher ou à assumer.
4. Questions collège existantes de `ravageurs_auxiliaires` manifestement de cycle 3 (coccinelle, syrphe, carabe, crapaud, hérisson…) : notion C3-ENV à leur ajouter plus tard ?
