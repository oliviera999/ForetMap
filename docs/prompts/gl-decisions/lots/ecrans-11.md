# Lot ecrans-11 — Les moments forts et les sons du tour

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-11` · Attend : ecrans-10 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

Au tableau, quatre moments du tour deviennent de courtes scènes : le tour s'ouvre, le voile avance, une page tient,
le camp. Olu parle depuis un médaillon peint, sur une note épinglée. Chaque monde donne sa couleur aux écrans de la
table, et la nuit polaire les fait passer au bleu nuit. La péripétie s'affiche sur une scène du monde traversé. Le
tour a ses sons : bois pour les Gnomes, verre pour les Licornes ; quand le voile avance, la musique pâlit.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime » ; le mouvement là où il sert la table, dont quatre moments forts. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |
| Décision 38 de l'addendum 4 | 24/11, 11 h 50 | Le code ne dépend d'aucune image : chaque visuel a un repli CSS ou SVG. | — |
| Décision 39 de l'addendum 4 | 24/11, 11 h 41 | Plus de gel : le chantier ajoute ce que les décisions nommées demandent. | — |
| Décision 40 de l'addendum 4 | 24/11 (choix de Claude) | L'interrupteur `modules.table_de_jeu_enabled` coupe l'habillage, les animations et les moments forts. | — |
| Décision du 24/11 après-midi | 24/11, 14 h 16 | « Mon sac » à la veillée a la lueur du feu, pas la nuit du monde. | « Je valide » |
| Décision du 24/11 après-midi | 24/11, 14 h 43 | `GL_icone_voile` est un repère fixe à côté des mots qui nomment le voile ; elle ne remplace ni le texte ni la perte de couleur. | « on garde l'image de voile » |

L'étape des sons (ex-S4) n'a pas de numéro de décision à elle : elle vient de la décision 34 de l'addendum 4. Elle a quitté l'ancien
lot du son parce qu'elle sonorise la fouille, l'oiseau et le voile que les lots ecrans-9 et ecrans-10 ont posés.

**Choix par défaut posés par Claude** (la session les applique sans demander ; Oliv peut les retirer) :

- Les quatre moments forts et leur scène ; le choix des scènes par biome.
- Dans la scène « Une page tient », deux fils : un doré (Licornes) et un brun (Gnomes).
- Les teintes par biome ; le thème sombre de la nuit polaire.
- Toute la table des sons ; les volumes 0,22 et 0,10 ; bois pour les Gnomes, verre pour les Licornes.
- La table ne s'applique qu'en « Tenir » ; le jeu classique et la console du prof (décision 34 de l'addendum 4 : elle reste
  l'outil ForêtMap) gardent l'affichage d'aujourd'hui.

## 3. Fichiers

- **À toi** (tu les modifies librement) :
  - `src/gl/components/tenir/GLOluBulle.jsx`
  - `src/gl/components/tenir/GLPeripetieOverlay.jsx`
  - `src/gl/utils/glVoyageurSounds.js`
  - `src/gl/components/MusicPlayer.jsx` et `src/gl/hooks/useGLPlateauMusic.js` (la musique qui pâlit ; le lot
    ecrans-5 y est passé avant toi)
  - Tests : `tests-ui/gl/GLPeripetieOverlay.test.jsx`, `tests-ui/gl/glVoyageurSounds.test.js`,
    `tests-ui/gl/GLProjectionView.test.jsx`, `tests-ui/gl/GLTenirEcranEquipe.test.jsx`,
    `tests-ui/gl/useGlTenirOlu.test.jsx`, `tests-ui/gl/glSettingsForm.test.js`
- **Nouveaux** :
  - `src/gl/components/tenir/GLMomentFort.jsx`
  - un module pour la table des scènes et des teintes par biome, sous `src/gl/utils/` (nom libre)
  - `tests-ui/gl/GLMomentFort.test.jsx`, `tests-ui/gl/GLOluBulle.test.jsx`, le test du module des scènes
- **D'un autre couloir, modification minimale permise** :
  - `src/gl/utils/glSettingsForm.js` (partagé) : le libellé du réglage `modules.voyageur_sounds_enabled` et son
    aide. La clé ne change pas : ne touche pas `lib/glSettings.js`.
  - Dans ton couloir, fichiers habillés par la table de jeu (lots ecrans-7 et ecrans-8) ; tu n'y fais que ceci :
    - `src/gl/styles/gl-table.css` (créé par ecrans-7) : tu y **ajoutes** les ambiances (teintes, nuit polaire), les
      moments forts, le médaillon et la note d'Olu, la carte de la péripétie. Tu ne changes aucune matière.
    - `src/gl/components/tenir/GLProjectionView.jsx` (habillé par ecrans-8) : étape 1, le montage de
      `GLMomentFort` ; étape 3, la teinte et la nuit sur la racine ; étape 5, le déclenchement des sons et la musique
      qui pâlit. Avant toi : ecrans-9 n'y a rien monté ; ecrans-10 y a posé la cible de la page arrachée.
    - `src/gl/components/tenir/GLTenirEcranEquipe.jsx` (habillé par ecrans-7) : étape 3, la teinte et la nuit sur la
      racine ; étape 5, le déclenchement des sons de la tablette.
    - `src/gl/components/tenir/GLTenirMoment.jsx` (habillé par ecrans-7, retouché par ecrans-10) : une prop de plus
      vers `GLPeripetieOverlay` (la scène) et vers `GLOluBulle`, rien d'autre.
    - `src/gl/components/mj/GLTourScreen.jsx` : il monte `GLOluBulle` à la console du prof ; n'y touche que s'il
      faut une prop pour garder le rendu d'aujourd'hui.
    - `tests/content/gl-mots-du-voyage.test.js` (créé par ecrans-6) : ajoute tes nouveaux composants à sa liste.
    - `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : voir section 9.
