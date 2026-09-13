# Audit — affichage des repères et des zones sur `planlyautey.olution.info` (13 septembre 2026)

> **Second relevé**, neuf jours après `docs/AUDIT_PLAN_AFFICHAGE_2026-09.md`. Même méthode :
> lecture du code sur la tête de `main` (`package.json` 1.153.39) **confrontée à la charge
> publique réelle** (`GET https://planlyautey.olution.info/api/plan/content`, serveur en
> 1.153.38), avec des mesures faites dans un vrai navigateur plutôt que déduites du CSS.
>
> **Ce qui a changé en neuf jours** : 336 commits, de 1.145 à 1.153. Le produit a gagné
> l'orientation « cap en haut », une barre d'échelle et une rose des vents, une barre de
> parcours ; la carte est passée de 28 à 33 zones, de 20 à 26 repères, de 4 à 9 catégories,
> et le fond de plan a été recapturé. **Sept des neuf constats ouverts au 4 septembre sont
> réglés** (§2), dont le plus grave.
>
> **Ce que ce relevé ajoute** : deux constats majeurs, dont un qui rend inutilisable une
> fonction livrée entre-temps, et un qui vide de son sens le mécanisme de priorité des
> étiquettes — non par défaut de code, mais parce que la donnée qu'il lit a changé de sens.

---

## 1. En une page

**Le premier audit est en grande partie soldé.** Le certificat TLS est valide depuis le
12 septembre : le plan s'ouvre enfin normalement, avec géolocalisation et hors ligne. Le fond
de plan est passé de 852 à 1210 px de large. Les catégories sont passées de 4 à 9 et couvrent
maintenant 32 zones sur 33. Le moteur d'étiquettes livré le 4 septembre tient ses promesses sur
les données d'aujourd'hui : **zéro ancre hors polygone, zéro recouvrement** à toutes les
échelles, et la totalité des noms de zones dès ×2,5.

**Mais deux choses neuves coincent, et la seconde est contre-intuitive.**

**N1 — « Orienter la carte selon la boussole » retourne tout le texte.** La rotation est posée
sur le calque qui porte **aussi** les étiquettes, les emojis et les pastilles. Mesuré dans
Chromium : à un cap de 180°, l'angle du texte à l'écran est de 180° — les noms de bâtiments et
de repères sont littéralement à l'envers. La fonction est opt-in, mais son usage même consiste
à tourner sur soi : elle devient illisible dès que l'on quitte le nord.

**N2 — les cinq entrées du lycée sont au dernier rang de priorité d'affichage.** Le moteur
d'étiquettes lit `sort_order` comme importance, et c'est exactement ce qui était documenté.
Sauf que l'établissement s'en sert désormais comme **ordre d'audience** : Elèves (0), Parents
(1), Enseignement (2), Administration (3), Infrastructure (4)… Résultat : les deux tables
d'échecs et le ping-pong (catégorie « Elèves », rang 0) sont nommés à l'ouverture, tandis que
« Entrée lycée », « Entrée collège », « Entrée visiteurs » et « Entrée parking prof » — sans
catégorie, donc rang 50 — attendent le zoom. Sur un plan dont la première question est « par où
j'entre ? », c'est le pire classement possible. Le mécanisme fonctionne ; sa donnée d'entrée a
changé de sens sous lui.

S'ajoutent : **`main` est rouge** depuis au moins le 12 septembre, pour un seul fichier mal
formaté — ce qui fait sauter en cascade toute la suite Vitest **et** le filet e2e Plan pourtant
rendu bloquant entre-temps (N3) ; cinq « WC » strictement indiscernables dans la recherche
(N4) ; un parcours publié qui ne contient qu'une étape (N5).

**Ordre de traitement :** N3 (une commande, débloque les filets) → N2 (quelques minutes en
console) → N1 (correction de code, ~½ journée) → N4, N5, N6.

---

## 2. Ce qui est réglé depuis le 4 septembre

