# Lot ecrans-10 — La fouille et l'oiseau

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-10` · Attend : ecrans-9 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

Quand une équipe fouille, sa tablette éclaire le paysage comme une lanterne, et la carte du moment appelle
l'Éclaireuse ou l'Éclaireur. L'oiseau vole jusqu'au point touché, s'y pose, et laisse une plume : couchée, penchée,
droite ou dorée, elle dit « froid », « tiède », « chaud » ou « une page dort ici ». Une page trouvée s'arrache du
paysage et vole vers le carnet. Une sonde se montre de la même façon. Le pack « Oiseau noir » n'est plus proposé à
une équipe de G&L. Aucune règle ni route de jeu ne change.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime » ; le mouvement là où il sert la table : la fouille, l'oiseau. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | L'Éclaireuse ou l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond à la question de case. | — |
| Décision 37 de l'addendum 4 | 24/11, 11 h 50 (laissé à Claude) | L'oiseau se pose à chaque fouille et y laisse une plume, qui remplace la pastille de couleur ; il n'a ni nom, ni cri, ni bulle (détail à l'étape 3). | — |
| Décision 38 de l'addendum 4 | 24/11, 11 h 50 | Le code ne dépend d'aucune image : chaque visuel a un repli CSS ou SVG. | — |
| Décision 40 de l'addendum 4 | 24/11 (choix de Claude) | L'interrupteur `modules.table_de_jeu_enabled` coupe l'habillage, les animations et les plumes. | — |
| Décision 41 de l'addendum 4 | 24/11 (choix de Claude) | Le pack publié « Oiseau noir » anime l'oiseau posé (réglage `gameplay.oiseau_temoin_pack_id`, vide par défaut) ; il n'est jamais proposé à une équipe. | — |
| Décision 37 du prompt | 24/11, 11 h 47 | Une bonne réponse de case donne une sonde (toucher un dessin, lire « chaud », « tiède » ou « froid ») ; son empreinte est visible de tous. | « Je suis ton avis. » |
| Décision du 24/11 après-midi | 24/11, vers 14 h 35 | Une sonde par bonne réponse de case, à utiliser dans le tour. | (choix sur carte) |
| Décision du 24/11 après-midi | 24/11, vers 14 h 40 | Pack « Oiseau noir » : on attend ce lot, qui l'exclut du choix des équipes de G&L. | (choix sur carte) |

**Choix par défaut posés par Claude** (la session les applique sans demander ; Oliv peut les retirer) :

- La plume dit le verdict par sa posture ; le ruban dit l'équipe ; l'information est la même qu'aujourd'hui (les
  empreintes étaient déjà publiques), seule la forme change.
- L'oiseau reprend ses plumes autour d'une page tenue : affichage seulement, les empreintes restent en base.
- Le pack « Oiseau noir » sert au témoin quand le réglage est posé ; il n'est jamais proposé à une équipe.
- La sonde reste à l'Opératrice ou l'Opérateur, qui vient de répondre.
- Un seul interrupteur (`modules.table_de_jeu_enabled`) : coupé, ni lanterne, ni plume, ni page qui s'arrache, ni
  loupe ; le disque et la silhouette d'aujourd'hui.
- La correspondance entre le verdict et l'état du pack (tableau de l'étape 3).
- Lanterne : assombrissement `rgba(10,8,5,.28)`, halo de rayon 9 %.
- La loupe de précision (étape 5), ajoutée sans décision d'Oliv : 450 ms, zoom × 2.

## 3. Fichiers

- **À toi** (tu les modifies librement) :
  - `src/gl/components/tenir/GLChasseLayer.jsx`
  - `src/gl/components/tenir/GLKraaWitness.jsx`
  - `src/gl/components/GLGameBoard.jsx` (gestes de fouille, montage de la lanterne et de la page arrachée)
  - `src/gl/hooks/useGlPctMapGestures.js` (appui long de l'étape 5, si c'est là que le geste se pose)
  - `src/gl/styles/gl-tenir.css` (chasse, oiseau, lanterne, plume, page arrachée)
  - `lib/glUnifiedMascotCatalog.js` (exclusion du témoin), ses deux appelants `routes/gl/mascots.js` et
    `lib/glTeamComposition.js`, et `src/gl/context/GLMascotCatalogContext.jsx` si le rendu de l'oiseau le demande
  - Tests : `tests-ui/gl/GLChasseLayer.test.jsx`, `tests-ui/gl/GLGameBoard.test.jsx`,
    `tests-ui/gl/GLTenirMoment.test.jsx`, `tests-ui/gl/GLTenirEcranEquipe.test.jsx`,
    `tests-ui/gl/glTenirMoment.test.js`, `tests-ui/gl/tenir-chaines-interdites.test.jsx`,
    `tests-ui/gl/GLProjectionView.test.jsx`, `tests-ui/gl/GLTenirTiroir.test.jsx`, `tests/gl-mascot-catalog.test.js`,
    `tests/gl-mascots.test.js`, `e2e/gl-tenir-escalier.spec.js`, `e2e/gl-tenir-tablettes.spec.js`
- **Nouveaux** :
  - `src/gl/components/tenir/GLLanterne.jsx`
  - `src/gl/components/tenir/GLPlume.jsx`
  - `src/gl/components/tenir/GLPageArrachee.jsx`
  - `tests-ui/gl/GLLanterne.test.jsx`, `tests-ui/gl/GLPlume.test.jsx`, `tests-ui/gl/GLPageArrachee.test.jsx`
- **D'un autre couloir, modification minimale permise** :
  - `lib/glSettings.js`, `src/gl/utils/glSettingsForm.js`, `tests/gl-settings-registry.test.js` (partagés par tous
    les couloirs) : **un** réglage, `gameplay.oiseau_temoin_pack_id`, chaîne vide par défaut, avec son libellé dans
    les réglages du prof.
  - Dans ton couloir, fichiers habillés par la table de jeu (lots ecrans-7 et ecrans-8) ; tu n'y fais que ceci :
    - `src/gl/components/tenir/GLTenirMoment.jsx` (habillé par ecrans-7 : carte de parchemin, plaque de rôle en
      laiton) et la source de ses chaînes (`src/gl/utils/glTenirMoment.js`) : étape 1, le texte de la plaque et la
      phrase d'invitation quand la fouille ou la sonde est armée. Ni l'habillage, ni les états, ni les autres textes.
    - `src/gl/components/tenir/GLTenirTiroir.jsx` (habillé par ecrans-7) : étape 3, la légende des plumes.
    - `src/gl/components/tenir/GLTenirBandeau.jsx` (habillé par ecrans-7) : étape 4, un repère (`ref` ou attribut)
      sur le bouton qui sert de cible à la page arrachée. Rien de visible.
    - `src/gl/components/tenir/GLProjectionView.jsx` (habillé par ecrans-8) : étape 4, un repère sur la colonne du
      carnet (cible de la page arrachée) et, si besoin, le montage du vol ; étape 6, rien à monter, un test. Le lot
      ecrans-9 n'y a rien monté ; le lot ecrans-11 y montera les moments forts et les sons après toi.
    - `src/gl/components/GLMapView.jsx` : seulement pour faire passer une prop nouvelle au plateau.
    - `tests/content/gl-mots-du-voyage.test.js` (créé par ecrans-6) : ajoute tes nouveaux composants à sa liste.
    - `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : voir section 9.
