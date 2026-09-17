# Audit — Affichage des emojis, et le cas des appareils Apple — 2026-09-17

> **Instantané** du 17 sept. 2026 · app **v1.163.1** · commit `b05c861`
> Portée : chaîne complète d'affichage d'un emoji dans les trois produits (ForetMap, G&L,
> Plan Lyautey) — fichier de police, `@font-face`, ordre des piles `font-family`, livraison
> HTTP, cache hors ligne, réparation des données.
> Méthode : lecture du code + **mesures** — table par table sur le fichier de police livré,
> et sondes de rendu Chromium/WebKit (Playwright) sur la pile réelle.
>
> **Limite assumée** : le WebKit de Playwright tourne sous Linux (FreeType/Cairo) ; le WebKit
> de Safari iOS tourne sur **CoreText**. Les deux ne partagent pas le moteur de rendu des
> polices **couleur**. Les mesures ci-dessous valident la mécanique CSS (chargement, ordre de
> pile, requêtes réseau) ; elles ne valident **pas** le dessin des glyphes sur iPhone. Ce point
> précis est le seul qui demande un appareil physique (§ 6).

## Réponse courte

**Oui, le rendu emoji est le maillon faible sur iPhone / iPad / Mac — et ce n'est pas un bug de
ForetMap, c'est un choix de police incompatible avec le moteur d'Apple.**

Le dépôt impose partout une police emoji auto-hébergée (`ForetMapColorEmoji` = Noto Color Emoji)
**avant** `Apple Color Emoji`. Or Safari/WebKit n'implémente ni **COLRv1** ni **COLRv0** : sur un
appareil Apple, cette police ne peut être dessinée que par sa table **OT-SVG**, la voie la moins
supportée des deux, documentée comme instable en conditions réelles — les glyphes
« disparaissent au zoom ou après un moment » ([infolektuell/noto-color-emoji](https://github.com/infolektuell/noto-color-emoji)).
Et l'écran principal de ForetMap est **une carte que l'on zoome**, couverte d'emojis.

Sur Android / Windows / Chrome, la même police passe par sa table **COLRv1** : cette voie-là
fonctionne. Le problème est donc **strictement Apple**.

## Tableau de statut

| ID          | Sévérité           | Constat                                                                | Statut                     |
| ----------- | ------------------ | ---------------------------------------------------------------------- | -------------------------- |
| EMO-APL-001 | **Bloquant** Apple | Police imposée avant `Apple Color Emoji`, voie OT-SVG instable sur iOS | Ouvert — **arbitrage § 7** |
| EMO-APL-002 | Majeur             | 5,7 Mo sur le fil, **25,1 Mo décompressés**, dont 20,1 Mo de SVG       | Ouvert (lié à 001)         |
| EMO-APL-003 | Majeur             | Le `preload` annule l'optimisation `unicode-range` documentée          | Ouvert — **arbitrage § 7** |
| EMO-APL-004 | Majeur             | `/fonts/*` servi **sans en-tête de cache**                             | **Traité** (ce lot)        |
| EMO-APL-005 | Moyen              | Police absente du précache PWA (cache-first seulement à l'usage)       | Ouvert                     |
| EMO-APL-006 | Moyen              | Trois piles `font-family` sans repli emoji (dont `.lb-rank` 🥇🥈🥉)    | Ouvert (lié à 001)         |
| EMO-APL-007 | Mineur             | `font-variant-emoji` n'est pas « Baseline »                            | Constat, sans correctif    |
| EMO-APL-008 | Mineur             | `unicode-range` sans les keycaps (`U+23`, `U+2A`, `U+30-39`)           | Risque dormant             |
| EMO-APL-009 | Mineur             | `@font-face` identique triplé dans trois feuilles                      | Dette de maintenance       |

## 1. Ce que contient réellement le fichier de police

`public/fonts/noto-color-emoji.woff2` (copié de `@fontsource/noto-color-emoji` 5.3.1 par
`npm run fonts:sync-noto-emoji`). Tables lues dans l'en-tête WOFF2 :

| Table     | Taille décompressée | Sert à                                   |
| --------- | ------------------- | ---------------------------------------- |
| `SVG `    | **20 101 916 o**    | OT-SVG — **la seule voie de Safari**     |
| `glyf`    | 3 479 648 o         | contours de base                         |
| `COLR`    | 1 101 244 o         | COLRv1 — voie de Chrome / Edge / Firefox |
| `CPAL`    | 24 798 o            | palettes COLR                            |
| autres    | ~ 384 000 o         | `GSUB`, `cmap`, `hmtx`, `loca`…          |
| **Total** | **25 091 548 o**    | pour **5 708 560 o** sur le fil          |

Deux enseignements :

1. Le fichier embarque **les deux** formats de police couleur. C'est ce qui fait qu'il « marche »
   partout au sens du chargement — mais ce sont deux implémentations distinctes, et Apple n'a
   que la plus fragile.
2. **20 Mo de la police sont des documents SVG** — un par glyphe, à parser au rendu. C'est
   précisément ce que l'iPhone doit avaler, et la seule partie qu'il utilise. Les 1,1 Mo de
   `COLR` que Chrome utilise sont, pour lui, du poids mort ; et réciproquement.

## 2. La pile `font-family` et ce qu'elle impose à Apple

Déclarée à l'identique dans trois feuilles (`src/index.css:70`, `src/gl/styles/gl-base.css:31`,
`src/plan/styles/plan.css:18`) et dans `src/shared/styles/typography-tokens.css:20` :

```css
--font-emoji-stack:
  'ForetMapColorEmoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
--font-sans: 'DM Sans', 'ForetMapColorEmoji', 'Apple Color Emoji', …;
```

`Apple Color Emoji` n'est atteinte **que** si la police auto-hébergée échoue au **chargement**.
Elle ne l'est pas si la police charge mais **se dessine mal** : côté CSS, une police chargée dont
le glyphe existe est une police qui convient. Il n'y a donc **aucun repli** vers la police
d'Apple sur le scénario qui pose problème.

C'est un choix documenté et assumé : `docs/AUDIT_UI_HOMOGENEITE_2026-09.md` § A3 a délibérément
remonté `ForetMapColorEmoji` en tête pour que « le même caractère sorte de la même fonte sur
tous les appareils ». L'objectif — supprimer l'écart entre une épingle (pile emoji) et un emoji
resté dans un nom de zone (pile sans) — était juste. Le moyen a un coût qui n'avait pas été
mesuré : il fait passer **tous** les appareils Apple par la voie OT-SVG, alors qu'ils disposent
nativement d'une police emoji irréprochable (`Apple Color Emoji`, format `sbix`, déjà résidente,
zéro octet à télécharger).

## 3. Mesures de rendu (Chromium vs WebKit)

Page de test reproduisant le `@font-face` et la pile du dépôt, police servie en local, capture
d'écran analysée pixel par pixel (part de pixels « encrés » réellement colorés : un emoji
monochrome sort à ~0, un emoji couleur au-dessus de 0,7).

