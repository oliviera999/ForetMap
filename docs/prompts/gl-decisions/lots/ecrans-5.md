# Lot ecrans-5 — Le son : la projection chante

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge légère · banc : fumée
> Branche : `claude/gl-decisions-ecrans-5` · Attend : ecrans-4 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- La musique de chaque biome joue enfin : le code retrouve les pistes sous le nom qu'elles ont dans la médiathèque.
- Elle joue **sur la projection seule**, après un bouton « Activer le son » touché une fois sur le poste de projection.
- La tablette d'équipe, le compte d'élève et la console du prof n'ont plus ni musique ni bouton de musique.
- La musique d'intro de l'app ne prend plus une image pour un son.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| I10 (addendum 2) | 24/11, prise « telle qu'écrite » par la décision 39 de l'addendum 4 (11 h 41) | La musique par biome joue (clés réparées), sur la projection seule ; plus de bouton de musique orphelin ailleurs ; la musique d'intro de l'app ne prend plus une image pour un son. | — |
| Décision 39 de l'addendum 4 | 24/11, 11 h 41 | Plus de gel ; les décisions I1 à I10 de l'addendum 2 sont prises telles qu'écrites. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |

**Choix par défaut posés par Claude** (la session les applique sans demander ; Oliv peut les retirer) :

- La projection seule chante ; la musique de zone suit la même règle.
- Volume × 0,4 pendant une question montrée en projection, fondu de 600 ms.
- Pour la forêt méditerranéenne, la piste « (2) » passe avant la « (1) ».
- Aucun réglage ne change : couper `modules.zone_music_enabled` reste une décision d'Oliv.
- Posé à l'écriture de cette fiche, à relire (section 11) : la piste par défaut d'un plateau suit la même liste de
  clés candidates que son biome ; l'aperçu d'une piste dans l'éditeur de zones du prof ne change pas.

Cadre de la décision I10 : **aucune route, aucun réglage, aucun défaut de réglage, aucun schéma**.

## 3. Fichiers

**À toi** (vérifiés sur `main`) :

