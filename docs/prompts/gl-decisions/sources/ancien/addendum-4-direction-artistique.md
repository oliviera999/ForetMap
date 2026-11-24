# Addendum 4 au prompt orchestrateur · Direction artistique : un jeu de plateau qui s'anime

Écrit le 24/11/2026 vers 12 h, d'après les décisions d'Oliv de 11 h 41 (« On se fiche du gel. Suis le chemin de la
direction artistique et creuse à fond de ce côté ») et ses réponses de 11 h 50 (rôles échangés ; on ne refait pas les
cartes ; images Gemini aujourd'hui ; la trace de l'oiseau laissée à Claude).
**Recalé le 24/11 à 12 h 40 sur le prompt orchestrateur** (Oliv, 12 h 12 : « Orchestrateur a la priorité ») :
priorité, numéros en double (« 24 quinquies-R », « 34 (addendum 4) »…) et rôle de la sonde. Aucune décision retirée.

- **Code lu** : clone local au commit `b8b5344` (v1.263.5, `main` = prod à 10 h). Le recalage sur GitHub de 11 h 30 a
  échoué : **l'orchestratrice recale sur `main` avant de lancer** et signale tout écart avec les chemins cités ici.
- **Données lues en prod** par le connecteur (marqueurs des chapitres, page `rules`, pack « Oiseau noir »).
- **Sources** : `claude/Direction_artistique_GL_2026-11-24.md` (analyse), `claude/Vocabulaire_et_esthetique_GL_2026-11-24.md`
  (§ 6, pistes R1 à R9), `claude/Audit_ambiance_GL_2026-11-24.md` (A1 à A5, S4), `claude/Audit_ecrans_onglets_popovers_GL_2026-11-24.md`
  (§ 3 et § 4). Tout ce qu'il faut de ces documents est recopié ici : les sessions de Claude Code ne les lisent pas.

## Comment cet addendum s'applique

Comme les trois autres (voir l'addendum 3, « Comment cet addendum s'applique ») :

1. **Au lancement**, Oliv colle dans la même session : le prompt orchestrateur, l'addendum 1 (lot 2, questions de
   lecture), l'addendum 2 (immersion), l'addendum 3 (copiste), puis **cet addendum 4**.
2. **Lot 0** : l'orchestratrice verse les quatre addenda, mot pour mot, dans la section « Addenda » de
   `docs/prompts/GL_DECISIONS_PROMPT.md`.
3. **Priorité en cas de conflit** : **le prompt orchestrateur prévaut** (Oliv, 24/11 à 12 h 12 : « Orchestrateur a la
   priorité » ; prompt, § 00.8), puis cet addendum, puis 3, 2, 1. Les décisions ci-dessous restent prises ; seul un
   numéro ou un détail que le prompt décrit autrement se règle par le prompt.
4. **Numéros en double** : le prompt a ses propres décisions 34 et 37 et son étape 24 quinquies (questions de zone,
   « 24 quinquies-Z »). Les décisions de cet addendum se citent « 34 (addendum 4) » à « 41 (addendum 4) » ; son étape
   des rôles échangés est la **24 quinquies-R**.

---

## 0. Décisions d'Oliv (24/11)

| # | Décision | Lot, étape |
| --- | --- | --- |
| 34 | (11 h 41) **Direction artistique « un jeu de plateau qui s'anime », à fond.** La grammaire du jeu de plateau soigné (table de bois, matière de chaque peuple, plaques de laiton, parchemin, jetons de verre, symboles gravés, figurines sur socle) partout où un élève regarde : tablette d'équipe, compte d'élève, Seuil, projection, vitrine. Le mouvement seulement là où il sert la table : la fouille, l'oiseau, la mascotte qui marche, quatre moments forts. La console du prof et les réglages restent l'outil ForêtMap. | T, P, F, A |
| 35 | (11 h 50) **Les deux gestes du tour s'échangent.** L'**Éclaireuse ou l'Éclaireur fouille** (montre où chercher) ; l'**Opératrice ou l'Opérateur répond à la question de case**. Dans une équipe de quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou l'Opérateur (le geste reste « répondre »). | 2, étape 24 quinquies-R |
| 36 | (11 h 50) **On ne refait pas les cartes** : illustrations, cadres et cœurs sculptés des coins restent tels quels. **Confirmé par Oliv (12 h 16)** : seule la ligne « Au tour de jeu » des quatre cartouches concernés est recomposée avant l'impression (script `compose.py`, hors dépôt, voir § 5). | hors chantier |
| 37 | (11 h 50, laissé à Claude) **L'oiseau se pose à chaque fouille et y laisse une plume.** La plume remplace la pastille de couleur : elle dit le verdict par sa posture (couchée, penchée, droite), porte un ruban à la couleur de l'équipe et reste tout le chapitre. Quand une page tient, l'oiseau reprend les plumes autour d'elle et un fil doré prend leur place. Il n'a ni nom, ni cri, ni bulle. | F, étape F3 |
| 38 | (11 h 50) **Les images de la série « Table de jeu » sont générées le 24/11** (Gemini, piloté par Claude). **Le code ne dépend d'aucune image** : chaque visuel a un repli CSS ou SVG, et prend l'image dès qu'elle existe dans la médiathèque sous sa clé (§ 4). | T, P, F, A |
| 39 | (11 h 41) **Plus de gel** (confirme la décision 28 de l'addendum 3). Les décisions I1 à I10 de l'addendum 2 sont prises telles qu'écrites (I6 : lexique du voyage, option A, déjà appliqué dans la page des règles). **La navigation en cinq onglets et les règles des surcouches** (notées « après deux séances » dans l'audit des écrans) **entrent dans le chantier** : elles font partie de la table de jeu (choix de Claude, signalé). | T, étapes T6 et T8 |
| 40 | (choix de Claude) **Un interrupteur unique** `modules.table_de_jeu_enabled` (défaut vrai) coupe l'habillage, les animations et les plumes, et rend l'affichage d'aujourd'hui, sans toucher aux règles ni aux données. C'est la voie de repli si quelque chose gêne en classe. | T, étape T1 |
| 41 | (choix de Claude) **Le témoin a son pack** : le pack publié « Oiseau noir » du studio ForêtMap (sprites de 256 px, 33 états) donne vie à l'oiseau quand il se pose. Réglage `gameplay.oiseau_temoin_pack_id` (vide par défaut : silhouette SVG d'aujourd'hui). Ce pack n'est jamais proposé à une équipe. | F, étape F3 |