| Sonde                           | Chromium | WebKit (Linux) |
| ------------------------------- | -------- | -------------- |
| `@font-face` chargée            | oui      | oui            |
| `document.fonts.check(…)`       | vrai     | vrai           |
| Emoji seul, police forcée       | 0,975    | 0,975          |
| Emojis, pile complète           | 0,798    | 0,798          |
| Emojis dans un `<text>` **SVG** | 0,868    | 0,869          |
| 200 emojis sur la même page     | 0,877    | 0,876          |

Lecture : la mécanique CSS est saine — la police se charge, la pile résout, le rendu couleur
tient y compris dans les `<text>` SVG (les libellés de zone de `ZonePolygonsLayer.jsx` et
`VisitZonesSvgLayer.jsx`) et sans décrochage à 200 glyphes. **Aucun bug côté ForetMap.** Mais ce
WebKit-là s'appuie sur FreeType, qui sait lire COLRv1 ; celui d'iOS s'appuie sur CoreText, qui ne
le sait pas. Ce tableau innocente le code, il n'innocente pas le choix de police.

## 4. Livraison : 5,7 Mo téléchargés inconditionnellement

`src/index.css:36-37` documente l'optimisation :

> « Borne le téléchargement aux caractères emoji : la police (5,5 Mo) n'est récupérée que si un
> emoji est effectivement rendu, même placée en tête de pile. »

C'est exact pour le `unicode-range` seul — et **faux dans l'application livrée**, parce que
`index.vite.html:35-42` et `gl.html:12-18` posent :

```html
<link rel="preload" href="/fonts/noto-color-emoji.woff2" as="font" type="font/woff2" crossorigin />
```

Un `preload` de police est inconditionnel et prioritaire : il part **avant** même que le CSS soit
analysé, donc avant toute notion d'emoji rendu ou de `unicode-range`. Les 5,7 Mo sont donc
téléchargés à chaque première visite, sur tous les appareils, y compris ceux qui n'en feront
jamais rien. À titre de comparaison, `dist/assets/main-*.js` pèse **498 Ko** : **la police emoji
vaut 11 fois le bundle principal de l'application**.

Le `preload` avait sa raison d'être (éviter le FOUT sur les épingles, A3). Elle disparaît si la
police cesse d'être la première de pile (§ 7).

**Vérification de la mécanique** (Chromium et WebKit, police réelle, comptage des requêtes) :