- `src/gl/utils/resolvePlateauAudioSlug.js` (les deux résolveurs : `resolvePlateauAudioSlug`, `resolveIntroAudioSlug`)
- `src/gl/assets/index.js` (seulement `plateauAudio()` et `introAudio()` : passer l'index des clés aux résolveurs)
- `src/gl/hooks/useGLPlateauMusic.js`, `src/gl/hooks/useGLZoneMusic.js`
- `src/gl/components/MusicPlayer.jsx`, `src/gl/components/GLZoneMusicMuteButton.jsx`
- `src/gl/components/GLBoardChrome.jsx` (retrait du bouton de musique de zone, l. 105-109 de `main`)
- `src/gl/AppGL.jsx` (montage de `MusicPlayer`, de `GLZoneMusicMuteButton`, de `useGLZoneMusic` et de
  `useGLZoneMusicArrival` ; propriétés `zoneMusic*` passées au plateau)
- `src/gl/components/tenir/GLProjectionView.jsx` (montage de la musique et du bouton « Activer le son »)
- `src/gl/styles/gl-tenir.css` (style du bouton « Activer le son » dans `.gl-projection`, rien d'autre)
- Tests : `tests/gl-plateau-audio-slug.test.js`, `tests-ui/gl/GLProjectionView.test.jsx`,
  `tests-ui/gl/GLTeamSessionView.test.jsx`, `e2e/gl-zone-music.spec.js`

**Nouveaux** : aucun fichier de code obligatoire. Un test UI de `MusicPlayer` peut naître sous
`tests-ui/gl/MusicPlayer.test.jsx`.

**D'un autre couloir, modification minimale permise** :

- `src/gl/components/GLGameBoard.jsx`, `src/gl/components/GLMapView.jsx` : retirer les propriétés `zoneMusicEnabled`,
  `zoneMusicMuted`, `onZoneMusicToggle`, `onZoneMusicUnlock` **seulement** si plus personne ne les lit. Aucun autre
  changement dans ces deux fichiers.
- `docs/reference/gl/guide-du-mj.md`, `docs/reference/gl/carte-du-royaume.md` : la seule phrase qui deviendrait fausse
  (section 9).

**Ne touche pas** :

- `src/gl/utils/glVoyageurSounds.js` et tout son du tour (dés, bonne réponse, oiseau, « la musique pâlit ») : lot
  ecrans-11.
- `src/gl/components/GLChapterMapStudio.jsx` (l'aperçu d'une piste dans l'éditeur de zones du prof) et
  `src/gl/hooks/useGLKingdomZones.js` : outil de préparation, pas un écran de jeu.
- `lib/glSettings.js`, `src/gl/utils/glSettingsForm.js`, `lib/glZoneMusic.js`, toute route : aucun réglage, aucune
  route.
- `lib/shared/*` (miroir généré), `src/shared/*`.

## 4. Étapes (un commit par étape, dans cet ordre)

### ecrans-5.1 — La musique par biome joue (ex-étape S1)

- **Constat vérifié** sur `main` (`src/gl/utils/resolvePlateauAudioSlug.js`) :
  - `AUDIO_BY_BIOME` (l. 19-32) ne connaît qu'une clé par biome, de la forme `plateau-N_*` (`plateau-1_jungle`,
    `plateau-2_savane`, `plateau-1_desert-chaud`, `plateau-2_mediterranee`, `plateau-4_foret-caducifoliee`,
    `plateau-3_landes`, `plateau-5_taiga`, `plateau-5_toundra-jour`, `plateau-5_toundra-nuit`).
  - Le garde « c'est bien un fichier audio » (`isAudioKey`, l. 106-111 : `relativePath` contient `/audio/`) ne sert
    qu'au repli par préfixe (l. 112-116), pas aux clés nommées.
  - `src/gl/assets/index.js › plateauAudio()` (l. 140-156) passe déjà l'index des clés (`keysIndex`) au résolveur.
  - Un test existe déjà : `tests/gl-plateau-audio-slug.test.js` (trois cas, dont « une image de plateau ne devient
    jamais une musique »). Ses appels sans index doivent rester verts.
- **Constat de prod, non vérifiable depuis le dépôt** (lu le 24/11 dans `/uploads/media-library/_keys.json`, fichier
  de la médiathèque, hors dépôt) : la médiathèque a importé les dix pistes sous leur nom d'origine : `jungle`,
  `savane`, `desert`, `mediterranee (1)`, `mediterranee (2)`, `foret caducifolie`, `landes`, `taiga`, `toundra jour`,
  `toundra nuit`. Le code cherche `plateau-1_jungle`, `plateau-2_savane`… : dix pistes, jamais jouées. Le manifeste
  audio servi par la médiathèque de prod avait tous ses `src` à `null`. Le fichier du dépôt est
  `src/gl/assets/manifest.audio.json` (copie embarquée, repli quand le manifeste servi manque) : seul `intro` y a
  `src: null`.
- **Changement attendu** :
  1. Une **liste de clés candidates par biome**, la clé `plateau-N_*` d'abord, puis le nom de la médiathèque :

     | Biome canonique | Candidates, dans l'ordre |
     | --- | --- |
     | `jungle_afc` | `plateau-1_jungle`, `jungle` |
     | `savane` | `plateau-2_savane`, `savane` |
     | `sahara` | `plateau-1_desert-chaud`, `desert` |
     | `foret_mediterraneenne` | `plateau-2_mediterranee`, `mediterranee (2)`, `mediterranee (1)` |
     | `foret_caducifoliee` | `plateau-4_foret-caducifoliee`, `foret caducifolie` |
     | `landes` | `plateau-3_landes`, `landes` |
     | `taiga` | `plateau-5_taiga`, `taiga` |
     | toundra, été | `plateau-5_toundra-jour`, `toundra jour` |
     | toundra, nuit | `plateau-5_toundra-nuit`, `toundra nuit` |

  2. Une clé n'est retenue que si son `relativePath` contient `/audio/` : étends à **toutes** les candidates le garde
     du repli par préfixe. Sans index, ou pour une clé sans `relativePath`, le garde laisse passer, comme
     aujourd'hui (les tests existants appellent sans index).
  3. La piste par défaut d'un plateau (`DEFAULT_AUDIO_BY_PLATEAU`) suit la liste de son biome (plateau 1 :
     `jungle_afc` ; 2 : `sahara` ; 3 : `foret_caducifoliee` ; 4 et 5 : `taiga`). Le texte d'origine ne le dit pas :
     choix posé à l'écriture de la fiche, à redire dans ton rapport.
  4. Les biomes hors trajet (`mangrove`, `prairie_steppe`, `desert_froid`) gardent leur clé unique.
- **Textes** : aucun.
- **Tests** (`tests/gl-plateau-audio-slug.test.js`, à compléter) : un test unitaire sur un **index de clés de
  médiathèque**. L'ancien texte le voulait « copié de la prod (les 20 clés audio et une image homonyme) » : cet index
  n'est fourni nulle part et tu n'as pas la prod. **Tu construis le jeu d'essai** et tu le dis dans ton rapport :
  - les dix noms de la médiathèque ci-dessus, chacun avec un `relativePath` sous `media-library/audio/…` ;
  - les clés `plateau-N_*` du tableau, pour vérifier qu'elles passent devant quand elles existent ;
  - au moins une **clé homonyme qui est une image** (une candidate, par exemple `savane`, dont le `relativePath` est
    sous `media-library/image/…`) : elle n'est pas retenue ;
  - cas attendus : chaque biome du tableau rend le nom de la médiathèque quand la clé `plateau-N_*` manque ;
    `foret_mediterraneenne` rend `mediterranee (2)` avant `mediterranee (1)` ; `toundra_hiver` rend `toundra nuit` ;
    une image homonyme seule rend `null`.
- **Critère d'acceptation** : avec un index qui ne contient que les dix noms d'origine, chaque biome du voyage résout
  une piste audio ; aucune image ne devient une musique ; les trois tests existants restent verts.

### ecrans-5.2 — La projection chante, les autres écrans se taisent (ex-étape S2)

- **Constat vérifié** sur `main` (les lignes bougeront après le lot ecrans-4, qui réécrit ces deux fichiers) :
  - `src/gl/AppGL.jsx` : la projection est rendue seule, avant tout le reste (l. 942-950,
    `<GLProjectionView gameId token />`) ; `MusicPlayer` est monté bien plus bas (l. 1495-1500), avec le dock.
    La projection n'a donc jamais de musique.
  - `src/gl/components/MusicPlayer.jsx` : le bouton vit dans un bloc `aria-hidden` (l. 33), sans feuille de style
    (`gl-plateau-music`), et il réemploie `GLZoneMusicMuteButton`, titré « Couper la musique des zones »
    (`src/gl/components/GLZoneMusicMuteButton.jsx`, l. 14-15) : un bouton orphelin.
  - `MusicPlayer` débloque l'audio au premier `pointerdown` de la fenêtre (l. 24-28) : le navigateur exige un geste
    à chaque chargement de page.
  - Boutons de musique de zone hors projection : `src/gl/components/GLBoardChrome.jsx` (l. 105-109) et le dock de
    `AppGL.jsx` (l. 1520-1529). La musique de zone elle-même est pilotée dans `AppGL.jsx` (l. 562-598 :
    `useGLZoneMusic`, `useGLZoneMusicArrival`), à partir de `gameState`, que la projection ne charge pas.
  - `GLProjectionView.jsx` lit seule l'état de la partie (`GET /api/gl/games/:id`, l. 130-155) : elle a `state.game`,
    `state.markers`, `state.teams`. Le biome de la musique se calcule aujourd'hui dans `AppGL.jsx` (l. 526-541,
    `resolvePlateauMusicBiomeSlug` de `src/gl/utils/glPlateauMusicProgress.js`, avec `chapter_plateau_number`).
  - Elle ne reçoit pas les modules (`modules.*`) : vérifie d'où elle peut lire `zoneMusicEnabled`.