**Ce qui change dans le prompt et les addenda** :
- Partout où l'Opératrice ou l'Opérateur fouille, touche ou montre l'endroit, lire « l'Éclaireuse ou l'Éclaireur » ;
  partout où l'Éclaireuse ou l'Éclaireur répond à la question, lire « l'Opératrice ou l'Opérateur ». Cela vaut pour
  l'addendum 2 : étape V3 (`maps › reperes`, « … et l'Opératrice ou l'Opérateur touche l'endroit ») et annexe I.1
  (« … et l'Opératrice ou l'Opérateur montre l'endroit »). Le prompt a déjà aligné ses péripéties (étape 24) le 24/11.
- **§ 6 du prompt, puces « après deux séances »** sur l'habillage, les icônes, la typographie, les matières, la
  navigation, la fouille à la lanterne, le voile qui pâlit, les moments forts : elles deviennent les lots T, P, F, A.

## 1. Où verser

**Tableau des lots (§ 00.3)** : quatre lignes de plus.

| Lot | Titre | Étapes | Charge | Attend | Fichiers principaux (réservés) | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| T | La table de jeu : matières, tablette d'équipe, typographie, barre, navigation, Seuil, projection | T1 à T9 | lourde | V, C, H | `src/gl/styles/gl-table.css` (nouveau), `src/gl/components/tenir/GLTenirEcranEquipe.jsx`, `GLTenirBandeau.jsx`, `GLTenirMoment.jsx` (habillage seulement), `GLProjectionView.jsx`, `src/gl/constants/app-runtime.js`, `src/gl/components/GLHelpDock.jsx`, `GLAppVersionBadge.jsx`, vues `GLCarnetView.jsx`, `GLCaravaneView.jsx`, `GLComprendrePanel.jsx` (nouvelles), `GLSeuilView.jsx` et `GLSeuil*.jsx` (habillage), `lib/glSettings.js` (un réglage), `tests-ui/gl-table-*.test.jsx` (nouveaux), e2e de navigation | — |
| P | Le plateau : symboles gravés, figurines sur socle, tour hors du dessin, voile qui pâlit, fil doré de la Trame | P1 à P5 | moyenne | M, T | `src/gl/components/GLBoardMarkers.jsx`, `GLBoardMascot.jsx`, `GLBoardTurnHud.jsx`, `GLGameBoard.jsx`, `src/gl/components/tenir/GLVoileLayer.jsx`, `GLTrameFils.jsx` et `glSymbolesGraves.jsx` (nouveaux), `src/gl/utils/glTenirMoment.js` (table `CASES`), `src/gl/styles/gl-tenir.css` (voile) | — |
| F | La fouille et l'oiseau : lanterne, plume, oiseau qui se pose, page qui s'arrache, loupe | F1 à F6 | moyenne | P | `src/gl/components/tenir/GLChasseLayer.jsx`, `GLKraaWitness.jsx`, `GLPlume.jsx`, `GLPageArrachee.jsx`, `GLLanterne.jsx` (nouveaux), `GLGameBoard.jsx` (gestes de fouille, après P), `src/gl/styles/gl-tenir.css` (chasse, oiseau), `lib/glSettings.js` (un réglage), `lib/glUnifiedMascotCatalog.js` (exclusion du témoin) | — |
| A | Les moments forts : quatre scènes de projection, Olu en portrait, couleur et nuit du monde, péripétie illustrée | A1 à A4 | moyenne | T, P, S | `src/gl/components/tenir/GLMomentFort.jsx` (nouveau), `GLProjectionView.jsx` (montage, après T), `GLOluBulle.jsx`, `GLPeripetieOverlay.jsx`, `src/gl/styles/gl-table.css` (ambiances, après T) | — |

**Lot 2** : ajoute l'étape **24 quinquies-R** (échange des rôles), après l'étape 24 quinquies-Z du prompt. Si
`src/shared/glSortMomentsCore.js` est réservé par un autre lot, l'orchestratrice y place la partie code de l'étape et
laisse les catalogues au lot 2.

**Lot S** : ajoute l'étape **S4** (sons du tour), après S3.

**Ordre de priorité** : 1, 2, 3, B, M, 6, 5, **Q**, 4, 7, H, S, V, C, **T, P, F, A**, 8, 9. F et A peuvent tourner en
parallèle (fichiers disjoints, sauf `GLProjectionView.jsx` : A y monte un composant, F n'y touche pas). Le lot 9 attend
aussi T, P, F, A (captures et docs).

**Lot Q** (prompt, décision 37 du prompt : une case de plus, trois sous le voile, et la sonde ; étapes 19 et 35) :
recalé le 24/11 à 12 h 05 avec cet addendum. Il garde sa place (après 5 et 6, avant 7) et ses dépendances. **T et P
attendent aussi Q** (`GLTenirEcranEquipe.jsx`, `GLTenirMoment.jsx`, `glTenirMoment.js` sont touchés par Q avant
l'habillage). **La sonde suit la question de case** : avec l'échange des rôles (décision 35 de cet addendum), c'est
l'Opératrice ou l'Opérateur, l'élève qui vient de répondre, qui sonde ; sa plaque dit « Opératrice ou Opérateur, à
toi » (tranché par le prompt, § 00.8, le 24/11 à 12 h 35 ; une première version de cet addendum la donnait à
l'Éclaireuse ou l'Éclaireur). Au lot F, une empreinte de sonde (colonne `sonde` du lot Q) se rend en plume comme une
fouille, l'oiseau s'y pose de même, et la lanterne (F2) s'allume aussi quand la sonde est armée.

**Plafond** : 20 sessions de lot et 6 reprises, soit 26 sessions lancées (lot Q compris).

**Numéro de migration (§ 00.2, point 3)** : étiquette `N+8` pour l'étape 24 quinquies-R (lot 2) ; `N+7` est l'étiquette
du lot Q (étape 35), comme le dit l'addendum 1. Le numéro de fichier se prend de toute façon à la fusion. Les lots T, P,
F, A n'ont pas de migration : leurs deux réglages ont leur défaut dans `lib/glSettings.js`.

**Choix par défaut (§ 3)** : ceux du § 3 de cet addendum. **Docs (§ 7)** : § 6. **Après le chantier (§ 10)** : § 7.

**Contrats de test changés** (§ 7) : libellés des cinq onglets ; plus de pastille de couleur pour une fouille (une
plume) ; plus de `gl-voile-bande` en « Tenir » ; le compteur de tour hors de `.gl-board` en « Tenir » ; rôles du tour
(`ROLE_DU_GESTE`) ; textes des péripéties, du badge « Trouveur » et de la mission `mis-09`.

## 2. Étapes

### Étape 24 quinquies-R — Les rôles du tour s'échangent (décision 35) · lot 2

**1. Code** (`src/shared/glSortMomentsCore.js` et sa copie `lib/shared/glSortMomentsCore.js`, l. 61-81) :

| Clé | Avant | Après |
| --- | --- | --- |
| rôle du geste `repondre` | `'Éclaireuse ou Éclaireur'` | `'Opératrice ou Opérateur'` |
| rôle du geste `fouiller` | `'Opératrice ou Opérateur'` | `'Éclaireuse ou Éclaireur'` |
| phrase du moment `repondre` | « C'est le moment de l'Éclaireuse ou de l'Éclaireur. » | « C'est le moment de l'Opératrice ou de l'Opérateur. » |
| phrase du moment `fouiller` | « C'est le moment de l'Opératrice ou de l'Opérateur. » | « C'est le moment de l'Éclaireuse ou de l'Éclaireur. » |
| commentaire d'en-tête | « Éclaireuse ou Éclaireur : répond à la question de case · Opératrice ou Opérateur : fouille · … (à quatre, fait aussi l'Éclaireur) » | « Éclaireuse ou Éclaireur : fouille (montre où chercher) · Opératrice ou Opérateur : répond à la question de case · … (à quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou l'Opérateur) » |

- Les clés techniques ne changent pas : `operateurs_json` (table `gl_game_rounds`), la route
  `POST /games/:id/tenir/tour/operateurs`, le rôle `'operateur'` par défaut et la source de badge
  `pages_trouvees_operateur` désignent désormais **l'élève qui fouille**. Ajoute un commentaire d'une ligne à chacun
  (« historique : désigne l'élève qui fouille, l'Éclaireuse ou l'Éclaireur depuis le 24/11 ») ; ne renomme rien, pas
  de migration de schéma.
- Cherche tout autre libellé visible qui associe un rôle à un geste (`grep -rn "Opérat\|Éclaireu" src/gl src/shared lib
  routes`) et aligne-le. La Fresque (`src/shared/fresque/`, niveau « Éclaireur ») n'est pas concernée.

**2. Catalogues** (`data/gl/tenir/` et copies `exemple/` quand un test y lit le texte), par le même chemin d'import que
l'étape 24 ter. Les péripéties nommaient des rôles au masculin seul, et confiaient les dés à l'Opérateur (c'est la ou le
Gestionnaire qui lance) : on corrige tout d'un coup. (`per-01`, `per-02`, `per-04`, `per-06`, `per-07` : mêmes textes
qu'à l'étape 24 du prompt, alignée le 24/11.)

| Fichier | id | Nouveau texte |
| --- | --- | --- |
| `peripeties.json` | `per-01` | « Une mangouste a volé le dé. La ou le Gestionnaire relance de la main qui n'écrit pas. » |
| | `per-02` | « Pluie de mousson sur la caravane : l'équipe répond à la prochaine question en chuchotant, et l'Opératrice ou l'Opérateur tranche en mimant. » |
| | `per-04` | « Un calao s'est posé sur la carte. L'Éclaireuse ou l'Éclaireur désigne la fouille sans parler, du bout du nez. » |
| | `per-06` | « Le baobab a soif : chaque membre dit un mot qui contient la lettre O avant que la ou le Gestionnaire ne lance. » |
| | `per-07` | « Nuit dans la savane : l'équipe répond à la prochaine question les yeux fermés, en écoutant la ou le Secrétaire lire deux fois. » |
| | `per-09` | « Tempête de sable : l'Opératrice ou l'Opérateur tranche la prochaine réponse les yeux fermés, sur la seule voix de son équipe. » |
| | `per-11` | « Mirage : l'Éclaireuse ou l'Éclaireur désigne deux endroits à fouiller, l'équipe vote à main levée pour le bon. » |
| | `per-12` | « Les chèvres sont montées dans l'arganier : la ou le Gestionnaire lance les dés debout sur une seule jambe. » |
| | `per-13` | « Le vent chaud a séché les gorges : l'équipe répond à la prochaine question sans aucun mot, seulement par gestes, et la ou le Secrétaire traduit. » |
| | `per-14` | « Cigales : pendant que l'Éclaireuse ou l'Éclaireur cherche l'endroit, l'équipe fait « tssss » à voix basse sans s'arrêter, et se tait dès que la fouille est faite. » |
| | `per-16` | « Le fennec entend tout : l'équipe doit répondre à la prochaine question avant que l'Éclaireuse ou l'Éclaireur ait compté jusqu'à vingt, en silence. Sinon, on répond quand même. » |
| | `per-18` | « Brume sur la lande : l'Éclaireuse ou l'Éclaireur désigne la fouille avec le dos de la main, sans un mot. » |
| | `per-19` | « Le geai a caché un gland : avant de lancer, la ou le Gestionnaire doit retrouver, dans la trousse d'un membre de l'équipe, un objet que l'équipe a choisi en secret. » |
| | `per-21` | « Le blaireau creuse : la ou le Gestionnaire lance les dés en les faisant rouler sous la main, sans les soulever. » |
| | `per-24` | « Chouette de minuit : l'équipe fait son choix de réponse en se parlant seulement à l'oreille, en chaîne, jusqu'à l'Opératrice ou l'Opérateur. » |
| | `per-28` | « Les lemmings passent sous la table : la ou le Gestionnaire lance les dés à genoux. » |
| | `per-32` | « Le loup chante : la ou le Gestionnaire hurle une fois, doucement, à la lune, avant de lancer. Si elle ou il ne veut pas, la ou le Secrétaire le fait. » |
| `missions.json` | `mis-09` | « L'Éclaireuse ou l'Éclaireur fouille les yeux bandés : l'équipe la ou le guide de la voix jusqu'à l'endroit. » |
| `badges.json` | `trouveur`, `critere` | « Trois pages trouvées pendant un tour où l'élève fouillait pour son équipe. » |

**3. Migration `N+8`** (idempotente, gardée par l'ancienne phrase exacte, `REPLACE`) sur `gl_content_pages`, page
`rules` :
- « Une énigme dit quoi chercher, et l'Opératrice ou l'Opérateur montre l'endroit. » → « Une énigme dit quoi chercher,
  et l'Éclaireuse ou l'Éclaireur montre l'endroit. »
- Si la garde ne trouve rien, la migration n'écrit pas, et ton fichier de lot le dit.

**4. Tests** :
- `ROLE_DU_GESTE.fouiller === 'Éclaireuse ou Éclaireur'`, `ROLE_DU_GESTE.repondre === 'Opératrice ou Opérateur'` ;
  l'écran d'équipe affiche le bon rôle au-dessus de chaque geste (test UI existant à mettre à jour) ; la sonde (lot Q)
  porte le rôle « Opératrice ou Opérateur » ;
- test de catalogue : aucune péripétie ne fait lancer les dés par un autre rôle que la ou le Gestionnaire ; aucun nom de
  rôle au masculin seul (« l'Opérateur », « l'Éclaireur », « le Gestionnaire », « le Secrétaire » sans sa forme double)
  dans `peripeties.json` et `missions.json` ;
- test de migration : deux passages, la page `rules` contient « l'Éclaireuse ou l'Éclaireur montre l'endroit ».

### Lot T — La table de jeu

**Principe** : l'écran est la table ; le plateau peint est posé dessus ; chaque équipe joue dans le cadre de son
peuple. Une seule couche de matière à la fois, rien de lourd sur un petit écran : sous 640 px de large, les cadres
s'amincissent (bord de 6 px) et le bois devient une couleur unie.

#### T1. Les jetons de la table et l'interrupteur

**`src/gl/styles/gl-table.css`** (nouveau, importé par l'entrée G&L) définit, sous la classe racine `.gl-table` :

| Variable | Valeur | Repli sans image |
| --- | --- | --- |
| `--gl-table-bois` | `url(<GL_table_bois>)` répété, taille 512 px | `radial-gradient(120% 90% at 50% 40%, #4a3424 0%, #2b1d13 70%, #1d130c 100%)` |
| `--gl-parchemin` | `#f2e8d5` (grain : bruit SVG en `data:`, opacité 0,05, moins de 1 Ko) | idem sans grain |
| `--gl-encre` | `#2a2018` | — |
| `--gl-laiton` | `linear-gradient(180deg, #e2c27a 0%, #b08d3c 55%, #8a6a26 100%)`, texte gravé `#3a2a10` avec ombre claire `0 1px 0 rgba(255,240,200,.6)` | — |
| `--gl-chene` | `#6b4a2b` (bord), `#8b6440` (lumière), `#3f2a17` (ombre) | — |
| `--gl-argent` | `#c9d3dc` (bord), `#eef2f6` (lumière), `#16324f` (liseré bleu nuit) | — |
| `--gl-verre` | dégradé du jeton : `radial-gradient(circle at 35% 30%, #fff8 0 18%, transparent 19%), radial-gradient(circle, #e9c46a, #b98a1e)` | — |

- **Réglage `modules.table_de_jeu_enabled`** (booléen, défaut vrai) dans `lib/glSettings.js`, servi au client comme les
  autres `modules.*`. Faux : la classe `.gl-table` n'est posée nulle part, les plumes redeviennent des pastilles, les
  moments forts et la lanterne ne jouent pas. Libellé dans les réglages : « Table de jeu (habillage, animations, plumes
  de l'oiseau) ».
- **Images** : chaque variable prend l'image de la médiathèque par sa clé stable (§ 4) via `img(slug)` de
  `src/gl/assets/index.js` ; si `img()` rend le substitut (`GL_ASSET_PLACEHOLDER_URL`), le repli s'applique. Aucun appel
  réseau de plus que le manifeste existant.
- **Contraste** : tout texte posé sur une matière est vérifié AA (4,5:1 ; 3:1 au-dessus de 24 px). Le texte ne se pose
  jamais sur le bois : toujours sur parchemin, plaque ou carte.

#### T2. La tablette d'équipe dans la matière de son peuple

`GLTenirEcranEquipe.jsx` : la racine reçoit `.gl-table` et `data-peuple="gnome|licorne|neutre"`, d'après le type de la
mascotte de l'équipe (`gnome`, `unicorn`, sinon `neutre`).

- **Cadre** : `border-image` de `GL_cadre_gnome` ou `GL_cadre_licorne` (découpe 9 tranches, `border-image-slice: 18%`,
  largeur 22 px sur tablette, 14 px sous 900 px). Repli : chêne = double bord `--gl-chene` avec ombre interne ; licorne =
  bord `--gl-argent` et liseré intérieur bleu nuit de 3 px. Neutre : laiton fin.
- **Fond derrière le plateau** : `--gl-table-bois` (remplace le fond de `.gl-board` posé par l'étape V6 de l'addendum 2
  sur les écrans de la table ; V6 reste le repli quand l'interrupteur est coupé).
- **Bandeau** (`GLTenirBandeau.jsx`) : une plaque de laiton pleine largeur, nom de l'équipe gravé (Caudex gras), phase en
  mots d'élève, jetons de verre de la bourse (T3), sablier.
- **Carte du moment** (`GLTenirMoment.jsx`) : une carte de jeu posée sur la table, fond parchemin, coins arrondis 14 px,
  ombre portée `0 6px 18px rgba(0,0,0,.35)`. En haut, **la plaque de rôle** en laiton, comme sur les cartes Job :
  « Éclaireuse ou Éclaireur, à toi », « Opératrice ou Opérateur, à toi », etc. Le gros bouton du geste est une plaque
  de laiton en relief (hauteur 56 px au moins). Aucune règle ni état ne change : habillage seul.
- **Le tiroir « L'équipe »** : un carnet de cuir qui s'ouvre (fond `#5a3b25`, pages parchemin).

#### T3. Les gemmes en jetons de verre

- Partout où un écran d'élève montre une gemme (bourse de la barre, bandeau d'équipe, tiroir, Marché, Seuil), un jeton
  de verre (`GL_gemme_verre`, repli `--gl-verre` en CSS, cercle de 1,2 em) remplace 💎. Les emoji restent à la console.
- **Bourses** : le compte d'un élève ne s'affiche que sur l'écran de son équipe et sur son compte ; jamais en
  projection, jamais sur l'écran d'une autre équipe (règle existante : un test le vérifie pour le nouveau composant).

#### T4. La typographie

- **Cinzel** seulement pour les titres de monde (titre du chapitre, cartouche, carte « Au camp », titres des moments
  forts). **Caudex** pour tout le reste ; les petits titres en Caudex gras.
- Corps de texte : 17 px au moins sur la tablette d'équipe et la carte du moment, 16 px au compte d'élève, 22 px au
  moins en projection. Boutons : 48 px de haut au moins.
- Test : aucun élément de `.gl-table` sous 15 px calculés, hors mentions de pied.

#### T5. Une barre en une ligne

Compte d'élève : mascotte de l'élève (médaillon rond), son nom, sa bourse (jeton de verre), « ? ». La version
(`GLAppVersionBadge`) ne s'affiche que pour le staff. La cloche et la musique restent dans le dock.

#### T6. Cinq onglets, dans l'ordre du parcours (décision 39)

| # | Onglet | Contenu |
| --- | --- | --- |
| 1 | **Le Seuil** | Dans cet ordre : Mon expédition (avec « Rejoindre le chemin ») ; Ce soir, tu peux… ; Mes défis (Trame, case) ; Mon grimoire (sorts du chapitre, « Lancer un sortilège ») ; Moi, en voyage (les deux regards, le niveau) ; Lettre et mentorat (quand ils existent) ; Les marges du copiste (lot C) ; Garde-robe ; Mes traversées et mes badges ; But de l'année |
| 2 | **Le chemin** | L'écran d'équipe pendant le tour ; le plateau le reste du temps |
| 3 | **Le carnet** | Trois sous-onglets : **Pages de la caravane** (le carnet de la chasse : trouvées, tenues) · **Mes pages** (l'actuel « Carnet Sélène ») · **Le récit** (l'actuelle « Histoire ») |
| 4 | **La nature** | **Les biomes** · **Les espèces** · **Les mots** (les actuels « Écosystèmes », « Biodiversité », « Glossaire scientifique ») |
| 5 | **La caravane** | **Le Marché** · **Mon journal** · Forum (seulement si le module est allumé) |

- Le « ? » du dock devient **« Comprendre le jeu »** (`GLComprendrePanel.jsx`) : Le monde (l'introduction), Les
  règles, Le lexique du voyage (filtré par `chapitre_scope`, étape V2 de l'addendum 2), Revoir l'intro, Refaire la
  visite d'Olu.
- **Retirés de la barre d'un élève** : Journal de partie (il reste à la console et nourrit « Ce qui change » au Seuil),
  Statistiques (la bourse de la barre ouvre « Ma bourse et mes progrès »), Tutoriels, Le monde G&L et L'aventure
  (répartis ci-dessus).
- **Téléphone** (moins de 640 px) : Le Seuil, Le chemin, Le carnet en bas ; « Plus » pour La nature et La caravane.
- **Icônes** : les icônes peintes `GL_icone_seuil`, `GL_icone_chemin`, `GL_icone_carnet`, `GL_icone_nature`,
  `GL_icone_caravane`, `GL_icone_comprendre` (28 px, § 4) ; sans image, le libellé seul, **sans emoji**.
- **Console du prof** : Console MJ d'abord, puis les cinq onglets dans le même ordre, puis Contenus, Gestion
  utilisateurs, Gestion mascottes, Réglages plateforme. Le prof garde ses emoji.
- **Fichiers** : `src/gl/constants/app-runtime.js` ; `GLAdventureView`, `GLMondeView`, `GLJoueursView` remplacées par
  `GLCarnetView`, `GLCaravaneView` et `GLComprendrePanel` ; **une table de correspondance des anciens identifiants
  d'onglet** (liens profonds, onglet mémorisé dans `localStorage` sous `try/catch`, `importTargetNav` des pistes) ; les
  parcours d'Olu par onglet ; les tests e2e de navigation. Aucune route, aucune donnée, aucun droit.

#### T7. Le Seuil en carnet

Le Seuil devient un carnet ouvert : fond parchemin, marge d'encre à gauche (filet `#8a3b2a` à 28 px), chaque bloc est une
page avec son titre en Caudex gras et un filet d'encre dessous. Les boutons d'action sont des plaques de laiton ; les
compteurs (gemmes, Lumière) des jetons de verre. Aucun bloc ne change de contenu, seulement d'ordre (T6). Le bloc « Les
marges du copiste » (lot C) garde son crayon gris graphite.

#### T8. Les surcouches : une à la fois (décision 39)

Écris ces règles dans `docs/GL_TABLE_DE_JEU.md` (nouveau, § « Surcouches »), avec un renvoi depuis `docs/GL_TENIR_A_DEUX.md`, et applique-les :

1. **Une seule surcouche à la fois**, dans un ordre fixe : intro → visite d'Olu → péripétie → question → retour → gain
   ou badge → notification. La suivante attend que la précédente se ferme (petite file `glOverlayQueue` dans
   `src/gl/utils/`, ou le mécanisme existant s'il y en a un).
2. Pendant un tour ouvert, sur un écran d'équipe : ni visite guidée, ni fenêtre du plateau, ni toast de gain ; les gains
   s'affichent à « Tour terminé ». (I1 et F5 de l'addendum 2 le font déjà en partie : complète.)
3. Une piste s'ouvre sur place, en lecture seule ; « Revenir au jeu » rend exactement le même écran (I2).
4. Pendant une question, rien n'est consultable (I3).
5. **Un geste fermé est absent, pas grisé**, y compris les sous-onglets vides (Tutoriels, Forum sans message, Mon
   journal tant que le module n'est pas présenté).

Tests : deux surcouches demandées en même temps → une seule montée, la seconde à la fermeture ; aucun toast de gain sur
l'écran d'équipe pendant un tour ouvert.

#### T9. La projection, la vitrine et la connexion

- **Projection** (`GLProjectionView.jsx`) : `.gl-table` ; le plateau dans un cadre de bois sculpté neutre (laiton fin
  si pas d'image) ; le bandeau en plaque de laiton ; la colonne en cartes de parchemin ; les équipes en **fanions** à
  leur couleur avec leur mascotte en médaillon (pas de pilule). Jamais une bourse.
- **Vitrine des parents** et **connexion** : fond bois sous l'image d'accueil (étape V5 de l'addendum 2), formulaire
  sur une carte de parchemin. Avant le miroir, le vrai monde : pas de matière de peuple ici.

### Lot P — Le plateau

#### P1. Les cases gravées dans la pierre

En « Tenir » (et seulement là ; le jeu classique garde ses emoji), `GLBoardMarkers.jsx` ne rend plus l'emoji du
marqueur : il rend **le symbole gravé** de la sorte de case, lue comme dans `casesEnPastilles` (la tonalité `trame` ou
`souffle` prime sur `event_type`).

- **Table** (`src/gl/utils/glTenirMoment.js`, `CASES`) : ajoute à chaque sorte une clé `symbole`.

| Sorte | `symbole` (clé d'image) | Glyphe SVG de repli (monochrome, gravé) |
| --- | --- | --- |
| `start` | `GL_symbole_depart` | Une porte en arc |
| `question` | `GL_symbole_question` | Un point d'interrogation |
| `event` | `GL_symbole_peripetie` | Une étoile à huit branches fines |
| `souffle` | `GL_symbole_souffle` | **Une feuille dont la moitié s'efface en pointillés** (l'effet, jamais une forme qui agit) |
| `trame` | `GL_symbole_trame` | Trois fils qui se nouent |
| `challenge` | `GL_symbole_defi` | Deux mains qui se tiennent |
| `shortcut` | `GL_symbole_raccourci` | Une flèche courbe |
| `frontier` | `GL_symbole_frontiere` | Un petit drapeau |
| `finish` | `GL_symbole_camp` | Une tente |
| `story`, `narration` | `GL_symbole_recit` | Un livre ouvert |
| défaut | `GL_symbole_etape` | Un point |

- **Rendu avec image** : `GL_symbole_*` est **la pierre gravée entière** (calcaire pâle, symbole en creux, fond
  transparent) : elle se pose sur la pierre peinte, centrée, au même diamètre. **Rendu sans image** : le glyphe de
  `glSymbolesGraves.jsx` occupe 58 % du diamètre de la pierre peinte, centré, `mix-blend-mode: multiply`, opacité 0,8 ; le glyphe SVG porte un filtre « gravure » (`feOffset` 0,6 vers le bas,
  `feGaussianBlur` 0,4, trait `rgba(40,28,18,.78)`, reflet clair `rgba(255,248,230,.5)` décalé vers le haut). **La
  pierre peinte reste visible.**
- Le numéro de case (`gl-board-marker__path-number`) devient un petit chiffre d'encre au bord de la pierre (11 px,
  Caudex), pas une pastille.
- `aria-label` et `title` gardent le mot de la case (« Question », « Trame »…).
- Le symbole de la pastille « cases à venir » (tiroir) suit la même table ; `icone` (emoji) reste pour la console.

#### P2. Les équipes en figurines sur socle

`GLBoardMascot.jsx` en « Tenir » :
- sous le sprite, un **socle** de bois (`GL_socle`, repli : ellipse `radial-gradient(#7a5535, #3f2a17)`, 70 % de la
  largeur du sprite, ombre portée douce) ;
- derrière, un **fanion** SVG sur une hampe fine : tissu à la couleur de l'équipe, nom de l'équipe en Caudex gras
  11 px (12 caractères au plus, coupé avec « … »), contraste AA calculé (texte clair ou foncé selon la couleur) ;
- il remplace la pilule `gl-board-mascot__titre` ; sous le voile, **le fanion pâlit** (filtre `grayscale(.85)
  brightness(1.1)`) au lieu du texte « sous le voile » ; `aria-label` garde « sous le voile » ;
- taille minimale de la figurine : 7 % de la largeur du plateau sur la tablette et en projection ;
- la marche case par case du lot M s'applique à la figurine et à son socle ensemble.

#### P3. Le tour sort du dessin

En « Tenir », `GLBoardTurnHud` n'est plus monté dans `.gl-board` : le numéro du tour et la phase passent dans le bandeau
(T2) et dans le bandeau de projection. Test : aucun élément `gl-board-turn-hud` dans `.gl-board` en « Tenir ».

#### P4. Le voile pâlit la peinture (piste R2, A1 de l'audit d'ambiance)

Remplace la bande grise de `GLVoileLayer.jsx` en « Tenir » :
- une seconde couche de l'image du plateau, filtrée `grayscale(0.9) sepia(0.25) brightness(1.15) contrast(0.75)`,
  révélée par un **masque SVG** construit sur la polyligne des cases jusqu'à la position du voile (trait de 14 unités du
  repère 0-100, bords flous `feGaussianBlur` 2,5, bord fibreux `feTurbulence` baseFrequency 0,9) ;
- au bord du masque, quelques fils dorés courts et effilochés (la Trame qui se défait) ; **jamais de forme, de visage,
  de couleur sombre, d'ombre qui avance ni d'icône** ;
- « Le voile avance » : le masque glisse jusqu'à la nouvelle position en 1,6 s (projection et tablette) ; il recule de
  la même façon ;
- une page pâlie : sa zone se désature aussi (cercle flou de rayon 6 % autour du centre public de la page) ;
- les symboles, les figurines et les plumes restent lisibles au-dessus ; `aria-label="le voile"` et `data-position`
  gardés ;
- `prefers-reduced-motion` : changement direct, sans glissement ;
- **poids** : aucune image de plus (la même image du plateau, filtrée en CSS).

#### P5. Le fil doré de la Trame (piste R1)

`GLTrameFils.jsx` (nouveau calque SVG) :
- chaque page **tenue** trace un fil doré (`#c9a227`, 0,5 unité, halo `drop-shadow(0 0 1.2px #f4d77a)`) en courbe douce,
  du centre public de sa zone à la case du chemin la plus proche ;
- la zone d'une page tenue garde un halo doré très léger (opacité 0,18) ;
- le fil apparaît en se dessinant (`stroke-dashoffset`, 1,2 s ; direct en mouvement réduit) ;
- au camp, tous les fils scintillent une fois ;
- progrès collectif, jamais un classement : aucune couleur d'équipe sur un fil.
- Données : le carnet sert déjà le centre des pages tenues (`carnet.pages[].contour`) ; les positions des cases sont
  celles des marqueurs. Aucun appel de plus.

### Lot F — La fouille et l'oiseau

Rappel du geste (inchangé) : la carte du moment arme la fouille ; un toucher sur le plateau envoie le point
(`GLGameBoard.jsx`, l. 706) ; deux fouilles par tour, une sous le voile ; le serveur rend le verdict et la position de
l'oiseau (`lib/glChasse.js`, `setKraaTx`). **Aucune règle ni route ne change dans ce lot.**

#### F1. Le rôle et l'invitation

Quand la fouille est armée, la carte du moment dit : plaque « Éclaireuse ou Éclaireur, à toi » et, dessous, « Touchez
le paysage là où l'indice vous mène. » (« vous » : c'est l'écran de l'équipe). Une fois par fouille armée, un reflet
doré traverse la peinture en 0,8 s (pas en mouvement réduit) : la peinture est jouable. Quand c'est une sonde qui est
armée (lot Q), la plaque dit « Opératrice ou Opérateur, à toi » (§ 1, lot Q).

#### F2. La lanterne

`GLLanterne.jsx`, monté au-dessus du plateau quand `fouilleMode` est vrai :
- le paysage s'assombrit légèrement (`rgba(10,8,5,.28)`) sauf un **halo chaud** (rayon 9 % de la largeur du plateau,
  bord doux, teinte `rgba(255,214,140,.18)`) qui suit le pointeur ou le doigt (`pointermove` ; au toucher, le halo naît
  au contact) ;
- au toucher qui fouille, la lanterne reste posée une seconde là où on a touché, puis s'éteint ;
- jamais sur la projection pendant qu'on vise : la projection ne voit que le résultat (l'oiseau, la plume) ;
- `pointer-events: none` sur le calque : le clic passe au plateau comme aujourd'hui.

#### F3. L'oiseau se pose et laisse une plume (décisions 37 et 41 de cet addendum)

**L'oiseau** (`GLKraaWitness.jsx`) :
- **Vol** : de son perchoir précédent au point fouillé, 0,9 s (transition existante), silhouette SVG actuelle avec les
  ailes qui battent (animation CSS de `.gl-kraa__aile`) et une ombre portée qui glisse sur la peinture.
- **Il se pose** : si `gameplay.oiseau_temoin_pack_id` désigne un pack publié du catalogue, l'oiseau passe au sprite de
  ce pack (`GLMascotRenderer` existant, 4,2 % de la largeur du plateau) et joue 1,6 s l'état du verdict, puis reste
  perché en `idle` jusqu'à la fouille suivante :

| Verdict (`kraa.etat`) | État du pack | Ce qu'on voit |
| --- | --- | --- |
| `froid` | `idle_side` | Il tourne la tête ailleurs |
| `tiede` | `search` | Il fouille du regard autour de lui |
| `chaud` | `happy_jump` | Il sautille sur place |
| `zone` | `dig` | Il gratte le sol |
| `page_trouvee` | `treasure` | Il tient un trésor |
| `page_tenue` | `celebrate` | Il fête |
| `deja_trouvee` | `sleep` | Il bâille, s'assoupit |

  Sans pack : la silhouette SVG et les animations CSS d'aujourd'hui.
- **Toujours** : `aria-hidden`, aucun texte, aucun nom, aucune bulle, aucun cri ; Olu se fige pendant l'animation
  (`freezeOlu`, existant) ; mouvement réduit : il apparaît posé, sans vol ni état animé.
- **Le pack n'est jamais proposé à une équipe** : `lib/glUnifiedMascotCatalog.js` retire l'identifiant du réglage des
  listes de choix et de la composition automatique des équipes (le catalogue complet reste lisible par le staff).
  Test : catalogue servi à une équipe sans le pack du témoin.

**La plume** (`GLPlume.jsx`, rendue par `GLChasseLayer.jsx` à la place du disque `gl-chasse-empreinte`) :
- une plume noire peinte (`GL_plume_froid`, `GL_plume_tiede`, `GL_plume_chaud`, `GL_plume_page` ; repli : plume SVG
  dessinée par le lot, rachis clair, barbes noires) ; hauteur 3,2 % de la largeur du plateau ; pied de la plume au point
  fouillé ;
- **un ruban** noué au pied, à la couleur de l'équipe (`--gl-team-color`, 0,6 unité) : on sait qui a fouillé ;
- **la posture dit le verdict** (pas la couleur seule) :

| Verdict | Plume |
| --- | --- |
| `froid` | Couchée à plat, gris ardoise, opacité 0,6 |
| `tiede` | Plantée, penchée à 35° |
| `chaud` | Plantée droite, pointe dorée |
| `zone` (une page dort ici) | Plume dorée entière, un éclat doré une fois |
| `deja_trouvee` | Couchée, comme `froid` |

- `<title>` garde le mot du verdict (« froid », « tiède », « chaud », « une page », « déjà trouvée ») ;
- deux plumes à moins de 1,5 % l'une de l'autre s'écartent en éventail (± 12°) ;
- les plumes restent tout le chapitre (les empreintes sont déjà gardées par le serveur) ; sous le voile, elles pâlissent
  avec la peinture (P4) ;
- **quand une page tient** : les plumes à moins de 6 % du centre de sa zone s'envolent (fondu et montée, 1 s) — l'oiseau
  reprend ses plumes — et le fil doré de P5 se dessine ; filtrage d'affichage seulement, rien n'est effacé en base ;
- **légende** dans le tiroir « L'équipe » : « Les plumes de l'oiseau : couchée, froid ; penchée, tiède ; droite, chaud ;
  dorée, une page dort ici. » ;
- interrupteur coupé : le disque d'aujourd'hui.

#### F4. La page s'arrache du paysage

Au verdict `page_trouvee` (sur la tablette de l'équipe qui trouve et en projection) :
- une feuille de parchemin (6 % de la largeur, bord déchiré par masque SVG) sort du centre de la zone : échelle 0,2 → 1,
  rotation − 8° → 6° ;
- elle vole en arc jusqu'au bouton du carnet du bandeau (tablette ; position lue par `getBoundingClientRect`) ou jusqu'à
  la colonne « Carnet de la caravane » (projection) ; 1,6 s en tout ;
- mouvement réduit : la feuille apparaît à l'arrivée et s'estompe ;
- jamais au-dessus d'une question ouverte (T8) ; si une question arrive, l'animation se termine d'abord.

#### F5. La loupe de précision

En mode fouille, sur écran tactile : appui long de 450 ms → le plateau zoome × 2 sous le doigt (le zoom existant du
plateau, ou une transformation CSS locale) ; relâcher fouille au point sous le doigt ; glisser hors du plateau annule.
Un toucher bref fouille comme aujourd'hui. Test : appui long puis relâché → un seul appel de fouille, au bon point.

#### F6. Ce que dit la projection

La projection voit l'oiseau voler, se poser, la plume, la page qui s'arrache ; jamais la lanterne, jamais le point visé
avant le toucher.

### Lot A — Les moments forts

#### A1. Quatre moments forts en projection

`GLMomentFort.jsx`, monté par `GLProjectionView.jsx` ; 3 s au plus ; jamais au-dessus d'une question ; un à la fois
(T8) ; aucun en mouvement réduit (un simple bandeau de 2 s à la place) ; jamais sur la tablette d'équipe.

| Moment | Scène |
| --- | --- |
| **Le tour s'ouvre** | Un parchemin se déroule au centre : « Tour {n} », Cinzel, puis s'enroule |
| **Le voile avance** | Le masque de P4 glisse ; la musique pâlit (S4) ; aucun texte de plus que la phase |
| **Une page tient** | La vignette de la page passe du gris à la couleur, de gauche à droite ; deux fils, un doré (Licornes) et un brun (Gnomes), se rejoignent et se nouent |
| **Le camp** | La carte « Au camp » prend en fond la scène de joie du biome (tableau ci-dessous), les figurines des équipes autour d'un feu |

| Biome | Clé de la scène (camp et péripétie) |
| --- | --- |
| Jungle | `joie_jungle_lianes-chimpanzes` |
| Savane | `joie_savane_balade-matriarche-suricates` |
| Sahara | `joie_sahara_oasis-baignade-glissade` |
| Méditerranée | `recit_02-chap2_reconnaissance-pays-mediterra` |
| Caducifoliée | `joie_foret_pluie-de-feuilles_avec-licorne` |
| Landes | `recit_03-chap3_landes-nommer-ensemble` |
| Taïga | `recit_04-chap4_taiga-marche-neige` |
| Toundra été / nuit | `recit_05-chap5_toundra-ete-ouverture` / `recit_05-chap5_toundra-hiver-aurores` |

Si une clé ne résout pas d'image, la carte « Au camp » garde son fond parchemin.

#### A2. Olu en portrait

`GLOluBulle.jsx` : Olu parle depuis un **médaillon peint** (`GL_olu_portrait`, 72 px sur la tablette, 112 px en
projection ; repli : le rendu actuel de la mascotte dans un cercle de laiton) posé dans un coin ; sa bulle devient une
**note épinglée** sur parchemin (punaise de laiton, légère rotation de − 1,5°). Le texte et les règles d'Olu ne changent
pas (le geste d'abord, jamais de morale).

#### A3. La couleur du monde, et la nuit polaire

Une variable `--gl-biome-ambient` par biome teinte les accents des écrans de la table (bandeau, filets, halo de la carte
du moment) sans toucher au bois : jungle vert profond, savane ocre, sahara sable, méditerranée olive, caducifoliée
rousse, landes bruyère, taïga bleu-vert, toundra été lichen doré. **Nuit polaire** (sous-biome de nuit du chapitre 7) :
les écrans de la table passent en thème sombre (bleu nuit `#0f1d2e`, texte clair `#eef2f6`, plateau assombri de 15 %).
Contraste AA vérifié pour chaque teinte. Source des biomes : `src/gl/data/biomes.registry.js`.

#### A4. La péripétie illustrée

`GLPeripetieOverlay.jsx` : le panneau prend en fond la scène du biome (tableau de A1), assombrie à 35 % sous le texte ;
le texte sur une carte de parchemin.

### Étape S4 — Les sons du tour · lot S

Même moteur de synthèse que `glVoyageurSounds` (aucun fichier, aucune licence). **Les Gnomes sonnent bois, les
Licornes sonnent verre.**

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

Volumes : 0,22 en projection, 0,10 sur la tablette d'équipe, rien sur les comptes perso pendant le tour. Interrupteur :
`modules.voyageur_sounds_enabled` (libellé « Sons du jeu »).

## 3. Choix par défaut posés par Claude (à lister dans le rapport final)

- La plume dit le verdict par sa posture ; le ruban dit l'équipe ; l'information est la même qu'aujourd'hui (les
  empreintes étaient déjà publiques), seule la forme change.
- L'oiseau reprend ses plumes autour d'une page tenue : affichage seulement, les empreintes restent en base.
- Le pack « Oiseau noir » sert au témoin quand le réglage est posé ; il n'est jamais proposé à une équipe.
- La navigation en cinq onglets et la file des surcouches entrent dans le chantier (« à fond », décision 39).
- Un seul interrupteur (`modules.table_de_jeu_enabled`) pour tout l'habillage.
- Le jeu classique garde ses emoji et son plateau ; la table ne s'applique qu'en « Tenir », au compte d'élève, au Seuil,
  en projection et à la vitrine.
- Le symbole du Souffle est une feuille qui s'efface : un effet, pas une chose.
- Les péripéties sont réécrites en formes doubles et confient les dés à la ou au Gestionnaire.
- La sonde reste à l'Opératrice ou l'Opérateur, qui vient de répondre (tranché par le prompt, § 00.8).

## 4. Les images (clés stables de la médiathèque)

Générées par Claude dans Gemini à partir du 24/11 (série « Table de jeu »), contrôlées, détourées, livrées à Oliv, qui
les téléverse dans la médiathèque avec ces clés (ou Claude, sur sa demande explicite). Formats : PNG détouré pour les
objets, WebP pour les matières ; une matière sous 150 Ko.

| Clé | Contenu | Usage |
| --- | --- | --- |
| `GL_table_bois` | Bois sombre et chaud, grain léger, raccordable, 1024 px | T1 |
| `GL_cadre_gnome` | Cadre de chêne sculpté (glands, feuilles), centre vide, découpable en 9 tranches | T2 |
| `GL_cadre_licorne` | Cadre d'argent pâle et de pierre de lune, liseré bleu nuit, centre vide | T2 |
| `GL_plaque_laiton` | Plaque de laiton gravée, vide | T2 (option ; repli CSS) |
| `GL_gemme_verre` | Jeton de verre taillé, doré | T3 |
| `GL_symbole_*` (11) et `GL_pierre_vierge` | Pierres rondes de calcaire pâle, symbole gravé en creux (P1) ; une pierre sans symbole | P1 |
| `GL_socle` | Socle rond de bois tourné, vu de trois quarts | P2 |
| `GL_plume_froid`, `_tiede`, `_chaud`, `_page` | Plume noire : couchée, penchée, droite à pointe dorée, dorée | F3 |
| `GL_icone_*` (12) | seuil, chemin, carnet, nature, caravane, comprendre, gemme, plume, grimoire, voile, camp, lumière | T6, T3 |
| `GL_olu_portrait` | Olu en médaillon peint (référence : planche modèle d'Olu) | A2 |

**État le 24/11 à 12 h 26** : les 35 images sont faites, dans `GL_table_de_jeu_2026-11-24_v3.zip` (noms = clés, halos
retirés, pierres recadrées en disque, portrait d'Olu compris ; envoyé dans la conversation). Écarts : `GL_table_bois` a une vignette sombre sur les bords (à poser en `background-size: cover`,
pas en motif répété) ; pour l'icône « plume », prendre `GL_plume_chaud` (la planche a donné un oiseau, rangé sous
`GL_icone_oiseau`, non utilisé) ; images en 1024 px de large (cadres compris : suffisant en `border-image`).

Garde-fous des images : jamais le visage de Sélène ; aucun mot écrit qui nomme l'oiseau ; le voile jamais dessiné ;
parité dans toute scène avec des personnages.

## 5. Les cartes Job (hors dépôt, avant l'impression)

Décision 36 : on ne refait ni les illustrations, ni les cadres, ni les cœurs. **Confirmé par Oliv le 24/11 à 12 h 16** :
recomposer la seule ligne du tour sur quatre cartouches :

| Carte | Ligne 1 (inchangée) | Ligne 2 (nouvelle) |
| --- | --- | --- |
| Gnome Éclaireuse, Licorne Éclaireur | « Cherche l’information dans les documents. » | « Au tour de jeu : montre où fouiller. » |
| Gnome Opératrice, Licorne Opérateur | « Fait les manipulations. » | « Au tour de jeu : répond à la question. » |

**Fait le 24/11 à 12 h 40** : `Cartes_GL_24nov.zip` (envoyé dans la conversation) contient les 26 cartes et les deux PDF
A4 recto verso (27 cartes par peuple, versos en miroir, bord long, 100 %). Corrigé en passant : le Licorne Opérateur
portait « Qpérateur » et un médaillon « Q » (lettres reprises de la carte Gnome). Corps 23 (Opératrice) et 20
(Éclaireuse), Lora SemiBold Italic, encre `#3a2618`. C'est la version à imprimer.

## 6. Docs (§ 7 du prompt)

| Doc | Lot |
| --- | --- |
| Règles § 0 (lot 8 : « 24/11 : direction artistique, table de jeu ; rôles échangés : l'Éclaireuse ou l'Éclaireur fouille, l'Opératrice ou l'Opérateur répond et sonde ») et passages sur les rôles | 2, 8 |
| `essentiel-mj.md`, `deroule-partie.md`, `guide-du-mj.md` : les cinq rôles avec les nouveaux gestes ; « les plumes de l'oiseau » (lecture du plateau) ; l'interrupteur « Table de jeu » ; « Sons du jeu » | 9 |
| `docs/GL_TABLE_DE_JEU.md` (nouveau) : matières, jetons, clés d'image, replis, interrupteur, les cinq règles des surcouches (T8) ; renvoi depuis `docs/GL_TENIR_A_DEUX.md` et `docs/GL_ARCHITECTURE.md` | T |
| Annexe C du prompt (lot 9) : captures de la tablette d'équipe (Gnomes et Licornes), du plateau gravé, d'une fouille avec plumes, de la projection | 9 |

## 7. Après le chantier (§ 10 du prompt), par Oliv

1. **Téléverser les images** de la série « Table de jeu » dans la médiathèque, sous leurs clés (§ 4). Sans elles, tout
   marche, en replis.
2. **Poser `gameplay.oiseau_temoin_pack_id`** = l'identifiant de catalogue du pack « Oiseau noir »
   (`srv-c45f4983-ae08-4607-8e75-dd5659bc2793` en prod le 24/11). Ses fichiers s'appellent `kraavoleur_*.png` : un élève
   ne le voit que dans les outils de développement du navigateur ; les renommer au studio si tu veux zéro risque.
3. **Tracer les 8 zones du plateau 1** sur le dessin (éditeur de zones ; accepté par Oliv le 24/11 à 12 h 16), puis
   les faire reporter dans `chasse-zones.json` : sans elles, la plus belle fouille reste une loterie.
4. **Imprimer les planches** de `Cartes_GL_24nov.zip` (§ 5 ; cartouches recomposés le 24/11).
5. **Regarder la projection au fond de la salle** : symboles gravés, plumes, fanions lisibles à 8 m ?

## 8. Garde-fous de cette direction (à relire par `gl-relecteur-garde-fous`)

- Le voile n'est qu'une perte de couleur, jamais une forme, une ombre qui avance seule, un visage ni une couleur sombre.
- L'oiseau est un témoin : ni nom, ni cri, ni bulle, ni texte ; il ne vole rien pendant la fouille (le chapardeur est un
  autre moment, plateau 2 et suivants) ; il n'est jamais le Souffle.
- Jamais le visage de Sélène.
- Parité : figurines, cadres de peuple et scènes alternent filles et garçons ; rôles en formes doubles, jamais de point
  médian.
- Une seule surcouche à la fois ; un moment fort n'interrompt jamais une question ; mouvement réduit respecté partout.
- Bourses privées : le jeton de verre n'affiche un compte que sur l'écran de l'équipe et sur le compte de l'élève.
- Adresse : « vous » sur la tablette d'équipe et en projection ; « tu » au compte d'élève et sur la plaque d'un rôle
  nommé (« Éclaireuse ou Éclaireur, à toi »).
- Aucun nouveau texte élève sans passage au filtre `findForbiddenString` et au test `gl-mots-du-voyage` (lot V), que
  les lots T, P, F, A complètent avec leurs composants.

## 9. Non vérifié

- La projection, la tablette d'équipe et le compte d'un élève, en vrai (vus seulement dans le code et en admin).
- La lisibilité des symboles gravés et des plumes au fond de la salle.
- Les chemins cités sont ceux du commit `b8b5344` (vérifiés : `src/gl/constants/app-runtime.js`, `GLMondeView.jsx`,
  `GLSeuilView.jsx`, `GLAdventureView.jsx`, `GLJoueursView.jsx`, `src/gl/data/biomes.registry.js`). Note : l'addendum 3
  place `GLCopisteMarges.jsx` dans `src/gl/components/seuil/`, dossier qui n'existe pas ; le mettre à côté de
  `GLSeuilView.jsx`.
- Le rendu des sprites du pack « Oiseau noir » à 4 % du plateau (lisibilité d'un sprite de 256 px réduit).
