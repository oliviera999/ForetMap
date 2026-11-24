# Lot contenu-2 — Pistes de zone, badges, Passeur, textes d'écran, pseudo de la Lettre

> Chantier G&L « décisions » · vague 1 · couloir contenu · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-contenu-2` · Attend : contenu-1 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Après un « pas encore » à une question de zone, la piste ne nomme plus un mot de la bonne réponse.
- Les badges portent des noms en formes doubles (« Fouilleuse / Fouilleur ») ; une seule source les décrit.
- Le Mentorat et la Lettre ne renvoient plus à une piste du professeur qui n'existe peut-être pas.
- Le Passeur du plateau 1 lit cinq pages, dans l'ordre du récit, sans la page qui écrit le cri de l'oiseau.
- Le pseudo de l'autrice ou de l'auteur d'une Lettre ne se voit plus en projection ni chez les autres équipes.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 3 du prompt | 19/11 | Une piste de zone ne nomme jamais un mot de la bonne réponse. | |
| Décision 5 du prompt | 19/11 | Une seule source pour les badges : `lib/glRewardsCatalog.js`. | |
| Décision 10 du prompt | 19/11 | Noms de badges en formes doubles. | |
| Décision 11 du prompt | 19/11 | « Regarde la piste de ton professeur » est adouci. | |
| Décision 12 du prompt | 19/11 | Le pseudo de l'auteur d'une Lettre est caché en projection et aux autres équipes. | |
| Décision 21 du prompt | 23/11 | « Corbeau », nom commun, est permis dans les pages de Sélène ; l'interface et les catalogues ne l'écrivent pas. `ep-VI-02` sort du Passeur du plateau 1. | |
| QV1 (addendum 1) | 24/11, 11 h 31 | « Corbeau » reste dans les cinq questions de lore qui parlent de l'oiseau des pages de Sélène (`LQCM0038`, `LQCM0097`, `LQCM0157`, `LQCM0246`, `LQCM0247`) ; le nom propre et le cri restent interdits partout. | « 1. On garde 2. Réécris les 3. Ok » (réponse commune aux décisions QV1 à QV3) |
| Décision 34 du prompt | 24/11 | Les questions de zone sont réécrites en prod : la piste se vérifie contre les nouvelles réponses. | |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Texte de vérité des cases favorables neutres : « Belle rencontre : la caravane repart. »
- Les deltas morts des cases (cœurs, gemmes neutralisées) restent en base : les anciennes parties les lisent encore.
- Les treize formes doubles sont la rédaction de Claude (la décision 10 dit seulement « formes doubles »).
- `data/gl/tenir/titres.json` (« Passeur de Pages »…) ne change pas : décision d'Oliv.
- Canal `espece_pays` : la voie la plus simple, au choix de la session, dite dans le rapport (étape contenu-2.4).
- Étape contenu-2.1 : aucun changement de ressource dans `chasse-zones.json` (le motif a disparu avec la réécriture
  des questions) ; le test compare les mots de quatre lettres ou plus.
- Étape contenu-2.6 : aucun libellé nouveau quand le nom est masqué.
- Les tests de contenu « sur la base » se sautent sur une base qui ne porte pas les écritures de prod des 23 et 24/11.

## 3. Fichiers

- **À toi** :
  - `data/gl/tenir/badges.json`, `data/gl/tenir/exemple/badges.json`, `lib/glRewardsCatalog.js`,
    `data/gl/tenir/README.md` ;
  - `data/gl/tenir/sorts.json`, `data/gl/tenir/exemple/sorts.json` (deux `retour_pas_encore`) ;
  - `data/gl/tenir/passeur-plateau4.json`, `lib/glLoreFeuilletSpeciesReveal.js` ;
  - `src/shared/glGardeFousCore.js` (commentaire d'en-tête), `src/shared/glTenirCaseEffetCore.js` (une chaîne) ; leurs
    miroirs `lib/shared/*` se régénèrent par `npm run sync:shared-cores` (ou le build), jamais à la main ;
  - `routes/gl/lore.js` (étape contenu-2.6) ;
  - tests : `tests/gl-ensemble-unifie-zones.test.js`, `tests/content/gl-ensemble-unifie-zones.test.js`,
    `tests/content/gl-tenir-donnees.test.js`, `tests/gl-tenir-case-effet-core.test.js`,
    `tests/gl-rewards-engine.test.js`, `tests/gl-tenir-exports.test.js`, `tests/gl-ensemble-unifie-lexique.test.js`,
    `tests/gl-lore-feuillet-species-reveal.test.js`, `tests-ui/gl/GLCarnetClasseView.test.jsx` ;
  - docs : `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 1 et table des badges du § 12), `docs/API.md`,
    `docs/reference/gl/guide-du-mj.md`, `docs/reference/gl/chapitres-et-progression.md`.
- **Nouveaux** : `tests/content/gl-zones-piste-reponse.test.js`, `tests/content/gl-cases-adresse.test.js`, un test de
  route pour l'étape contenu-2.6 (`tests/gl-lettre-pseudo.test.js`).
- **D'un autre couloir, modification minimale permise** :
  - `lib/glChasse.js` (couloir moteur) : la garde de `pisteDeReponse` (étape contenu-2.1) et le champ `auteur` de la
    marge dans `buildCarnetClasse` (étape contenu-2.6). Rien d'autre ; le lot moteur-4 y ajoute la sonde après toi.
  - `routes/gl/games/chasse.js` : seulement ce qu'il faut passer à `buildCarnetClasse` (étape contenu-2.6).
- **Ne touche pas** :
  - `data/gl/tenir/chasse-zones.json` : aucun polygone, aucun indice (Oliv retrace les zones du plateau 1 après la
    synchronisation) ;
  - le `critere` du badge `trouveur` de `badges.json` (« …saisi comme Opérateur ») : le lot moteur-2 le réécrit ;
  - `data/gl/tenir/titres.json` ; `src/gl/components/GLSeuilPagesVoyageur.jsx` ;
  - `src/gl/utils/glTenirMoment.js`, `src/gl/components/tenir/GLProjectionView.jsx` (texte du vent : lot ecrans-2) ;
  - dans `routes/gl/lore.js`, tout ce qui n'est pas `discoveredBy` : le lot contenu-3 y ajoute un filtre après toi,
    puis les lots contenu-4, contenu-5 et contenu-6.

## 4. Étapes (un commit par étape ; l'ordre entre elles est libre)

### contenu-2.1 — Pistes de zone qui donnent la réponse (ex-étape 3)

- **Constat vérifié** :
  - `lib/glChasse.js › pisteDeReponse(db, zone)` (ligne 534), appelée ligne 711 pour la seule question fixe de la
    zone (`zone.questionCode`). Elle rend le premier terme actif de `zone.glossaire`, sinon la première fiche active
    de `zone.especes` : « La réponse se trouve au mot « … » du glossaire. » ou « … dans la fiche « … ». »
  - Les cinq questions qui avaient motivé cette étape sont réécrites en prod (24/11). Bonnes réponses en prod :

| Zone | Question | Bonne réponse en prod (24/11) | Ressources (dépôt = prod) |
| --- | --- | --- | --- |
| `cz-p4-01` | `QCM0364` | « Ils ont plus de petits. » | `especes` `SP0145` (Lièvre variable), `SP0140` (Lynx boréal) |
| `cz-p4-10` | `QCM0176` | « Il attend à terre, en mangeant très peu. » | `glossaire` `GL0015` (banquise) ; `especes` `SP0049`, `SP0050` |
| `cz-p4-06` | `QCM0152` | « Ils perdent leur abri sous la neige. » | `especes` `SP0054` (Harfang des neiges), `SP0052` (Lemming d'Arctique) |
| `cz-p3-04` | `QCM0230` | « Ils passent mal d'un bois à l'autre. » | `glossaire` `GL0280` (défrichement) ; `especes` `SP0082`, `SP0258` |
| `cz-p3-03` | `QCM0219` | « Ils trouveraient moins bien l'eau du sol. » | `glossaire` `GL0170` (mycorhize), `GL0257` (symbiose) ; `especes` `SP0261`, `SP0082` |

  - Sur ces réponses, aucune ressource n'est nommée dans la réponse : en prod, la garde ne saute rien aujourd'hui.
    Elle protège la suite (une question réécrite, une ressource ajoutée). Les 8 questions des zones du plateau 1 sont
    réécrites en prod depuis le 23/11.
  - `tests/gl-ensemble-unifie-zones.test.js` (lignes 143 à 146) teste déjà `pisteDeReponse`.
  - `tests/content/gl-ensemble-unifie-zones.test.js` : les gardes `corpusPresent` et `cataloguePresent` sortent par
    `return`, sans `t.skip` (lignes 57, 94, 95, 119, 134, 138, 168, 171, 177).
- **Changement attendu** :
  1. Dans `pisteDeReponse`, une ressource est **sautée** quand son nom (`terme` ou `nom_commun`) figure dans le texte
     de la bonne réponse de la question fixe de la zone (`gl_qcm_questions.reponse_texte`, par `zone.questionCode`).
  2. Comparaison : minuscules, sans accents ni ponctuation, sur des mots entiers. Un nom de moins de 4 lettres ne
     déclenche pas la garde.
  3. Seule la question fixe compte : une question du thème de secours a déjà `piste: null`.
  4. Si toutes les ressources sont sautées, la piste vaut `null`. Lis la réponse en une seule requête par appel.
  5. Aucune donnée ne change : ni ressource, ni polygone, ni indice de `chasse-zones.json`.
- **Tests** :
  - unitaires (`tests/gl-ensemble-unifie-zones.test.js`) : terme présent dans la réponse → sauté ; terme présent dans
    la question seulement → gardé ; accents et majuscules ; nom court ; toutes les ressources sautées → `null` ;
  - contenu (`tests/content/gl-zones-piste-reponse.test.js`, vrai `t.skip` sans corpus) : pour chaque zone active, le
    nom rendu par la piste ne contient aucun mot de quatre lettres ou plus de la bonne réponse, et chaque code de
    `glossaire` et d'`especes` existe et est actif. Vrai `t.skip` aussi, « base sans les réécritures des 23 et
    24/11 », quand l'énoncé de `QCM0009` en base n'est pas celui de `tests/fixtures/gl-questions-zones-p2-p4.json`
    (fichier posé par le lot contenu-1). Un échec sur une base à jour est un écart nouveau : écris-le, ne corrige
    aucune donnée ;
  - `tests/content/gl-ensemble-unifie-zones.test.js` : les neuf sorties par `return` appellent `t.skip(...)`.
- **Critère d'acceptation** : tests unitaires verts ; le rapport dit si le test de contenu a pu être joué, et liste
  les zones où la garde saute une ressource sur ta base.

### contenu-2.2 — Badges : une seule source, noms en formes doubles (ex-étape 5)

- **Constat vérifié** :
  - Les badges vivent sur le moteur commun (`lib/glRewards.js`, catalogue à paliers `lib/glRewardsCatalog.js`, 21
    titres). `data/gl/tenir/badges.json` (16 badges) et la table `gl_tenir_badges` sont hérités ; leurs codes
    (`fouilleur`, `revelateur`…) ne recoupent pas les clés du catalogue (`chasse.fouilles`…). Aucun écran actif ne
    lit les seuils de `badges.json`.
  - `lib/glRewardsBackfill.js › LEGACY_MAP` (ligne 18) relie dix codes : `premiere_page` → `chasse.pages`, `lecteur`
    → `lecture.pages`, `fouilleur` → `chasse.fouilles`, `mains_tendues` → `cooperation.dons`, `veilleur` →
    `veillee.semaines`, `nommeur` → `nature.especes`, `cartographe` → `nature.biomes`, `passeur_de_seuil` →
    `voyage.chapitres`, `chuchoteur` → `manuel.chuchoteur`, `correcteur_du_renard` → `manuel.renard`.
  - Seul `premiere_page` (« Première page ») n'a pas le nom de son titre de catalogue (`chasse.pages` : « Trouveur »).
  - `lib/glRewardsCatalog.js`, ligne 208 : commentaire « nom à confirmer par Oliv ».
  - `src/gl/constants/glRewardsOlu.js` ne cite aucun titre.
- **Changement attendu** :
  1. `badges.json` : `format` devient `badges v1 — HÉRITÉ, non affiché : la source est lib/glRewardsCatalog.js
     (paliers)`. Aligne chaque `nom` sur le titre du catalogue quand `LEGACY_MAP` relie les deux ; sinon, applique
     seulement la forme double. N'aligne pas les seuils. Ne retire ni la table ni le fichier.
  2. Noms en formes doubles, dans `lib/glRewardsCatalog.js` (`title`), puis dans `badges.json` et sa copie
     `exemple/` :

| Titre actuel | Nouveau titre |
| --- | --- |
| Fouilleur | Fouilleuse / Fouilleur |
| Trouveur | Trouveuse / Trouveur |
| Lecteur | Lectrice / Lecteur |
| Nommeur | Nommeuse / Nommeur |
| Tisserand | Tisserande / Tisserand |
| Voyant des fils | Voyante / Voyant des fils |
| Gardien des fils | Gardienne / Gardien des fils |
| Réparateur | Réparatrice / Réparateur |
| Bon rangeur | Bonne rangeuse / Bon rangeur |
| Veilleur | Veilleuse / Veilleur |
| Grand voyageur | Grande voyageuse / Grand voyageur |
| Chuchoteur | Chuchoteuse / Chuchoteur |
| Correcteur du renard | Correctrice / Correcteur du renard |

  3. Les titres déjà neutres ne bougent pas : Porte-page, Pas encore, Mains tendues, Épaule, Mains de la Trame,
     Cartographe, Deux peuples, Esprit d'équipe.
  4. Retire le commentaire « nom à confirmer par Oliv ».
  5. Badge `trouveur` de `badges.json` : tu changes son `nom` ; son `critere` reste tel quel (lot moteur-2).
  6. Aligne les textes qui citent ces titres : `data/gl/tenir/README.md` (ligne 177) ;
     `docs/reference/gl/guide-du-mj.md` (lignes 484 et 485) ; `docs/reference/gl/chapitres-et-progression.md` (lignes
     349 et 350) ; trouvés en plus par recherche : la table des badges des règles (lignes 249 à 262) et
     `docs/API.md` (lignes 1267 à 1278). `docs/GL_DEFIS.md` (lignes 210 à 214) : note-le pour le lot fin-1.
- **Tests** :
  - nouveau, dans `tests/content/gl-tenir-donnees.test.js` : pour chaque code de `LEGACY_MAP` présent dans
    `badges.json`, même nom que le titre du catalogue ;
  - à aligner : `tests/gl-rewards-engine.test.js` (lignes 89 à 93), `tests/gl-tenir-exports.test.js` (ligne 68 :
    `chasse.pages.1;Trouveur;Fil;`), `tests/gl-ensemble-unifie-lexique.test.js` (lignes 71 à 80). Les tests qui
    posent leurs propres badges d'essai (`tests/gl-tenir-badges.test.js`, `tests-ui/gl/GLRewardsPanel.test.jsx`…) ne
    changent pas.
- **Critère d'acceptation** : à 390 px de large, chips et cartes de badge ne débordent pas ; capture du badge au titre
  le plus long (« Correctrice / Correcteur du renard ») dans `docs/captures/gl-decisions/contenu-2/`.

### contenu-2.3 — Retours « pas encore » du Mentorat et de la Lettre (ex-étape 8)

- **Constat vérifié** : `data/gl/tenir/sorts.json`, lignes 535 (Mentorat, `SL027`) et 577 (Lettre, `SL048`), champ
  `retour_pas_encore` : « Regarde la piste de ton professeur… », « Lis la piste de ton professeur… ». La copie
  `exemple/sorts.json` les recopie (lignes 531 et 573).
- **Changement attendu**, dans les deux fichiers :
  - Mentorat : « Pas encore : il manque un morceau à ton explication. Si ton professeur a laissé une piste, lis-la ;
    tu repasses une autre semaine, sans rien repayer. »
  - Lettre : « Pas encore : ta page a besoin d'un détail de plus. Si ton professeur a laissé une piste, lis-la, et
    réécris ta page quand tu veux. Tu n'as rien à repayer. »
- **Tests** : `npm run test:content` ; un test qui lit l'ancien texte se met à jour.
- **Critère d'acceptation** : les deux textes sont mot pour mot dans les deux fichiers.

### contenu-2.4 — Passeur du plateau 1 et « corbeau » (ex-étape 23 et son complément, décision QV1)

- **Constat vérifié** :
  - `data/gl/tenir/passeur-plateau4.json`, plateau `"1"` : le dépôt a encore l'ancienne liste de 7 pages. **La prod
    est déjà conforme** (cinq pages actives, ordres 6 et 7 désactivés) : tu alignes le dépôt, tu n'écris rien en prod.
  - `tests/content/gl-tenir-donnees.test.js` (lignes 54 à 58) attend `['1:7', '2:7', '3:9', '4:7']`.
  - Sur main, une page du Passeur est aussi la page d'une zone au plateau 1 (`ep-I-colonne`, zone `cz-p1-04`) et au
    plateau 3 (`ep-VII-tourb-1`, zone `cz-p3-10`). Aucune aux plateaux 2 et 4.
  - Partie jouée le 23/11 : `ep-V-01` gagnée par la fiche `SP0027` (canal `espece_pays`,
    `lib/glLoreFeuilletSpeciesReveal.js › findNextPaysFeuillet`), puis relue par le Passeur.
  - `src/shared/glGardeFousCore.js` interdit `corbeau` (ligne 28) pour l'interface et les catalogues ; les pages de
    Sélène le disent, c'est voulu.
- **Changement attendu** :
  1. Plateau `"1"` du fichier, dans cet ordre :

```text
"1": {
  "nb": 5,
  "pages": [
    { "feuillet_code": "ep-V-01", "ordre_voyage": 1042, "titre": "Premier pays, les premiers jours. La chaleur.", "biome_slug": "jungle_afc", "ordre": 1 },
    { "feuillet_code": "ep-I-sem", "ordre_voyage": 1043, "titre": "Premier pays. Un oiseau bleu.", "biome_slug": "savane", "ordre": 2 },
    { "feuillet_code": "ep-V-02", "ordre_voyage": 6002, "titre": "Toujours la chaleur. Une semaine plus tard, peut-être deux.", "biome_slug": "jungle_afc", "ordre": 3 },
    { "feuillet_code": "ep-V-03", "ordre_voyage": 1052, "titre": "Encore les tropiques. La nuit du grand bruit.", "biome_slug": "savane", "ordre": 4 },
    { "feuillet_code": "ep-seuil-1", "ordre_voyage": 1085, "titre": "Au bord des terres sèches.", "biome_slug": "savane", "ordre": 5 }
  ],
  "note": "ordre du récit (V-02 avant V-03) ; ep-I-colonne retirée (page de la zone cz-p1-04) ; ep-VI-02 retirée (son texte écrit le cri de l'oiseau), décision d'Oliv du 23/11"
}
```

     L'import désactive de lui-même les ordres 6 et 7 (`importPasseur`, désactivation par plateau).

  2. Canal `espece_pays` : en partie « Tenir », une page du Passeur ne se gagne pas aussi par une fiche d'espèce.
     Voie la plus simple, à dire dans ton rapport : exclure les pages du Passeur de la révélation par espèce, ou ne
     pas relire au Passeur une page déjà au carnet.
  3. Commentaire d'en-tête de `src/shared/glGardeFousCore.js` et § 1 des règles, même phrase : « les feuillets du
     carnet, et les questions de lore qui parlent de l'oiseau des pages de Sélène, ne passent pas par ce filtre ; le
     nom propre et le cri restent interdits partout ». Aucun changement de liste. Aucun contrôle nouveau ne refuse
     « corbeau » dans `gl_qcm_lore_questions` ; « Krâ », « Kraa » et « krâ » y restent interdits.
- **Tests** :
  - `tests/content/gl-tenir-donnees.test.js` : le compte devient `1:5` ; nouveau contrôle « aucune page du Passeur du
    plateau 1 n'est la page d'une zone active du plateau 1 ». Il ne vaut que pour le plateau 1 : pour les plateaux 2
    à 4, le test liste les doublons dans son diagnostic, sans échouer, et tu les recopies dans ton rapport sans les
    corriger ;
  - `tests/gl-lore-feuillet-species-reveal.test.js` : le cas de la voie retenue pour `espece_pays`.
- **Critère d'acceptation** : l'import à blanc du Passeur passe ; les tests de contenu sont verts.

### contenu-2.5 — Texte de vérité des cases favorables, test d'adresse des cases (ex-étape 22, part « textes »)

- **Constat vérifié** : `src/shared/glTenirCaseEffetCore.js`, ligne 211 : `'Une case favorable : on repart, sans
  gain.'` ; `tests/gl-tenir-case-effet-core.test.js` l'attend aux lignes 156, 171 et 238. La ligne voisine dit déjà
  « Le biome éprouve la caravane ».
- **Changement attendu** : la chaîne devient `'Belle rencontre : la caravane repart.'` ; régénère le miroir.
- **Tests** :
  - `tests/gl-tenir-case-effet-core.test.js` : les trois attendus ;
  - nouveau test de contenu `tests/content/gl-cases-adresse.test.js`, dans l'esprit de
    `tests/content/gl-adresse-ecran-equipe.test.js`, sur les cases du plateau 1 en base
    (`gl_chapter_markers.description` et libellés de `event_config_json.effects.*.label`, chapitre du plateau 1) :
    aucun tutoiement (` tu `, ` te `, ` t'`, ` ton `, ` ta `, ` tes `, impératif « Tire »). Vrai `t.skip` sans corpus,
    et vrai `t.skip` sur une base sans les écritures de prod (même marque qu'à l'étape contenu-2.1 : les douze
    descriptions du plateau 1 sont au « vous » en prod depuis le 23/11, pas dans le dépôt). Plateaux 2 à 4 : compte
    les occurrences, sans faire échouer le test, et mets le nombre dans ton rapport.
- **Critère d'acceptation** : tests verts ; le rapport donne le compte des plateaux 2 à 4, ou dit qu'il n'a pas pu
  être fait.

### contenu-2.6 — Pseudo de l'autrice ou de l'auteur d'une Lettre (ex-étape 10)

- **Constat vérifié** (il corrige l'ancien texte, qui ne nommait que `routes/gl/lore.js`) :
  - `lib/glVoyageurPlume.js` (lignes 153 à 155) écrit, dans l'état de page de **chaque équipe**,
    `discoveredByName` = pseudo de l'auteur, `discoveredByPlayerId` et `discoveredSource` = source de la plume
    (`'lettre'` pour une Lettre).
  - `routes/gl/lore.js` les sert à tout élève : liste (lignes 259 et 260) et page (lignes 325 et 326).
    `src/gl/components/GLSeleneCarnetView.jsx` (lignes 290 à 292) affiche « Découvert par <pseudo> ».
  - **Le carnet de la classe ne lit pas `discoveredBy`.** Le pseudo y arrive par un autre chemin :
    `lib/glChasse.js › buildCarnetClasse` (lignes 1492 à 1507) rend `marge[]` avec `auteur` = pseudo, pour tout
    spectateur, projection comprise (appel : `routes/gl/games/chasse.js`, ligne 175) ;
    `src/gl/components/tenir/GLCarnetClasseView.jsx` (ligne 90) affiche « titre » — pseudo, sous « En marge : les
    pages des voyageurs ».
  - Le libellé « Une page de voyageur », que l'ancien texte disait affiché sans nom, n'existe nulle part.
- **Changement attendu** :
  1. Pour une page de source Lettre, `discoveredBy` et `discoveredByPlayerId` (`routes/gl/lore.js`) et `auteur` de la
     marge (`buildCarnetClasse`) ne sont servis **qu'à** l'autrice ou l'auteur, aux membres de son équipe dans la
     partie en cours et au staff G&L. Ils valent `null` pour la projection, les autres équipes et les autres élèves.
  2. La base ne change pas.
  3. Sans nom, les écrans font ce qu'ils font déjà : `GLSeleneCarnetView` n'affiche pas la ligne « Découvert par »,
     `GLCarnetClasseView` affiche le titre seul. Aucun libellé nouveau.
  4. Cherche tout autre chemin qui servirait ce pseudo (`git grep -n "discovered_by_name\|pl.pseudo" -- lib routes`)
     et dis ce que tu trouves.
- **Tests** : route et carnet, cinq lecteurs : auteur, coéquipier, autre équipe, projection, prof ;
  `tests-ui/gl/GLCarnetClasseView.test.jsx` : une marge sans `auteur` n'affiche que le titre.
- **Critère d'acceptation** : capture du carnet de la classe en projection avec une Lettre, sans pseudo
  (`docs/captures/gl-decisions/contenu-2/`) ; `docs/API.md` décrit `discoveredBy` et `marge[].auteur` selon le
  lecteur.

## 5. Migration

Aucune.

**Déjà en prod par le connecteur, les 23 et 24/11 : ne refais rien, n'écris aucune de ces données.**

| Table | Ce qui est en prod |
| --- | --- |
| `gl_tenir_passeur_pages` | Plateau 1 : ordre 3 = `ep-V-02`, ordre 4 = `ep-V-03`, ordres 6 et 7 désactivés (étape contenu-2.4). |
| `gl_qcm_questions` | Les 36 questions de zone réécrites (8 du plateau 1 le 23/11, 28 des plateaux 2 à 4 le 24/11) : la piste se juge contre ces réponses (étape contenu-2.1). |
| `gl_chapter_markers` (plateau 1) | 12 descriptions au « vous » (ids 9, 13, 15, 17, 21, 24, 26, 30, 32, 34, 38, 185) ; libellés des cases Trame 19, 188 et 36 au « vous », deltas intacts (étape contenu-2.5). |
| `gl_chapter_markers` (plateaux 1 à 4) | 61 cases question au texte intermédiaire « Une question du biome. Bonne réponse : une case de plus et vous relancez. » : le lot moteur-4 le termine, n'y touche pas. |
| `gl_qcm_lore_questions` | Les cinq questions qui disent « corbeau » sont actives (décision QV1). |

Les catalogues de ce lot (`badges`, `sorts`) ne sont pas en prod : Oliv les synchronise après la vague.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` n'est à verser. Les tests de contenu lisent
`tests/fixtures/gl-questions-zones-p2-p4.json`, posé par le lot contenu-1 ; s'il manque, dis-le (état `bloquée` pour
les deux tests qui s'en servent).

## 7. Vérifications propres au lot

- `npm run test:content`, puis
  `DB_NAME=foretmap_contenu_2_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run` : `badges`, `sorts` et
  `passeur-plateau4` passent. `qcm-feedbacks-zones` reste refusé pour les six erreurs de bonne lettre laissées par le
  lot contenu-1 (la base du banc porte les anciens énoncés) : ce n'est pas de ton lot.
- Banc, régime fumée, une passe à la fin.
- Captures (`docs/captures/gl-decisions/contenu-2/`) : badge au titre le plus long à 390 px ; carnet de la classe en
  projection avec une Lettre.
- Relecteurs : `gl-relecteur-garde-fous` sur le diff des textes et des JSON ; `gl-relecteur-science` si une ressource
  de zone change.
- Comptes à rendre dans le rapport : tutoiement des cases des plateaux 2 à 4 ; doublons Passeur / zones des plateaux
  2 à 4 ; zones où la garde saute une ressource ; voie retenue pour `espece_pays`.

## 8. Contrats de test changés

- Titres des badges : treize titres en formes doubles (catalogue, export CSV `chasse.pages.1;Trouveuse /
  Trouveur;Fil;`, `GET` du catalogue des récompenses).
- `tests/content/gl-tenir-donnees.test.js` : Passeur `1:7` → `1:5` ; noms de `badges.json` (dont `premiere_page`).
- Texte de vérité : « Belle rencontre : la caravane repart. »
- `retour_pas_encore` du Mentorat et de la Lettre.
- `discoveredBy`, `discoveredByPlayerId` et `marge[].auteur` valent `null` hors de l'équipe de l'auteur.
- `pisteDeReponse` peut sauter une ressource, et rendre `null`.
- `tests/content/gl-ensemble-unifie-zones.test.js` : neuf vrais `t.skip`.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md`, hors § 0 : § 1 (phrase sur « corbeau ») ; table des badges du § 12 (titres).
- `docs/API.md` : `discoveredBy` et `marge[].auteur` selon le lecteur ; titres du catalogue des récompenses.
- `docs/reference/gl/guide-du-mj.md` et `chapitres-et-progression.md` : seulement les titres devenus faux.
- `data/gl/tenir/README.md` : `badges.json` hérité, nouveaux titres.
- Skills `.claude/skills/gl-*` : toute phrase qui donne `badges.json` pour la source des badges.
- `changelog.d/gl-decisions-contenu-2.md`.
- Pour le § 0 des règles (à recopier dans ton rapport) : « 24/11 : les questions de lore peuvent dire « corbeau »,
  jamais son nom ni son cri » ; « 19/11 : une piste de zone ne nomme jamais un mot de la bonne réponse ; les badges
  ont une seule source et des noms en formes doubles ; le pseudo de l'auteur d'une Lettre ne se voit que dans son
  équipe ».

## 10. Hors périmètre

- Le `critere` du badge `trouveur` et le code des rôles : lot moteur-2. Écris dans « Ce que les lots suivants doivent
  savoir » que son `nom` est déjà « Trouveuse / Trouveur ».
- Le texte du vent (« Porté par le vent : la case ne joue pas. ») : lot ecrans-2.
- La question de case et la sonde, le texte des 61 cases question : lot moteur-4.
- Le filtre des questions de catégorie `histoire` dans `routes/gl/lore.js` : lot contenu-3.
- Les polygones des zones ; le doublon Passeur / zone du plateau 3 ; le tutoiement des cases des plateaux 2 à 4 ;
  `titres.json` ; le retrait de `gl_tenir_badges`.
- La réécriture des docs de référence : lot fin-2.

## 11. Pour Oliv

**À relire**

- Les treize titres de badges en formes doubles. Dans `badges.json` (hérité, non affiché), `premiere_page` prend le
  nom de son titre de catalogue, « Trouveuse / Trouveur », comme le badge `trouveur`.
- Les deux retours « pas encore » du Mentorat et de la Lettre.
- « Belle rencontre : la caravane repart. » : « la caravane » y désigne une équipe, alors que les mots du voyage la
  réservent à toute la classe. L'autre rédaction proposée était « Belle rencontre : l'équipe repart. »
- Pistes de zone, ce qui ne se déduit pas du dépôt :
  - l'ancien texte demandait trois changements de ressources, pour un motif qui a disparu avec la réécriture des
    questions ; ils ne sont pas faits : `cz-p4-01`, `especes` → `["SP0140", "SP0145"]` (Lynx boréal d'abord) ;
    `cz-p4-10`, `glossaire` → `["GL0220"]` (réchauffement climatique) ; `cz-p4-06`, `especes` → `["SP0052",
    "SP0054"]` (Lemming d'Arctique d'abord). À demander si tu les veux ;
  - pour les 36 questions réécrites, la fiche ou le mot que montre la piste contient-il encore la réponse ?
    (`cz-p4-10` : « La réponse se trouve au mot « banquise » du glossaire », pour « Que fait-il quand la glace a
    fondu ? »).
- Lettre : sans nom, rien ne s'affiche à la place. L'ancien texte citait un libellé « Une page de voyageur » qui
  n'existe pas : le veux-tu ?
- Les tests de contenu sur les cases et sur les pistes ne se jouent que sur une copie de la prod.

**À faire après la vague**

- Synchroniser les catalogues, d'abord à blanc : `badges`, `sorts`, `passeur-plateau4` (déjà conforme en prod pour le
  plateau 1).
- Ensuite seulement, retracer les 8 polygones des zones du plateau 1 dans l'éditeur de zones, puis demander à Claude
  de les reporter dans `chasse-zones.json`, pour qu'une future synchronisation ne les écrase pas.