- **Changement attendu** :
  1. `MusicPlayer` (musique par biome) est monté **dans `GLProjectionView`**, avec le plateau, le biome et la saison
     calculés comme dans `AppGL.jsx` (même fonction, pas de copie de la règle).
  2. Un bouton **« Activer le son »**, montré une fois : le premier clic débloque l'audio du navigateur ; le fait est
     mémorisé dans le `localStorage` du poste de projection (lecture et écriture sous `try/catch` ; nom de clé à ton
     choix, à dire dans ton rapport). Aucune lecture automatique sans ce premier clic.
  3. **Plus aucune musique ni bouton de musique sur les autres écrans G&L** (tablette d'équipe, compte d'élève,
     console) : retire le montage de `MusicPlayer` et de `GLZoneMusicMuteButton` hors projection. Le bouton orphelin
     de `MusicPlayer` (bloc `aria-hidden`, sans CSS, titré « Couper la musique des zones ») disparaît.
  4. La **musique de zone** (`useGLZoneMusic`) suit la même règle : projection seule. Si la projection ne peut pas
     lire les zones du chapitre sans route nouvelle (`GET /api/gl/kingdom-map/zones?chapterId=…` refusé à une
     session de projection), **n'ajoute pas de route** : la musique de zone se tait partout, et tu le dis dans ton
     rapport. **Aucun réglage ne change.**
  5. Pendant une **question montrée en projection** (apportée par le lot ecrans-4) : volume × 0,4, fondu de 600 ms,
     retour au volume normal à la fermeture. Si le rapport du lot ecrans-4 dit qu'il a renoncé à montrer la question
     en projection, il n'y a pas de signal : écarte ce point et dis-le.
  6. `prefers-reduced-motion` ne coupe pas le son.