| Constat                                               | État                                                                                                 | Vérification du jour                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** — certificat TLS auto-signé, page non ouvrable | **Réglé**                                                                                            | Let's Encrypt, émis le 12/09, valide au 11/12. `https://` répond 200. Géolocalisation et service worker redeviennent possibles                                                                                                            |
| **B1** — 11 noms de zone sur 28 en collision          | **Réglé**                                                                                            | 0 recouvrement à ×1, ×1,6, ×2,5, ×4 et ×8 sur les 33 zones et 26 repères d'aujourd'hui                                                                                                                                                    |
| **B2** — 2 noms hors de leur polygone                 | **Réglé**                                                                                            | 0 ancre hors polygone sur 33 zones                                                                                                                                                                                                        |
| **B3** — emoji dessiné deux fois                      | **Réglé**                                                                                            | Les 33 zones portent toujours l'emoji en tête du nom ; il n'est plus dessiné qu'une fois                                                                                                                                                  |
| **B4** — aucun nom de repère avant ×3,2               | **Réglé côté seuil**, mais voir **N2** : 10 repères sur 26 sont nommés dès l'ouverture, pas les bons |
| **B5, C1–C5** — échelle, géométrie, accessibilité     | **Réglés**                                                                                           | Revérifiés dans Chromium : cible tactile 44 × 44, contour 1,5 px écran, étiquettes non déformées                                                                                                                                          |
| **C6** — puces de catégorie vidant la carte           | **Réglé**                                                                                            | 32 zones sur 33 et 16 repères sur 26 ont au moins une catégorie                                                                                                                                                                           |
| **C7** — fond de plan à 852 px                        | **Largement réglé**                                                                                  | Nouveau fond **1210 × 1437** (116 Ko). Marge avant flou : ×3,1, au-delà du ×2,5 nécessaire pour lire les noms                                                                                                                             |
| **C8** — halo de précision invisible                  | **Réglé**                                                                                            | Dimensionné en pixels du calque                                                                                                                                                                                                           |
| **C9** — filet e2e jamais exécuté                     | **Partiellement**                                                                                    | Une étape **bloquante** « Playwright Plan smoke » a été ajoutée (projet `plan-mobile`, deux specs). Mais elle est court-circuitée aujourd'hui (voir **N3**), et `plan-mobile-position.spec.js` — qui couvrirait N1 — n'en fait pas partie |
| **D1** — lieux de travail publiés                     | **Partiellement**                                                                                    | « À nommer — … » ×2, « 📖 L (copie) » et le repère « n3 » ont disparu. Mais « 🚙 Parking (copie) » est apparu, et « 📖 P » ×2 demeure                                                                                                     |
| **D2** — aucun alias de recherche                     | **Non réglé**                                                                                        | 0 alias sur 59 lieux                                                                                                                                                                                                                      |
| **D3** — `zoom_only` jamais coché                     | **Non réglé**                                                                                        | 0 catégorie sur 9                                                                                                                                                                                                                         |
| **D4** — parcours en brouillon                        | **Publié**, mais voir **N5**                                                                         |
| **Attribution du fond**                               | **Non réglé**                                                                                        | `ui.plan.attribution` toujours vide                                                                                                                                                                                                       |

---

## 3. Nouveaux constats

### N1 — MAJEUR · « Orienter la carte » retourne les étiquettes

`PlanMapStage.jsx` applique la rotation d'orientation sur `.plan-map__fit` :

```jsx
<div className="plan-map__fit" style={{ ...fitStyle, ...orientStyle }}>
```

Or ce calque porte **tout** : l'image, le SVG des zones, le calque d'étiquettes, les repères,
les pastilles de groupe et le point de position. Rien ne contre-tourne le texte — aucune
variable CSS d'orientation n'existe dans `plan.css`.

Mesuré dans Chromium, sur le DOM exact du produit, en cumulant les matrices jusqu'au viewport :