- **Ne touche pas** :
  - `src/gl/components/tenir/GLVoileLayer.jsx`, `GLTrameFils.jsx`, `glSymbolesGraves.jsx`, `GLBoardMarkers.jsx`,
    `GLBoardMascot.jsx` : lot ecrans-9. Tu lis son voile et son fil, tu ne les changes pas.
  - `lib/glChasse.js`, `routes/gl/games/chasse.js`, `src/gl/hooks/useGlChasse.js` : couloir moteur (la sonde est
    posée par moteur-4). Aucune règle ni route de jeu ne change ici.
  - `src/gl/utils/glVoyageurSounds.js` : le son de l'oiseau qui se pose est au lot ecrans-11.
  - `src/gl/styles/gl-table.css` : tes styles vont dans `gl-tenir.css`.
  - `src/shared/styles/*`, `src/shared/components/*` : reste dans `src/gl/` (`npm run check:bundle`).

## 4. Étapes (un commit par étape, dans cet ordre)

Les lignes citées ont été lues sur `main` = `d65dca4`. Les lots passés avant toi ont pu les décaler : revérifie
chaque constat.

**Rappel du geste (inchangé)** : la carte du moment arme la fouille ; un toucher sur le plateau envoie le point
(`GLGameBoard.jsx`, l. 708) ; deux fouilles par tour, une sous le voile ; le serveur rend le verdict et la position
de l'oiseau (`lib/glChasse.js`, `setKraaTx`, l. 367). **Aucune règle ni route ne change dans ce lot.**

**La sonde** (posée par le lot moteur-4) : une empreinte de sonde (colonne `sonde`) se rend en plume comme une
fouille ; l'oiseau s'y pose de même ; la lanterne s'allume aussi quand la sonde est armée. La sonde est tenue par
l'Opératrice ou l'Opérateur, la fouille par l'Éclaireuse ou l'Éclaireur. Avec moteur-4, quand la sonde est armée, le
plateau est en mode fouille et le toucher envoie `sonde: true` : vérifie-le sur le code avant de brancher.

**Garde-fous de la direction artistique** (à faire relire par `gl-relecteur-garde-fous`) :

- L'oiseau est un témoin : ni nom, ni cri, ni bulle, ni texte. Il ne vole rien pendant la fouille (le chapardeur est
  un autre moment, plateau 2 et suivants). Il n'est jamais le Souffle. Aucun mot écrit ne le nomme.
