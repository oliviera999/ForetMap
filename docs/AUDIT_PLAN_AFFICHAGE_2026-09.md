# Audit — affichage des repères et des zones sur `planlyautey.olution.info` (septembre 2026)

> **Statut : audit, sans aucune modification de code.** Relevé du 4 septembre 2026 sur la tête de
> `main` (`package.json` 1.145.0), **confrontée aux données réelles de production** : le serveur
> répond `{"version":"1.145.0"}` sur `/api/version`, le code lu ici est donc bien celui qui est
> servi. Chaque constat porte une référence `fichier:ligne` et, quand c'est possible, une mesure
> faite sur la charge publique réelle (`GET /api/plan/content`).
>
> **Objet.** Le plan s'affiche, mais mal : les noms de zones se chevauchent et débordent
> largement des bâtiments, les repères sont anonymes tant qu'on n'a pas beaucoup zoomé, et
> plusieurs briques de désencombrement déjà écrites dans le dépôt ne sont **pas branchées** sur
> ce produit. Un problème d'infrastructure, antérieur à tout cela, empêche par ailleurs une
> partie des visiteurs d'ouvrir la page (§3.1).
>
> Complète et ne remplace pas `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` (cadrage du produit) et
> `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` (plan de convergence, lots 0 à 8).

---

## 1. En une page

Le produit est bien construit — un seul écran, un noyau carte partagé, pas de session, une charge
publique unique et mise en cache. **Le défaut n'est pas d'architecture, il est de finition du
rendu**, et il tient en une phrase : _le calque de zones du noyau partagé (`PctZonesLayer`) est
la version « neutre et minimale » du calque de la carte de travail, et c'est justement le produit
dont la seule raison d'être est la lisibilité qui l'utilise brut._

Les trois calques de zones du monorepo, comparés :

| Fonction d'étiquetage                         | Carte de travail<br>`map/ZonePolygonsLayer.jsx` | Visite<br>`visit/VisitZonesSvgLayer.jsx` | **Plan**<br>`shared/pct-map/PctZonesLayer.jsx` |
| --------------------------------------------- | :---------------------------------------------: | :--------------------------------------: | :--------------------------------------------: |
| Ancrage au **pôle d'inaccessibilité**         |                   oui (`:40`)                   |               oui (`:67`)                |          **non** — centroïde (`:37`)           |
| **Emoji du nom retiré** du texte              |                   oui (`:44`)                   |               oui (`:89`)                |                    **non**                     |
| Nom **ajusté à la largeur** du polygone       |         oui (`fitOverlayLabelToWidth`)          |               oui (`:113`)               |                    **non**                     |
| **Masquage** des étiquettes des petites zones |         oui (`shouldShowZoneNameLabel`)         |                 partiel                  |                    **non**                     |
| **Contre-échelle** au zoom (`inv`)            |                       oui                       |                   oui                    |                    **non**                     |
| Zone **atteignable au clavier / lecteur**     |           oui (`aria-label`, `:112`)            |                   oui                    |        **non** — `<g onClick>` (`:55`)         |
| Résolution de **collisions** entre étiquettes |         non (module écrit, non branché)         |                   non                    |  **non** — `resolveLabelCollisions` inutilisé  |

Mesuré sur les données réelles (28 zones, 20 repères), sur un écran de référence 390 × 844 px :

- **11 noms de zone sur 28 sont en collision** avec au moins un autre à l'ouverture du plan
  (10 paires) ;
- le nom « À nommer — secteur centre-nord est » occupe **45 % de la largeur de l'écran** pour un
  bâtiment large de 9 px — **19,5 fois** la largeur de sa zone ; 13 zones sur 28 ont un nom plus
  large que leur polygone ;
- **12 zones sur 28 affichent leur emoji deux fois** (colonne `emoji` + préfixe du nom) ;
- **aucun des 20 repères n'affiche son nom** avant un zoom ×3,2 : ce sont 20 emojis anonymes,
  dont quatre 🚪 et quatre 🚻 indiscernables ;
