# OLU — planches d'animation (sprites `body`)

> Complément de [`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md), qui ne traite que
> des **portraits `bust`** (une image fixe par expression, rendue par `MascotSpeaker`).
> Ce document-ci traite de l'autre famille d'assets : les **planches de sprites `body`**,
> découpées en trames et animées par `VisitMapMascotSpritesheet`.
>
> **Pour produire les planches sans rien avoir à assembler**, aller directement à
> [`MASCOT_OLU_PROMPTS_A_COLLER.md`](./MASCOT_OLU_PROMPTS_A_COLLER.md) : les dix-neuf prompts y sont
> déjà complétés, prêts à copier-coller. Le présent document explique d'où ils viennent.
>
> Les deux familles sont indépendantes : on peut livrer les portraits sans jamais toucher aux
> planches, et inversement. Rien ici n'est bloquant — sans asset, le fallback SVG reste actif.

---

## 0. La référence de départ (obligatoire)

Toutes les planches se génèrent **avec la même image de référence jointe** : le **retournement**
d'OLU en quatre vues (face, trois quarts, profil droit, dos), corps entier, à échelle constante,
sur fond magenta uni.

C'est la pièce maîtresse du dispositif : un modèle d'image dérive dès qu'on lui demande plusieurs
poses sans ancre commune (le sac change de forme, la boussole disparaît, la queue change de
longueur). Le retournement fixe le personnage une fois pour toutes ; les seize planches ne font
plus que **rejouer** ce personnage-là.

**Contrôles à faire sur le retournement avant d'enchaîner** — s'ils passent, la suite est fiable :

- le **sac à dos** (toile beige/kaki, sangles et rabat brun cuir) a la même silhouette sur les
  quatre vues, y compris de dos ;
- le **tapis roulé vert sauge** est sanglé au même endroit sur les quatre vues ;
- la **boussole en laiton** est présente et pendue à la même sangle de poitrine (elle disparaît
  logiquement sur la vue de dos — c'est normal) ;
- la **hauteur du personnage** et la **hauteur de tête** sont identiques d'une vue à l'autre ;
- les quatre pieds reposent sur une **même ligne de sol**.

Deux défauts connus du retournement fourni, sans conséquence car retirés au découpage :

| Défaut                                        | Traitement                                                            |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Petit éclat blanc parasite en bas à droite    | Supprimé au détourage (composante isolée hors de la boîte englobante) |
| Bande de sol / ombre diffuse au pied des vues | Supprimée au détourage, les sprites n'ont pas d'ombre portée          |

> ⚠️ **Écart avec le brief** : le brief des portraits (§1) décrit les yeux comme « ronds, **noirs** ».
> Le retournement livré a les yeux **bruns/ambrés**. C'est le retournement qui fait foi désormais,
> puisque c'est lui qui sert de référence à tout le reste. La ligne du brief est à corriger dans
> le même lot que l'intégration des assets, pour que les deux familles restent cohérentes.

---

## 1. Fond magenta plutôt que vert

Le brief des portraits recommande un fond vert `#00FF00` (§3.4) parce que le vert n'existe pas sur
OLU. Pour les planches, on garde le **magenta `#FF00FF`** : c'est déjà ce que le modèle a produit
sur le retournement, et changer de fond en cours de série est un facteur de dérive supplémentaire.

**Seul point de vigilance** : l'**intérieur rosé des oreilles**. Il est très désaturé et loin du
magenta pur, mais si un liseré apparaît au détourage, resserrer le seuil de clé avant d'envisager
de repasser au vert.

---

## 2. Le prompt maître (à copier tel quel)

Remplacer `{N}` par le nombre de cases et `{ANIMATION}` par le bloc de la planche voulue (§4).

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard
anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de {N} cases côte à côte, de gauche à droite,
représentant les {N} étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau,
joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux
ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et
rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en
laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou
changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading,
palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds. Le personnage a exactement
la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les {N} cases. Ses pieds reposent sur une même
ligne horizontale invisible, située au même niveau dans chaque case. Il est centré
horizontalement dans sa case. Les {N} cases ont la même largeur et sont régulièrement
espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture,
sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun
libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les
cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de
coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas
d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire
autre que ceux du personnage. Un seul personnage par case.

ANIMATION : {ANIMATION}
```

### 2.0 Trois blocs ne se substituent pas mécaniquement

Le prompt maître interdit tout objet en plus des accessoires du personnage, et interdit que quoi
que ce soit disparaisse d'une case à l'autre. Trois planches contredisent ces deux lignes et
demandent donc une exception nommée dans le prompt final :

| Planche       | Ce qu'il faut lever                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| 9 — `inspect` | La **carte** est autorisée (et interdite de toute écriture — c'est là qu'un modèle glisse du faux texte) |
| 18 — `eat`    | La **baie** est autorisée, et elle disparaît volontairement à partir de la case 3                        |
| 8 — `spin`    | La **boussole** de poitrine est logiquement masquée sur la vue de dos                                    |

`MASCOT_OLU_PROMPTS_A_COLLER.md` intègre déjà ces exceptions ; elles ne concernent qu'une
substitution faite à la main.

### 2.1 Si le personnage dérive

Joindre **en plus** la planche `idle` déjà validée comme seconde référence, et ajouter en fin de
prompt : « conserve exactement le personnage de la seconde image de référence, ne change que la
pose ». C'est la même parade que pour les portraits (§3.1 du brief).

### 2.2 Si les cases sortent mal alignées

C'est le défaut le plus fréquent des modèles d'image sur une bande. Il est **sans gravité** : le
découpage se fait par **segmentation du contenu** (recherche des composantes non-magenta) et non
par grille fixe, puis chaque sujet est recentré horizontalement et calé sur sa ligne de pieds.
Une bande dont les cases sont inégales se découpe donc aussi bien qu'une bande parfaite.

Ce qui n'est **pas** rattrapable au découpage, en revanche, et impose de relancer la génération :

- une **taille de personnage qui varie** d'une case à l'autre (l'animation « respire ») ;
- un **élément qui disparaît** (sac, boussole, tapis) sur une partie des cases ;
- deux personnages qui **se chevauchent** ou se touchent — les composantes ne se séparent plus.

---

## 3. Les dix-neuf planches

**Une planche, une animation, une rangée.** Une première version regroupait les six animations
les plus courtes sur trois planches à deux rangées, pour économiser des générations. À l'essai,
elles rendent mal : le modèle mélange les rangées, reprend une pose de l'une dans l'autre, ou
change l'échelle du personnage de l'une à l'autre. Trois générations de plus coûtent moins cher
qu'une planche à retoucher — la règle est donc sans exception.

| #   | Planche      | État(s) du pack        | Cases | Vue                 | Cadence |
| --- | ------------ | ---------------------- | ----- | ------------------- | ------- |
| 1   | `idle`       | `idle`                 | 4     | trois quarts face   | 4 fps   |
| 2   | `walking`    | `walking` + `running`  | 6     | profil droit        | 10 / 14 |
| 3   | `talk`       | `talk`                 | 4     | trois quarts face   | 8 fps   |
| 4   | `point`      | `point`                | 4     | trois quarts face   | 6 fps   |
| 5   | `happy`      | `happy`                | 5     | face                | 10 fps  |
| 6   | `happy_jump` | `happy_jump`           | 5     | trois quarts face   | 10 fps  |
| 7   | `celebrate`  | `celebrate`            | 6     | face                | 12 fps  |
| 8   | `spin`       | `spin`                 | 6     | tour complet        | 12 fps  |
| 9   | `inspect`    | `inspect` + `map_read` | 4     | trois quarts face   | 3 fps   |
| 10  | `search`     | `search`               | 5     | trois quarts        | 6 fps   |
| 11  | `wave`       | `wave`                 | 5     | face                | 8 fps   |
| 12  | `alert`      | `alert`                | 3     | face                | 11 fps  |
| 13  | `surprise`   | `surprise`             | 3     | face                | 9 fps   |
| 14  | `sad`        | `sad`                  | 4     | trois quarts face   | 4 fps   |
| 15  | `love`       | `love`                 | 4     | trois quarts face   | 6 fps   |
| 16  | `angry`      | `angry`                | 4     | trois quarts face   | 8 fps   |
| 17  | `sleep`      | `sleep`                | 4     | trois quarts, assis | 3 fps   |
| 18  | `eat`        | `eat`                  | 5     | trois quarts        | 6 fps   |
| 19  | `dance`      | `dance`                | 6     | face                | 10 fps  |

**Soit 19 animations pour 21 états déclarés** : `running` réutilise les trames de `walking` à
cadence plus élevée, `map_read` réutilise celles d'`inspect`. C'est exactement le jeu d'états que
gèle `tests/visit-mascot-catalog-states.test.js` — aucun état ne retombe plus sur `idle` par
défaut une fois ces planches livrées.

---

## 4. Les blocs `{ANIMATION}`

### 1 — `idle` (4 cases, trois quarts face, 4 fps)

```
Boucle de repos, très sobre. Le personnage est debout, de trois quarts face, tourné vers le
spectateur, bras le long du corps, calme et attentif. Case 1 : posture neutre. Case 2 :
respiration, la poitrine et les épaules montent d'un cheveu, la queue s'écarte légèrement.
Case 3 : point haut de la respiration, une oreille pivote très légèrement. Case 4 : retour
vers la posture neutre, la queue revient. Le déplacement total est minuscule : les pieds ne
bougent pas, la tête ne se déplace pas latéralement.
```

### 2 — `walking` (6 cases, profil droit, 10 fps ; `running` = 14 fps)

```
Cycle de marche complet vu de profil, le personnage avançant vers la droite du cadre.
Case 1 : contact, jambe droite en avant talon posé, jambe gauche en arrière. Case 2 :
écrasement, poids sur la jambe droite, corps au plus bas. Case 3 : passage, jambe gauche
remontée sous le corps, corps au plus haut. Case 4 : contact inversé, jambe gauche en avant.
Case 5 : écrasement sur la jambe gauche. Case 6 : passage inversé, jambe droite remontée.
Les bras balancent en opposition aux jambes, la queue ondule d'un temps de retard, le sac
rebondit légèrement. La ligne de pieds reste la même : c'est le corps qui monte et descend,
pas le cadrage.
```

### 3 — `talk` (4 cases, trois quarts face, 8 fps)

```
Boucle de parole tranquille. Le personnage est debout de trois quarts face, une main ouverte
remontée près de la poitrine dans un geste d'explication. Case 1 : bouche fermée, début de
phrase. Case 2 : bouche entrouverte, la main s'ouvre vers l'extérieur. Case 3 : bouche
grande ouverte sur une syllabe, sourcils légèrement levés, tête un rien inclinée. Case 4 :
bouche à demi refermée, la main revient. Le corps reste stable, seuls la mâchoire, les
sourcils et l'avant-bras bougent.
```

### 4 — `point` (4 cases, trois quarts face, 6 fps)

```
Le personnage désigne quelque chose vers la droite du cadre. Case 1 : posture neutre, bras
le long du corps, regard vers le spectateur. Case 2 : le bras droit commence à se lever,
coude plié, le regard part vers la droite. Case 3 : bras tendu, index clairement pointé vers
la droite, main bien visible, le regard suit la direction indiquée, expression concentrée et
engageante. Case 4 : maintien de la pose avec un très léger appui vers l'avant du buste.
```

### 5 — `happy` (5 cases, face, 10 fps)

```
Joie contenue, sans exubérance. Case 1 : posture neutre, léger sourire. Case 2 : le sourire
s'élargit, les yeux commencent à se plisser, les épaules montent. Case 3 : franc sourire
chaleureux, yeux plissés de contentement, oreilles légèrement en arrière, tête redressée,
les deux mains remontées à hauteur de poitrine. Case 4 : la pose se relâche d'un cran.
Case 5 : retour vers la posture neutre en gardant le sourire. Les pieds ne quittent pas le
sol — c'est de la satisfaction paisible, pas un triomphe.
```

### 6 — `happy_jump` (5 cases, trois quarts face, 10 fps)

```
Petit bond de joie. Case 1 : accroupissement d'appel, genoux pliés, bras en arrière, corps
au plus bas. Case 2 : détente, les pieds quittent le sol, bras qui montent, corps étiré vers
le haut. Case 3 : point haut du saut, les deux pieds nettement décollés, bras levés, grand
sourire, oreilles rejetées en arrière par l'élan. Case 4 : descente, jambes qui se
préparent à la réception. Case 5 : réception, genoux fléchis, retour au sol. La ligne de sol
reste au même niveau dans les cinq cases : c'est le personnage qui monte dans le cadre.
```

### 7 — `celebrate` (6 cases, face, 12 fps)

```
Célébration franche, en boucle. Case 1 : posture neutre. Case 2 : les bras commencent à
monter, le buste se redresse. Case 3 : les deux bras sont levés en V au-dessus de la tête,
gueule ouverte sur un cri de joie, yeux fermés de contentement, queue relevée. Case 4 :
maintien de la pose bras levés, léger balancement du buste vers la gauche. Case 5 :
balancement vers la droite, bras toujours levés. Case 6 : les bras redescendent à mi-hauteur.
Aucun confetti, aucune étoile, aucun trait de mouvement : uniquement le personnage.
```

### 8 — `spin` (6 cases, tour complet, 12 fps)

```
Rotation complète du personnage sur lui-même, sur place, en six étapes régulières de soixante
degrés. Case 1 : vue de face. Case 2 : trois quarts face droit. Case 3 : profil droit.
Case 4 : vue de dos. Case 5 : trois quarts dos gauche. Case 6 : profil gauche. Le personnage
garde exactement la même posture debout et la même hauteur dans les six cases, bras
légèrement écartés ; seule l'orientation change. Le sac à dos et le tapis roulé doivent être
cohérents à chaque angle, notamment sur la vue de dos.
```

### 9 — `inspect` (4 cases, trois quarts face, 3 fps ; `map_read` réutilise ces trames)

```
Le personnage examine quelque chose qu'il tient. Il a sorti une carte pliée en papier vieilli
qu'il tient à deux mains devant lui, à hauteur de poitrine, légèrement inclinée vers lui.
Case 1 : il regarde la carte, sourcils froncés par la concentration. Case 2 : il approche la
carte de son museau, tête penchée sur le côté. Case 3 : il relève les yeux de la carte et
regarde au loin vers la droite, comme pour comparer. Case 4 : retour du regard sur la carte.
La carte garde exactement la même forme et la même taille dans les quatre cases.
```

### 10 — `search` (5 cases, trois quarts, 6 fps)

```
Le personnage cherche du regard. Case 1 : posture neutre, il commence à lever la main droite.
Case 2 : main droite en visière au-dessus des yeux, regard porté au loin vers la gauche du
cadre, oreilles pivotées vers l'avant. Case 3 : le buste et la tête pivotent, le regard
balaie vers le centre. Case 4 : regard porté au loin vers la droite du cadre, main toujours
en visière, buste penché en avant. Case 5 : la main redescend, retour vers la posture neutre.
Sourcils froncés par la curiosité et non par l'inquiétude.
```

### 11 — `wave` (5 cases, face, 8 fps)

```
Salut de la main. Case 1 : posture neutre de face, sourire léger. Case 2 : le bras droit se
lève, coude plié, main ouverte à hauteur d'épaule. Case 3 : la main est inclinée vers la
gauche, doigts écartés, franc sourire. Case 4 : la main est inclinée vers la droite, même
sourire — c'est le va-et-vient du salut. Case 5 : la main est de nouveau inclinée vers la
gauche. Le reste du corps ne bouge pas, seul l'avant-bras et le poignet travaillent.
```

### 12 — `alert` (3 cases, face, 11 fps)

```
Mise en garde. Case 1 : posture neutre, bras le long du corps, regard vers le spectateur.
Case 2 : le personnage se redresse, une main ouverte commence à se lever, paume vers
l'avant. Case 3 : main levée bien visible en signe de « attention », bras tendu vers
l'avant, regard direct et soutenu vers le spectateur, sourcils abaissés, bouche fermée et
ferme, oreilles dressées. Sérieux et posé, jamais apeuré ni menaçant.
```

### 13 — `surprise` (3 cases, face, 9 fps)

```
Sursaut de surprise. Case 1 : posture neutre, expression calme. Case 2 : le corps se raidit
et se redresse d'un coup, les oreilles se dressent, les yeux s'agrandissent, les épaules
montent. Case 3 : surprise pleine, yeux très écarquillés, gueule ouverte en rond, les deux
mains remontées ouvertes devant la poitrine, queue gonflée et relevée.
```

### 14 — `sad` (4 cases, trois quarts face, 4 fps)

```
Gravité, très retenue. Case 1 : posture neutre. Case 2 : les épaules s'affaissent, la tête
commence à descendre, les oreilles retombent. Case 3 : regard baissé et lointain, bouche en
ligne neutre, oreilles retombantes, épaules abaissées, queue basse. Case 4 : maintien de la
pose, la tête se redresse d'un cheveu. Recueilli et lucide — jamais larmoyant, aucune larme.
```

### 15 — `love` (4 cases, trois quarts face, 6 fps)

```
Élan d'affection. Case 1 : posture neutre, léger sourire. Case 2 : les deux mains remontent
et se joignent devant la poitrine, la tête commence à s'incliner sur le côté. Case 3 : mains
jointes sur la poitrine, tête inclinée, yeux fermés en deux arcs souriants, museau relevé,
expression attendrie. Case 4 : léger balancement du buste vers l'autre côté, même expression.
```

### 16 — `angry` (4 cases, trois quarts face, 8 fps)

```
Contrariété. Case 1 : posture neutre. Case 2 : les sourcils s'abaissent, les poings se
ferment le long du corps. Case 3 : buste penché en avant, poings serrés remontés à hauteur
de taille, babines légèrement retroussées, oreilles rabattues en arrière. Case 4 : même pose,
le buste se redresse d'un cran en soufflant. Contrarié et boudeur, jamais menaçant ni
effrayant : c'est une mascotte destinée à des élèves.
```

### 17 — `sleep` (4 cases, trois quarts, assis, 3 fps)

```
Sommeil paisible. Le personnage est assis en tailleur au sol, dos rond, tête penchée en
avant, yeux fermés en deux traits, queue enroulée autour de lui, et garde exactement cette
position dans les quatre cases — seule la respiration bouge. Case 1 : tête basse,
respiration au plus bas. Case 2 : la tête et les épaules remontent d'un cheveu. Case 3 :
point haut de la respiration, la tête glisse un peu sur le côté. Case 4 : la tête retombe
doucement vers l'avant.
```

> ⚠️ Seule planche où le personnage est **assis** : la contrainte de ligne commune porte sur le bas
> du corps, pas sur les pieds. Le prompt final en tient compte.

### 18 — `eat` (5 cases, trois quarts, 6 fps)

```
Le personnage mange une petite baie rouge sombre qu'il tient entre deux doigts. Case 1 : il
tient la baie devant lui, à hauteur de poitrine, et la regarde. Case 2 : il l'approche de son
museau, gueule entrouverte. Case 3 : la baie est dans la gueule, joues gonflées, main
redescendue. Case 4 : mastication, gueule fermée, joues gonflées d'un côté, yeux plissés de
contentement. Case 5 : déglutition, gueule fermée, sourire satisfait, main revenue le long
du corps. La baie a exactement la même taille et la même couleur dans les cases où elle est
visible, et n'apparaît plus à partir de la case 3.
```

### 19 — `dance` (6 cases, face, 10 fps)

```
Petite danse en boucle, joyeuse et simple. Case 1 : appui sur la jambe droite, hanche à
droite, bras gauche levé, bras droit bas. Case 2 : transition, les deux pieds au sol, bras à
mi-hauteur. Case 3 : appui sur la jambe gauche, hanche à gauche, bras droit levé, bras gauche
bas. Case 4 : transition inverse. Case 5 : petit saut sur place, les deux bras levés, grand
sourire. Case 6 : réception, genoux fléchis, bras qui redescendent. La queue accompagne le
mouvement avec un temps de retard. Grand sourire et yeux plissés dans les six cases.
```

---

## 5. Découpage et fabrication du pack — fait

Les dix-neuf planches ont été générées et découpées. Ce que le dépôt contient désormais :

| Élément                                      | Où                                                         |
| -------------------------------------------- | ---------------------------------------------------------- |
| Découpeur                                    | `scripts/olu-sheets-cut.cjs` — `npm run mascot:olu-cut`    |
| Trames découpées (88 PNG, 256 × 256, 1,4 Mo) | `public/assets/mascots/olu-planches/frames/`               |
| Pack                                         | `docs/packs/olu-planches-pack.json`                        |
| Fabrication de l'archive importable          | `scripts/olu-pack-archive.cjs` — `npm run mascot:olu-pack` |
| Garde-fous                                   | `tests/olu-mascot-pack.test.js` (9 cas, sans base)         |

```bash
npm run mascot:olu-cut -- --in <dossier-planches> --out public/assets/mascots/olu-planches/frames
npm run mascot:pack:validate -- docs/packs/olu-planches-pack.json
npm run mascot:olu-pack -- --out mascot-pack-olu.zip
```

### 5.1 Ce que fait le découpeur

1. **Clé chromatique.** Le fond n'est pas le `#FF00FF` demandé : il sort autour de `(247, 6, 233)`
   et varie d'une planche à l'autre. On ne compare donc pas à une couleur de référence mais à un
   **écart** : `min(R, B) − G`. Sur la palette d'OLU (roux, crème, brun, kaki, sauge) cet écart est
   toujours négatif ; sur le fond il dépasse 200. Le seuil est à 60, très loin des deux populations
   — ce qui rend la clé insensible à la dérive du fond **et** au bruit JPEG. Résidu mesuré après
   coup : au pire **5 pixels sur 15 000** (0,03 %), sur une seule trame.
2. **Rognage de 2 px** du masque, ce qui emporte le liseré d'anticrénelage. À ~500 px de côté
   source pour 256 px de sortie, deux pixels source valent un pixel de sortie : la silhouette ne
   maigrit pas visiblement.
3. **Retrait des composantes isolées** sous 0,12 % de l'aire — l'éclat blanc que le générateur pose
   en bas à droite (retiré sur `inspect`), un point de compression.
4. **Segmentation par colonnes vides**, pas par grille. Les dix-neuf planches ont été segmentées
   correctement **du premier coup**, y compris celles dont les cases sont inégalement espacées.
5. **Échelle par planche.** Chaque planche ayant été générée séparément, OLU n'y a pas la même
   taille en pixels : de 335 px de haut sur `walking` à 523 px sur `alert`. La hauteur médiane de
   chaque planche est ramenée à une hauteur commune (206 px), d'où des facteurs de 0,37 à 0,62.
6. **Ligne de sol par planche, pas par sujet.** Le calage se fait sur le bas le plus bas de la
   planche. Un calage individuel aurait aplati les sauts : sur `happy_jump`, `celebrate` et `dance`,
   les trames où les pieds décollent gardent ainsi leur hauteur relative.
7. **Palette de 256 couleurs.** 3,4× plus léger que le PNG vraie couleur (16 Ko au lieu de 45 Ko par
   trame), sans différence visible sur cet aplat cel-shaded. À 128 couleurs, en revanche, un
   tramage apparaît sur le poitrail crème : comparé image à image avant d'être retenu.

> Le nombre de sujets attendu est **déclaré** planche par planche dans `SHEETS`, et un écart est une
> **erreur**, pas un avertissement : une planche mal segmentée doit arrêter la chaîne, pas produire
> un état amputé d'une trame que personne ne remarquera.

### 5.2 La seule valeur posée à la main

OLU assis (`sleep`) occupe moins de hauteur que debout, et sa planche ne contient aucun sujet
debout : son échelle ne peut pas se déduire de sa seule hauteur. Le rapport est posé à **0,74** de
la hauteur debout (`SEATED_HEIGHT_RATIO`). C'est la seule valeur du découpeur qui relève du jugement
et non de la mesure ; elle se vérifie sur la planche de contrôle (`--contact`).

### 5.3 Le pack

`id: 'olu-spritesheet'` — **l'identifiant de la mascotte livrée**, volontairement. Un pack publié
dont le `catalog_id` reprend celui d'une mascotte du catalogue **remplace** cette mascotte dans le
sélecteur au lieu de s'ajouter à côté. L'entrée `olu-spritesheet` déclare un spritesheet dont le PNG
n'est pas versionné : OLU n'y apparaît qu'en silhouette SVG. Reprendre cet identifiant, c'est donner
ses animations à cette mascotte-là.

Le dossier des trames, lui, s'appelle `olu-planches` : ce sont des trames découpées (`sprite_cut`),
pas un spritesheet — les nommer ainsi induirait en erreur.

`pixelated: false` (illustration HD, contrairement à `fox-backpack`), `frameWidth`/`frameHeight` à
256, `fallbackSilhouette: 'olu'`. **Vingt et un états pour 88 trames** : `running` réutilise les
trames de `walking` à 14 fps, `map_read` celles d'`inspect`. Plus aucun état ne retombe sur `idle`.

### 5.4 L'archive importable

`npm run mascot:olu-pack` produit `mascot-pack-olu.zip` au format `foretmap-mascot-pack-archive`
(`manifest.json` + `pack.json` + `assets/`), **1,1 Mo**, importable tel quel :

- studio prof → onglet **Packs mascotte** → **Importer ZIP** ;
- ou `POST /api/visit/mascot-packs/import`.

L'archive a été relue par le **parseur d'import du serveur lui-même**
(`lib/mascotPackArchive.parseMascotPackZipBuffer`) et par la validation Zod servie au runtime
(`lib/visit-pack/mascotPack.parseMascotPack`) : 88 trames citées, 88 présentes, aucune manquante,
aucune orpheline.

Il reste à **publier** le pack après import — seuls les packs publiés apparaissent en visite.

### 5.5 Ce qui reste à reprendre

- **`alert` et `surprise`** viennent des deux seules planches au format 1792 × 592, générées dans
  une passe où le personnage a dérivé : tête plus ronde, membres plus fins, et surtout **le
  poitrail crème disparaît**. Une fois normalisées elles tiennent, mais OLU n'y est pas tout à fait
  le même. À régénérer avec le retournement joint, prompts 12 et 13 de
  `MASCOT_OLU_PROMPTS_A_COLLER.md` — puis relancer le découpeur, rien d'autre à faire.
- Une planche livrée n'était pas une animation mais un **échantillon d'expressions** (cinq humeurs
  différentes côte à côte) : inutilisable telle quelle, et écartée.
- Le générateur a produit **deux prises de `dance`** ; c'est celle de 2064 × 512 qui est retenue,
  ses sujets étant plus grands donc mieux définis.