- **Ne touche pas** :
  - `src/gl/components/tenir/GLVoileLayer.jsx`, `GLTrameFils.jsx` : lot ecrans-9 (tu lis leur effet, tu ne le
    refais pas).
  - `src/gl/components/tenir/GLKraaWitness.jsx`, `GLChasseLayer.jsx`, `GLPlume.jsx`, `GLPageArrachee.jsx` : lot
    ecrans-10 (tu y accroches un son, de l'extérieur).
  - `src/gl/utils/resolvePlateauAudioSlug.js`, `src/gl/utils/glPlateauMusicProgress.js` : lot ecrans-5 ; tu les
    lis.
  - `src/shared/glBiomesRegistryCore.js` : noyau partagé, lecture seule.
  - `data/gl/tenir/peripeties.json` : couloir contenu ; le texte d'une péripétie ne se réécrit pas ici.
  - `src/gl/components/GLSeuilView.jsx` et « Mon sac » : lot ecrans-8.
  - `src/shared/styles/*`, `src/shared/components/*` : reste dans `src/gl/` (`npm run check:bundle`).

## 4. Étapes (un commit par étape, dans cet ordre)

Les lignes citées ont été lues sur `main` = `d65dca4`. Les lots passés avant toi ont pu les décaler : revérifie
chaque constat.

**Garde-fous de la direction artistique** (à faire relire par `gl-relecteur-garde-fous`) :

- L'oiseau n'a ni nom, ni cri, ni bulle, ni texte. Aucun de ses sons n'est un cri. Il n'est jamais le Souffle.
- Le voile se montre toujours en pâlissant ce qu'il touche (peinture du plateau, fanion de la figurine, plumes). Il
  n'est jamais dessiné comme une forme qui agit, une ombre qui avance seule, un visage ni une couleur sombre ; son
  icône est un repère fixe.
- Jamais le visage de Sélène.
- Parité : dans toute scène avec des personnages, filles et garçons ; rôles en formes doubles, jamais de point
  médian.
- Une seule surcouche à la fois ; un moment fort n'interrompt jamais une question ; mouvement réduit respecté
  partout.
- Bourses privées : aucun moment fort ne montre une bourse.
- Adresse : « vous » sur la tablette d'équipe et en projection.
- Aucun nouveau texte d'élève sans passage au filtre `findForbiddenString` (`src/shared/glGardeFousCore.js`) et au
  test `tests/content/gl-mots-du-voyage.test.js`, que tu complètes avec tes composants.

**L'interrupteur** `modules.table_de_jeu_enabled` (clé client `tableDeJeuEnabled`) est posé par le lot ecrans-7 :
tu le lis, tu ne le recrées pas.

**Les images** : aucune n'est versionnée. `img(slug)` de `src/gl/assets/index.js` lit la médiathèque et rend
`GL_ASSET_PLACEHOLDER_URL` quand la clé manque : c'est alors le repli qui s'affiche. `img()` rend le substitut tant
que le manifeste n'est pas chargé : prévois le re-rendu (`useGlAssetsReady`). Une feuille CSS ne peut pas appeler la
médiathèque : l'adresse d'une image se pose par un composant (attribut `src` ou variable CSS). Tests et captures
montrent les replis.

**Le monde en cours** : le sous-biome suit la case la plus avancée jamais atteinte par une équipe
(`src/gl/utils/glPlateauMusicProgress.js` › `furthestReachedPathIndex`, `musicSousBiomeAtPathIndex`, d'après
`sous_biome_slug` des cases) ; la saison de la toundra se déduit du sous-biome
(`resolvePlateauAudioSlug.js` › `inferSaisonFromBiomeSlug`, l. 45). C'est déjà ce qui choisit la musique. Sers-t'en
pour la teinte, la nuit et les scènes, sauf si tu trouves mieux ; dis-le dans ton rapport.

**Table des scènes par biome** (étapes 1 et 4). Slugs du registre `src/gl/data/biomes.registry.js` :

| Biome | Slug | Clé de la scène (camp et péripétie) |
| --- | --- | --- |
| Jungle | `jungle_afc` | `joie_jungle_lianes-chimpanzes` |
| Savane | `savane` | `joie_savane_balade-matriarche-suricates` |
| Sahara | `sahara` | `joie_sahara_oasis-baignade-glissade` |
| Méditerranée | `foret_mediterraneenne` | `recit_02-chap2_reconnaissance-pays-mediterraneen` |
| Caducifoliée | `foret_caducifoliee` | aucune pour l'instant : fond parchemin (voir section 11) |
| Landes | `landes` | `recit_03-chap3_landes-nommer-ensemble` |
| Taïga | `taiga` | `recit_04-chap4_taiga-marche-neige` |
| Toundra, été | `toundra`, sous-biome `toundra_ete` | `recit_05-chap5_toundra-ete-ouverture` |
| Toundra, nuit | `toundra`, sous-biome `toundra_hiver` | `recit_05-chap5_toundra-hiver-aurores` |

Si une clé ne résout pas d'image, ou si le biome n'est pas dans la table (`mangrove`, `prairie_steppe`,
`desert_froid`, case `transition`), le fond reste en parchemin. L'ancien texte donnait la clé de la Méditerranée
tronquée (`…-mediterra`) : la vraie est celle du tableau. Il donnait pour la Caducifoliée
`joie_foret_pluie-de-feuilles_avec-licorne` : cette image est réservée, **ne l'emploie pas**.

### ecrans-11.1 — Quatre moments forts en projection (ex-étape A1)

- **Constat vérifié** :
  - La projection connaît le tour (`round.number`, `round.phase` : `ouverture`, `jeu`, `souffle`, `clos`), la
    position du voile, le carnet et le camp (`auCamp` : partie `ended`) : `GLProjectionView.jsx` l. 157-176.
  - Son bandeau dit déjà « Tour 3 — Le voile avance » : `GLProjectionView.jsx` l. 189-195 ;
    `src/gl/constants/tenirPhases.js`.
  - L'ancien texte ne dit pas de quel champ se déduit chaque moment.
  - Aucune « carte Au camp » sous ce nom sur `main` : au camp, la projection montre « Ce qui change » en pied
    (`GLCeQuiChange`) et, s'il y a une page du jour, la carte plein écran `.gl-projection__carte`
    (`GLProjectionView.jsx` l. 221-262 et l. 310-323).
  - La vignette d'une page trouvée se résout par son code (`feuilletIllustration(code)`, `src/gl/assets/index.js`
    l. 165) ; le carnet sert `feuilletCode` et `titre` d'une page trouvée (`lib/glChasse.js` l. 1470-1471).
  - Après ecrans-8 : une seule surcouche à la fois (petite file `glOverlayQueue` dans `src/gl/utils/`, ou le
    mécanisme qu'ecrans-8 a retenu).
  - Après ecrans-9 : le voile glisse déjà en 1,6 s ; les pages tenues ont leur fil doré (`GLVoileLayer.jsx`,
    `GLTrameFils.jsx`).
- **Changement attendu** : `GLMomentFort.jsx`, monté par `GLProjectionView.jsx` ; 3 s au plus ; jamais au-dessus
  d'une question ; un à la fois (la file des surcouches) ; aucun en mouvement réduit (un simple bandeau de 2 s à la
  place) ; jamais sur la tablette d'équipe ; aucun si l'interrupteur est coupé.

  | Moment | Scène | Déduction proposée (à vérifier) |
  | --- | --- | --- |
  | **Le tour s'ouvre** | Un parchemin se déroule au centre : « Tour {n} », Cinzel, puis s'enroule | `round.number` change, phase `ouverture` |
  | **Le voile avance** | Le masque du voile (lot ecrans-9) glisse ; la musique pâlit (étape 5) ; aucun texte de plus que la phase | la position du voile change |
  | **Une page tient** | La vignette de la page passe du gris à la couleur, de gauche à droite ; deux fils, un doré (Licornes) et un brun (Gnomes), se rejoignent et se nouent | une page du carnet passe à `tenue` |
  | **Le camp** | La carte « Au camp » prend en fond la scène de joie du biome (table ci-dessus), les figurines des équipes autour d'un feu | `auCamp` |

  1. « Le voile avance » : `GL_icone_voile` peut se poser à côté du nom de la phase, en repère fixe, sans rien
     animer ; repli : le texte seul. Le voile lui-même reste la perte de couleur du plateau.
  2. « Une page tient » : sans vignette, le titre de la page sur parchemin.
  3. « Le camp » : cherche d'abord une carte « Au camp » posée par ecrans-7 ou ecrans-8. S'il n'y en a pas, pose la
     scène là où la projection montre le camp, et dis-le dans ton rapport. Si une clé ne résout pas d'image, la
     carte « Au camp » garde son fond parchemin.
  4. Tension à signaler, pas à trancher : le fil du plateau (lot ecrans-9) est doré pour tous, sans couleur
     d'équipe. Ici ce sont deux couleurs de **peuple**, dans la scène seulement, jamais sur le plateau. Code la
     scène telle qu'écrite ; le point est à relire par Oliv.