- Le voile se montre toujours en pâlissant ce qu'il touche (peinture du plateau, fanion de la figurine, plumes). Il
  n'est jamais dessiné comme une forme qui agit, une ombre qui avance seule, un visage ni une couleur sombre ; son
  icône est un repère fixe.
- Jamais le visage de Sélène.
- Parité : rôles en formes doubles, jamais de point médian.
- Une seule surcouche à la fois ; rien ne passe au-dessus d'une question ; mouvement réduit respecté partout.
- Adresse : « vous » sur la tablette d'équipe et en projection ; « tu » sur la plaque d'un rôle nommé (« Éclaireuse
  ou Éclaireur, à toi »).
- Aucun nouveau texte d'élève sans passage au filtre `findForbiddenString` (`src/shared/glGardeFousCore.js`) et au
  test `tests/content/gl-mots-du-voyage.test.js`, que tu complètes avec tes composants.

**L'interrupteur** `modules.table_de_jeu_enabled` (clé client `tableDeJeuEnabled`) est posé par le lot ecrans-7 :
tu le lis, tu ne le recrées pas.

**Les images** : aucune n'est versionnée. `img(slug)` de `src/gl/assets/index.js` lit la médiathèque et rend
`GL_ASSET_PLACEHOLDER_URL` quand la clé manque : c'est alors le repli qui s'affiche. `img()` rend le substitut tant
que le manifeste n'est pas chargé : prévois le re-rendu (`useGlAssetsReady`). Une feuille CSS ne peut pas appeler la
médiathèque : l'adresse d'une image se pose par un composant. Tests et captures montrent les replis.

### ecrans-10.1 — Le rôle et l'invitation (ex-étape F1)

- **Constat vérifié** :
  - Fouille armée, la carte du moment montre le rôle (`moment.role`), puis « Touchez la carte · 2 fouilles »
    (test-id `gl-tenir-fouilles`) et « Arrêter de fouiller » : `GLTenirMoment.jsx` l. 283-300.
  - Le rôle vient de `ROLES_TENIR` ; à quatre, `roleDuGeste('repondre', 4)` rend « Assistante ou Assistant » :
    `src/shared/glSortMomentsCore.js` l. 65-88.
  - Après moteur-2 : le rôle de la fouille est « Éclaireuse ou Éclaireur » (même fichier).
  - Après ecrans-7 : le rôle est une plaque de laiton (« …, à toi ») en haut de la carte du moment.
  - Après moteur-4 : la carte du moment a un état de sonde (« Sondez le plateau : touchez un dessin. », rôle
    « Opératrice ou Opérateur »), dans `src/gl/utils/glTenirMoment.js`.
  - Le plateau prend un bord doré en fouille : `GLTenirEcranEquipe.jsx` l. 284 (`is-fouille`).
- **Changement attendu** :
  1. Quand la fouille est armée, la carte du moment dit : plaque « Éclaireuse ou Éclaireur, à toi » et, dessous, la
     phrase d'invitation (« vous » : c'est l'écran de l'équipe).
  2. Une fois par fouille armée, un reflet doré traverse la peinture en 0,8 s (pas en mouvement réduit) : la
     peinture est jouable.
  3. Quand c'est une sonde qui est armée, la plaque dit « Opératrice ou Opérateur, à toi ».
  4. La plaque reprend le rôle que la carte du moment sert déjà, suivi de « , à toi » : ne recalcule pas le rôle.
     Garde à l'écran le compte des fouilles restantes (« 2 fouilles ») : l'ancien texte n'en parle pas, il ne retire
     aucune information. La phrase de la sonde reste celle du lot moteur-4.
- **Textes** (mot pour mot) :
  - plaque de la fouille : « Éclaireuse ou Éclaireur, à toi »
  - sous la plaque : « Touchez le paysage là où l'indice vous mène. »
  - plaque de la sonde : « Opératrice ou Opérateur, à toi »
- **Tests** : `tests-ui/gl/GLTenirMoment.test.jsx` (l. 98-110), `tests-ui/gl/GLTenirEcranEquipe.test.jsx`
  (l. 437-477), `tests-ui/gl/glTenirMoment.test.js` (l. 212), `tests-ui/gl/tenir-chaines-interdites.test.jsx`
  (l. 354) : la plaque et la phrase en fouille, la plaque en sonde, le compte des fouilles ; le reflet joue une fois
  par fouille armée et pas en mouvement réduit. `e2e/gl-tenir-escalier.spec.js` l. 186 lit l'ancien texte.
- **Critère d'acceptation** : une équipe qui arme sa fouille lit qui doit toucher et où ; une équipe qui arme sa
  sonde lit l'autre rôle ; le reflet passe une fois.

### ecrans-10.2 — La lanterne (ex-étape F2)