- 2 zones (`📖 H`, `🎓 I`) ont leur **centroïde hors de leur propre polygone** : leur nom flotte
  sur le bâtiment voisin.

Et, en amont de tout : **`planlyautey.olution.info` présente aujourd'hui un certificat TLS
auto-signé**, alors que `olution.info` envoie un `Strict-Transport-Security … includeSubDomains`.
Pour tout visiteur dont le navigateur a déjà ouvert `foretmap.olution.info` en HTTPS, la page du
plan **ne s'ouvre pas du tout**, sans possibilité de passer outre (§3.1).

**Ordre de traitement recommandé :** A1 (certificat) → B1/B2/B3 (étiquettes de zones, un seul
lot, ~1 journée, bénéfice partagé avec la Visite) → B4 (noms de repères, un réglage) →
C6 + D1 (catégories et hygiène des données, côté console ForetMap, sans code) → le reste.

---

## 2. Méthode et périmètre

- **Code** : tête de `main` au 4 septembre 2026, `package.json` 1.145.0.
- **Données** : charge publique réelle `GET http://planlyautey.olution.info/api/plan/content`
  (28 zones, 20 repères, 4 catégories, 0 parcours), fond de plan réel
  `/uploads/maps/lyautey-1782492590889.jpg` — **852 × 1012 px, 88 Ko**.
- **Écran de référence** : 390 × 844 px (projet Playwright `mobile-chromium`), soit une scène de
  carte d'environ 390 × 694 px une fois la barre de recherche et les puces déduites. Le rectangle
  « contain » de l'image y mesure **390 × 463 px** ; c'est l'échelle à laquelle toutes les mesures
  ci-dessous sont données.
- **Non couvert** : la fiche de lieu au-delà de son en-tête, les parcours (aucun n'est publié en
  production), la recherche, le hors ligne, la position GPS — sauf là où ils touchent au rendu de
  la carte.

Les mesures de largeur de texte reprennent l'estimateur du dépôt lui-même
(`mapOverlayLabelCollision.js:23` — largeur ≈ nombre de caractères × 0,55 × taille de police),
pour rester cohérentes avec ce que le code croit de ses propres étiquettes.

---

## 3. Constats

### A — Bloquant

#### A1 — Le plan est inaccessible en HTTPS : certificat auto-signé sous un domaine HSTS

`planlyautey.olution.info:443` répond avec un certificat **auto-signé**, émis le jour même :

```
subject=CN = planlyautey.olution.info
issuer =CN = planlyautey.olution.info      ← auto-signé
notBefore=Sep  4 11:13:09 2026 GMT
```

Les deux autres hosts du monorepo ont, eux, un certificat Let's Encrypt valide
(`foretmap.olution.info`, `gl.olution.info`). Le vhost du plan a manifestement été créé sans que
la demande de certificat aboutisse.

Trois conséquences, par ordre de gravité :