- **Textes** (mot pour mot) : « Tour {n} ». Aucun autre texte nouveau ; le nom de la phase reste celui de
  `tenirPhases.js`.
- **Tests** : `tests-ui/gl/GLMomentFort.test.jsx` (un seul moment à la fois ; deux demandés : le second à la
  fermeture du premier ; 3 s au plus ; mouvement réduit : un bandeau de 2 s ; jamais au-dessus d'une question
  ouverte ; interrupteur coupé : rien ; clé de scène absente : fond parchemin ; aucune bourse) ;
  `tests-ui/gl/GLProjectionView.test.jsx` (la projection le monte) ; `tests-ui/gl/GLTenirEcranEquipe.test.jsx` (la
  tablette ne le monte jamais).
- **Critère d'acceptation** : au tableau, chacun des quatre moments se voit, trois secondes au plus, un seul à la
  fois, et jamais par-dessus une question.

### ecrans-11.2 — Olu en portrait (ex-étape A2)

- **Constat vérifié** :

| Fait | Où |
| --- | --- |
| La bulle d'Olu est un paragraphe (`gl-olu-bulle`, test-id `gl-olu-bulle`, `data-moment`) : « OLU : » puis la ligne ; aucun dessin d'Olu | `GLOluBulle.jsx` l. 5-17 ; `gl-tenir.css` l. 219-226 |
| Elle est montée par la carte du moment (tablette d'équipe) et par la console du prof | `GLTenirMoment.jsx` l. 383 ; `mj/GLTourScreen.jsx` l. 583 |
| Sur `main`, elle n'est pas montée en projection ; elle y arrive avec le lot ecrans-2 | — |
| Olu a déjà un portrait ailleurs dans G&L : `MascotSpeaker` (taille `face`) avec le narrateur de `useGlNarrator` | `src/gl/components/GLHelpPanel.jsx` l. 46-51 ; `src/shared/components/MascotSpeaker.jsx` ; `src/gl/hooks/useGlNarrator.js` |

- **Changement attendu** : `GLOluBulle.jsx` : Olu parle depuis un **médaillon peint** (`GL_olu_portrait`, 72 px sur
  la tablette, 112 px en projection ; repli : le rendu actuel de la mascotte dans un cercle de laiton) posé dans un
  coin ; sa bulle devient une **note épinglée** sur parchemin (punaise de laiton, légère rotation de − 1,5°). Le
  texte et les règles d'Olu ne changent pas (le geste d'abord, jamais de morale). La console du prof garde le rendu
  d'aujourd'hui. Interrupteur coupé : le rendu d'aujourd'hui partout. La bulle reste cachée tant qu'Olu est figé
  (`frozen`).