| Rotation de la carte |    Angle du texte à l'écran |
| -------------------: | --------------------------: |
|                   0° |                          0° |
|                 −90° |       −90° (texte vertical) |
|                −180° | **180° (texte à l'envers)** |

La fonction est **opt-in** — bouton 🧭 « Orienter la carte selon la boussole », préférence
retenue sur l'appareil, et elle exige que la position soit active. Elle est autorisée en
production (`heading_up_enabled` vrai sur la carte **et** dans les réglages). Mais son usage
même consiste à pivoter sur soi-même dans un couloir : dès que l'on ne regarde plus vers le
nord, les noms se couchent, puis se retournent.

**Correction.** Contre-tourner les habillages, comme le fait la contre-échelle `--pct-inv` :
exposer une variable `--pct-orient` sur le calque `fit` et l'appliquer en `rotate(calc(-1 *
var(--pct-orient)))` sur `.fm-pct-label`, `.fm-pct-marker` et `.fm-pct-cluster`.

**Attention, ce n'est pas qu'une ligne de CSS.** Aujourd'hui la résolution de collisions
(`resolveVisibleLabels`) travaille en coordonnées de contenu non tournées, ce qui reste juste
**parce que** tout tourne ensemble : la géométrie relative est préservée. Dès que les étiquettes
se redressent, leurs boîtes redeviennent alignées sur l'écran alors que leurs ancres, elles,
tournent : deux noms qui ne se gênent pas à 0° peuvent se recouvrir à 45°. Il faudra donc passer
l'angle au moteur de placement et tourner les ancres avant de construire les boîtes.

**Pourquoi personne ne l'a vu.** `tests-ui/shared/pctMapOrientation.test.js` couvre les helpers
de rotation et `MapScaleCompassOverlay.test.jsx` l'aiguille, mais **aucun test ne vérifie
qu'une étiquette reste lisible quand la carte tourne** ; et le scénario e2e qui exerce la
position (`plan-mobile-position.spec.js`) ne fait pas partie du smoke bloquant.

### N2 — MAJEUR · Les entrées sont au dernier rang, les tables d'échecs au premier

`pctMapLabels.js` classe les étiquettes par `sort_order` de catégorie — le plus petit gagne —
avec un rang intermédiaire (50) pour les lieux sans catégorie. C'est le comportement documenté :
« l'ordre des catégories sert de priorité ».

Les neuf catégories de production sont ordonnées par **audience**, pas par importance
d'affichage :

| Rang | Catégorie      |   Rang | Catégorie          |
| ---: | -------------- | -----: | ------------------ |
|    0 | Elèves         |      9 | Personnels         |
|    1 | Parents        |     10 | Verdure            |
|    2 | Enseignement   |     12 | Professeurs        |
|    3 | Administration |     14 | Sanitaire          |
|    4 | Infrastructure | _(50)_ | _(sans catégorie)_ |

Priorité effective des 26 repères, calculée avec le code de production :

|   Rang | Repères                                                                                                                                  |
| -----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
|  **0** | Echec, Echec, Infirmerie, Permanence, Ping pong                                                                                          |
|      1 | Entrée Delacroix, Réunion parents                                                                                                        |
|     12 | Reprographie, Salle des profs sciences                                                                                                   |
|     14 | Fontaine ×3, WC ×4                                                                                                                       |
| **50** | **Entrée collège, Entrée lycée, Entrée parking prof, Entrée visiteurs**, Caisse, Matériel, T3 labo, Vers Beaulieu, WC, zone téléphonique |

Conséquence mesurée à l'ouverture du plan (écran 390 × 844, rectangle image 390 × 463) : sur les
10 repères nommés, on trouve « Echec » deux fois, « Ping pong », « Caisse » et « Vers
Beaulieu » — et **une seule entrée sur cinq**. Côté zones, « Direction lycée », « Direction
collège », « CIO et salle de formation », « Salle des profs » et « Infirmerie » restent muettes
au profit de « Parking (copie) » et « salle aérée n³ ».

Deux façons de sortir de là, non exclusives :

1. **Sans code, tout de suite** : créer une catégorie « Entrées / Accès » en tête de l'ordre et
   y ranger les cinq entrées. Elle passe aussi première dans les puces de filtre — ce qui, pour
   un plan de repérage, est probablement la bonne place de toute façon.
2. **Avec code, pour de bon** : séparer les deux notions. `sort_order` ordonne les puces de
   filtre (une information d'audience), une colonne distincte ordonne l'affichage des
   étiquettes. Cela demande une migration, et c'est la seule façon d'éviter que le classement
   d'écran reparte de travers à la prochaine réorganisation des catégories.

En attendant, un garde-fou de code serait utile : un lieu **sans catégorie** prend aujourd'hui
le rang 50, c'est-à-dire derrière les neuf catégories réelles. Le rang par défaut avait été
choisi quand les catégories valaient 10 et 100 ; il ne joue plus son rôle d'« intermédiaire ».

### N3 — MOYEN · `main` est rouge, et cela désarme les filets

Les deux derniers runs CI de `main` (12 et 13 septembre) échouent. Deux causes indépendantes :

- **`quality`** échoue à l'étape « Run format check ». Reproduit en local : **un seul fichier**,
  `docs/API.md`. L'étape suivante, « Run UI tests (Vitest) », est alors **sautée** : les ~3 700
  tests UI n'ont pas tourné sur `main`.

  La cause est prosaïque : **cinq tableaux** du fichier ne sont plus dans l'alignement canonique
  de Prettier (lignes 45, 328, 1173, 1610 et 2189). `prettier --write docs/API.md` est donc bien
  la correction juste — elle réécrit 202 lignes, ce qui est beaucoup pour une PR d'audit mais
  normal pour une remise au format : **à faire dans sa propre PR**, en une commande, pour ne pas
  entrer en conflit avec les autres PR touchant ce fichier.

  Trouvé en chemin, et indépendant de la CI : le tableau « Auth GL » déclare **4 colonnes**, mais
  deux de ses lignes en comptent **6**. La ligne `/api/gl/auth/google` contient un type union
  `{ idToken, mode?: 'player' | 'staff' | 'auto' }` dont les barres verticales ne sont **pas
  échappées**, et le séparateur a été « réparé » à 6 colonnes pour suivre. Markdown lit donc
  trois cellules là où il en faut une : **le tableau s'affiche de travers sur GitHub**, avec
  « 'staff' » et « 'auto' » propulsés dans les colonnes Description et suivantes. Deux `\|` et un
  séparateur ramené à 4 colonnes suffisent ; c'est un défaut de rendu, pas la cause du rouge.

- **`test`** échoue à « Run backend tests (with coverage) ». Toutes les étapes suivantes sont
  sautées : build, installation de Playwright, et surtout **« Run Playwright Plan smoke
  (bloquant) »** — le filet ajouté depuis le dernier audit précisément pour couvrir le plan.

Autrement dit, la correction apportée à C9 est réelle dans le fichier de workflow mais **inerte
en pratique** tant que le job échoue avant d'y arriver. `npx prettier --write docs/API.md` remet
la moitié du dispositif en marche en une commande ; l'échec backend demande son propre
diagnostic (non fait ici : il ne touche pas l'affichage du plan).

### N4 — MOYEN · Cinq « WC » indiscernables dans la recherche

| Libellé  | Occurrences | Sous-titre | Note |
| -------- | ----------: | ---------- | ---- |
| WC       |           5 | vide       | vide |
| Fontaine |           3 | vide       | vide |
| Echec    |           2 | vide       | vide |
| 📖 P     |   2 (zones) | —          | —    |

Sur la carte, le regroupement au dézoom et les positions distinctes les séparent correctement.
Mais dans la **feuille de résultats**, cinq lignes strictement identiques s'affichent : même
emoji, même nom, ni sous-titre ni catégorie distinctive. Un visiteur qui cherche « WC » ne peut
pas savoir lequel est le plus proche sans ouvrir les cinq fiches l'une après l'autre.

Le champ existe déjà et s'affiche : `visit_subtitle`. « WC — bâtiment H », « WC — rez-de-chaussée
D » suffirait. C'est de la donnée, pas du code — mais le produit pourrait aider en affichant la
**distance** quand la position est active, ce qu'il calcule déjà pour « Y aller ».

### N5 — MINEUR · Le parcours publié ne contient qu'une étape

Le seul parcours publié, « Faire le tour du lycée » (public : « Nouveaux professeurs »), porte
**une seule étape**, sans titre ni texte, et sa description est vide. Un « tour du lycée » à une
étape promet un parcours et n'en livre pas. Soit il se complète, soit il repasse en brouillon en
attendant.

### N6 — MINEUR · Hygiène des données

- **« 🚙 Parking (copie) »** : un doublon de travail a disparu (« 📖 L (copie) »), un autre est
  apparu. **« 📖 P » ×2** n'a pas bougé depuis le 4 septembre.
- **Emojis incohérents** : « 🌱 Sanitaire » (une pousse pour des sanitaires), « Infirmerie »
  symbolisée par 🌱, « 🌱 salle aérée n³ », « Vers Beaulieu » par 🎾. Les repères « WC » portent
  bien 🚻 : la zone et les repères qui désignent la même chose n'ont pas le même signe.
- **Deux zones sans emoji ni catégorie** : « 📖 G » (aucune catégorie) et « 🧪 S ».
- **Alias de recherche** : toujours 0 sur 59 lieux. « toilettes » ne trouve pas « WC »,
  « documentation » ne trouve pas « CDI », « infirmerie » est un repère mais « santé » ne mène
  nulle part.
- **`zoom_only`** : aucune des 9 catégories n'est cochée, alors que « Sanitaire » (7 lieux) en
  est le cas d'école.
- **`ui.plan.attribution`** : toujours vide, alors que le fond de plan a été recapturé.

---

## 4. Ce qui tient (vérifié, pas supposé)

- **Moteur d'étiquettes** : sur les données d'aujourd'hui, 0 ancre hors polygone, 0
  recouvrement, révélation progressive saine — 22 zones sur 33 et 10 repères sur 26 à
  l'ouverture, 33 sur 33 et 22 sur 26 à ×2,5, tout à ×8.
- **Géométrie des habillages** (remesurée dans Chromium) : cible tactile du repère 44 × 44 px,
  contour de zone 1,5 px écran, étiquettes non déformées, emoji non dupliqué.
- **Barre d'échelle** : exacte. Comparée à la distance haversine entre les trois ancres de
  calage, l'écart est de **0,0 % à 0,5 %**. La rose des vents indique un nord à 0,2° : le plan
  est de fait orienté au nord.
- **Suite UI** : 615 tests verts sur les 71 fichiers `tests-ui/plan` et `tests-ui/shared`
  (exécutés en local, puisque la CI ne les joue plus — N3).

---

## 5. Plan d'action

| #   | Action                                                                                                        | Constat    | Effort          | Qui            |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------- | --------------- | -------------- |
| 1   | `npx prettier --write docs/API.md`, pousser                                                                   | N3         | 1 min           | code           |
| 2   | Diagnostiquer l'échec backend de `main`                                                                       | N3         | ?               | code           |
| 3   | Créer une catégorie « Entrées / Accès » en tête et y ranger les 5 entrées                                     | N2         | 5 min           | console        |
| 4   | Contre-rotation des habillages **et** passage de l'angle au moteur de collisions                              | N1         | ½ j             | code           |
| 5   | Ajouter `plan-mobile-position.spec.js` au smoke bloquant, et un test de lisibilité sous rotation              | N1, C9     | ¼ j             | code           |
| 6   | Sous-titres distinctifs sur les WC / Fontaines / Echecs ; distance dans la liste quand la position est active | N4         | 20 min + ¼ j    | console + code |
| 7   | Séparer `sort_order` (ordre des puces) et priorité d'affichage                                                | N2         | ½ j + migration | code           |
| 8   | Compléter ou dépublier « Faire le tour du lycée »                                                             | N5         | 10 min          | console        |
| 9   | Alias de recherche, `zoom_only` sur « Sanitaire », emojis cohérents, doublons, attribution                    | N6, D2, D3 | 1 h             | console        |

---

## 6. Reproduire les mesures

```bash
# charge publique et fond de plan
curl -s https://planlyautey.olution.info/api/plan/content -o plan.json
curl -s https://planlyautey.olution.info/uploads/maps/lyautey-1789299489652.jpg -o fond.jpg

# certificat (constat A1, désormais réglé)
openssl s_client -connect planlyautey.olution.info:443 \
  -servername planlyautey.olution.info </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -dates

# format (constat N3)
npm run format:check
```

Le placement des étiquettes et les priorités se rejouent en important
`src/shared/pct-map/pctMapLabels.js` sur la charge réelle (`buildZoneLabelSpecs`,
`resolveVisibleLabels`, `labelPriority`), avec un rectangle image de 390 × 463 px. La rotation
(N1) se mesure en cumulant les matrices de transformation jusqu'au viewport sur le DOM du
produit, la carte tournée de 0°, −90° et −180°.