1. **La page ne s'ouvre pas.** `foretmap.olution.info` renvoie
   `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Tout navigateur ayant ouvert
   ForetMap en HTTPS au cours de l'année écoulée — c'est-à-dire tous les professeurs et tous les
   élèves — a **épinglé l'ensemble de `*.olution.info` en HTTPS**. Sur ces appareils, le plan
   affiche une erreur de sécurité **non contournable** (HSTS supprime le bouton « Continuer
   quand même »).
2. **Pas de position.** L'API de géolocalisation exige un contexte sécurisé : en HTTP simple, le
   bouton « Me situer » (`PlanMapStage.jsx:321`) ne s'affiche même pas, `position.available`
   étant faux. Tout le lot 6 est inopérant.
3. **Pas de hors ligne, pas d'installation.** Le service worker (`sw-plan.js`, servi correctement
   par `/sw.js`) et le manifest PWA ne s'enregistrent pas hors contexte sécurisé : le bandeau
   « Hors ligne — plan mémorisé sur cet appareil » (`AppPlan.jsx`) promet une mémorisation qui
   n'a jamais lieu.

**Correction** : émettre le certificat du sous-domaine (même chaîne certbot que les deux autres
hosts) et rediriger `http` → `https`. Aucune ligne de code applicatif.

_Reproduction_ :
`openssl s_client -connect planlyautey.olution.info:443 -servername planlyautey.olution.info </dev/null | openssl x509 -noout -issuer`

---

### B — Majeur (rendu des repères et des zones)

#### B1 — Les noms de zones ne sont ni ajustés, ni masqués, ni départagés

`PctZonesLayer.jsx:62-77` écrit le nom complet de **chaque** zone, à taille fixe
(`plan.css:474-482`, `font-size: 2.4` unité de `viewBox`), sans jamais consulter la largeur du
polygone ni les étiquettes voisines. Sur l'écran de référence, une unité de `viewBox` vaut
3,90 px en largeur : un nom de _n_ caractères occupe environ _n_ × 5,1 px.

Relevé complet sur les données de production (extrait — 13 zones sur 28 dépassent leur polygone) :

| Nom affiché                        | Largeur du texte | Largeur du bâtiment | Débordement | Part de l'écran |
| ---------------------------------- | ---------------: | ------------------: | ----------: | --------------: |
| À nommer — secteur centre-nord est |           175 px |                9 px |       ×19,5 |        **45 %** |
| 📚 CIO et salle de formation       |           144 px |               29 px |        ×5,0 |            37 % |
| 🤝 Salle réunion parents           |           124 px |               32 px |        ×3,8 |            32 % |
| 📖 Vie scolaire collège            |           118 px |               38 px |        ×3,2 |            30 % |
| À nommer — secteur nord            |           118 px |                9 px |       ×13,8 |            30 % |
| 📖 Permanences collège             |           113 px |               15 px |        ×7,5 |            29 % |
| 🏛️ Direction collège               |           108 px |               17 px |        ×6,4 |            28 % |
| 🧑‍🏫 Salle des profs                 |           108 px |               31 px |        ×3,5 |            28 % |

Conséquence directe : **10 paires de noms se recouvrent** à l'ouverture, soit 11 étiquettes sur
28 illisibles ou trompeuses.

```
À nommer — secteur centre-nord est ⟷ 📚 CIO et salle de formation
À nommer — secteur centre-nord est ⟷ 🧑‍🏫 Salle des profs
À nommer — secteur nord            ⟷ 📖 Vie scolaire collège
🥙 Cafétéria                        ⟷ 📚 CIO et salle de formation
🥙 Cafétéria                        ⟷ 🧑‍🏫 Salle des profs
📚 CDI                              ⟷ 📚 CIO et salle de formation
📚 CDI                              ⟷ 🧑‍🏫 Salle des profs
📚 CIO et salle de formation        ⟷ 🧑‍🏫 Salle des profs
🏛️ Direction collège                ⟷ 🧪 S
📖 Permanences collège              ⟷ 📖 T
```

Le plus frappant est que **le dépôt sait déjà faire les trois choses qui manquent** :

- `src/utils/mapOverlayZoneLabels.js` — `fitOverlayLabelToWidth` (réduction puis troncature avec
  `<title>`), `shouldShowZoneNameLabel`, `shouldShowZoneEmojiLabel` : utilisés par la carte de
  travail (`ZonePolygonsLayer.jsx:91-97`) et par la Visite (`VisitZonesSvgLayer.jsx:113`) ;
- `src/shared/pct-map/mapOverlayLabelCollision.js` — `estimateLabelBox:38` et
  `resolveLabelCollisions:67`, écrits au lot 5 **précisément pour ce plan**
  (`AUDIT_PLAN_LYAUTEY_2026-09.md` N5), testés (`tests-ui/shared/mapOverlayLabelCollision.test.js`)
  et… **appelés par aucun composant du dépôt**. Seul `shouldShowMarkerLabel` du même module est
  branché (`PlanMapStage.jsx:250`).

**Correction** : brancher `resolveLabelCollisions` sur les étiquettes de zones **et** de repères
du plan (candidats triés par `sort_order` de catégorie puis par aire de polygone, lieu
sélectionné `pinned`), et passer les noms par `fitOverlayLabelToWidth`. Le module est pur et
déjà couvert par des tests : le lot est court, et il profite aussi à la carte de travail, où le
même défaut est relevé (`AUDIT_UI_HOMOGENEITE_2026-09.md` E4/D2).

#### B2 — L'étiquette est posée au centroïde, pas au pôle d'inaccessibilité

`PctZonesLayer.jsx:37-38` calcule la moyenne arithmétique des sommets. Sur un bâtiment en L ou en
U, ce point tombe hors du polygone : c'est le cas de **2 zones sur 28** en production
(`📖 H`, 21 sommets, x de 46 à 86 ; `🎓 I`, 8 sommets, y de 33 à 54), dont le nom flotte alors sur
le bâtiment voisin — exactement l'erreur que le plan doit éviter.

`src/shared/pct-map/pctPolylabel.js` fournit `polygonPoleOfInaccessibilityPct`, et les deux autres
calques l'utilisent déjà (`ZonePolygonsLayer.jsx:40`, `VisitZonesSvgLayer.jsx:67`), avec le
commentaire qui décrit le problème mot pour mot. Il manque un import dans le calque partagé.

#### B3 — L'emoji est affiché deux fois sur 12 zones sur 28

`PctZonesLayer.jsx:62-77` dessine la colonne `zone.emoji` puis, juste dessous, le nom **complet**.
Or les noms saisis en production portent presque tous l'emoji en préfixe. Résultat à l'écran :

```
        🥙
   🥙 Cafétéria