- **Textes** : aucun texte nouveau.
- **Tests** : `tests-ui/gl/GLOluBulle.test.jsx` (médaillon avec image ; sans image, le portrait de repli dans son
  cercle ; note épinglée ; `gl-olu-bulle` et `data-moment` gardés ; figé : rien ; console : le rendu d'aujourd'hui ;
  mouvement réduit : pas de rotation animée) ; `tests-ui/gl/useGlTenirOlu.test.jsx` reste vert.
- **Critère d'acceptation** : sur la tablette et au tableau, Olu a un visage et une note ; ses phrases sont les
  mêmes, mot pour mot.

### ecrans-11.3 — La couleur du monde, et la nuit polaire (ex-étape A3)

- **Constat vérifié** :

| Fait | Où |
| --- | --- |
| L'ancien texte ne nomme aucun fichier à modifier, seulement la source des biomes | `src/gl/data/biomes.registry.js` (réexport de `src/shared/glBiomesRegistryCore.js`) |
| Le registre a 11 biomes ; l'étape donne 8 teintes et la nuit ; `mangrove`, `prairie_steppe`, `desert_froid` et la case `transition` n'ont pas de teinte | `glBiomesRegistryCore.js` l. 18-150 |
| L'ancien texte disait la nuit polaire « sous-biome de nuit du chapitre 7 » : c'est faux. Le sous-biome `toundra_hiver` est dans le chapitre id 6 (plateau 4, joué) et dans le chapitre id 7 (mis de côté) | lu en prod le 24/11 |
| Après ecrans-7 : la racine de la tablette porte `.gl-table` ; après ecrans-8 : la projection aussi | `GLTenirEcranEquipe.jsx`, `GLProjectionView.jsx` |

