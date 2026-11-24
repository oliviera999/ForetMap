# Lot ecrans-7 — La table de jeu I : matières, tablette d'équipe, gemmes, typographie, barre

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge forte · banc : fumée
> Branche : `claude/gl-decisions-ecrans-7` · Attend : `ecrans-6`, `contenu-6` · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- L'écran devient une table de jeu : bois sous le plateau, parchemin, plaques de laiton, jetons de verre.
- La tablette d'équipe joue dans le cadre de son peuple : chêne pour les Gnomes, argent pour les Licornes.
- Les gemmes sont des jetons de verre sur les écrans d'élève ; le voile, là où il est nommé, porte son pictogramme.
- Une typographie réglée (Cinzel pour les titres de monde, Caudex ailleurs) et une barre d'élève en une ligne.
- Un interrupteur du prof, « Table de jeu », rend l'affichage d'avant. Aucune règle du jeu ne change.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime », à fond : table de bois, matière de chaque peuple, plaques de laiton, parchemin, jetons de verre, partout où un élève regarde (tablette d'équipe, compte d'élève, espace personnel, projection, vitrine). La console du prof et les réglages restent l'outil ForêtMap. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | L'Éclaireuse ou l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond à la question de case (et sonde). | — |
| Décision 38 de l'addendum 4 | 24/11, 11 h 50 | Les images de la série « Table de jeu » existent, mais **le code ne dépend d'aucune image** : chaque visuel a un repli CSS ou SVG et prend l'image dès qu'elle existe dans la médiathèque sous sa clé. | — |
| Décision 40 de l'addendum 4 (choix de Claude, non confirmé par Oliv) | 24/11 | Un interrupteur unique `modules.table_de_jeu_enabled` (défaut vrai) coupe l'habillage, les animations et les plumes, et rend l'affichage d'aujourd'hui, sans toucher aux règles ni aux données. | — |
| « On garde l'image de voile » | 24/11, 14 h 43 | `GL_icone_voile` est le pictogramme du voile, un simple repère fixe, partout où un écran d'élève **nomme** le voile en mots. Elle accompagne le texte sans le remplacer, et ne remplace pas la perte de couleur. Sans image : le texte seul. | « on garde l'image de voile » |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Un seul interrupteur pour tout l'habillage ; le jeu classique garde ses emoji et son plateau.
- Valeurs de couleur et de dégradé des matières (tableau de l'étape ecrans-7.1) ; matière « neutre » : laiton fin.
- Plaque de rôle « …, à toi » en tutoiement, sur un écran d'équipe qui dit « vous » ailleurs.
- Diamètre du jeton : 1,2 em. Seuils de taille : 15, 16, 17 et 22 px ; boutons de 48 px.
- Posés à l'écriture de cette fiche, à relire (section 11) : la racine du compte d'élève porte `.gl-table` ; le
  « ? » reste dans le dock ; « Mon profil » et « Déconnexion » restent atteignables ; le jeton de verre de « Mon
  sac » est posé par le lot ecrans-8 ; avec l'interrupteur coupé, la plaque de rôle rend le texte d'aujourd'hui.

**Garde-fous de cette direction** (à faire relire par `gl-relecteur-garde-fous`) :

- Le voile n'est jamais dessiné comme une forme qui agit, une ombre qui avance seule, un visage ni une couleur
  sombre ; son icône est un repère fixe. Il se montre toujours en pâlissant ce qu'il touche.
- Jamais le visage de Sélène. Parité : les cadres de peuple alternent filles et garçons ; rôles en formes doubles.
- Bourses privées : le jeton de verre n'affiche un compte que sur l'écran de l'équipe et sur le compte de l'élève.
- Adresse : « vous » sur la tablette d'équipe ; « tu » au compte d'élève et sur la plaque d'un rôle nommé.
- Mouvement réduit respecté partout.
- Aucun nouveau texte d'élève sans passage au filtre `findForbiddenString` et au test
  `tests/content/gl-mots-du-voyage.test.js` (créé par ecrans-6) : ajoute tes composants à sa liste.
- **Contraste** : tout texte posé sur une matière est AA (4,5:1 ; 3:1 au-dessus de 24 px). Le texte ne se pose
  jamais sur le bois : toujours sur parchemin, plaque ou carte.
- **Poids** : rien dans `src/shared/styles/*` ni dans `src/index.css` (budget de l'écran de connexion ForêtMap :
  5 Ko de marge en CSS). Tout vit dans `src/gl/`.

**Non vérifié par l'auteur des décisions** : le rendu réel de la tablette d'équipe et du compte d'un élève (vus
seulement dans le code et en admin).