- **Constat vérifié** : `GLGameBoard.jsx` reçoit `fouilleMode` (l. 134) ; il ne s'en sert que pour le curseur
  (l. 692) et l'envoi du point (l. 708). La projection est la présentation `projection` (`figee`, l. 143).
- **Changement attendu** : `GLLanterne.jsx`, monté au-dessus du plateau quand `fouilleMode` est vrai (fouille ou
  sonde armée) :
  1. le paysage s'assombrit légèrement (`rgba(10,8,5,.28)`) sauf un **halo chaud** (rayon 9 % de la largeur du
     plateau, bord doux, teinte `rgba(255,214,140,.18)`) qui suit le pointeur ou le doigt (`pointermove` ; au
     toucher, le halo naît au contact) ;
  2. au toucher qui fouille, la lanterne reste posée une seconde là où on a touché, puis s'éteint ;
  3. jamais sur la projection pendant qu'on vise : la projection ne voit que le résultat (l'oiseau, la plume) ;
  4. `pointer-events: none` sur le calque : le clic passe au plateau comme aujourd'hui ;
  5. interrupteur coupé : pas de lanterne.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLLanterne.test.jsx` (monté seulement en mode fouille ; `pointer-events: none` ; le halo
  suit le pointeur ; il reste une seconde après le toucher ; absent en projection ; absent interrupteur coupé).
- **Critère d'acceptation** : sur la tablette, armer la fouille assombrit un peu le paysage sauf sous le doigt ;
  toucher fouille comme avant ; le tableau ne montre jamais où l'équipe vise.

### ecrans-10.3 — L'oiseau se pose et laisse une plume (ex-étape F3)

Trois parties. Un commit, ou trois si tu préfères (l'oiseau, le pack, la plume), tests verts à chacun.

- **Constat vérifié** :
  - L'oiseau est une silhouette SVG, `aria-hidden`, sans texte ; sept états ; 1,6 s ; Olu se fige (`freezeOlu`) :
    `GLKraaWitness.jsx` l. 4-13, l. 29, l. 45-63 ; `gl-tenir.css` l. 145-216.
  - Sa position et son état viennent du carnet, `carnet.kraa` (`x`, `y`, `etat`, `at`) : `lib/glChasse.js` l. 367
    et l. 1527.
  - Une empreinte est un disque `gl-chasse-empreinte`, rayon 1,1, couleur d'équipe, avec un `<title>` :
    `GLChasseLayer.jsx` l. 46-58 ; `gl-tenir.css` l. 92-108.
  - Le calque est un SVG `viewBox 0 0 100 100` en `preserveAspectRatio="none"` : une forme y est étirée si le
    plateau n'est pas carré (`GLChasseLayer.jsx` l. 29-35).
  - Verdicts des empreintes en base : `froid`, `tiede`, `chaud`, `zone`. Une zone déjà trouvée ne laisse pas
    d'empreinte ; `page_trouvee` et `page_tenue` ne sont que des états de l'oiseau (`lib/glChasse.js` l. 410-467).
  - Le serveur sert les 200 dernières empreintes de la partie (`id`, `teamId`, `roundNumber`, `x`, `y`, `verdict`,
    `createdAt`) : `lib/glChasse.js` l. 1483-1525.
  - Une page tenue : `carnet.pages[].etat === 'tenue'`, centre public `contour` (de 0 à 1), `lib/glChasse.js`
    l. 1479.
  - `gameplay.oiseau_temoin_pack_id` n'existe pas ; les `gameplay.*` sont déclarés dans `lib/glSettings.js`, l. 219
    et suivantes.
  - `GLMascotRenderer` ne dessine un pack que si son identifiant est dans le catalogue servi par
    `GET /api/gl/mascots` ; sinon, l'avatar de repli (`GLMascotRenderer.jsx` l. 26-56 ;
    `GLMascotCatalogContext.jsx` l. 21).
  - Le catalogue a deux appelants : la route du catalogue, servie aux élèves comme au prof (`routes/gl/mascots.js`
    l. 125-142), et la composition automatique, qui écarte déjà les packs sans peuple (`lib/glTeamComposition.js`
    l. 274-285). L'affectation à la main relit le catalogue (`POST /assign`, `getGlUnifiedMascotById`).
  - Les états `idle_side`, `dig`, `treasure` n'apparaissent nulle part dans le dépôt : ils vivent dans le pack, en
    base.
  - En prod le 24/11 (lu par SELECT) : le pack « Oiseau noir » est publié, listé, et porte les sept états du
    tableau ; il est donc proposé aujourd'hui comme mascotte. Sans peuple, il échappe déjà à la composition
    automatique, mais reste affectable à la main.

- **Changement attendu — A. L'oiseau** (`GLKraaWitness.jsx`) :
  1. **Vol** : de son perchoir précédent au point fouillé, 0,9 s (transition existante), silhouette SVG actuelle
     avec les ailes qui battent (animation CSS de `.gl-kraa__aile`) et une ombre portée qui glisse sur la peinture.
  2. **Il se pose** : si `gameplay.oiseau_temoin_pack_id` désigne un pack publié du catalogue, l'oiseau passe au
     sprite de ce pack (`GLMascotRenderer` existant, 4,2 % de la largeur du plateau) et joue 1,6 s l'état du
     verdict (tableau ci-dessous), puis reste perché en `idle` jusqu'à la fouille suivante.
  3. Sans pack : la silhouette SVG et les animations CSS d'aujourd'hui. Un état absent du pack retombe sur `idle`,
     sans erreur.
  4. **Toujours** : `aria-hidden`, aucun texte, aucun nom, aucune bulle, aucun cri ; Olu se fige pendant l'animation
     (`freezeOlu`, existant) ; mouvement réduit : il apparaît posé, sans vol ni état animé.
  5. Il vole et se pose de la même façon sur une sonde.

  | Verdict (`kraa.etat`) | État du pack | Ce qu'on voit |
  | --- | --- | --- |
  | `froid` | `idle_side` | Il tourne la tête ailleurs |
  | `tiede` | `search` | Il fouille du regard autour de lui |
  | `chaud` | `happy_jump` | Il sautille sur place |
  | `zone` | `dig` | Il gratte le sol |
  | `page_trouvee` | `treasure` | Il tient un trésor |
  | `page_tenue` | `celebrate` | Il fête |
  | `deja_trouvee` | `sleep` | Il bâille, s'assoupit |

- **Changement attendu — B. Le pack n'est jamais proposé à une équipe** : `lib/glUnifiedMascotCatalog.js` retire
  l'identifiant du réglage des listes de choix et de la composition automatique des équipes (le catalogue complet
  reste lisible par le staff). Réglage `gameplay.oiseau_temoin_pack_id` : chaîne, vide par défaut.
  - **Tension à lever en codant** : le dessin de l'oiseau sur une tablette d'équipe passe par le catalogue que
    l'élève reçoit. Retirer le pack de ce que l'élève reçoit effacerait le sprite. Sépare donc le **choix** (listes
    où l'on choisit une mascotte, affectation à la main, composition automatique : sans le pack du témoin) du
    **rendu** de l'oiseau (qui doit trouver le pack). `GLMascotRenderer` accepte déjà des entrées en plus
    (`extraCatalogEntries`). Dis dans ton rapport comment tu l'as fait.
  - `POST /api/gl/mascots/assign` refuse le pack du témoin, comme un pack inconnu.
  - Tant que le réglage est vide, rien n'est exclu : c'est Oliv qui le pose après la vague.

- **Changement attendu — C. La plume** (`GLPlume.jsx`, rendue par `GLChasseLayer.jsx` à la place du disque
  `gl-chasse-empreinte`) :
  1. une plume noire peinte (`GL_plume_froid`, `GL_plume_tiede`, `GL_plume_chaud`, `GL_plume_page` ; repli : plume
     SVG dessinée par le lot, rachis clair, barbes noires) ; hauteur 3,2 % de la largeur du plateau ; pied de la
     plume au point fouillé ;
  2. **un ruban** noué au pied, à la couleur de l'équipe (`--gl-team-color`, 0,6 unité) : on sait qui a fouillé ;
  3. **la posture dit le verdict** (pas la couleur seule) :

  | Verdict | Plume |
  | --- | --- |
  | `froid` | Couchée à plat, gris ardoise, opacité 0,6 |
  | `tiede` | Plantée, penchée à 35° |
  | `chaud` | Plantée droite, pointe dorée |
  | `zone` (une page dort ici) | Plume dorée entière, un éclat doré une fois |
  | `deja_trouvee` | Couchée, comme `froid` |

  4. `<title>` garde le mot du verdict (« froid », « tiède », « chaud », « une page », « déjà trouvée ») ;
  5. deux plumes à moins de 1,5 % l'une de l'autre s'écartent en éventail (± 12°) ;
  6. les plumes restent tout le chapitre (les empreintes sont déjà gardées par le serveur) ; sous le voile, elles
     pâlissent avec la peinture (le voile du lot ecrans-9) ;
  7. **quand une page tient** : les plumes à moins de 6 % du centre de sa zone s'envolent (fondu et montée, 1 s) —
     l'oiseau reprend ses plumes — et le fil doré du lot ecrans-9 se dessine ; filtrage d'affichage seulement, rien
     n'est effacé en base ;
  8. **légende** dans le tiroir « L'équipe » (texte ci-dessous) ;
  9. une empreinte de sonde se rend en plume comme une fouille ;
  10. interrupteur coupé : le disque d'aujourd'hui.

- **Textes** (mot pour mot) :
  - légende du tiroir : « Les plumes de l'oiseau : couchée, froid ; penchée, tiède ; droite, chaud ; dorée, une page
    dort ici. »
  - `<title>` des plumes : « froid », « tiède », « chaud », « une page », « déjà trouvée » (inchangés).
  - S'il faut une icône de plume à côté de la légende : `GL_plume_chaud` (`GL_icone_plume` n'existe pas).
- **Tests** :
  - `tests-ui/gl/GLPlume.test.jsx` : une posture par verdict ; le ruban à la couleur de l'équipe ; le `<title>` ;
    l'éventail de deux plumes proches ; avec et sans image.
  - `tests-ui/gl/GLChasseLayer.test.jsx` : plus de disque pour une fouille (l. 28 le compte encore) ; une empreinte
    de sonde rendue en plume ; page tenue : les plumes à moins de 6 % ne sont plus rendues, les autres restent ;
    interrupteur coupé : le disque ; l'oiseau reste `aria-hidden` et sans texte (aussi
    `tests-ui/gl/tenir-chaines-interdites.test.jsx` l. 245) ; avec pack : le sprite et l'état du verdict ; sans
    pack : la silhouette ; mouvement réduit : posé, sans vol.
  - `tests-ui/gl/GLTenirTiroir.test.jsx` : la légende.
  - `tests/gl-mascot-catalog.test.js`, `tests/gl-mascots.test.js` : réglage posé, le catalogue servi à une équipe
    pour choisir n'a pas le pack du témoin ; la composition automatique ne le prend pas ; `POST /assign` le refuse ;
    le staff le lit toujours ; réglage vide, rien ne change. `tests/gl-settings-registry.test.js` : le réglage.
- **Critère d'acceptation** : après une fouille ou une sonde, l'oiseau vole, se pose, et une plume reste au point
  touché ; sa posture se lit sans la couleur ; aucun mot, aucun son ; réglage posé, aucune liste de choix ne propose
  le pack du témoin, et l'oiseau s'anime quand même sur la tablette et au tableau.

### ecrans-10.4 — La page s'arrache du paysage (ex-étape F4)

- **Constat vérifié** :
  - La page trouvée se lit dans le carnet, public : `carnet.kraa.etat === 'page_trouvee'` (avec un nouvel `at`), et
    la page passe à `trouvee` avec `trouveePar` (`lib/glChasse.js` l. 771 et l. 1465-1480).
  - Le centre de la zone est le `contour` de la page (`lib/glChasse.js` l. 1479).
  - « Le bouton du carnet du bandeau » n'existe pas sur `main` : le bandeau n'a que le bouton du tiroir
    « L'équipe » (test-id `gl-tenir-tiroir-bouton`, `GLTenirBandeau.jsx` l. 98-115), et le carnet est dans le tiroir
    (`gl-tenir-tiroir-carnet`, `GLTenirTiroir.jsx` l. 167-171).
  - En projection, le carnet est la section `gl-projection-carnet` de la colonne de droite (« Carnet de la classe »
    sur `main`, « Carnet de la caravane » après ecrans-6) : `GLProjectionView.jsx` l. 308 et l. 384-395.
  - Après ecrans-8 : une seule surcouche à la fois, par une petite file (`glOverlayQueue` dans `src/gl/utils/`, ou
    le mécanisme qu'ecrans-8 a retenu).
- **Changement attendu** : au verdict `page_trouvee` (sur la tablette de l'équipe qui trouve et en projection),
  `GLPageArrachee.jsx` :
  1. une feuille de parchemin (6 % de la largeur, bord déchiré par masque SVG) sort du centre de la zone : échelle
     0,2 → 1, rotation − 8° → 6° ;
  2. elle vole en arc jusqu'au bouton du carnet du bandeau (tablette ; position lue par `getBoundingClientRect`) ou
     jusqu'à la colonne du carnet (projection) ; 1,6 s en tout. Sur la tablette, cherche d'abord un bouton du
     carnet posé par ecrans-7 ou ecrans-8 ; s'il n'y en a pas, la cible est le bouton du tiroir « L'équipe », qui
     contient le carnet ; dis-le dans ton rapport ;
  3. mouvement réduit : la feuille apparaît à l'arrivée et s'estompe ;
  4. jamais au-dessus d'une question ouverte ; si une question arrive, l'animation se termine d'abord ;
  5. interrupteur coupé : rien.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLPageArrachee.test.jsx` (jouée une fois par page trouvée ; pas sur la tablette d'une
  autre équipe ; mouvement réduit ; jamais au-dessus d'une question ouverte ; `aria-hidden`) ;
  `tests-ui/gl/GLProjectionView.test.jsx` (la cible existe).
- **Critère d'acceptation** : quand une équipe trouve une page, une feuille part de sa zone et rejoint le carnet,
  sur sa tablette et au tableau, sans jamais couvrir une question.

### ecrans-10.5 — La loupe de précision (ex-étape F5)

- **Constat vérifié** : le toucher qui fouille passe par `onMapClick` de `GLPctMapCanvas` (`GLGameBoard.jsx`
  l. 700-716 ; `GLPctMapCanvas.jsx` l. 155-162). Les gestes du plateau (pan, molette, pincement, double toucher,
  `zoomBy`) sont dans `src/gl/hooks/useGlPctMapGestures.js`. L'ancien texte parle du « zoom existant du plateau »
  sans le nommer : c'est celui-là, à confirmer. Une équipe n'a que deux fouilles par tour : un envoi en double en
  consommerait une.
- **Changement attendu** : en mode fouille, sur écran tactile : appui long de 450 ms → le plateau zoome × 2 sous le
  doigt (le zoom existant du plateau, ou une transformation CSS locale) ; relâcher fouille au point sous le doigt ;
  glisser hors du plateau annule. Un toucher bref fouille comme aujourd'hui. Le geste n'a aucun texte à l'écran.
  Interrupteur coupé : pas de loupe.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLGameBoard.test.jsx` : appui long puis relâché → un seul appel de fouille, au bon
  point ; toucher bref → un seul appel ; glisser hors du plateau → aucun appel. `e2e/gl-tenir-tablettes.spec.js`
  (fouille au toucher) : à relire et à garder vert.
- **Critère d'acceptation** : un doigt posé longtemps grossit le paysage et fouille au relâcher, une seule fois.

### ecrans-10.6 — Ce que dit la projection (ex-étape F6)

- **Constat vérifié** : la projection monte le plateau en `presentation="projection"` avec le carnet
  (`GLProjectionView.jsx` l. 160-162 et l. 266-288) : elle reçoit donc l'oiseau, les plumes et la page trouvée par
  les mêmes données que la tablette. Elle ne reçoit jamais `fouilleMode`.
- **Changement attendu** : la projection voit l'oiseau voler, se poser, la plume, la page qui s'arrache ; jamais la
  lanterne, jamais le point visé avant le toucher.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLProjectionView.test.jsx` : pas de `GLLanterne` en projection ; l'oiseau, les plumes et
  la page arrachée y sont rendus.
- **Critère d'acceptation** : au tableau, la classe voit le résultat d'une fouille, jamais sa visée.

## 5. Migration

Aucune. Le réglage `gameplay.oiseau_temoin_pack_id` a son défaut (vide) dans `lib/glSettings.js`. La colonne `sonde`
des empreintes vient du lot moteur-4 (`mig-sonde`).

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/`.

**Clés de médiathèque employées par ce lot, et leur repli** :

| Clé | Contenu | Étape | Repli sans image |
| --- | --- | --- | --- |
| `GL_plume_froid` | Plume noire couchée | 3 (verdicts `froid` et `deja_trouvee`) | Plume SVG dessinée par le lot (rachis clair, barbes noires), couchée |
| `GL_plume_tiede` | Plume noire penchée | 3 (`tiede`) | Plume SVG, penchée à 35° |
| `GL_plume_chaud` | Plume droite à pointe dorée | 3 (`chaud`) ; sert aussi d'icône de plume | Plume SVG, droite, pointe dorée |
| `GL_plume_page` | Plume dorée | 3 (`zone`) | Plume SVG dorée |

`GL_icone_plume` n'existe pas : prendre `GL_plume_chaud`. `GL_icone_oiseau` n'est pas employée. La lanterne, le
reflet doré, le ruban et la page arrachée sont en CSS et SVG, sans image. Le pack « Oiseau noir » n'est pas une
image de la médiathèque : c'est un pack du studio, désigné par le réglage ; sans réglage, la silhouette SVG.

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-projection.spec.js`,
  `e2e/gl-tenir-escalier.spec.js`, `e2e/gl-mascots.spec.js`.
- Banc, régime fumée : une seule passe à la fin, les deux scénarios des règles communes ; il doit être vert. Le
  banc ne voit pas l'appui long : vérifie à la main, dans un e2e tactile, qu'une fouille n'est jamais envoyée deux
  fois.
- `npm run check:bundle` : tes fichiers d'écran sont sous `src/gl/`, le budget ne doit pas bouger.
- Captures (`docs/captures/gl-decisions/ecrans-10/`), en replis : tablette 1024 × 768, fouille armée (plaque,
  phrase, lanterne) ; après trois fouilles (plumes couchée, penchée, droite) ; une plume dorée ; projection avec
  l'oiseau posé et les plumes ; le tiroir avec la légende ; une capture interrupteur coupé.
- À rendre dans ton rapport : comment le choix et le rendu du pack sont séparés ; la cible de la page arrachée sur
  la tablette ; ce que la loupe fait au pan et au pincement.

## 8. Contrats de test changés

Tous ne valent qu'en « Tenir », interrupteur allumé. Interrupteur coupé : rien ne change.

| Contrat | Avant | Après |
| --- | --- | --- |
| Empreinte d'une fouille | Disque `.gl-chasse-empreinte` (pastille de couleur) | Une plume ; plus de disque. `data-verdict` et `<title>` gardés |
| `gl-tenir-fouilles` (test-id) | « Touchez la carte · 2 fouilles » | « Touchez le paysage là où l'indice vous mène. », le compte des fouilles à côté |
| Rôle de la carte du moment en fouille | « Opératrice ou Opérateur » (avant moteur-2) | Plaque « Éclaireuse ou Éclaireur, à toi » ; en sonde, « Opératrice ou Opérateur, à toi » |
| `gl-kraa` (test-id) | Toujours une silhouette SVG | Silhouette, ou sprite du pack si le réglage est posé ; toujours `aria-hidden` et sans texte |
| `GET /api/gl/mascots`, `POST /api/gl/mascots/assign` | Tous les packs publiés | Réglage posé : le pack du témoin n'est plus proposé ni affectable |

Les tests et e2e qui affirment l'ancien sont nommés à chaque étape.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : la lanterne ; les plumes (clés d'image sous leurs deux formes,
  `GL_plume_froid` et `plume_froid`, replis, postures, légende) ; le réglage `gameplay.oiseau_temoin_pack_id` et la
  table verdict → état du pack ; ce que voit la projection.