- **Changement attendu** : une variable `--gl-biome-ambient` par biome teinte les accents des écrans de la table
  (bandeau, filets, halo de la carte du moment) sans toucher au bois : jungle vert profond, savane ocre, sahara
  sable, méditerranée olive, caducifoliée rousse, landes bruyère, taïga bleu-vert, toundra été lichen doré.
  **Nuit polaire** : quand le monde en cours est le sous-biome `toundra_hiver` (jamais un numéro de chapitre), les
  écrans de la table passent en thème sombre (bleu nuit `#0f1d2e`, texte clair `#eef2f6`, plateau assombri de 15 %).
  Contraste AA vérifié pour chaque teinte.
  1. Le composant pose le biome sur la racine (attribut ou variable CSS) ; la feuille `gl-table.css` porte les
     teintes.
  2. Les valeurs exactes des huit teintes ne sont pas données : choisis-les, vérifie-les AA, liste-les dans ton
     rapport, section « À relire par Oliv ».
  3. Un biome sans teinte : aucune teinte, les accents gardent leur couleur de base (non dit par l'ancien texte ;
     dis-le dans ton rapport).
  4. La nuit est celle du monde : le voile reste une perte de couleur, il doit se lire encore sur le plateau
     assombri ; vérifie-le.
  5. « Mon sac » à la veillée garde sa lueur de feu : ni teinte de nuit ni thème sombre du monde (décision du 24/11,
     14 h 16). N'y touche pas.
  6. Interrupteur coupé : ni teinte, ni nuit.
- **Textes** : aucun.
- **Tests** : dans `tests-ui/gl/GLTenirEcranEquipe.test.jsx` et `tests-ui/gl/GLProjectionView.test.jsx` : le biome
  posé sur la racine ; `toundra_hiver` → thème de nuit, quel que soit le chapitre ; `toundra_ete` → pas de nuit ;
  biome sans teinte → rien. Un test de contraste AA de chaque teinte et du thème de nuit (calcul sur les valeurs de
  la table).