| Ordre de pile                              | Requêtes `.woff2` — Chromium | WebKit |
| ------------------------------------------ | ---------------------------- | ------ |
| `'ForetMapColorEmoji'` puis police système | **1**                        | **1**  |
| Police système puis `'ForetMapColorEmoji'` | **0**                        | **0**  |

Autrement dit : si une police emoji **déjà présente sur l'appareil** passe devant, la webfont
n'est pas seulement inutilisée — elle **n'est pas demandée**. Sur iPhone et Mac, l'arbitrage du
§ 7 ne coûte pas 5,7 Mo : il en économise 5,7.

## 5. Cache HTTP et hors ligne

**EMO-APL-004 (traité dans ce lot)** — `lib/staticCacheHeaders.js` ne posait de `Cache-Control`
que sur `dist/assets/` (noms hachés par Rollup) et sur les HTML d'entrée (`no-store`).
`/fonts/noto-color-emoji.woff2` tombait donc dans les défauts d'`express.static` :
`Cache-Control: public, max-age=0` + `ETag`. Conséquence : **une revalidation réseau à chaque
chargement de page**, et un re-téléchargement complet des 5,7 Mo dès que le cache HTTP est vidé —
ce que Safari iOS fait plus volontiers que les autres. Correctif : famille de cache dédiée aux
polices (30 jours), le nom du fichier étant stable mais son contenu pouvant changer à la
synchronisation `@fontsource` (un nom haché permettrait `immutable`, cf. § 8 R6).

**EMO-APL-005 (ouvert)** — la police n'est pas dans `FORET_STATIC_ASSETS`
(`scripts/build-pwa.js:39`) : elle n'est donc pas précachée à l'installation du service worker.
Elle est bien mise en cache **cache-first** à la première requête (`IMAGE_FONT_EXTENSIONS`
contient `.woff2`), mais rien ne garantit sa présence hors ligne. La précacher ajouterait 5,7 Mo
à l'installation du SW : à ne faire **qu'après** l'arbitrage du § 7, sinon on ancre le mauvais
choix.

## 6. Ce qui n'est **pas** en cause (vérifié)

Plusieurs suspects classiques ont été écartés :

1. **Le mojibake des données.** `src/shared/emojiMojibakeCore.js` répare les emojis stockés sur
   16 bits (plan Excel : `U+F32B` → `U+1F32B`) et l'artefact `U+1FE0F`, avec tests
   (`tests/emoji-mojibake.test.js`, `tests/zone-emoji.test.js`, `tests-ui/constants/emojis.test.js`).
   Correct, et indépendant de la plateforme.
2. **La détection du préfixe emoji** (`src/shared/emojiPrefixCore.js`) : `Intl.Segmenter` avec
   repli regex. `Intl.Segmenter` est disponible depuis Safari 14.1 — sans risque sur le parc.
3. **Les `<text>` SVG** des libellés de carte : rendu couleur confirmé en WebKit (§ 3).
4. **Les trois `unicode-range`** des trois feuilles produit : vérifiés **identiques** ce jour,
   octet par octet après normalisation.
5. **La CSP** : `lib/csp.js:73` autorise `font-src 'self'`, la police est bien servie en
   `font/woff2`.

**Ce qui reste à vérifier sur appareil physique** — et qui ne peut l'être ici : le dessin effectif
des emojis sur iPhone (iOS 16 / 17 / 18), au repos **et pendant un zoom de carte**, sur la carte
élève, la vue Visite et le plateau G&L. C'est le seul point ouvert du diagnostic.

## 7. Arbitrage à trancher — EMO-APL-001 / EMO-APL-003

Le correctif technique est simple ; c'est le choix produit qui appartient à l'équipe.

**Option A (recommandée) — laisser les appareils Apple utiliser leur police.**
Placer `'Apple Color Emoji'` **avant** `'ForetMapColorEmoji'` dans les quatre piles, et retirer
le `preload` des deux entrées HTML.

- Aucune détection de plateforme : les machines non-Apple n'ont pas `Apple Color Emoji` et
  tombent naturellement sur la police auto-hébergée. Le rendu Android / Windows **ne change pas**.
- Sur iPhone / iPad / Mac : rendu natif, instantané, fiable — et **5,7 Mo de moins à télécharger**
  (mesuré § 4).
- Contrepartie assumée : sur Apple, les emojis sont dessinés « à la Apple » et non « à la Noto ».
  L'objectif A3 « même dessin partout » n'est plus tenu **entre** un iPhone et un Android — il
  reste tenu **à l'intérieur d'un même écran**, qui était le vrai défaut d'origine (une épingle et
  un emoji de nom de zone dessinés différemment côte à côte).