- **Textes** (mot pour mot) : « Activer le son ».
- **Tests** :
  - `tests-ui/gl/GLProjectionView.test.jsx` : la projection monte `MusicPlayer` et le bouton « Activer le son » ;
    après un clic, le bouton n'est plus montré et le choix est mémorisé ; volume réduit pendant une question.
  - `tests-ui/gl/GLTeamSessionView.test.jsx` et un test du compte d'élève : aucun bouton de musique (ni
    `gl-zone-music-toggle`, ni « Activer le son »).
  - `e2e/gl-zone-music.spec.js` : son dernier test attend le bouton `gl-zone-music-toggle` sur un compte d'élève
    (l. 99) ; il devient « absent sur le compte d'élève ». Le test d'API du même fichier ne change pas.
- **Critère d'acceptation** : la projection joue la piste du biome après « Activer le son » ; aucun autre écran G&L
  ne monte un lecteur ni un bouton de musique ; aucune requête de plus qu'avant sur la tablette et le compte.

### ecrans-5.3 — La musique d'intro de l'app ne prend plus une image (ex-étape S3)

- **Constat vérifié** sur `main` : `resolveIntroAudioSlug(knownSlugs)` (même fichier, l. 121-129) essaie
  `intro_ambiance`, `intro_loop`, `intro_01_la-boite`, puis toute clé `intro_*`. Il ne reçoit pas l'index des clés et
  ne regarde jamais le `relativePath`. Or `intro_01_la-boite` est une **image** : la clé figure dans
  `src/gl/assets/manifest.images.json` (PNG en prod, non vérifiable ici). Appelant : `src/gl/assets/index.js ›
introAudio()` (l. 158-163).
- **Changement attendu** : le résolveur ne retient qu'une clé dont le `relativePath` contient `/audio/` ; sinon il
  rend `null` et aucun lecteur n'est créé. `introAudio()` lui passe l'index des clés. Vérifie que le repli de
  `introAudio()` (`audio('intro')`, dont le `src` est `null`) ne ramène pas une image par un autre chemin.