- **Critère d'acceptation** : les accents changent de couleur d'un monde à l'autre, le bois ne change pas ; dans la
  nuit polaire, tablette et tableau sont en bleu nuit, lisibles.

### ecrans-11.4 — La péripétie illustrée (ex-étape A4)

- **Constat vérifié** : `GLPeripetieOverlay.jsx` est un plein écran sombre avec un panneau clair (titre « Péripétie
  — {équipe} », le texte du catalogue, un compte à rebours de 30 s, « On passe ») ; il reçoit `peripetie` et
  `teamName`, rien sur le biome ; il est monté par la carte du moment (`GLTenirMoment.jsx` l. 385). Styles :
  `gl-tenir.css` l. 228-249. L'ancien texte ne dit pas de quelle case vient « le biome » : par défaut, le monde en
  cours (voir plus haut) ; dis-le dans ton rapport.
- **Changement attendu** : `GLPeripetieOverlay.jsx` : le panneau prend en fond la scène du biome (table des scènes
  ci-dessus), assombrie à 35 % sous le texte ; le texte sur une carte de parchemin. Clé absente ou biome hors
  table : fond parchemin. Le texte, le compte à rebours et « On passe » ne changent pas. Interrupteur coupé :
  l'affichage d'aujourd'hui. Contraste AA du texte sur sa carte.
- **Textes** : aucun texte nouveau (le texte d'une péripétie vient du catalogue, il n'est jamais réécrit ici).
- **Tests** : `tests-ui/gl/GLPeripetieOverlay.test.jsx` (avec scène : l'image en fond et la carte de parchemin ;
  sans scène : fond parchemin ; les 30 s et « On passe » inchangés ; `gl-peripetie-overlay` gardé).
- **Critère d'acceptation** : une péripétie s'affiche sur l'image du monde traversé, son texte lisible sur
  parchemin.

### ecrans-11.5 — Les sons du tour (ex-étape S4)

- **Constat vérifié** :
  - Les sons sont synthétisés (Web Audio, aucun fichier) : `soundScore(kind, options)` rend une partition de notes
    d'oscillateur, `playVoyageurSound` la joue ; volume maître 0,16 ; aucune source de bruit
    (`src/gl/utils/glVoyageurSounds.js` l. 18, l. 74-113, l. 116-150).
  - Le peuple ne change qu'un son aujourd'hui (`options.people`, l. 106-109).
  - Deux coupures : le prof (module `voyageurSoundsEnabled`, poussé par `setVoyageurSoundsAllowed`, `AppGL.jsx`
    l. 723) et l'élève (`gl_voyageur_sfx_muted`, même fichier l. 23-45).
  - Le libellé du réglage est « Sons du voyageur » (`src/gl/utils/glSettingsForm.js` l. 255-258) ; la clé est
    `modules.voyageur_sounds_enabled` (`lib/glSettings.js` l. 409).
  - La musique de plateau vit dans deux éléments `Audio` en fondu croisé, pas dans `MusicPlayer.jsx` :
    `src/gl/hooks/useGLPlateauMusic.js` l. 76-89.
  - `MediaElementSource` et `BiquadFilter` : aucune occurrence dans le dépôt.
  - Après ecrans-5 : la musique ne joue qu'en projection, après un clic sur « Activer le son ».
  - Le journal du tour porte déjà des évènements utiles : `pas_encore`, `page_tenue`, `voile_avance`,
    `lumiere_palier`, `chapardeur`, `arrivee_camp` (`lib/glTour.js`, `lib/glChasse.js`, `lib/glChapardeur.js`) ;
    l'oiseau qui se pose se lit dans `carnet.kraa.at`.
  - L'ancien texte ne rattache aucun son à un champ, et ne donne pas les notes du motif.
