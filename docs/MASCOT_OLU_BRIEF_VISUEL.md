# OLU — brief de production des portraits

> Complément opérationnel de [`MASCOT_NARRATEUR_OLU.md`](./MASCOT_NARRATEUR_OLU.md) §4.3, §4.4
> et §5.3. Ce document sert à **produire les assets** : ce qu'on attend, comment les générer à
> partir de la planche d'expressions existante, et comment les recetter avant intégration.
>
> ⚠️ Rien ici n'est bloquant pour le développement : les lots 1 à 4 tournent sans aucun asset
> (fallback SVG, §4.1 « règle absolue »).

---

## 1. Le personnage

OLU est le **renard à sac à dos** déjà présent dans l'application sous forme pixel art
(`public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png`). Les portraits en sont la
déclinaison **illustration HD**, destinée aux bulles d'aide et de récit — pas au sprite de carte.

**Signes distinctifs à conserver, sans exception :**

| Élément     | Description                                                              |
| ----------- | ------------------------------------------------------------------------ |
| Pelage      | Roux/orange chaud, museau, joues, poitrail et bout de queue crème        |
| Oreilles    | Grandes, dressées, intérieur rosé, pointes légèrement plus sombres       |
| Yeux        | Ronds, noirs, très expressifs, petit reflet blanc                        |
| Sac à dos   | Toile beige/kaki, sangles et rabat brun cuir, porté sur les deux épaules |
| Tapis roulé | Sanglé au-dessus du sac, vert sauge                                      |
| Boussole    | Petit boîtier laiton pendu à une sangle de poitrine                      |
| Style       | Cartoon moderne, contours souples, ombrage doux (cel-shading), 2D        |
| Palette     | Chaude, désaturée, compatible thème forêt (`--forest`, `--leaf`)         |

---

## 2. Ce qu'il faut livrer

### 2.1 Priorité 1 — les 4 bustes

Arbitrage §11.3 : on démarre à **4 expressions**, les autres retombant sur `neutre`.

| Fichier                 | Expression | État canonique | Emploi                          |
| ----------------------- | ---------- | -------------- | ------------------------------- |
| `olu-neutre-bust.webp`  | `neutre`   | `idle`         | Défaut, en-tête de panneau      |
| `olu-parle-bust.webp`   | `parle`    | `talk`         | Étape de parcours standard      |
| `olu-montre-bust.webp`  | `montre`   | `point`        | Coach mark désignant un élément |
| `olu-content-bust.webp` | `content`  | `happy`        | Fin de parcours, validation     |

### 2.2 Priorité 2 — les 4 suivantes

`olu-cherche-bust.webp` (`search`), `olu-grave-bust.webp` (`sad`), `olu-vigilant-bust.webp`
(`alert`), `olu-complice-bust.webp` (`wave`).

### 2.3 Spécifications techniques (§5.3)

- **Cadrage `bust`** — buste : tête + épaules + haut du sac à dos, **une main visible** quand la
  pose l'exige. C'est le **seul cadrage indispensable**.
- **Dimensions finales** : 256 × 320 px.
- **Format** : WebP (+ PNG de repli), **fond transparent**.
- **Poids** : ≤ 30 Ko par portrait, ≤ 120 Ko pour l'ensemble chargé.
- **Recadrable en `face`** (256 × 256, visage seul) **sans perte** : même axe de tête, même
  échelle de tête d'une expression à l'autre. Les 8 portraits doivent être superposables.
- **Pas de pixel art** : ces portraits sont HD. Ne jamais leur appliquer
  `image-rendering: pixelated` (le drapeau `pixelated: true` du catalogue ne concerne que le
  sprite de carte 64 × 64, cadrage `body`).

### 2.4 Ce que la planche fournie ne couvre pas

La planche d'expressions existante (8 vignettes + illustration corps entier) est une **excellente
feuille de modèle**, mais ce n'est pas un livrable :

- elle donne des **visages** (cadrage `face`), pas des **bustes** — or `bust` est le cadrage
  principal, et `montre` exige une main, donc un buste ;
- fond crème + cadres + bordures + libellés anglais : il faut des fichiers **individuels à fond
  transparent** ;
- définition trop faible pour un export natif en 256 × 320 ;
- des **incrustations** (ampoule, coche, gouttes, « ? ») contredisent §2.4 — l'expression passe
  par le visage, et le `💡` fait doublon avec le préfixe des panneaux d'aide ;