```

Les 12 cas : Cafétéria, CDI, CIO et salle de formation, Déchetterie, Delacroix, Direction collège,
Direction lycée, Direction pôle, P (×2), Parking, Salle réunion parents. Quatorze autres zones
portent un emoji dans leur nom **sans** colonne `emoji` : leur emoji n'est alors pas centré comme
les autres mais collé au texte, ce qui donne deux styles d'étiquette sur la même carte.

`stripLeadingMarkerEmoji` / `detectLeadingMarkerEmoji` (`src/constants/emojis.js`) traitent
exactement ce cas et sont appelés par les deux autres calques (`ZonePolygonsLayer.jsx:43-44`,
`VisitZonesSvgLayer.jsx:89`). Même correction, même endroit que B2.

La fiche de lieu répète la même duplication (`PlanPlaceSheet.jsx:34` puis `:49`) : l'en-tête
affiche « 🥙 » suivi de « 🥙 Cafétéria ».

#### B4 — Aucun repère n'affiche son nom avant un zoom ×3,2

`PlanMapStage.jsx:27` fixe `PLAN_LABEL_PRIORITY_CUTOFF = 50` : un repère est « prioritaire » — et
son nom apparaît dès ×1,6 — si l'une de ses catégories a un `sort_order` ≤ 50 ; sinon le nom
attend ×3,2 (`mapOverlayLabelCollision.js:108-125`, `labelsFromRatio * 2`).

Dans les données de production :

- **17 repères sur 20 n'ont aucune catégorie** → priorité `+Infinity` ;
- les 3 autres portent « Sanitaire », dont le `sort_order` vaut **100** ;
- la seule catégorie sous le seuil est « Infrastructure » (`sort_order` 10), et elle n'est posée
  que sur des zones.

Donc **aucun repère, jamais, n'est prioritaire** : à l'ouverture du plan, un visiteur voit vingt
emojis nus — quatre 🚪 (« Entrée collège », « Entrée lycée », « Entrée parking prof »,
« Entrée visiteurs ») et quatre 🚻 rigoureusement identiques. Pour un plan dont la première
question est « où est l'entrée ? », c'est le défaut le plus coûteux après A1.

Aggravant : à ×3,2, l'image de fond (852 px de large) est agrandie 1,5 fois au-delà de sa
définition — le nom apparaît sur un plan flou (voir C7).

**Correction** — deux gestes, à faire ensemble :

1. _données_ : donner aux catégories structurantes (« Entrées », « Administration », « Sanitaire »)
   un `sort_order` inférieur à 50 dans la console ForetMap, et catégoriser les 17 repères qui ne
   le sont pas ;
2. _code_ : traiter l'absence de catégorie comme une priorité **moyenne** plutôt que nulle, ou
   afficher le nom dès ×1,6 pour tous et laisser `resolveLabelCollisions` (B1) faire le tri — ce
   qui est le comportement des moteurs cartographiques et supprime le réglage arbitraire.

#### B5 — Rien ne contre-compense le zoom : tout grossit avec la carte

Le calque monde porte `transform: scale(committed.s)` (`PlanMapStage.jsx:282`) et **tous** les
habillages vivent à l'intérieur : les `<text>` des zones (unités de `viewBox`), la pastille du
repère (`plan.css:499`, `font-size: var(--text-xl)`), son étiquette (`:505`), la pastille de
groupe (`:599`). À l'échelle maximale (8, `pctMapTransform.js:19`), l'emoji d'un repère mesure
donc **~170 px** et le nom d'une zone ~89 px de haut. À l'inverse, au dézoom minimal (0,5 × la
vue d'ensemble), les noms tombent à 5,5 px.

La carte de travail résout cela depuis longtemps par un facteur `inv = 1/scale` propagé aux
étiquettes (`ZonePolygonsLayer.jsx:59`, `:91-94`, `src/shared/mapOverlayScale.js`). Le plan ne
l'utilise pas. C'est aussi ce qui rend le seuil de B4 nécessaire : des étiquettes de taille
constante se chevaucheraient moins et pourraient s'afficher plus tôt.

---

### C — Moyen

#### C1 — Le texte des zones est déformé horizontalement

`PctZonesLayer.jsx:46` : `viewBox="0 0 100 100"` avec `preserveAspectRatio="none"`. C'est le bon
choix pour les **polygones** (les points sont en pourcentage, sur deux axes indépendants), mais il
s'applique aussi aux `<text>` : sur le fond réel (852 × 1012, rapport 0,842), les glyphes sont
**comprimés de 16 % en largeur**. Le nom d'une zone n'a pas la même graisse apparente que le reste
de l'interface, et l'écart se creuserait sur un fond plus allongé.

C'est le défaut que l'audit de cadrage reprochait déjà au calque de la Visite
(`AUDIT_PLAN_LYAUTEY_2026-09.md` §2.1, « SVG étiré »).

**Correction** : sortir les étiquettes du SVG déformé — soit en les rendant en HTML positionné en
`%` (comme les repères), soit en appliquant à chaque `<text>` la transformation inverse
`scale(1, uy/ux)`.

#### C2 — Le repère saute quand son étiquette apparaît

`plan.css:484-497` : `.fm-pct-marker` est une colonne flex `[pastille, étiquette]` translatée de
`-50%, -100%`. Le décalage vertical vaut donc **la hauteur de tout le bouton**, étiquette comprise.
Quand l'étiquette apparaît (franchissement du seuil de B4), la pastille **monte** brusquement
d'environ 20 px — tous les repères concernés se déplacent d'un coup pendant un zoom, ce qui donne
l'impression que le plan est mal calé.

**Correction** : ancrer la pastille seule (`translate(-50%, -100%)` sur `.fm-pct-marker__pin`) et
poser l'étiquette en `position: absolute` sous elle, hors du flux qui détermine l'ancrage.

#### C3 — Un repère n'a pas de cible tactile de 44 px

`.fm-pct-marker` (`plan.css:484-497`) n'a ni `min-width`, ni `min-height`, ni marge interne : la
zone tapable se réduit à l'emoji, soit ~22 px de côté. La pastille de **groupe**, elle, respecte
la règle (`plan.css:604-605`, `min-width/min-height: var(--tap-target)`), comme tout le reste du
produit (8 autres occurrences dans `plan.css`). C'est donc une omission, pas un choix — et elle
contredit la règle projet « cibles tactiles ≥ 44 px » (`CLAUDE.md`).

Aggravant : 8 repères sur 20 sont posés à l'intérieur d'une zone ; rater le repère de quelques
pixels ouvre la fiche du **bâtiment**, pas celle du lieu visé.

#### C4 — Les zones ne sont ni focusables au clavier ni annoncées

`PctZonesLayer.jsx:52-56` : le polygone est un `<g onClick>`, sans `role`, sans `tabIndex`, sans
`aria-label`. **Les 28 zones — 58 % des lieux du plan — sont donc inatteignables au clavier et
muettes pour un lecteur d'écran**, alors que les repères sont de vrais `<button>` avec
`aria-label` (`PctMarkersLayer.jsx:30`), et que la carte de travail annonce ses zones
(`ZonePolygonsLayer.jsx:112`).

Le contournement existe (les zones sont listées dans la feuille de résultats), mais il n'est pas
équivalent : rien ne relie la liste au dessin.

#### C5 — Les contours de zones sont des cheveux de 0,35 px

`plan.css:457-462` : `stroke-width: 0.35` + `vector-effect: non-scaling-stroke`. La compensation
`non-scaling-stroke` neutralise la mise à l'échelle **interne** du `viewBox`, si bien que le trait
est rendu à 0,35 px CSS à la vue d'ensemble — sous le pixel, donc dépendant de l'anticrénelage,
sur un fond de plan déjà gris. Le contour de la zone sélectionnée (`:464-467`, 0,8 px) reste fin.
Les remplissages n'aident pas : 24 zones sur 28 sont en `#9ca3af80` ou `#f59e0b80`, du gris ou de
l'orange à 50 % d'opacité sur une capture cartographique claire.