- **Changement attendu** : même moteur de synthèse que `glVoyageurSounds` (aucun fichier, aucune licence). **Les
  Gnomes sonnent bois, les Licornes sonnent verre.**

  | Moment | Son | Projection | Tablette d'équipe |
  | --- | --- | --- | --- |
  | Dés révélés | Gnomes : trois claquements de bois ; Licornes : trois tintements de verre | oui | la sienne |
  | Bonne réponse | Tierce majeure résolue, 0,4 s | oui | oui |
  | « Pas encore » | Deux notes douces qui montent et restent en suspens (quarte ; jamais grave, jamais dissonant) | oui | oui |
  | L'oiseau se pose | Trois souffles de bruit filtré (battement d'ailes), **jamais de cri** | oui | la sienne |
  | Page trouvée | La note suivante d'un motif pentatonique de 8 notes par chapitre | oui | oui |
  | Page tenue | Bois et verre ensemble | oui | oui |
  | Le voile avance | **Aucun son ajouté : la musique pâlit** (passe-bas de 8 000 à 600 Hz, volume × 0,5 pendant 3 s, retour en 2 s ; `MediaElementSource` + `BiquadFilter`) ; sans musique, silence | oui | non |
  | Palier de Lumière | Le motif du carnet en entier, vite | oui | non |
  | L'oiseau chapardeur passe | Battement d'ailes, jamais de cri | oui | la sienne |
  | Camp | Les notes trouvées du chapitre, lentement, sans trou à la place des pages manquantes | oui | non |

  1. Volumes : 0,22 en projection, 0,10 sur la tablette d'équipe, rien sur les comptes perso pendant le tour.
  2. Interrupteur : `modules.voyageur_sounds_enabled` (libellé « Sons du jeu »). Complète l'aide du réglage, côté
     prof : il coupe aussi les sons du tour.
  3. « La sienne » : la tablette ne joue ce son que pour un évènement de sa propre équipe.
  4. Le filtre de la musique se branche sur les deux éléments `Audio` de `useGLPlateauMusic.js`. Il ne joue rien
     tant que le son n'est pas activé au tableau.
  5. Les notes du motif ne sont pas données : compose un motif pentatonique de 8 notes par chapitre et liste-les
     dans ton rapport. Un plateau peut cacher plus de huit pages : dis ce que joue la neuvième.
  6. Rattache chaque son à l'évènement ou au champ qui le dit (pistes dans le constat) ; liste les rattachements
     dans ton rapport. Un son qui ne trouve pas son évènement : étape `partielle`, pas d'évènement inventé côté
     serveur.
  7. Un son de l'oiseau ne contient aucune note tenue ni aucune voix : du bruit filtré seulement.