- **Textes** : aucun.
- **Tests** (`tests/gl-plateau-audio-slug.test.js`) : clé d'image → `null` ; clé audio → la clé (et, par
  `introAudio()`, une URL).
- **Critère d'acceptation** : avec `intro_01_la-boite` seule dans l'index, sous `media-library/image/…`, aucun
  élément audio n'est créé pour l'intro.

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire.

**Images** : ce lot n'emploie aucune image.

**Clés audio de la médiathèque** (aucune piste n'est versionnée) : les clés du tableau de l'étape ecrans-5.1. Repli
de chacune : le silence (pas de lecteur, pas de bouton cassé). Tests et captures tournent sans médiathèque : ils
montrent le bouton « Activer le son », pas une piste qui joue.

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-zone-music.spec.js`, `e2e/gl-tenir-projection.spec.js`,
  `e2e/gl-tenir-tablettes.spec.js`.
- Banc, régime fumée : une passe à la fin (les deux scénarios des règles communes), verte, sans seuil.
- `npm run check:bundle` : ce lot ne doit rien ajouter à `src/shared/*`.
- Captures dans `docs/captures/gl-decisions/ecrans-5/` : projection avec « Activer le son » ; tablette d'équipe sans
  bouton de musique.
- À rendre dans ton rapport : le jeu d'essai construit pour ecrans-5.1 ; le nom de la clé `localStorage` ; ce que
  devient la musique de zone (jouée en projection, ou tue faute de route) ; si le volume réduit pendant une question
  a pu se brancher.

## 8. Contrats de test changés

- Montage de `MusicPlayer` : projection seule.
- `data-testid="gl-zone-music-toggle"` : absent de la tablette d'équipe, du compte d'élève et de la console
  (`e2e/gl-zone-music.spec.js`, dernier test).
- Nouveau texte attendu en projection : « Activer le son ».
- `resolveIntroAudioSlug` : rend `null` pour une clé d'image.

## 9. Docs à mettre à jour dans ce lot

- `docs/reference/gl/guide-du-mj.md` et `docs/reference/gl/carte-du-royaume.md` : seulement la phrase qui deviendrait
  fausse. À dire : la musique se joue sur la projection ; au premier lancement, toucher « Activer le son ».
- Une ligne pour le § 0 des règles, dans ton rapport : « 24/11 : la musique joue sur la projection seule ; bouton
  "Activer le son" au premier lancement ».
- `changelog.d/gl-decisions-ecrans-5.md`.

## 10. Hors périmètre

- Les sons du tour (dés, bonne réponse, « pas encore », l'oiseau qui se pose, la musique qui pâlit quand le voile
  avance) : lot ecrans-11.
- L'habillage de la projection en table de jeu : lot ecrans-8.
- Les mots du voyage dans la projection (« Lumière de la caravane », « Carnet de la caravane ») : lot ecrans-6.
- Téléverser ou renommer les pistes dans la médiathèque, couper `modules.zone_music_enabled` : Oliv.

## 11. Pour Oliv

**À relire**

- Le texte du bouton : « Activer le son ».
- Deux choix posés à l'écriture de la fiche : la piste par défaut d'un plateau suit la liste de son biome ; l'aperçu
  d'une piste dans l'éditeur de zones du prof (Contenus → Chapitres) reste.
- Ce que le rapport dira de la musique de zone en projection (jouée, ou tue faute de route).

**À faire après la vague**

- Au premier lancement de la projection, toucher « Activer le son » ; vérifier qu'aucune tablette ne joue de musique.
- Dire si `modules.zone_music_enabled` doit être coupé (par le connecteur).
- Vérifier dans la médiathèque que les dix pistes portent bien les noms du tableau (constat du 24/11, non revérifié).