#### C6 — Le filtre par catégorie vide la carte plus qu'il ne la trie

`planPlaces.js:39-47` : dès qu'une puce est cochée, un lieu n'est gardé que s'il porte **au moins
une** des catégories retenues — les lieux sans catégorie disparaissent. C'est documenté et
défendable, mais confronté aux données réelles, cela donne :

| Puce               | `sort_order` |                         Lieux affichés si on la coche |
| ------------------ | -----------: | ----------------------------------------------------: |
| Infrastructure     |           10 |                                    24 zones, 0 repère |
| **Administration** |          100 |                               **0 lieu — carte vide** |
| Sanitaire          |          100 | 0 zone, **3** repères (le 4ᵉ WC n'a pas la catégorie) |
| **Tiny garden**    |          100 |                               **0 lieu — carte vide** |

Deux puces sur quatre **vident entièrement la carte**, et la puce « Sanitaire » cache un des
quatre WC. Ce n'est pas un bug de code, c'est une conséquence des données (17 repères sur 20 sans
catégorie, 3 catégories sur 4 non attribuées) — mais le produit devrait s'en protéger :

- masquer (ou désactiver, avec l'explication) une puce dont le compte est nul — `counts` est déjà
  calculé et passé aux puces (`AppPlan.jsx`, `PlanCategoryChips.jsx:16`), il suffit de s'en servir ;
- afficher un état vide explicite (« Aucun lieu dans cette catégorie ») plutôt qu'une carte nue.

#### C7 — Le fond de plan est trop peu défini pour le zoom qu'il exige

`/uploads/maps/lyautey-1782492590889.jpg` : **852 × 1012 px** pour 88 Ko. Sur un écran de
référence, il est affiché à 390 px de large, soit un facteur 0,46 : la marge de zoom réelle avant
flou est de ×2,2. Or B4 impose ×3,2 pour lire le nom d'un repère : **le plan est nécessairement
flou au moment précis où l'on cherche à lire un nom**. Sur un écran à 3 dpr, le flou commence dès
la vue d'ensemble.

Un fond de 2000 à 2500 px de large (toujours ~300 Ko en JPEG de qualité correcte) supprimerait le
problème sans toucher au code, les géométries étant en pourcentage. À traiter en même temps que la
question de licence du fond actuel (`AUDIT_PLAN_LYAUTEY_2026-09.md` §8.2, fond extrait de Google
Maps) — et le réglage `ui.plan.attribution`, prévu pour cela, est **vide** en production, si bien
qu'aucune mention de source n'apparaît (`PlanMapStage.jsx:355`).

---

### D — Hygiène des données et finitions

Ces points ne demandent pas de code ; ils sont visibles par tous les visiteurs.

- **D1 — Lieux de travail publiés tels quels.** Sont affichés aujourd'hui sur le plan public :
  « À nommer — secteur centre-nord est », « À nommer — secteur nord », « 📖 L (copie) »,
  deux zones nommées « 📖 P », un repère « n3 », un repère « Vers Beaulieu » symbolisé par 🎾. Les
  deux « À nommer » sont, par leur longueur, les deux pires étiquettes de la carte (B1).
- **D2 — Aucun alias de recherche.** `search_aliases` est vide sur les 48 lieux, alors que le
  champ existe, remonte dans la charge (`routes/plan.js:228`), alimente le moteur de recherche et
  s'affiche dans la fiche (« Aussi appelé : … », `PlanPlaceSheet.jsx:111`). « Toilettes » ne
  trouve pas « WC », « documentation » ne trouve pas « CDI ».
- **D3 — Le désencombrement au zoom n'est activé nulle part.** `zoom_only` vaut `false` sur les
  4 catégories, alors que la case existe dans la console (`MapCategoriesPanel.jsx:258`) et que le
  plan la respecte (`PlanMapStage.jsx:126-134`). C'est le réglage prévu pour les sanitaires.
- **D4 — Aucun parcours publié** (`routes: []`) : la puce « Parcours » du lot 8 n'apparaît jamais.
- **D5 — Lien direct mort.** `PlanPlaceSheet` sait afficher « Lien direct : … » (`:21`, `:114`)
  mais `AppPlan.jsx` ne lui passe jamais `shareUrl`, alors qu'il calcule déjà l'URL du lieu
  (`buildPlaceUrl`, appliquée à `history.replaceState`). Une ligne à brancher — utile pour les
  QR codes.
- **D6 — Aucun test ne couvre le rendu de la carte du plan.** `tests-ui/plan/` contient
  `AppPlanMount.test.jsx`, `planPlaces.test.js`, `planRoutes.test.js` — logique et montage
  seulement. `tests-ui/shared/PctLayers.test.jsx` teste les calques hors contexte produit, et
  `resolveLabelCollisions` n'est testé qu'en isolement. Aucun test ne dirait qu'une étiquette
  déborde, se duplique ou se superpose : c'est ce qui a permis à B1–B3 de passer.

---

## 4. Ce qui va bien (à ne pas casser)

- **Une seule source de vérité géométrique** : tout est en pourcentage d'image, la charge publique
  est agrégée, mise en cache par version d'écriture (`routes/plan.js`, `writeVersionCache`) et
  servie avec un `Cache-Control` court. Le serveur ne fait rien de mal.
- **Le regroupement des repères fonctionne** : sur les données réelles, 6 repères sur 20 sont
  fusionnés en 3 pastilles à la vue d'ensemble, et le tap zoome sur l'enveloppe puisque les
  membres ne sont jamais rigoureusement au même point (`clusterMarkers.js`,
  `clusterSeparatesOnZoom`). Le repli « liste des lieux en feuille basse » est le bon choix
  d'accessibilité.
- **Aucune zone n'en recouvre une autre** au point de voler son tap (vérifié : 0 cas de centroïde
  d'une zone tombant dans une zone dessinée après elle).
- **Le calage GPS de `lyautey` est sain** : 3 ancres bien réparties (`geo_anchors`), `gps_enabled`
  actif. Seul le HTTPS manque pour que la position fonctionne (A1).
- Le noyau carte partagé apporte enfin bornes de déplacement, double-tap, inertie et pinch à
  médian vivant — les trois défauts majeurs relevés au cadrage (U1, U2) sont corrigés.

---

## 5. Plan de correction proposé

| Lot | Contenu                                                                                                                                                                                                                                          | Constats      | Effort | Bénéficie aussi à        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------ | ------------------------ |
| 1   | Certificat TLS du sous-domaine + redirection `http`→`https` (exploitation, pas de code)                                                                                                                                                          | A1            | 30 min | —                        |
| 2   | `PctZonesLayer` : pôle d'inaccessibilité, emoji retiré du nom, `fitOverlayLabelToWidth`, masquage des petites zones                                                                                                                              | B2, B3        | ½ j    | Visite, carte de travail |
| 3   | Brancher `resolveLabelCollisions` sur zones **et** repères du plan (priorité, aire, lieu sélectionné `pinned`)                                                                                                                                   | B1, B4        | ½ j    | carte de travail (E4/D2) |
| 4   | Contre-échelle des habillages (`inv`) + étiquettes hors du SVG déformé + ancrage de la pastille (plus de saut)                                                                                                                                   | B5, C1, C2    | ½ j    | Visite                   |
| 5   | Cible tactile 44 px du repère ; zones focusables et annoncées (`role="button"`, `tabIndex`, `aria-label`) ; contour plus lisible                                                                                                                 | C3, C4, C5    | ¼ j    | Visite, G&L              |
| 6   | Puces à compte nul masquées ou désactivées, état vide explicite ; `shareUrl` branché                                                                                                                                                             | C6, D5        | ¼ j    | —                        |
| 7   | **Données** (console ForetMap, aucun code) : renommer/supprimer les lieux de travail, catégoriser les 20 repères, `sort_order` < 50 pour les catégories structurantes, alias de recherche, `zoom_only` sur les sanitaires, `ui.plan.attribution` | D1–D4, C6, B4 | 1–2 h  | Visite, carte de travail |
| 8   | Fond de plan re-capturé à ~2400 px (et question de licence tranchée)                                                                                                                                                                             | C7            | 1 h    | Visite                   |
| 9   | Tests de rendu : une étiquette ne déborde pas de son polygone, deux étiquettes voisines ne se superposent pas, l'emoji n'est pas doublé ; scénario `e2e/plan-mobile-*` sur un jeu de zones dense                                                 | D6            | ½ j    | tout le noyau            |

Les lots 2 à 5 ne créent **aucune** brique nouvelle : ils branchent sur `PctZonesLayer` et
`PlanMapStage` des modules déjà écrits, déjà testés et déjà utilisés par les deux autres calques.
C'est la définition même de l'exigence transverse du plan de convergence (§8.10 du cadrage) —
ici, elle a joué à l'envers : les corrections sont parties vers ForetMap et la Visite sans
revenir au produit qui les avait motivées.

---

## 6. Reproduire les mesures

```bash
# charge publique réelle
curl -s http://planlyautey.olution.info/api/plan/content -o plan-content.json

# certificat (constat A1)
openssl s_client -connect planlyautey.olution.info:443 \
  -servername planlyautey.olution.info </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# HSTS hérité du domaine (constat A1)
curl -sI https://foretmap.olution.info/ | grep -i strict-transport
```

Les tableaux de débordement et de collision (§3, B1) se recalculent avec l'estimateur du dépôt :
rectangle image 390 × 463 px, 1 unité de `viewBox` = 3,90 px en x et 4,63 px en y, largeur d'un
nom ≈ `nb_caractères × 2,4 × 0,55 × 3,90` px, boîte de collision selon
`estimateLabelBox` (`mapOverlayLabelCollision.js:38`).