- **Textes** : le libellé « Sons du jeu » (réglages du prof). Aucun texte d'élève.
- **Tests** : `tests-ui/gl/glVoyageurSounds.test.js` (une partition par moment ; bois ou verre selon le peuple ; les
  sons de l'oiseau n'ont que du bruit ; « Pas encore » monte et ne descend pas ; durées courtes ; volumes 0,22 et
  0,10 ; rien si le prof ou l'élève a coupé) ; un test que les comptes perso ne jouent rien pendant un tour ouvert ;
  `tests-ui/gl/GLProjectionView.test.jsx` (le voile avance : le filtre est demandé, aucun son ajouté ; sans musique,
  rien) ; `tests-ui/gl/GLTenirEcranEquipe.test.jsx` (un évènement d'une autre équipe ne sonne pas sur la tablette) ;
  `tests-ui/gl/glSettingsForm.test.js` (le libellé).
- **Critère d'acceptation** : au tableau, chaque moment du tour a son son, bas et court ; l'oiseau ne crie jamais ;
  quand le voile avance, rien ne s'ajoute, la musique s'assourdit trois secondes ; un réglage coupe tout.

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/`.

**Clés de médiathèque employées par ce lot, et leur repli** :

| Clé | Contenu | Étape | Repli sans image |
| --- | --- | --- | --- |
| `GL_olu_portrait` | Olu en médaillon peint | 2 | Le portrait actuel d'Olu (`MascotSpeaker`) dans un cercle de laiton |
| `GL_icone_voile` | Pictogramme du voile, repère fixe | 1 (« Le voile avance », à côté du nom de la phase) | Le texte seul |
| Les huit clés de scène de la table de la section 4 | Scènes des mondes | 1 et 4 | Fond parchemin |
| vignette d'une page (`feuilletIllustration(code)`) | Illustration de la page tenue | 1 | Le titre de la page sur parchemin |

Les huit clés de scène sont dans `src/gl/assets/manifest.images.json` ; leur présence dans la médiathèque de prod
n'a pas été vérifiée. Non employée : `joie_foret_pluie-de-feuilles_avec-licorne` (réservée). Les sons n'ont aucun
fichier.

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-tenir-projection.spec.js`, `e2e/gl-tenir-tablettes.spec.js`,
  `e2e/gl-zone-music.spec.js`.
- Banc, régime fumée : une seule passe à la fin, les deux scénarios des règles communes ; il doit être vert.
- `npm run check:bundle` : tes fichiers sont sous `src/gl/`, le budget ne doit pas bouger.
- Captures (`docs/captures/gl-decisions/ecrans-11/`), en replis : projection pendant « Le tour s'ouvre », « Une
  page tient » et « Le camp » ; tablette d'équipe avec Olu en médaillon ; une péripétie ; tablette et projection en
  nuit polaire ; une capture interrupteur coupé.
- À rendre dans ton rapport : d'où se déduit chaque moment fort ; les huit teintes et leur contraste ; les notes
  des motifs ; le rattachement de chaque son ; ce qui n'a pas pu être entendu (un banc n'écoute pas).

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| Libellé du réglage `modules.voyageur_sounds_enabled` | « Sons du voyageur » | « Sons du jeu » |
| `gl-olu-bulle` (test-id) | Un paragraphe « OLU : … » | Gardé, dans une note épinglée avec un médaillon (tablette, projection) ; inchangé à la console |
| `gl-peripetie-overlay` (test-id) | Panneau clair sur fond sombre | Gardé ; fond de scène et carte de parchemin |
| `soundScore` | Huit sortes de son | Les mêmes, plus les sons du tour |
| Racine de la tablette et de la projection | — | Porte le biome en cours et, en nuit polaire, le thème de nuit |

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : les quatre moments forts ; la table des scènes par biome et le
  repli ; les teintes et la nuit polaire (critère : sous-biome `toundra_hiver`) ; Olu en portrait ; la table des
  sons, les volumes, le réglage.
- `docs/reference/gl/guide-du-mj.md` (l. 18) et `docs/reference/gl/presentation.md` (l. 145) : le module s'appelle
  « Sons du jeu ». Cette phrase seulement ; le reste des docs du prof est au lot fin-2.
- `changelog.d/gl-decisions-ecrans-11.md`.

## 10. Hors périmètre

- Le voile qui pâlit, son glissement, le fil doré du plateau : lot ecrans-9.
- L'oiseau qui se pose, la plume, la page qui s'arrache : lot ecrans-10.
- La musique par biome, « Activer le son », le volume pendant une question : lot ecrans-5.
- La file des surcouches, « Mon sac » et sa veillée : lot ecrans-8.
- Le texte des péripéties : couloir contenu.
- Les docs du prof (« Sons du jeu », les rôles, la lecture du plateau), les captures finales : lot fin-2 ; le § 0
  des règles : lot fin-1.
- Aucune règle, aucune route, aucun évènement nouveau côté serveur, aucun réglage nouveau.

## 11. Pour Oliv

**À relire**

- **La scène de la forêt caducifoliée** : l'image prévue (`joie_foret_pluie-de-feuilles_avec-licorne`) est
  réservée (« pas pour les élèves ») ; le lot ne l'emploie pas et laisse le parchemin. Quelle image à la place ?
- Les trois scènes de la série « joie » (jungle, savane, Sahara) : à regarder pour la parité avant de les projeter.
- La scène « Une page tient » : un fil doré pour les Licornes et un fil brun pour les Gnomes, alors que le fil du
  plateau est doré pour tous. À garder ou à passer à deux fils dorés ?
- La carte « Au camp » : elle n'existait pas sous ce nom ; le rapport du lot dit où la scène a été posée.
- Les huit teintes de monde et le bleu de la nuit polaire (valeurs dans le rapport du lot).
- Les sons : toute la table est un choix de Claude. À écouter au tableau ; les notes des motifs sont dans le
  rapport du lot.
- Non vérifié : la projection et la tablette en vrai ; le son dans une salle de classe.

**À faire après la vague**

- Téléverser `GL_olu_portrait` dans la médiathèque (et `GL_icone_voile` si ce n'est pas fait). Sans elles, tout
  marche, en replis.
- Vérifier que les huit scènes sont bien dans la médiathèque de prod sous leurs clés.
- Écouter la projection : volumes, et la musique qui pâlit quand le voile avance.