**Option B — ne basculer que sur les moteurs Apple.**
Conserver l'ordre actuel et le surcharger sous `@supports (font: -apple-system-body)`. Tient A3 à
la lettre hors Apple, mais ajoute une détection de plateforme à maintenir et repose sur un
`@supports` détourné de son usage.

**Option C — ne rien changer.** Défendable seulement si une vérification sur iPhone montre que le
rendu tient. Dans ce cas, EMO-APL-003 (le `preload`) et EMO-APL-004 restent à traiter pour le
poids.

## 8. Plan de remédiation

| ID  | Constats | Action                                                                                               | Vérification                                               |
| --- | -------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1  | 001, 002 | Option A ou B du § 7 (ordre des piles)                                                               | Test UI sur l'ordre des piles + relecture iPhone           |
| R2  | 003      | Retirer le `preload` de `index.vite.html` et `gl.html` (rendu sans objet par R1-A)                   | Comptage des requêtes `.woff2` (harnais du § 4)            |
| R3  | 004      | **Fait** : `Cache-Control` 30 jours sur `/fonts/*`                                                   | `tests/static-cache-headers.test.js`                       |
| R4  | 006      | Ajouter la pile emoji sur `.lb-rank`, `.stat-number`, `header .logo` (`src/index.css:337,3141,3165`) | À faire **après** R1, sinon on étend la voie fragile       |
| R5  | 005      | Décider du précache PWA de la police                                                                 | `tests/service-worker-cache.test.js`                       |
| R6  | 002, 004 | Nom de fichier haché (`noto-color-emoji.<hash>.woff2`) → `immutable` sans risque de version figée    | `npm run fonts:sync-noto-emoji` + test de cache            |
| R7  | 008      | Ajouter `U+23, U+2A, U+30-39` à l'`unicode-range`, ou renoncer explicitement aux keycaps             | Test de contenu sur le catalogue d'emojis                  |
| R8  | 009      | Remonter le `@font-face` unique dans `typography-tokens.css`                                         | Cliquet `tests-ui/utils/breakpoints.test.js` (même patron) |

## 9. Détail des constats mineurs

**EMO-APL-006** — trois piles affichent des emojis sans repli emoji déclaré :
`src/index.css:3165` `.lb-rank` (🥇 🥈 🥉 du classement, `TeacherLeaderboard.jsx:44`),
`src/index.css:3141` `.stat-number` et `src/index.css:337` `header .logo`, toutes en
`'Playfair Display', serif`. L'emoji y sort de la police **système** — Apple Color Emoji sur
iPhone, Noto système sur Android. C'est exactement l'écart que A3 voulait supprimer, et il
subsiste dans le classement des élèves. À corriger **dans le sens retenu au § 7**.

**EMO-APL-007** — `font-variant-emoji: emoji` (huit usages : `map-overlay-labels.css:12`,
`gl-admin.css:72,88`, `gl-theme.css:1717,1730,1782`, `index.css:3028,3032`) force la présentation
couleur d'un caractère dépourvu de `U+FE0F`. La propriété n'est pas « Baseline » : à traiter comme
un bonus, jamais comme la garantie qu'un caractère sortira en couleur. La garantie, c'est
`U+FE0F` dans la donnée.

**EMO-APL-008** — l'`unicode-range` omet `U+0023`, `U+002A` et `U+0030-0039`, alors que
`U+20E3` (keycap englobant) y figure. Une séquence keycap (`1️⃣` = `U+0031 U+FE0F U+20E3`) sortirait
donc à cheval sur deux polices : le chiffre en DM Sans, l'encadrement en Noto. Aucun keycap dans
`src/constants/emojis.js` ni dans `emojiFontCoverage.js` aujourd'hui : **risque dormant**, qui se
réveillerait dès qu'un prof en saisirait un dans un nom de zone. Les tranches officielles de
`@fontsource` incluent ces trois plages — leur absence ici est un oubli de recopie.

**EMO-APL-009** — le même `@font-face` (16 lignes) existe en trois exemplaires, un par produit.
Identiques ce jour, mais `typography-tokens.css` existe précisément pour ce cas et documente la
règle « un token commun ne se déclare qu'ici ».

## 10. Harnais de mesure

Les sondes des § 3 et § 4 sont reproductibles : page statique reprenant le `@font-face` du dépôt,
police servie en local, Chromium et WebKit pilotés par Playwright, comptage des requêtes `.woff2`
et analyse colorimétrique des captures. Le WebKit de Playwright doit être lancé avec un
`executablePath` explicite lorsque la version installée diffère de celle attendue par
`playwright-core`.

Ce harnais n'a **pas** été versionné : il mesure une propriété du fichier de police et du moteur,
pas une régression du code applicatif, et son résultat sous Linux ne transpose pas à iOS (§ 3).
Le filet utile côté dépôt est un test d'ordre de pile (R1), pas une capture d'écran.