- `docs/API.md` : `GET /api/gl/mascots` et `POST /api/gl/mascots/assign` (l. 311-312), pour le pack du témoin.
- `docs/GL_TENIR_A_DEUX.md` (l. 13-14, l'oiseau témoin) : il peut prendre le sprite d'un pack ; il reste muet et
  sans nom.
- `docs/GL_TENIR_A_DEUX_REGLES.md`, la chasse (hors § 0) : seulement la phrase qui dit qu'une fouille laisse une
  empreinte en pastille, si elle devient fausse.
- `docs/reference/gl/carte-du-royaume.md`, section « Tenir à deux : les pages cachées, les empreintes, l'oiseau »
  (l. 183-187) : « laisse une empreinte » devient une plume de l'oiseau ; l'oiseau se pose. Ces phrases seulement.
- `changelog.d/gl-decisions-ecrans-10.md`.

## 10. Hors périmètre

- Le son de l'oiseau qui se pose et de la page trouvée : lot ecrans-11 (jamais de cri).
- Les moments forts de projection, Olu en portrait, la péripétie illustrée : lot ecrans-11.
- Le voile qui pâlit, le fil doré, les symboles, les figurines : lot ecrans-9.
- La sonde elle-même (droit, verdict, colonne, texte de la carte du moment) : lot moteur-4.
- L'échange des rôles dans le code et les catalogues : lot moteur-2.
- Poser le réglage en prod, renommer les fichiers du pack, tracer les zones du plateau 1 : Oliv, après la vague.
- La Visite ForêtMap : le pack y reste listé, ce lot n'y touche pas.
- Les identifiants techniques (`GLKraaWitness`, classes `gl-kraa`, `carnet.kraa`, `setKraaTx`) ne se renomment
  pas : ils ne sont jamais affichés.
- Les docs du prof (« les plumes de l'oiseau », lecture du plateau) et les captures finales : lot fin-2.

## 11. Pour Oliv

**À relire**

- La phrase d'invitation : « Touchez le paysage là où l'indice vous mène. »
- La légende : « Les plumes de l'oiseau : couchée, froid ; penchée, tiède ; droite, chaud ; dorée, une page dort
  ici. »
- La plaque de la sonde dans une équipe de quatre : à quatre, c'est l'Assistante ou l'Assistant qui répond à la
  question de case. L'ancien texte ne dit pas quelle plaque porte alors la sonde ; le lot reprend le rôle que la
  carte du moment sert.
- La loupe de précision (appui long) : ajoutée par Claude, sans décision de ta part.
- Les décisions 40 et 41 de l'addendum 4 (interrupteur, pack du témoin) sont des choix de Claude, non confirmés.
- Non vérifié : le rendu des sprites du pack « Oiseau noir » à 4 % du plateau (un sprite de 256 px réduit) ; la
  lisibilité des plumes au fond de la salle.

**À faire après la vague**

- **Poser `gameplay.oiseau_temoin_pack_id`** = l'identifiant de catalogue du pack « Oiseau noir »
  (`srv-c45f4983-ae08-4607-8e75-dd5659bc2793` en prod le 24/11). **Tant que le réglage est vide, le pack reste
  proposé aux équipes** et l'oiseau garde sa silhouette.
- Les fichiers du pack s'appellent `kraavoleur_*.png` : un élève ne le voit que dans les outils de développement du
  navigateur ; les renommer au studio si tu veux zéro risque.
- Téléverser `GL_plume_froid`, `GL_plume_tiede`, `GL_plume_chaud`, `GL_plume_page` dans la médiathèque. Ne pas
  téléverser `GL_icone_oiseau`.
- Tracer les 8 zones du plateau 1 sur le dessin (éditeur de zones), puis les faire reporter dans
  `data/gl/tenir/chasse-zones.json` : sans elles, la plus belle fouille reste une loterie.
- Regarder la projection au fond de la salle : plumes lisibles à 8 m ?
