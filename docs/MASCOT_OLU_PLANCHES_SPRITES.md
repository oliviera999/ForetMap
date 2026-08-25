# OLU — planches d'animation (sprites `body`)

> Complément de [`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md), qui ne traite que
> des **portraits `bust`** (une image fixe par expression, rendue par `MascotSpeaker`).
> Ce document-ci traite de l'autre famille d'assets : les **planches de sprites `body`**,
> découpées en trames et animées par `VisitMapMascotSpritesheet`.
>
> **Pour produire les planches sans rien avoir à assembler**, aller directement à
> [`MASCOT_OLU_PROMPTS_A_COLLER.md`](./MASCOT_OLU_PROMPTS_A_COLLER.md) : les seize prompts y sont
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

## 3. Les seize planches

Trois planches regroupent deux animations courtes sur **deux rangées** (haut / bas). Si le modèle
mélange les rangées, les scinder en deux générations d'une rangée chacune : le découpeur traite
les deux formes indifféremment.

| #   | Planche          | État(s) du pack        | Cases             | Vue               | Cadence |
| --- | ---------------- | ---------------------- | ----------------- | ----------------- | ------- |
| 1   | `idle`           | `idle`                 | 4                 | trois quarts face | 4 fps   |
| 2   | `walking`        | `walking` + `running`  | 6                 | profil droit      | 10 / 14 |
| 3   | `talk`           | `talk`                 | 4                 | trois quarts face | 8 fps   |
| 4   | `point`          | `point`                | 4                 | trois quarts face | 6 fps   |
| 5   | `happy`          | `happy`                | 5                 | face              | 10 fps  |
| 6   | `happy_jump`     | `happy_jump`           | 5                 | trois quarts face | 10 fps  |
| 7   | `celebrate`      | `celebrate`            | 6                 | face              | 12 fps  |
| 8   | `spin`           | `spin`                 | 6                 | tour complet      | 12 fps  |
| 9   | `inspect`        | `inspect` + `map_read` | 4                 | trois quarts face | 3 fps   |
| 10  | `search`         | `search`               | 5                 | trois quarts      | 6 fps   |
| 11  | `wave`           | `wave`                 | 5                 | face              | 8 fps   |
| 12  | `alert_surprise` | `alert` / `surprise`   | 3 + 3 (2 rangées) | face              | 11 / 9  |
| 13  | `sad_love`       | `sad` / `love`         | 4 + 4 (2 rangées) | trois quarts      | 4 / 6   |
| 14  | `angry_sleep`    | `angry` / `sleep`      | 4 + 4 (2 rangées) | trois quarts      | 8 / 3   |
| 15  | `eat`            | `eat`                  | 5                 | trois quarts      | 6 fps   |
| 16  | `dance`          | `dance`                | 6                 | face              | 10 fps  |

**Soit 19 animations distinctes pour 21 états déclarés** : `running` réutilise les trames de
`walking` à cadence plus élevée, `map_read` réutilise celles d'`inspect`. C'est exactement le jeu
d'états que gèle `tests/visit-mascot-catalog-states.test.js` — aucun état ne retombe plus sur
`idle` par défaut une fois ces planches livrées.

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

### 12 — `alert_surprise` (2 rangées de 3 cases, face, 11 et 9 fps)

```
Deux animations distinctes sur deux rangées, même taille de personnage partout.

RANGÉE DU HAUT — mise en garde, 3 cases. Case 1 : posture neutre. Case 2 : le personnage se
redresse, une main ouverte se lève paume vers l'avant. Case 3 : main levée bien visible en
signe de « attention », regard direct et soutenu vers le spectateur, sourcils abaissés,
bouche fermée et ferme. Sérieux et posé, jamais apeuré.

RANGÉE DU BAS — surprise, 3 cases. Case 1 : posture neutre. Case 2 : sursaut, le corps se
raidit et se redresse, les oreilles se dressent d'un coup, les yeux s'agrandissent. Case 3 :
surprise pleine, yeux très écarquillés, gueule ouverte en rond, les deux mains remontées
devant la poitrine, queue gonflée. Aucun trait de mouvement, aucun point d'exclamation.
```

### 13 — `sad_love` (2 rangées de 4 cases, trois quarts, 4 et 6 fps)

```
Deux animations distinctes sur deux rangées, même taille de personnage partout.

RANGÉE DU HAUT — gravité, 4 cases. Case 1 : posture neutre. Case 2 : les épaules
s'affaissent, la tête commence à descendre, les oreilles retombent. Case 3 : regard baissé
et lointain, bouche en ligne neutre, oreilles retombantes, épaules abaissées, queue basse.
Case 4 : maintien de la pose, la tête se redresse d'un cheveu. Recueilli et lucide —
surtout pas larmoyant, aucune larme.

RANGÉE DU BAS — affection, 4 cases. Case 1 : posture neutre. Case 2 : les deux mains
remontent et se joignent devant la poitrine, la tête s'incline sur le côté. Case 3 : mains
jointes sur la poitrine, yeux fermés en deux arcs souriants, museau relevé, expression
attendrie. Case 4 : léger balancement du buste, même expression. Aucun cœur, aucune étoile,
aucun pictogramme flottant.
```

### 14 — `angry_sleep` (2 rangées de 4 cases, trois quarts, 8 et 3 fps)

```
Deux animations distinctes sur deux rangées, même taille de personnage partout.

RANGÉE DU HAUT — contrariété, 4 cases. Case 1 : posture neutre. Case 2 : les sourcils
s'abaissent, les poings se ferment le long du corps. Case 3 : buste penché en avant, poings
serrés remontés, babines légèrement retroussées, oreilles rabattues en arrière. Case 4 :
même pose, le buste se redresse d'un cran en soufflant. Contrarié et boudeur, jamais
menaçant ni effrayant — c'est une mascotte pour des élèves. Aucune veine, aucun symbole de
colère.

RANGÉE DU BAS — sommeil, 4 cases. Le personnage est assis en tailleur au sol, dos rond, tête
penchée en avant, yeux fermés en deux traits, queue enroulée autour de lui. Case 1 : tête
basse, respiration au plus bas. Case 2 : la tête et les épaules remontent d'un cheveu.
Case 3 : point haut de la respiration, la tête glisse un peu sur le côté. Case 4 : la tête
retombe doucement. Aucune bulle de sommeil, aucune lettre Z.
```

### 15 — `eat` (5 cases, trois quarts, 6 fps)

```
Le personnage mange une petite baie rouge sombre qu'il tient entre deux doigts. Case 1 : il
tient la baie devant lui, à hauteur de poitrine, et la regarde. Case 2 : il l'approche de son
museau, gueule entrouverte. Case 3 : la baie est dans la gueule, joues gonflées, main
redescendue. Case 4 : mastication, gueule fermée, joues gonflées d'un côté, yeux plissés de
contentement. Case 5 : déglutition, gueule fermée, sourire satisfait, main revenue le long
du corps. La baie a exactement la même taille et la même couleur dans les cases où elle est
visible, et n'apparaît plus à partir de la case 3.
```

### 16 — `dance` (6 cases, face, 10 fps)

```
Petite danse en boucle, joyeuse et simple. Case 1 : appui sur la jambe droite, hanche à
droite, bras gauche levé, bras droit bas. Case 2 : transition, les deux pieds au sol, bras à
mi-hauteur. Case 3 : appui sur la jambe gauche, hanche à gauche, bras droit levé, bras gauche
bas. Case 4 : transition inverse. Case 5 : petit saut sur place, les deux bras levés, grand
sourire. Case 6 : réception, genoux fléchis, bras qui redescendent. La queue accompagne le
mouvement avec un temps de retard. Grand sourire et yeux plissés dans les six cases.
```

---

## 5. Découpage et fabrication du pack

### 5.1 Géométrie cible

- **Génération** : ce que rend le modèle, sans contrainte de taille (typiquement 1024 à 2048 px
  de large pour une bande de 4 à 6 cases).
- **Case finale** : **256 × 256 px**, transparente, personnage centré horizontalement et calé
  sur une ligne de pieds commune à **toutes les planches** (sinon OLU « saute » au changement
  d'état).
- **Feuille finale** : une seule image, une **rangée par état**, cases contiguës, sans marge.
- **`pixelated: false`** — contrairement à `fox-backpack`, ce pack est en illustration HD.

### 5.2 Le découpeur

Un script `scripts/olu-sheets-cut.cjs` est à écrire sur le modèle de
`scripts/fox-backpack-extract-and-compose.cjs`. Étapes :

1. clé chromatique magenta → alpha, seuil resserré (vigilance oreilles rosées, §1) ;
2. suppression des composantes isolées de moins de ~0,5 % de l'aire (l'éclat parasite du §0) ;
3. segmentation par colonnes vides pour isoler les cases, puis par rangées si la planche en a
   deux — **pas de grille fixe**, cf. §2.2 ;
4. pour chaque sujet : boîte englobante, recentrage horizontal, calage du bas de boîte sur la
   ligne de pieds commune, mise à l'échelle vers 256 × 256 avec une marge de sécurité de 4 px ;
5. composition de la feuille finale et écriture du manifeste.

### 5.3 Le manifeste

Même forme que les autres packs (`docs/MASCOT_PACK.md`) : `framesBase`, `frameWidth`/`frameHeight`
à 256, `pixelated: false`, `fallbackSilhouette`, et un `stateFrames.<état>` par ligne du tableau
du §3 — `running` pointant sur les trames de `walking` avec `fps: 14`, `map_read` sur celles
d'`inspect`.

Un pack publié l'emporte sur l'entrée catalogue de même `id` : le pack OLU issu de ces planches
remplacera donc `olu-spritesheet` sans qu'il y ait besoin de toucher
`src/utils/visitMascotCatalog.js`.

### 5.4 Recette

```bash
npm run mascot:pack:validate
```

Puis, dans l'application : parcourir les 21 états et vérifier qu'aucun ne retombe sur la
silhouette SVG, qu'OLU ne change pas de taille entre deux états, et qu'il ne se déplace pas
verticalement au changement d'état (défaut de ligne de pieds, §5.1).