- trois vignettes sont **hors charte** : `Frightened/Scared` (OLU prévient, il n'a pas peur),
  `Unhappy/Annoyed` (§2.2 : il ne juge jamais l'erreur), `Surprise/Shocked` (hors des 8
  expressions) ;
- deux expressions **manquent** : `complice` (le clin d'œil qui porte l'humour du §2.2) et
  `montre`.

---

## 3. Prompts Gemini

### 3.1 Mode d'emploi

1. Ouvrir Gemini (application ou API image) et **joindre la planche d'expressions** comme image
   de référence. C'est elle qui garantit la ressemblance ; sans elle, le personnage dérive.
2. Coller le **prompt maître** ci-dessous en remplaçant `{EXPRESSION}` par le bloc voulu du §3.3.
3. **Une génération par expression**, toujours avec la même image de référence jointe et le même
   prompt maître : c'est ce qui rend les 8 portraits superposables.
4. Appliquer le post-traitement du §4, puis la recette du §5.

> Si le personnage dérive d'une génération à l'autre, joindre **en plus** le portrait `neutre`
> déjà validé comme seconde référence, et ajouter au prompt : « conserve exactement le
> personnage de la seconde image de référence, ne change que l'expression et la pose ».
>
> Ces prompts sont rédigés en français. Si les résultats manquent de constance, les traduire en
> anglais donne en général une adhérence un peu meilleure — le contenu reste identique.

### 3.2 Prompt maître (à copier)

```
Image de référence jointe : planche d'expressions du personnage « OLU », un renard
anthropomorphe explorateur.

Génère UN SEUL portrait en buste de CE MÊME personnage, en respectant à l'identique son
design : pelage roux/orange chaud, museau, joues et poitrail crème, grandes oreilles
dressées à l'intérieur rosé, yeux ronds noirs très expressifs avec un petit reflet blanc,
sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert
sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading,
palette chaude et légèrement désaturée. Rendu propre et lisible en petite taille.

CADRAGE : buste — tête, épaules et haut du sac à dos. Le personnage occupe toute la hauteur
de l'image, tête légèrement en haut, sans marge superflue. Vue de face ou de trois quarts,
regard vers le spectateur. Format portrait vertical 4:5.

FOND : entièrement transparent (canal alpha). Aucun décor, aucun sol, aucune ombre portée
sur le fond.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun libellé, aucun
filigrane. Aucun cadre, aucune bordure, aucune vignette, aucun fond coloré. Aucun emoji ni
pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni
d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de
bulle de dialogue. Un seul personnage, aucun autre objet dans le champ.

EXPRESSION : {EXPRESSION}
```

### 3.3 Les blocs `{EXPRESSION}`

**Priorité 1**

| Fichier            | Bloc à substituer                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `olu-neutre-bust`  | Calme et attentif. Bouche fermée en un très léger sourire, regard posé et bienveillant, oreilles droites et détendues. Aucune emphase — c'est la pose de repos, celle qui sera vue le plus souvent.                     |
| `olu-parle-bust`   | En train de parler. Bouche entrouverte en cours de phrase, sourcils légèrement levés, tête très légèrement inclinée, une main ouverte remontée près de la poitrine dans un geste d'explication tranquille.              |
| `olu-montre-bust`  | Il désigne quelque chose. Il pointe clairement de l'index vers l'avant-droite du cadre, bras levé et main bien visible, regard suivant la direction indiquée, expression concentrée et engageante.                      |
| `olu-content-bust` | Content, sans exubérance. Franc sourire chaleureux, yeux plissés de contentement, oreilles légèrement en arrière, tête un peu redressée. Satisfaction paisible et non triomphale — surtout pas de cri ni de bras levés. |

**Priorité 2**

| Fichier             | Bloc à substituer                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `olu-cherche-bust`  | En exploration. Regard porté au loin sur le côté, une main en visière au-dessus des yeux, oreilles pivotées vers l'avant, sourcils froncés par la curiosité et non par l'inquiétude.       |
| `olu-grave-bust`    | Grave et pensif. Regard baissé et lointain, bouche en ligne neutre, oreilles légèrement retombantes, épaules un peu abaissées. Recueilli et lucide — surtout pas larmoyant ni pitoyable.   |
| `olu-vigilant-bust` | Il met en garde. Regard direct et soutenu vers le spectateur, sourcils abaissés, bouche fermée et ferme, une main ouverte levée en signe de « attention ». Sérieux et posé, jamais apeuré. |
| `olu-complice-bust` | Complice. Clin d'œil franc d'un seul œil, sourire en coin, une main levée à hauteur d'épaule en petit salut décontracté, oreille du côté du clin d'œil légèrement inclinée. Ironie douce.  |

### 3.4 Si le fond transparent n'est pas obtenu

Remplacer le bloc `FOND` du prompt maître par :

```
FOND : aplat uniforme vert pur #00FF00, parfaitement plat, sans dégradé, sans texture et
sans ombre portée. Aucun élément vert sur le personnage lui-même.
```

Puis détourer au §4.1. Le vert pur est choisi parce qu'il n'apparaît nulle part sur OLU (roux,
crème, brun, kaki) — le tapis vert sauge est assez éloigné pour ne pas être mangé par le seuil.

---

## 4. Post-traitement

Depuis le dossier des images brutes générées. `magick` = ImageMagick 7 (`convert` en v6),
`cwebp` = paquet `webp`.

### 4.1 Détourage (uniquement si fond vert)

```bash
magick olu-neutre-raw.png -fuzz 12% -transparent '#00FF00' olu-neutre-cut.png
```

Augmenter `-fuzz` par pas de 2 % si un liseré vert subsiste ; le baisser s'il ronge le pelage.

### 4.2 Recadrage et mise à l'échelle

```bash
magick olu-neutre-cut.png -trim +repage \
  -resize 256x320^ -gravity north -extent 256x320 \
  olu-neutre-bust.png
```

`-trim` supprime la marge transparente, `-gravity north` garde la tête si la hauteur déborde.

### 4.3 Export WebP

```bash
cwebp -q 82 -alpha_q 90 olu-neutre-bust.png -o olu-neutre-bust.webp
ls -l olu-neutre-bust.webp   # doit rester sous 30 Ko
```

Descendre `-q` à 75 si le fichier dépasse 30 Ko. Conserver le PNG comme repli.

### 4.4 Vérification de superposition

Les portraits doivent avoir la même échelle et le même axe de tête. Contrôle visuel rapide :

```bash
magick olu-neutre-bust.png olu-parle-bust.png -compose blend -define compose:args=50 \
  -composite check-superposition.png
```

Si la tête « double » nettement sur l'image de contrôle, régénérer l'expression fautive.

---

## 5. Recette avant intégration

- [ ] 256 × 320 px exactement, alpha propre (aucun halo vert ni gris en bordure)
- [ ] ≤ 30 Ko en WebP, PNG de repli présent
- [ ] Aucun texte, aucun emoji, aucun pictogramme flottant, aucun cadre
- [ ] Personnage identique d'un portrait à l'autre (pelage, sac, boussole, tapis)
- [ ] Même axe et même échelle de tête sur les 4 portraits (§4.4)
- [ ] Le visage seul se recadre en carré 256 × 256 sans couper les oreilles
- [ ] Lisible et identifiable **affiché à 72 px de haut** — c'est la taille réelle en parcours
- [ ] `montre` : la main et la direction sont sans ambiguïté à 72 px
- [ ] `content` reste sobre (§2.2 : pas de flatterie), `grave` reste digne (§2.3)

---

## 6. Intégration

Les portraits ne sont **pas versionnés en dur** : ils passent par la médiathèque et le réglage
`content.help.narrator.portraits.<expression>.bust` (§5.1 option A, §5.2), édité depuis le studio
prof. La plomberie arrive au **lot 2** (schéma Zod, route, payload public) et l'écran d'édition au
**lot 5**. Tant qu'un portrait est absent, l'expression retombe sur `neutre`, puis sur le
fallback SVG — aucun écran vide.

> Le corbeau de Gnomes & Licornes relève d'un autre registre visuel et d'un autre chantier :
> illustration peinte, personnage du monde et non voix d'interface. Il ne reçoit **pas** de
> planche d'expressions. Voir `docs/AUDIT_FEUILLETS_ACCES.md` §11.2 et §11.5 pour ses moments
> d'apparition (feuillets `message` / `mode_apparition = corbeau`), et les garde-fous lore de
> `lib/gl/demoFeuillets.js` — le nom du corbeau n'est jamais affiché.