## 3. Fichiers

**À toi** (vérifiés sur `main`) :

- `src/gl/main.jsx` (import de la nouvelle feuille, après `gl-tenir.css`, l. 34-36)
- `lib/glSettings.js` (`DEFAULT_MODULES`, `moduleCamelKeyFor`), `src/gl/constants/modules.js`
  (`GL_MODULE_DEFAULTS`), `src/gl/utils/glSettingsForm.js` (libellé), `tests/gl-settings-registry.test.js` (liste
  fermée des clés)
- `src/gl/components/tenir/GLTenirEcranEquipe.jsx`, `src/gl/components/tenir/GLTenirBandeau.jsx`,
  `src/gl/components/tenir/GLTenirMoment.jsx` (habillage seulement), `src/gl/components/tenir/GLTenirTiroir.jsx`,
  `src/gl/components/tenir/GLSortsParMoment.jsx`
- `src/gl/components/GLTopBar.jsx`, `src/gl/components/GLVitalityDisplay.jsx` (la bourse de la barre),
  `src/gl/components/GLHelpDock.jsx`, `src/gl/components/GLBoardChrome.jsx` (les boutons posés sur le plateau :
  lisibles sur le bois, 48 px ; rien d'autre)
- `src/gl/components/GLMarketView.jsx`, `src/gl/components/GLMarketPlacePanels.jsx` (jetons)
- `src/gl/AppGL.jsx` (classe `.gl-table` de la racine du compte d'élève ; `modules` passés à la tablette d'équipe)
- `src/gl/styles/gl-theme.css`, `src/gl/styles/gl-tenir.css` (tailles et polices sous `.gl-table` ; fond du plateau)
- `src/gl/assets/index.js` (lecture seule de `img()` et `GL_ASSET_PLACEHOLDER_URL` ; n'y ajoute rien)
- Tests : `tests-ui/gl/GLTenirEcranEquipe.test.jsx`, `tests-ui/gl/GLTenirBandeau.test.jsx`,
  `tests-ui/gl/GLTenirMoment.test.jsx`, `tests-ui/gl/GLTenirTiroir.test.jsx`, `tests-ui/gl/GLTopBar.test.jsx`,
  `tests-ui/gl/GLDeuxEcrans.test.jsx`, `e2e/gl-tenir-escalier.spec.js`

**Nouveaux** :

- `src/gl/styles/gl-table.css`
- un utilitaire qui pose la classe et les variables d'image de la table, par exemple
  `src/gl/utils/glTableDeJeu.js` (nom libre)
- `src/gl/components/GLJetonGemme.jsx` (le jeton ; nom libre) et `src/gl/components/GLIconePeinte.jsx` (une icône
  de la médiathèque ou rien ; servira aussi aux lots ecrans-8 et ecrans-9)
- `tests-ui/gl/gl-table-*.test.jsx` (convention du dépôt : sous `tests-ui/gl/`, pas à la racine de `tests-ui/`)
- `docs/GL_TABLE_DE_JEU.md`

**D'un autre couloir, modification minimale permise** :

- `docs/API.md` : une ligne pour `modules.table_de_jeu_enabled` dans la liste des modules.
- `docs/GL_TENIR_A_DEUX.md`, `docs/GL_ARCHITECTURE.md` : un renvoi vers `docs/GL_TABLE_DE_JEU.md`.

**Ne touche pas** :

- `src/gl/components/GLSeuilView.jsx`, `src/gl/components/GLSeuil*.jsx`, `src/gl/styles/gl-seuil.css` : le lot contenu-6 y monte son
  bloc pendant que tu travailles ; l'habillage de « Mon sac » est au lot ecrans-8.
- `src/gl/constants/app-runtime.js`, l'ordre des onglets, `GLAdventureView`, `GLMondeView`, `GLJoueursView` : lot
  ecrans-8.
- `src/gl/components/tenir/GLProjectionView.jsx`, `src/gl/components/GLAuthView.jsx`,
  `src/gl/components/parents/*` : lot ecrans-8.
- `src/gl/components/GLBoardMarkers.jsx`, `src/gl/components/GLBoardMascot.jsx`,
  `src/gl/components/GLBoardTurnHud.jsx`, `src/gl/components/tenir/GLVoileLayer.jsx` (symboles gravés, figurines, voile qui pâlit) : lot ecrans-9.
- `src/gl/components/tenir/GLChasseLayer.jsx`, `src/gl/components/tenir/GLKraaWitness.jsx` (plumes, oiseau) : lot
  ecrans-10.
- La console et les réglages (`src/gl/components/mj/*`, `settings/*`, `admin/*`) : ils gardent leurs emoji.
- `src/shared/styles/*`, `src/index.css`, `lib/shared/*`.

## 4. Étapes (un commit par étape, dans cet ordre)

**Principe du lot** : l'écran est la table ; le plateau peint est posé dessus ; chaque équipe joue dans le cadre de
son peuple. Une seule couche de matière à la fois, rien de lourd sur un petit écran : sous 640 px de large, les
cadres s'amincissent (bord de 6 px) et le bois devient une couleur unie.

### ecrans-7.1 — Les jetons de la table et l'interrupteur (ex-étape T1)

- **Constat vérifié** sur `main` :
  - Aucune feuille `gl-table.css`, aucun réglage `modules.table_de_jeu_enabled`.
  - Un réglage `modules.*` se déclare à quatre endroits : `lib/glSettings.js` (`DEFAULT_MODULES`, l. 190-216, et
    `moduleCamelKeyFor`, l. 373-416), `src/gl/constants/modules.js` (`GL_MODULE_DEFAULTS`),
    `src/gl/utils/glSettingsForm.js` (libellé et aide ; modèle : `modules.voyageur_sounds_enabled`, l. 256), et la
    liste fermée de `tests/gl-settings-registry.test.js`. Aucune migration : le défaut vit dans `lib/glSettings.js`.
  - `img(slug)` (`src/gl/assets/index.js`, l. 94-108) est synchrone : il rend le substitut
    (`GL_ASSET_PLACEHOLDER_URL`) tant que `loadGlAssetRuntime()` n'a pas fini, puis l'adresse de l'image si la clé
    existe. Les clés réelles de la médiathèque n'ont pas le préfixe `GL_` (`table_bois`) ; `img('GL_table_bois')`
    les retrouve par normalisation.
  - **Une feuille CSS ne peut pas appeler `img()`.** L'adresse d'une image se pose par un composant, en variable
    CSS, sur la racine `.gl-table`.
  - La tablette d'équipe (`GLTeamSessionView`) et la projection ne reçoivent pas `modules` aujourd'hui (`AppGL.jsx`
    les rend avant le reste, l. 925-950) : sans eux, l'interrupteur ne les atteint pas.
- **Changement attendu** :
  1. **`src/gl/styles/gl-table.css`** (nouveau, importé par `src/gl/main.jsx`) définit, sous la classe racine
     `.gl-table` :

     | Variable | Valeur | Repli sans image |
     | --- | --- | --- |
     | `--gl-table-bois` | l'image `GL_table_bois`, posée en `background-size: cover`, centrée, **sans répétition** (l'image a une vignette sombre sur les bords : elle n'est pas raccordable) | `radial-gradient(120% 90% at 50% 40%, #4a3424 0%, #2b1d13 70%, #1d130c 100%)` ; couleur unie sous 640 px |
     | `--gl-parchemin` | `#f2e8d5` (grain : bruit SVG en `data:`, opacité 0,05, moins de 1 Ko) | idem sans grain |
     | `--gl-encre` | `#2a2018` | — |
     | `--gl-laiton` | `linear-gradient(180deg, #e2c27a 0%, #b08d3c 55%, #8a6a26 100%)`, texte gravé `#3a2a10` avec ombre claire `0 1px 0 rgba(255,240,200,.6)` | — |
     | `--gl-chene` | `#6b4a2b` (bord), `#8b6440` (lumière), `#3f2a17` (ombre) | — |
     | `--gl-argent` | `#c9d3dc` (bord), `#eef2f6` (lumière), `#16324f` (liseré bleu nuit) | — |
     | `--gl-verre` | dégradé du jeton : `radial-gradient(circle at 35% 30%, #fff8 0 18%, transparent 19%), radial-gradient(circle, #e9c46a, #b98a1e)` | — |

     L'ancien texte disait le bois « répété, taille 512 px » : c'est corrigé ici (`cover`).

  2. **Réglage `modules.table_de_jeu_enabled`** (booléen, défaut vrai), servi au client comme les autres
     `modules.*` (clé client `tableDeJeuEnabled`). Faux : la classe `.gl-table` n'est posée **nulle part**, et tout
     rend l'affichage d'aujourd'hui (les lots suivants y accrochent plumes, moments forts et lanterne). Libellé dans
     les réglages, mot pour mot : « Table de jeu (habillage, animations, plumes de l'oiseau) ».
  3. **Un seul endroit pose la table** : un utilitaire rend, pour une racine, la classe `.gl-table` et le style des
     variables d'image (`--gl-table-bois` et les suivantes) quand `img(clé)` ne rend pas le substitut. Il se
     recalcule quand `loadGlAssetRuntime()` a fini (le repli s'affiche d'abord, l'image ensuite). Aucun autre
     composant n'appelle la médiathèque pour une matière. Aucun appel réseau de plus que l'index déjà chargé (chaque
     image trouvée reste une requête d'image).
  4. Passe `modules` à la tablette d'équipe (la projection : lot ecrans-8).
- **Textes** : le libellé du réglage ci-dessus (vu du prof).
- **Tests** :
  - `tests/gl-settings-registry.test.js` : la clé de plus, inscrite sciemment.
  - `tests-ui/gl/gl-table-interrupteur.test.jsx` : interrupteur coupé → aucune classe `.gl-table` dans le rendu de
    l'écran d'équipe ; allumé → la classe est là, avec le repli quand `img()` rend le substitut.
  - Un test de contraste, calculé sur les couleurs des jetons (encre sur parchemin, texte gravé sur laiton) : AA.
- **Critère d'acceptation** : sans aucune image dans la médiathèque, la table s'affiche en replis ; avec
  l'interrupteur coupé, les captures de l'écran d'équipe sont celles d'avant ce lot.

### ecrans-7.2 — La tablette d'équipe dans la matière de son peuple (ex-étape T2)

- **Constat vérifié** sur `main` (le lot ecrans-4 aura réécrit ces fichiers : revérifie) :
  - `GLTenirEcranEquipe.jsx` : racine `<section className="gl-tenir-ecran…" data-testid="gl-tenir-equipe">`
    (l. 265-272) ; le plateau lui arrive déjà monté (propriété `board`) ; `team.type` vaut `gnome` ou `unicorn` (le
    bandeau le lit déjà, `GLTenirBandeau.jsx`, l. 42).
  - `GLTenirMoment.jsx` : le rôle s'affiche dans `<p className="gl-tenir-moment__role">` (l. 226 et 286), avec le
    repli « Toute l'équipe » ; le libellé vient de `roleDuGeste()` (`src/shared/glSortMomentsCore.js`), échangé par
    le lot moteur-2.
  - Le voile est nommé en mots à trois endroits de la tablette : la phase du bandeau (« Le voile avance »,
    `src/gl/constants/tenirPhases.js`), l'état `souffle` de la carte du moment (« Le voile avance. », avec
    l'émoji 🌫️ de `PICTOS`), la ligne « Votre mascotte est sous le voile. » (`data-testid="gl-tenir-sous-voile"`,
    `src/gl/utils/glTenirMoment.js`).
- **Changement attendu** (habillage seul : **aucune règle ni état ne change**) :
  1. La racine de `GLTenirEcranEquipe.jsx` reçoit `.gl-table` et `data-peuple="gnome|licorne|neutre"`, d'après le
     type de la mascotte de l'équipe (`gnome`, `unicorn`, sinon `neutre`).
  2. **Cadre** : `border-image` de `GL_cadre_gnome` ou `GL_cadre_licorne` (découpe 9 tranches,
     `border-image-slice: 18%`, largeur 22 px sur tablette, 14 px sous 900 px). Repli : chêne = double bord
     `--gl-chene` avec ombre interne ; licorne = bord `--gl-argent` et liseré intérieur bleu nuit de 3 px. Neutre :
     laiton fin.
  3. **Fond derrière le plateau** : `--gl-table-bois`. Il remplace, sur les écrans de la table, le fond de
     `.gl-board` posé par le lot ecrans-6 (dégradé sombre) ; ce dégradé reste le repli quand l'interrupteur est
     coupé.
  4. **Bandeau** (`GLTenirBandeau.jsx`) : une plaque de laiton pleine largeur, nom de l'équipe gravé (Caudex gras),
     phase en mots d'élève, jetons de verre de la bourse (étape ecrans-7.3), sablier.
  5. **Carte du moment** (`GLTenirMoment.jsx`) : une carte de jeu posée sur la table, fond parchemin, coins arrondis
     14 px, ombre portée `0 6px 18px rgba(0,0,0,.35)`. En haut, **la plaque de rôle** en laiton, comme sur les
     cartes Job. Le gros bouton du geste est une plaque de laiton en relief (hauteur 56 px au moins).
  6. **Le tiroir « L'équipe »** : un carnet de cuir qui s'ouvre (fond `#5a3b25`, pages parchemin).
  7. **Le pictogramme du voile** : là où la tablette nomme le voile (les trois endroits du constat, et toute
     distance au voile que l'écran afficherait), `GL_icone_voile` se pose à côté du texte, décorative
     (`alt=""`, `aria-hidden`). Elle ne remplace ni le texte ni la perte de couleur. Dans la carte du moment, elle
     prend la place de l'émoji 🌫️. Sans image : le texte seul, sans émoji.
- **Textes** (mot pour mot) : plaques de rôle « Éclaireuse ou Éclaireur, à toi », « Opératrice ou Opérateur, à
  toi », et de même pour les autres rôles (« Gestionnaire, à toi », « Secrétaire, à toi », « Assistante ou Assistant,
  à toi »). L'Éclaireuse ou l'Éclaireur est appelé pour fouiller, l'Opératrice ou l'Opérateur pour répondre et pour
  sonder. « Toute l'équipe » (aucun rôle) reste tel quel.
- **Tests** : `tests-ui/gl/GLTenirEcranEquipe.test.jsx` (`data-peuple` gnome, licorne, neutre) ;
  `tests-ui/gl/GLTenirMoment.test.jsx` (plaque de rôle ; état `souffle` : le texte est là, l'icône est décorative) ;
  aucune bourse de plus qu'avant.
- **Critère d'acceptation** : une équipe Gnome et une équipe Licorne ont deux cadres distincts ; tout texte est sur
  parchemin ou sur laiton ; l'écran tient toujours sans défiler sur 1024 × 768
  (`e2e/gl-tenir-tablettes.spec.js` le mesure).

### ecrans-7.3 — Les gemmes en jetons de verre (ex-étape T3)

- **Constat vérifié** sur `main` : l'émoji 💎 est écrit en dur. Écrans d'élève : `GLVitalityDisplay.jsx` (bourse de la
  barre, 3), `tenir/GLTenirBandeau.jsx` (1), `tenir/GLTenirTiroir.jsx` (2, dont « Réserve de la caravane : 💎 »),
  `tenir/GLSortsParMoment.jsx` (1, dans une chaîne), `tenir/GLButDeLAnnee.jsx` (1), `GLMarketView.jsx` (8),
  `GLMarketPlacePanels.jsx` (4), `GLStatsView.jsx` (5), `spell-cast/GLSpellCastRosterSection.jsx` (5),
  `spell-cast/GLSpellCastPickers.jsx`, `GLSpellCastWizard.jsx`, `GLSpellPopover.jsx`, `GLSpellCatalog.jsx`,
  `GLFeuilletPopover.jsx`, `utils/glSpellCastRules.js` (2, dans des chaînes). Console et réglages (à laisser) :
  `mj/GLGameMasterConsoleLive.jsx`, `mj/GLTourScreen.jsx`, `settings/GLVitalityDefaultsSettings.jsx`,
  `utils/glSettingsForm.js`.
- **Changement attendu** :
  1. Partout où un écran d'élève montre une gemme (bourse de la barre, bandeau d'équipe, tiroir, Marché, espace
     personnel), un jeton de verre (`GL_gemme_verre` ; repli `--gl-verre` en CSS, cercle de 1,2 em) remplace 💎. Les
     emoji restent à la console.
  2. Ce lot fait : la barre, le bandeau, le tiroir, la carte du moment et le Marché. **L'espace personnel (« Mon
     sac ») est fait par le lot ecrans-8.** Pour les autres écrans d'élève du constat (sorts, statistiques, page) :
     remplace là où la gemme est un élément ; laisse là où elle est prise dans une chaîne composée, et liste-le.
  3. Le plus simple : le composant rend toujours l'émoji (`aria-hidden`) et un jeton ; la feuille, sous `.gl-table`,
     cache l'émoji et montre le jeton. Interrupteur coupé : l'émoji, comme aujourd'hui. Le nom lisible par un
     lecteur d'écran (« gemmes ») ne change pas.
  4. **Bourses** : le compte d'un élève ne s'affiche que sur l'écran de son équipe et sur son compte ; jamais en
     projection, jamais sur l'écran d'une autre équipe (règle existante).
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/gl-table-jeton.test.jsx` : le jeton n'affiche un compte que sur l'écran de sa propre
  équipe et au compte de l'élève ; rien quand le serveur tait le solde (`powerPoints` absent) ; jamais en projection.
- **Critère d'acceptation** : plus d'émoji 💎 visible sur la tablette d'équipe et dans la barre d'un élève quand la
  table est allumée ; la console n'a pas changé.

### ecrans-7.4 — La typographie (ex-étape T4)

- **Constat vérifié** sur `main` : Caudex (400, 700) et Cinzel (400, 600, 700) sont déjà chargées
  (`src/shared/fonts/glFonts.js`). La marque pose aujourd'hui Cinzel sur **tous** les titres et Caudex sur le corps
  (`lib/glBrand.js`, `src/gl/hooks/useGLBrandTheme.js` → variables `--gl-font-heading`, `--gl-font-body`). Les
  tailles vivent dans `gl-theme.css`, `gl-tenir.css` et `gl-seuil.css`.
- **Changement attendu** (sous `.gl-table` seulement ; les réglages de marque ne changent pas) :
  1. **Cinzel** seulement pour les titres de monde (titre du chapitre, cartouche, carte « Au camp », titres des
     moments forts). **Caudex** pour tout le reste ; les petits titres en Caudex gras.
  2. Corps de texte : 17 px au moins sur la tablette d'équipe et la carte du moment, 16 px au compte d'élève, 22 px
     au moins en projection (la projection elle-même : lot ecrans-8). Boutons : 48 px de haut au moins.
- **Textes** : aucun.
- **Tests** : « aucun élément de `.gl-table` sous 15 px calculés, hors mentions de pied ». jsdom ne calcule pas de
  mise en page : fais-en un contrôle e2e (`getComputedStyle` sur la tablette d'équipe et le compte d'élève, sous le
  verrou) ou, à défaut, un test statique des feuilles (aucune `font-size` sous 15 px dans les règles `.gl-table`).
  Dis lequel.
- **Critère d'acceptation** : sur la tablette d'équipe, aucun texte de jeu sous 17 px ; aucun bouton sous 48 px.

### ecrans-7.5 — Une barre en une ligne (ex-étape T5)

- **Constat vérifié** sur `main` :
  - **Déjà vrai** : la version (`GLAppVersionBadge`) ne s'affiche que pour le staff (`AppGL.jsx`, l. 1186,
    `showVersion={showStaffAdminUi}` ; `GLTopBar.jsx`, l. 96). Écris « écarté : déjà corrigé » pour ce point, et
    garde-le vrai par un test.
  - La barre d'un élève porte aujourd'hui : le titre et le sous-titre de la marque, les onglets, la mascotte
    (32 px, carrée), la bourse (`GLVitalityBadge`), le nom, « Mon profil », « Déconnexion » (`GLTopBar.jsx`,
    l. 94-146 et 177-225).
  - Le « ? » vit dans le dock flottant (`GLHelpDock.jsx`, monté par `AppGL.jsx`), avec la cloche. Depuis le lot
    ecrans-5, il n'y a plus de bouton de musique sur le compte d'élève.
- **Ce qu'il reste à faire** : au compte d'élève, la barre tient en une ligne et montre la mascotte de l'élève
  (médaillon **rond**), son nom, sa bourse (jeton de verre), « ? ». La cloche reste dans le dock.
  - La racine du compte d'élève (`.gl-app`, hors staff) reçoit `.gl-table` par l'utilitaire de l'étape ecrans-7.1.
  - « ? » : l'ancien texte le cite dans la barre, puis parle du « ? » du dock à l'étape suivante, et la bulle
    d'Olu dit « en bas à droite de chaque écran ». Écrit ici : **le « ? » reste dans le dock** ; la barre porte le
    médaillon, le nom et la bourse.
  - « Mon profil » et « Déconnexion » ne sont pas cités par la décision : ils restent atteignables (derrière le
    médaillon ou le nom), jamais supprimés.
  - Le staff garde sa barre d'aujourd'hui. Les onglets ne changent pas ici (lot ecrans-8).
- **Textes** : aucun.
- **Tests** (`tests-ui/gl/GLTopBar.test.jsx`) : un élève ne voit pas la version, le staff la voit ; la barre d'un
  élève porte médaillon, nom et bourse ; « Mon profil » et « Déconnexion » restent atteignables au clavier.
- **Critère d'acceptation** : à 1024 px de large, la barre d'un élève tient sur une ligne.

## 5. Migration

Aucune. Le réglage `modules.table_de_jeu_enabled` a son défaut dans `lib/glSettings.js`.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire.

**Images** : aucune n'est versionnée ; tests et captures montrent les replis. Clés de médiathèque que ce lot
emploie (écris-les dans `docs/GL_TABLE_DE_JEU.md` sous leurs deux formes : `GL_table_bois` et la clé réelle
`table_bois`) :

| Clé | Emploi | Repli |
| --- | --- | --- |
| `GL_table_bois` | fond derrière le plateau, en `cover` | dégradé radial brun ; couleur unie sous 640 px |
| `GL_cadre_gnome` | cadre de la tablette d'une équipe Gnome (`border-image`, 9 tranches) | double bord `--gl-chene`, ombre interne |
| `GL_cadre_licorne` | cadre de la tablette d'une équipe Licorne | bord `--gl-argent`, liseré intérieur bleu nuit de 3 px |
| `GL_plaque_laiton` | facultative : aucune étape ne dit où la poser | le dégradé `--gl-laiton` est la règle |
| `GL_gemme_verre` | jeton de verre | `--gl-verre`, cercle de 1,2 em |
| `GL_icone_voile` | pictogramme fixe à côté du mot « voile » | le texte seul |

Non employées ici : `GL_icone_gemme`, `GL_icone_plume` (pas d'image : pour une plume en icône, `GL_plume_chaud`),
`GL_icone_seuil` (remplacée par `GL_icone_sac`, lot ecrans-8).

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-ecrans-relus.spec.js`,
  `e2e/gl-tenir-escalier.spec.js`, `e2e/gl-market.spec.js`, `e2e/gl-responsive-accessibility.spec.js`.
- `npm run check:bundle` : vert, sans aucun ajout à `src/shared/styles/*` ni à `src/index.css`. Note dans ton
  rapport le poids de `gl-table.css`.
- Banc, régime fumée : une passe à la fin, verte.
- Captures dans `docs/captures/gl-decisions/ecrans-7/` (en replis) : tablette d'une équipe Gnome, d'une équipe
  Licorne, la même avec l'interrupteur coupé ; barre d'un élève ; état « Le voile avance ».
- À rendre dans ton rapport : les écrans où 💎 reste et pourquoi ; le choix du test de taille ; les mesures de
  contraste.

## 8. Contrats de test changés

- `.gl-tenir-moment__role` : « Gestionnaire » devient « Gestionnaire, à toi » (et de même pour chaque rôle) :
  `e2e/gl-tenir-escalier.spec.js` (l. 136), `tests-ui/gl/GLDeuxEcrans.test.jsx` (l. 116 et 149).
- Bourses : `tests-ui/gl/GLTenirBandeau.test.jsx` et `tests-ui/gl/GLTenirTiroir.test.jsx` lisent « 💎 4 » ; ils
  restent verts si l'émoji reste dans le DOM (caché par la feuille), sinon ils changent.
- Racine de l'écran d'équipe : classe `.gl-table` et `data-peuple` en plus ; `data-testid="gl-tenir-equipe"` ne
  change pas.
- `tests/gl-settings-registry.test.js` : une clé de plus.
- Carte du moment, état `souffle` : plus d'émoji 🌫️ quand la table est allumée.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TABLE_DE_JEU.md` (nouveau) : matières, jetons, clés d'image et replis, interrupteur, comment le code
  trouve une image, le garde-fou du voile et de son icône. Le lot ecrans-8 y ajoutera les surcouches.
- `docs/GL_TENIR_A_DEUX.md`, `docs/GL_ARCHITECTURE.md` : un renvoi.
- `docs/API.md` : `modules.table_de_jeu_enabled`.
- `docs/reference/gl/*` : rien ici (l'interrupteur « Table de jeu » est décrit par le lot fin-2).
- Une ligne pour le § 0 des règles, dans ton rapport : « 24/11 : direction artistique, table de jeu ».
- `changelog.d/gl-decisions-ecrans-7.md`.

## 10. Hors périmètre

- Les cinq onglets, « Comprendre le jeu », « Mon sac » en deux états, les surcouches, la projection, la vitrine et
  la connexion : lot ecrans-8.
- Les symboles gravés, les figurines sur socle, le tour hors du dessin, le voile qui pâlit la peinture, le fil
  doré : lot ecrans-9. La plume, l'oiseau, la lanterne : lot ecrans-10. Les moments forts, Olu en portrait, la
  couleur du monde et la nuit polaire, les sons du tour : lot ecrans-11.
- Les cartes Job imprimées : hors dépôt.

## 11. Pour Oliv

**À relire**

- La décision 40 (l'interrupteur unique) est un choix de Claude, jamais confirmé.
- Les plaques de rôle : « Gestionnaire, à toi », « Secrétaire, à toi », « Assistante ou Assistant, à toi » (seules
  les deux premières formes, Éclaireuse et Opératrice, sont écrites dans la décision). La phrase « C'est le moment
  de… » reste sous la plaque : elle fait peut-être doublon.
- Avec l'interrupteur coupé, la plaque redevient le texte d'aujourd'hui (sans « à toi »).
- Le « ? » laissé dans le dock ; « Mon profil » et « Déconnexion » rangés derrière le médaillon.
- Où l'icône du voile est posée sur la tablette (phase, carte du moment, ligne « sous le voile »).

**À faire après la vague**

- Téléverser dans la médiathèque `GL_table_bois`, `GL_cadre_gnome`, `GL_cadre_licorne`, `GL_gemme_verre`,
  `GL_icone_voile` (et `GL_plaque_laiton` si tu la veux) sous ces noms. Sans elles, tout marche, en replis.
- Regarder une vraie tablette d'équipe : cadres, lisibilité, bois.
- Le réglage « Table de jeu » est la voie de repli si quelque chose gêne en classe.
