# Audit — « Plan Lyautey » (`planlyautey.olution.info`) : un plan de repérage mobile dérivé de ForetMap (septembre 2026)

> **Statut : audit et cadrage, sans aucune modification de code.** Relevé effectué sur la tête de
> `main` (`package.json` 1.142.0, merge PR #401) par lecture du code, des migrations, des tests et
> de la documentation. Chaque constat porte une référence `fichier:ligne` vérifiable.
>
> **Objet.** Cadrer un troisième sous-produit du monorepo, **Plan Lyautey**, servi sur le host
> `planlyautey.olution.info` : une application très simple qui présente **une seule carte** (la
> carte `lyautey`, la plus dense) et permet à des visiteurs équipés d'un smartphone — professeurs,
> élèves, parents, personnels accueillis en formation — de **se repérer dans les lieux**. Ce n'est
> pas la Visite (pas de mascotte, pas de « marquer comme vu », pas de progression) ; c'est un plan,
> avec une recherche et des filtres très efficaces et un affichage toujours lisible. La totalité du
> code doit provenir de ForetMap.
>
> Le document se lit dans l'ordre : ce qu'on construit (§1), ce que ForetMap offre déjà (§2), ce
> qui coince aujourd'hui sur mobile (§3), l'expérience cible (§4), le portage (§5), le phasage (§6),
> les risques (§7) et **les questions à trancher avant d'écrire une ligne** (§8).

---

## 1. En une page

**Le bon point de départ existe, mais il est enfoui.** ForetMap n'utilise aucune bibliothèque
cartographique : le rendu est fait main (image de fond + calque SVG/DOM transformé par CSS),
toutes les géométries sont stockées **en pourcentages de l'image**, toutes les lectures de carte
sont **déjà publiques** (`GET /api/maps`, `/api/zones`, `/api/map/markers`, `/api/map-categories`,
`/api/plants`), la recherche plein texte et les filtres par catégorie existent, le calage GPS d'un
plan sur trois ancres est livré, testé et audité, et le schéma d'isolement par host est éprouvé
depuis Gnomes & Licornes (GL). Il n'y a rien à inventer côté données ni côté serveur.

**Le problème est ailleurs : il y a deux moteurs de carte, aucun n'est pensé pour un usage
« plan sur smartphone, debout, dehors ».** La carte de travail (`map-views.jsx`, 1 123 lignes)
est un outil d'édition : 20 boutons dans la barre, 18 surfaces superposables, détail en modale
plein cadre, pas de bornes de pan (on peut faire sortir le plan de l'écran), ni double-tap, ni
inertie, un verrou « Gestes » pour cohabiter avec le scroll de page. La carte de Visite est plus
sobre mais entièrement tournée vers la mascotte et le « vu / non-vu », et son SVG est étiré
(`preserveAspectRatio="none"`). Aucune des deux n'a de légende à l'écran, aucune ne propose de
tri, et le filtre **atténue** au lieu de masquer. Un bug fait que le centrage sur un repère depuis
la liste de résultats vise toujours le bord haut du plan (`src/utils/mapFocusLocation.js:9`).

**Recommandation.** Construire Plan Lyautey comme **troisième produit du monorepo** (entrée
`plan.html` → `src/plan/`, host `planlyautey.*`, exactement le schéma GL), **sans authentification
ni écriture** (l'édition des lieux reste dans ForetMap), en s'appuyant sur un **noyau carte
partagé** extrait des briques déjà découplées (`src/shared/pct-map/`, `useMapGestures` purifié,
`ZonePolygonsLayer`, `MapViewMarkerBubble`, typographie d'overlay, moteur de recherche
`mapLocationFilters.js`, chaîne GPS complète). Le shell mobile, lui, est neuf : carte plein écran,
recherche en premier, chips de catégories, fiche en **bottom sheet** à trois crans, point bleu de
position avec cap, PWA hors ligne. Les corrections de fond du noyau (bornes, double-tap, inertie,
légende, bug de centrage) **profitent à ForetMap** au passage.

**Sept décisions conditionnent le travail** (détail §8) : les étages et l'intérieur des
bâtiments ; le fond de plan (capture OSM à attribuer, ou plan dessiné) ; la source de vérité des
lieux (tables carte ou couche visite) ; l'itinéraire (simple « y aller » ou vrai routage) ;
l'accès (public ou restreint) ; les langues ; les parcours pour les formations. La volumétrie
réelle de la carte `lyautey` en production (nombre de zones, repères, catégories, salles) manque
au dépôt : elle décide de la densité d'étiquettes et donc de la moitié des choix d'affichage.

---

## 2. Ce que ForetMap offre déjà

### 2.1 Deux moteurs de carte, une seule géométrie

| Aspect                 | Carte de travail (`src/components/map-views.jsx`)                                                                                   | Carte de Visite (`src/components/visit-views.jsx`)                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendu                  | `<img>` + `<svg>` en **pixels naturels de l'image**, calque monde en `transform: translate() scale()` (`map-views.jsx:947-1085`)    | `<img>` + `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` **étiré** sur le rectangle « contain » (`visit/VisitZonesSvgLayer.jsx:81`) |
| Zones                  | `<polygon>` + `<text>` emoji/nom au centroïde arithmétique (`map/ZonePolygonsLayer.jsx:68-145`)                                     | idem, en unités %                                                                                                                             |
| Repères                | `<button class="map-bubble">` en `left/top` % (`MapViewMarkerBubble.jsx:50-70`)                                                     | boutons % (`visit/VisitMarkersLayer.jsx`)                                                                                                     |
| Gestes                 | pan 1 doigt, pinch, molette, +/−, clavier ; **pas de bornes**, pas de double-tap, pas d'inertie (`hooks/useMapGestures.js:477-637`) | pan, pinch, molette, +/−, **bornes** [1, 8] (`utils/visitMapTransform.js:24-34`), pas de double-tap, pas d'inertie                            |
| Fit de l'image         | `measureAndFit` (viewport mobile, paddings)                                                                                         | `computeMapImageContainRect` + `ResizeObserver` (`utils/mapImageFit.js`)                                                                      |
| Détail d'un lieu       | modale plein cadre en portail (`DialogShell`, `map/ZoneInfoModal.jsx`, 725 l.)                                                      | panneau sous le plan (`visit/VisitDetailPanel.jsx`, 347 l.)                                                                                   |
| Recherche / filtres    | oui : texte, type, catégories, espèce, tâches, tutoriels ; bottom sheet < 1024 px                                                   | non                                                                                                                                           |
| Étiquettes adaptatives | oui : taille selon plateau, masquage des petites zones, Aa/Aa+/Aa++ (`utils/mapOverlayZoneLabels.js:84-118`)                        | partagées (`shared/mapOverlayScale.js`)                                                                                                       |
| GPS                    | « Me suivre » → **la mascotte** suit la position (`hooks/useMascotGpsFollow.js`)                                                    | **aucun** (choix documenté, `docs/reference/foretmap/visite-et-mascottes.md:255`)                                                             |
| Dépendances npm carto  | aucune (`react`, `react-dom`, `lucide-react`, police emoji)                                                                         | aucune                                                                                                                                        |

L'audit d'homogénéité (`docs/AUDIT_UI_HOMOGENEITE_2026-09.md:126-134`) compte en réalité
**quatre** moteurs (plus les plateaux GL et les aperçus biodiversité). Plan Lyautey ne doit pas en
créer un cinquième : c'est l'occasion d'en extraire **un** noyau partagé (§5.3).

Le système de coordonnées est unique et sain : `points` = JSON `[{xp, yp}]` pour les zones,
`x_pct`/`y_pct` pour les repères, 0 → 100 depuis le coin haut-gauche de l'image
(`sql/schema_foretmap.sql:34-52`, `:746-759`). La conversion écran → % est factorisée dans
`src/shared/pct-map/pctMapPointer.js:64-91`. Le lat/lng n'intervient que pour le GPS, par une
affine à trois ancres (`src/utils/mapGeoTransform.js`).

### 2.2 Données et API : tout ce qu'il faut est lisible sans compte

| Ressource                | Endpoint public                                                              | Contenu utile pour le plan                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cartes                   | `GET /api/maps` (`routes/maps.js:11-37`, cache 20 s)                         | `id, label, map_image_url, frame_padding_px, is_active, georef (3 ancres), gps_enabled`                                                                   |
| Zones                    | `GET /api/zones?map_id=lyautey` (`routes/zones.js:181-256`)                  | polygone `points`, `name`, `emoji`, `color`, `description`, `visit_subtitle`, `visit_short_description`, `categories[]`, `is_infrastructure`, `species[]` |
| Repères                  | `GET /api/map/markers?map_id=lyautey` (`routes/map.js:174-197`)              | `x_pct, y_pct, label, emoji, note`, champs `visit_*`, `categories[]`                                                                                      |
| Catégories de lieux      | `GET /api/map-categories?map_id=lyautey` (`routes/map-categories.js:93-105`) | `label, emoji, color, description, applies_to, is_infrastructure, sort_order` — actives seulement                                                         |
| Photos                   | `GET /api/zones/:id/photos`, `GET /api/map/markers/:id/photos`               | `image_url`, `thumb_url`, `caption`                                                                                                                       |
| Contenu éditorial visite | `GET /api/visit/content?map_id=…` (`routes/visit.js:210-375`)                | blocs éditoriaux, photo principale, `visit_is_active` — **mais** pas de catégories                                                                        |
| Réglages publics         | `GET /api/settings/public`                                                   | typographie d'overlay `ui.map.*`, palette d'emojis                                                                                                        |

Les **catégories de lieux** (migration 204, `location_categories` + jonctions) sont la brique
maîtresse pour un plan de lycée : libellé, emoji, couleur, description, restriction zones/repères,
globales ou propres à une carte (« Salles » sur un plan de bâtiment est l'exemple donné dans la
doc, `docs/reference/foretmap/carte-et-zones.md:131`), case « Infrastructure ». Elles n'existent
que sur les tables **carte** (`zones`/`map_markers`), pas sur la couche visite — ce qui oriente le
choix de la source de vérité (§8, Q3).

**Volumétrie connue.** Le dépôt ne contient pour `lyautey` que 12 bâtiments tracés en % sur une
capture OpenStreetMap (`sql/zones_lyautey_batiments.sql`, générés par
`scripts/gen-zones-lyautey-batiments.js:4-15`), avec cet avertissement : les pourcentages ne
s'alignent **que** si le fond de la carte est cette même image, au même cadrage. La carte `foret`
compte 36 zones et 21 repères (`data/import/foret-comestible-garden.sql:3`). L'audit BDD d'août
donne 108 lignes pour toute la couche visite en prod. Le contenu réel de `lyautey` en production
n'est pas dans le dépôt (§8, Q2).

### 2.3 Recherche et filtres : un moteur solide, une restitution timide

Le moteur (`src/utils/mapLocationFilters.js`, 284 l.) est bon et réutilisable tel quel : tokens
en ET, normalisation NFD sans accents (`:26-39`), recherche sur nom, emoji, description, espèces,
textes visite et libellés de catégories (`:75-99`), filtres type / catégories / espèce / tâches /
tutoriels, tri alphabétique fr puis zones avant repères (`:275-281`). La barre
(`map/MapLocationFiltersBar.jsx`) passe en **bottom sheet** sous 1024 px avec cibles 44 px
(`src/index.css:3055-3097`), chips de filtres actifs, raccourci `/`.

Ce qui manque pour un plan : un **tri** exposé (aucun n'est configurable), une **légende** (le
CSS `.map-legend` existe, `src/index.css:989-992`, mais aucun JSX ne l'utilise), le **masquage**
réel des lieux hors filtre (aujourd'hui atténuation à 12 % d'opacité, `src/index.css:3251-3264`),
des **alias** de recherche (« CDI », « infirmerie », « G12 »), et une **liste parcourable** sans
avoir tapé quoi que ce soit.

### 2.4 Géolocalisation : complète, testée, mais attachée à la mascotte

La chaîne est petite et propre (`docs/AUDIT_GEOLOCALISATION_2026-09.md`, plan d'action livré en
totalité) : ancres `maps.geo_anchors_json` (migration 148), validation serveur avec contrôle de
plausibilité (`lib/mapGeoref.js:104-149`), affine 2D par différences au premier point
(`src/utils/mapGeoTransform.js:77-98`), `watchPosition` sans aucun envoi réseau
(`src/hooks/useGeolocation.js`), seuil de précision 50 m et marge hors-plan 5 %
(`src/hooks/useMascotGpsFollow.js:11-13`), bannière à six états
(`src/components/MascotGpsStatusBanner.jsx:36-73`), e2e avec géolocalisation simulée
(`e2e/map-gps-follow.spec.js`). La carte `lyautey` est citée comme ayant un calage **sain** (audit
C1 : c'est `foret` qui était dégénérée).

Deux couplages à défaire : le suivi est câblé sur la **mascotte** (`useMascotGpsFollow` n'appelle
qu'un `moveTo(xp, yp)` quelconque, mais l'éligibilité du bouton exige `showMapMascot`,
`map-views.jsx:327-331`), et le bouton n'existe que sur la carte de travail. Pour un plan, la
position est un **point bleu** avec halo de précision, pas un personnage.

### 2.5 Routage par host : le schéma GL tient en 31 lignes

`lib/productResolver.js:20-25` décide du produit : header `X-Foretmap-Product` (tests, e2e) sinon
`host.startsWith('gl.')`, défaut `foret`. Le host ne pilote que **trois** choses : l'index SPA servi
(`lib/spaFallback.js:8-18`), le favicon (`server.js:330-342`) et la redirection de
`/index.vite.html` sur `gl.*` (`server.js:322-329`). Tout le reste de l'isolement est orthogonal au
host : préfixe `/api/gl` monté avant la garde (`server.js:444-491`) et claim JWT `product`
(`lib/auth/jwtPipeline.js:55-58`). Vite produit `dist/gl.html` par une entrée supplémentaire
(`vite.config.js:58-62`) et les assets sont cloisonnés par dossier `public/gl/`.

Deux surfaces **partagées** sont à traiter explicitement pour un troisième host : le service worker
et le manifest PWA (`public/sw.js`, `public/manifest.json`, servis à tous les hosts avec
`scope: "/"`, nom « ForêtMap ») et la CSP globale (`lib/csp.js:59-82`, calculée une fois au
démarrage, sans crochet par produit). Détail du portage en §5.4.

### 2.6 Posture mobile actuelle

Un projet Playwright `mobile-chromium` (390×844, tactile) existe depuis le lot D-3 avec **un**
scénario carte (`e2e/mobile-map-nav.spec.js`). Le CSS est monolithique (`src/index.css`, 8 398 l.),
avec des tokens `--safe-bottom` et des breakpoints canoniques documentés. Le hook
`useIsCoarsePointer` n'est pas utilisé par la carte ForetMap, qui réimplémente la détection
(`useMapGestures.js:226-237`). Le shell ForetMap charge **tout** au démarrage (cartes, zones,
tâches, projets, plantes, repères, tutoriels — `useAppDataSync.js`) derrière un loader plein écran
(`docs/AUDIT_UX_ELEVE.md`, UX-01) ; la Visite se contente de trois appels.

---

## 3. Constats d'ergonomie mobile sur la carte telle qu'elle est

Chaque constat est noté sur sa gravité **pour l'usage « plan sur smartphone »**, pas pour l'usage
ForetMap actuel (où plusieurs sont acceptables).

### U1 — Le plan peut sortir de l'écran (majeur)

`useMapGestures.js:502-503` applique `tx.current.x = e.clientX - panStart.x` sans aucun clamp ; à
l'échelle minimale 0,15 (`:11-12`), un geste un peu large envoie le plan hors cadre, et seul
« Recentrer » le récupère. Debout, à une main, c'est la première chose qui arrive. La Visite clampe
(`visitMapTransform.js:24-34`) mais interdit toute échelle inférieure à 1, donc tout dézoom
au-delà du cadre — inutile sur un plan dense où l'on veut parfois « voir tout ».

### U2 — Gestes incomplets (majeur)

Ni double-tap (aucun `dblclick` ni comptage de taps dans les deux moteurs), ni inertie (`endPan`
commet et s'arrête net, `useMapGestures.js:426-430`), ni pan pendant le pinch (le point médian est
figé au `touchstart`, `:573-574`). Ce sont les trois gestes que tout utilisateur de Google Maps ou
Apple Plans fait sans y penser ; leur absence rend la carte « collante ».

### U3 — Le détail d'un lieu coupe le lien avec la carte (majeur)

Sur la carte de travail, toucher une zone ouvre une **modale plein cadre** portée sur `body`
(`map/ZoneInfoModal.jsx:327-335`), avec cinq onglets (Tâches, Tutoriels, Info, Photos, Modifier)
dont l'onglet par défaut est **Tâches** (`:104`). L'utilisateur perd la carte, donc le « où c'est
par rapport à moi ». Le pattern attendu sur un plan est la feuille basse (bottom sheet) à
crans : aperçu, mi-hauteur, plein, la carte restant visible et recadrée au-dessus.

### U4 — Le conflit scroll de page / gestes carte (moyen, disparaît en plein écran)

La carte de travail vit dans une page qui défile ; d'où `touchAction: 'pan-y'` au repos, un bouton
« Gestes » et un bandeau « ✋ Gestes carte actifs » (`useMapGestures.js:654-656`,
`map/MapViewToolbar.jsx:425-440`). Une app plan **est** la carte, plein écran, sans page derrière :
tout ce mécanisme devient inutile, et c'est un argument fort pour un shell dédié plutôt qu'un
« mode » de ForetMap.

### U5 — Filtre sans tri, sans masquage, sans légende (majeur pour un plan)

Voir §2.3. S'y ajoute : le compteur de résultats et la liste sont **repliés** par défaut ; les
lieux atténués gardent leur surface et leur étiquette (grisée), donc le bruit visuel reste ; aucune
couleur de catégorie n'est expliquée à l'écran (uniquement `title`/`aria-label`, inaccessibles au
doigt).

### U6 — Bug : le centrage sur un repère vise le haut du plan (mineur, trois caractères)

`src/utils/mapFocusLocation.js:6-11` lit `marker.yp` au lieu de `marker.y_pct` : depuis la liste de
résultats, tout repère est recadré à `yp = 0`. Le cas zone est correct.

### U7 — Étiquettes : bon socle, deux limites (moyen)

Le masquage adaptatif des noms selon l'aire à l'écran et le multiplicateur tactile ×1,2
(`src/shared/typographyTokens.js:24,52-53`) sont exactement ce qu'il faut. Mais : l'étiquette est
posée au **centroïde arithmétique des sommets** (`ZonePolygonsLayer.jsx:70-71`), hors du polygone
sur une forme en L ou en U (fréquent pour un bâtiment) ; et il n'y a **aucune gestion de
collision** entre étiquettes voisines, ni de priorité par catégorie (un bâtiment devrait toujours
garder son nom, une salle seulement au zoom). L'audit E3 signale aussi des emojis rasterisés flous
au zoom.

### U8 — Barre d'outils dense, sans affordance de défilement (moyen)

20 boutons, scroll horizontal avec barre masquée (`src/index.css:2404-2419`), deux cibles sous
44 px (`docs/AUDIT_UI_HOMOGENEITE_2026-09.md`, D2). Pour un plan, il en faut **quatre** : rechercher,
filtrer, me situer, recentrer.

### U9 — Pastilles clignotantes et mascotte (hors sujet, à ne pas embarquer)

Les états de tâches clignotent en boucle (`src/index.css:1006-1035`) et la mascotte occupe le bas
du canevas (`visit-map-mascot.css:23-24`). Aucun des deux n'a de sens sur un plan ; le noyau
partagé doit pouvoir s'en passer sans branche conditionnelle.

### U10 — Chargement et poids (moyen)

Sept domaines chargés au démarrage, image de fond unique en JPEG/PNG (le SVG `map-foret.svg` fait
exception), pas de `srcset`, pas de niveau de détail. Sur le réseau d'un lycée ou en 4G
intermittente, un plan doit s'ouvrir en **une** requête agrégée et rester utilisable hors ligne
(l'image et le JSON tiennent en cache).

### U11 — Fond de plan : capture OSM et alignement fragile (moyen, à décider)

Le tracé Lyautey suit une capture OpenStreetMap « étiquetée » (`gen-zones-lyautey-batiments.js:6-9`),
avec le nom des bâtiments **imprimé dans l'image** — donc redondant avec les étiquettes, et
illisible au zoom. Toute nouvelle capture au cadrage différent décale toutes les zones
(`:12-15`). Une image OSM publiée doit porter l'attribution ODbL « © les contributeurs
OpenStreetMap » — aucune mention n'existe dans le code aujourd'hui.

### U12 — Le modèle est plat : une image par carte, pas d'étages (bloquant à cadrer)

`maps` porte **une** `map_image_url` ; zones et repères sont 2D. Un lycée a des étages, et « se
repérer dans les lieux » signifie souvent trouver une salle au 2ᵉ. Le modèle peut l'absorber
(une carte par niveau, par exemple `lyautey`, `lyautey-1`, `lyautey-2`, et un sélecteur d'étage
dans le plan), mais c'est une décision de contenu et de saisie (§8, Q1).

---

## 4. L'expérience cible

### 4.1 Principes

1. **La carte est l'écran.** Plein écran dès l'ouverture, pas de page, pas de barre de navigation
   d'application, pas de loader bloquant : le plan (image mise en cache) apparaît d'abord, les
   lieux se posent dessus.
2. **La recherche d'abord.** Une barre flottante en haut, focus au tap, résultats immédiats dans la
   feuille basse. C'est le geste n° 1 d'un visiteur (« salle Delacroix », « infirmerie », « G12 »).
3. **Une seule surface de détail : la feuille basse** à trois crans (aperçu ~120 px, mi-hauteur,
   plein), glissable au doigt, la carte restant visible et recadrée sur le lieu au-dessus.
4. **Lisibilité garantie** : étiquettes avec halo, priorité par catégorie, masquage réel des lieux
   hors filtre, légende intégrée aux chips, contraste élevé (usage en extérieur, plein soleil).
5. **Quatre commandes, pas vingt** : rechercher, filtrer, me situer, recentrer. Cibles ≥ 44 px,
   `--safe-bottom`, pouce droit et gauche (commandes en bas, jamais en haut à droite seulement).
6. **Rien à valider, rien à créer** : pas de compte, pas de « vu », pas de commentaire. Le seul
   état persistant côté appareil : dernière position de la vue, filtre choisi, taille du texte.
7. **Sobriété** : aucune animation décorative, `prefers-reduced-motion` respecté, pas de mascotte.

### 4.2 Écran par écran

**Accueil / carte.** Plan plein écran, barre de recherche flottante (icône loupe + champ + bouton
✕), rangée de **chips de catégories** défilante sous la barre (emoji + libellé + pastille couleur,
multi-sélection, chip « Tout »), en bas à droite un **bouton « Me situer »** (FAB), en bas à gauche
« Recentrer » (n'apparaît que si la vue a quitté le cadre initial). Boutons +/− optionnels (une
préférence : sur mobile ils gênent plus qu'ils n'aident ; à garder pour l'accessibilité clavier et
les tablettes). Au premier lancement, une bulle unique : « Touchez un lieu, ou cherchez-le. »

**Recherche.** À la saisie, la feuille basse monte à mi-hauteur avec la liste : titre, catégorie
(pastille + emoji), sous-titre court, et si le GPS est actif, la **distance** (« 80 m »). Tri
sélectionnable : **pertinence** (défaut, avec priorité aux correspondances de début de nom et aux
alias), **A → Z**, **distance** (GPS), **catégorie**. Résultats groupés par catégorie quand le
filtre en couvre plusieurs. Sur la carte, les non-correspondants sont **masqués** (pas atténués)
et la vue se recadre sur l'enveloppe des résultats. Recherche tolérante : accents, casse, alias
(à saisir dans une fiche : « CDI ; bibliothèque ; bibli »), numéros de salle.

**Fiche d'un lieu (feuille basse).** Cran aperçu : emoji + nom + catégorie + bouton « Y aller ».
Cran mi-hauteur : photo principale, sous-titre, accroche (`visit_short_description`), étage si
pertinent. Cran plein : description, bloc dépliable (`visit_details_*`), galerie, **lieux
voisins** (par proximité géométrique), bouton **Partager** (lien profond `?lieu=<id>`). « Y
aller » : centre la carte à mi-chemin entre ma position et le lieu, trace une ligne droite avec la
distance ; le vrai routage est une phase ultérieure (§8, Q4).

**Filtres.** Les chips suffisent pour l'usage courant ; un bouton « Filtres » ouvre la feuille avec
les options rares (type zone/repère, infrastructures, étage). Un compteur « 14 lieux » est toujours
visible dans la barre. Un tap sur un chip déjà seul actif revient à « Tout ».

**Position.** Point bleu, halo de précision proportionnel à `coords.accuracy`, **cap** par
`DeviceOrientation` si disponible (demande de permission iOS explicite, dégradé sans). Le bouton
« Me situer » a quatre états visuels : inactif, acquisition, actif, actif et suivi (la carte suit ;
un pan manuel repasse en « actif »). Les six messages d'état existants sont repris tels quels
(refusé, calage incohérent, erreur d'acquisition, acquisition, hors plan, signal faible) sous forme
de **toast discret**, pas de bannière permanente. Hors plan : le point bleu s'affiche collé au bord
le plus proche avec une flèche, plutôt que de disparaître.

**Étages (si retenu).** Un sélecteur vertical (RDC, 1, 2) à gauche, style ascenseur ; les
résultats de recherche affichent l'étage et changent de niveau au tap.

**Hors ligne / PWA.** Manifest dédié (« Plan Lyautey », `scope` et `start_url` propres, icône
propre), service worker qui précache l'image du plan et le JSON agrégé (stale-while-revalidate,
comme déjà fait pour `/api/maps` et `/api/visit/content` dans `public/sw.js`). Un bandeau
« Hors ligne — plan mémorisé » quand le réseau manque.

**Accès rapide sur site.** QR codes aux entrées et sur les portes principales pointant vers
`https://planlyautey.olution.info/?lieu=<id>` : le visiteur ouvre directement la fiche et sait
où il est même sans GPS (§8, Q9).

### 4.3 Améliorations générales du noyau carte (profitent aussi à ForetMap)

| #   | Amélioration                                                                                                                    | Constat | Où                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Bornes de pan** : le plan ne peut jamais quitter le cadre de plus d'une fraction (ex. 25 %) ; retour élastique                | U1      | `useMapGestures.js:419-430, 502-503` — réutiliser la logique de `visitMapTransform.js`                                              |
| N2  | **Double-tap** = zoom ×2 vers le point ; **deux doigts tap** = dézoom ; **pinch + pan** simultanés (midpoint vivant)            | U2      | `useMapGestures.js:559-602`                                                                                                         |
| N3  | **Inertie** de pan : vélocité des derniers pointermove, décélération exponentielle sous rAF, bornée par N1                      | U2      | `useMapGestures.js:426-430` — modèle : l'inertie de Leaflet (BSD-2), `Map.Drag`                                                     |
| N4  | **Étiquette au pôle d'inaccessibilité** plutôt qu'au centroïde                                                                  | U7      | `ZonePolygonsLayer.jsx:70-71` — algorithme `polylabel` de Mapbox (ISC), à réimplémenter en ~80 lignes ou à ajouter comme dépendance |
| N5  | **Priorité et collision d'étiquettes** : ordre par catégorie puis aire, test de recouvrement des boîtes à chaque commit de zoom | U7      | nouveau module pur `mapOverlayLabelCollision.js`, testable                                                                          |
| N6  | **Halo de texte** (`paint-order: stroke`) et emoji rendu à une taille fixe écran                                                | U7, E3  | `mapOverlayTypography.js`, CSS overlay                                                                                              |
| N7  | **Légende** réelle (chips de catégories avec couleur) et **masquage** en option du filtre                                       | U5      | `MapLocationFiltersBar.jsx`, `map-views.jsx:566-583`                                                                                |
| N8  | Correction `marker.yp` → `marker.y_pct`                                                                                         | U6      | `mapFocusLocation.js:9` + test                                                                                                      |
| N9  | `useMapGestures` **pur** : sortir le `PUT /api/map/markers/:id` (`:529-531`) dans un callback `onMarkerDragEnd`                 | —       | prérequis du noyau partagé                                                                                                          |
| N10 | Rendu des repères filtré par `mapMarkersOnActiveMap` plutôt que la liste brute (`map-views.jsx:1043`)                           | —       | hygiène                                                                                                                             |

---

## 5. Le portage

### 5.1 Trois options, une recommandation

| Option                                                                                            | Pour                                                                                                                                | Contre                                                                                                                                                                                      | Verdict        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **A. Troisième produit du monorepo** (`plan.html` → `src/plan/`, host `planlyautey.*`, schéma GL) | Tout le code vient de ForetMap ; même déploiement, même BDD, même CI ; shell mobile libre ; bundle léger (pas de tâches, forum, GL) | Trois lignes à généraliser dans le routage host ; SW/manifest à rendre conscients du produit ; discipline pour ne pas dupliquer le noyau                                                    | **Recommandé** |
| B. « Mode plan » de ForetMap (même bundle, host qui force `showPublicVisit` + carte `lyautey`)    | Zéro nouvelle entrée Vite                                                                                                           | Embarque tout ForetMap (index.css 8 398 l., shell, contextes, chargement des 7 domaines) ; l'UX reste contrainte par la page et les gestes U4 ; chaque évolution du plan traverse `App.jsx` | Non            |
| C. Application séparée consommant l'API                                                           | Isolation totale                                                                                                                    | Contredit « la totalité du code doit provenir de ForetMap » ; double maintenance du rendu ; CORS et déploiement supplémentaires                                                             | Non            |

### 5.2 Données : lecture seule, une requête, une carte

- **Source de vérité : les tables carte** (`zones`, `map_markers`, `location_categories`, photos)
  de la carte `lyautey`, avec les champs `visit_subtitle` / `visit_short_description` /
  `visit_details_*` que `GET /api/zones` sert déjà. Raisons : seules ces tables portent les
  catégories ; la couche visite est une **copie ponctuelle** à resynchroniser
  (`docs/reference/foretmap/visite-et-mascottes.md:270-274`) ; l'édition reste dans les fiches
  ForetMap que les profs connaissent. À trancher en §8, Q3.
- **Un endpoint agrégé public** `GET /api/plan/content?map_id=lyautey` (`routes/plan/content.js`) :
  carte (`label`, `map_image_url`, `frame_padding_px`, `georef`, `gps_enabled`), catégories, zones et
  repères **allégés** (pas d'historique de cultures, pas de `species`, pas de `visit_body_json`),
  photo principale par lieu, alias. Cache mémoire par carte avec invalidation sur `gardenChanged`
  (le mécanisme existe : `lib/visitContentCache.js`), `ETag`, `Cache-Control: max-age=60,
stale-while-revalidate`. Une requête au lieu de quatre, et un contrat stable pour le SW.
- **Visibilité par lieu** : aujourd'hui rien ne permet de cacher une zone de la carte de travail
  sans la supprimer (aucun champ `is_public` ni `archived` sur `zones` et `map_markers` ; la visibilité publique n'est portée que par `maps.is_active`, `visit_zones.is_active`, `visit_markers.is_active` et `location_categories.is_active`). Deux voies : réutiliser
  `visit_zones.is_active` (implique la couche visite), ou une catégorie « Interne » exclue par le
  plan. Le plus simple et le plus explicite : un réglage public `ui.plan.hidden_category_ids`.
  À trancher en §8, Q3.
- **Alias de recherche** : nouveau champ `search_aliases` (TEXT, liste `;`) sur `zones` et
  `map_markers` par migration idempotente, éditable dans la fiche « Modifier » et dans l'inventaire
  admin « Zones & repères ». Sans lui, « CDI » ne trouve pas « Centre de documentation ».
- **Réglages** : `ui.plan.map_id` (défaut `lyautey`), `ui.plan.title`, `ui.plan.welcome_hint`,
  `ui.plan.category_order`, `ui.plan.hidden_category_ids`, `ui.plan.attribution` (texte OSM) —
  scope `public`, dans `lib/settings.js`, éditables depuis Paramètres admin.
- **Aucune écriture, aucune authentification** : pas de `/api/plan/auth`, pas de JWT, pas de
  session. Le rate limiter global suffit. Si l'accès doit être restreint (§8, Q5), un code
  établissement en cookie signé (le pattern HMAC de `routes/visit.js:26-83`) est le plus léger.

### 5.3 Front : un noyau partagé, un shell neuf

**Extraire le noyau** dans `src/shared/pct-map/` (le dossier existe déjà, avec `pctMapPointer.js`
et l'édition de polygones), sans changer le comportement de ForetMap — avec, comme l'impose
`CLAUDE.md`, **un test de montage posé avant** le refactor (patron `tests-ui/AppShellWiring.test.jsx`) :

| Brique                                                 | Origine                                                                                                                                                         | Travail                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `PctMapViewport` (gestes, transform, fit, plein écran) | `hooks/useMapGestures.js` (688 l.), `MapViewWorldLayer.jsx`, `MapViewBackgroundImage.jsx`                                                                       | purifier (N9), ajouter N1–N3, exposer `onTransformCommit`, `focusOnPct`, `fitToBounds` |
| `PctZonesLayer`                                        | `map/ZonePolygonsLayer.jsx` (239 l.)                                                                                                                            | rendre les pastilles de tâches optionnelles (slot), N4–N6                              |
| `PctMarkersLayer`                                      | `MapViewMarkerBubble.jsx` (168 l.)                                                                                                                              | idem, sans drag par défaut                                                             |
| `PctPositionLayer` (point bleu, halo, cap)             | nouveau, ~120 l.                                                                                                                                                | consomme `useGeolocation` + `mapGeoTransform`                                          |
| Typographie d'overlay                                  | `utils/mapOverlayTypography.js`, `mapOverlayZoneLabels.js`, `shared/mapOverlayScale.js`, `typographyTokens.js`                                                  | déjà partagés, inchangés                                                               |
| Moteur de recherche                                    | `utils/mapLocationFilters.js`                                                                                                                                   | ajouter alias, tri par distance, mode « masquer »                                      |
| GPS                                                    | `hooks/useGeolocation.js`, `hooks/useMascotGpsFollow.js` → `usePctMapGpsFollow.js`, `utils/mapGeoTransform.js`, `MascotGpsStatusBanner.jsx` → messages partagés | renommer, découpler de `showMapMascot`                                                 |
| Feuille basse                                          | CSS `.task-filters-sheet` / `.map-location-filters-sheet` (`src/index.css:3055-3097`), `DialogShell`                                                            | généraliser en `BottomSheet` à crans (drag, `dvh`, `--safe-bottom`, `inert` derrière)  |
| Chrome commun                                          | `src/shared/icons.jsx`, `shared/styles/*.css`, `useMediaQuery`, `usePrefersReducedMotion`, `FloatingDock`                                                       | tels quels                                                                             |

**Le shell** `src/plan/` (nouveau, ~1 500 lignes visées) : `main.jsx` (monte `AppPlan`, charge les
feuilles partagées + `plan/styles/plan.css`), `AppPlan.jsx` (orchestration seule),
`hooks/usePlanContent.js` (fetch agrégé, cache, hors ligne), `components/PlanSearchBar.jsx`,
`PlanCategoryChips.jsx`, `PlanResultsList.jsx`, `PlanPlaceSheet.jsx`, `PlanLocateButton.jsx`,
`PlanFloorSwitch.jsx` (si Q1), `PlanOfflineBanner.jsx`. Lien profond `?lieu=<id>` et
`?q=<texte>` lus au montage, historique navigateur géré par `useOverlayHistoryBack` (existant).

Ce que le plan **n'importe pas** : `App.jsx`, les contextes `Session`/`Data`/`Tour`, `index.css`
(il prend les feuilles `shared/styles/*` et une feuille propre), la mascotte, les tâches, les
tutoriels, le forum, Socket.IO (pas de temps réel : le contenu change rarement, le SW
revalide).

### 5.4 Serveur et infra : le schéma GL, généralisé

| Fichier                                | Aujourd'hui                                                                                    | À faire                                                                                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/productResolver.js:11-25`         | `gl`/`foret` en dur, `startsWith('gl.')`                                                       | table `{ 'gl.': 'gl', 'planlyautey.': 'plan' }` + override header `plan` ; catalogue des produits exporté                                                                                                                          |
| `lib/spaFallback.js:8-18`              | `distGlIndex` en dur                                                                           | `distIndexByProduct` avec repli `distSpaIndex`                                                                                                                                                                                     |
| `server.js:294-300, 322-342, 562-574`  | index GL, garde `/index.vite.html`, favicon GL                                                 | `dist/plan.html`, garde symétrique pour `/gl.html` et `/plan.html`, favicon `public/plan/`                                                                                                                                         |
| `lib/staticCacheHeaders.js:5`          | `gl.html` absent de la liste `no-store`                                                        | ajouter `gl.html` et `plan.html`                                                                                                                                                                                                   |
| `public/sw.js`, `public/manifest.json` | uniques, `scope: "/"`, nom ForêtMap, précache `index.vite.html`                                | **par produit** : `/plan/manifest.json`, `/plan/sw.js` servis selon le host (ou route `/manifest.json` qui choisit) ; ne pas enregistrer le SW ForetMap sur le host plan                                                           |
| `lib/csp.js:59-82`                     | globale                                                                                        | rien si le plan ne charge aucune origine tierce (recommandé) ; sinon élargir pour tous                                                                                                                                             |
| `vite.config.js:58-62`                 | entrées `main`, `mascotPackTool`, `gl`                                                         | entrée `plan` ; plugin de métadonnées OG cloné de `glShareMetaPlugin` (`:17-40`)                                                                                                                                                   |
| `server.js:444-491`                    | exclusion `/gl` de la garde JWT                                                                | monter `routes/plan/*` (lecture seule) ; pas d'exclusion nécessaire puisque la garde ne fait que décoder un Bearer optionnel                                                                                                       |
| `.env` / `FRONTEND_ORIGINS`            | deux hosts                                                                                     | ajouter `https://planlyautey.olution.info` (sinon `origin: false` en prod, `server.js:134-150`)                                                                                                                                    |
| `scripts/post-deploy-check.js:30-44`   | flags GL en dur                                                                                | `--plan-base-url` ; `package.json` `deploy:check:prod`                                                                                                                                                                             |
| `scripts/prepare-dist-deploy.js:83-88` | vérifie `dist/index.vite.html` seulement                                                       | vérifier aussi `dist/gl.html` et `dist/plan.html` (le repli silencieux sur ForetMap est un piège, `spaFallback.js:14-15`)                                                                                                          |
| Tests                                  | `tests/gl-product-routing.test.js`, `spa-fallback.test.js:59-79` (conditionnel, inactif en CI) | `tests/plan-product-routing.test.js` ; variante `serveDist: true` avec fichiers factices (pattern `static-cache-headers.test.js:18`) ; e2e `plan-*.spec.js` sur le projet `mobile-chromium` avec header `X-Foretmap-Product: plan` |
| Hors dépôt (o2switch / cPanel)         | —                                                                                              | DNS `planlyautey`, sous-domaine sur **la même** application Node (une instance, caches mémoire), AutoSSL, `X-Forwarded-*` conservés                                                                                                |
| Documentation                          | —                                                                                              | `docs/GL_ARCHITECTURE.md` § routage, `docs/EXPLOITATION.md`, `docs/API.md` (endpoint plan), `CLAUDE.md`, `.env.example`, nouveau `docs/reference/plan/` (doc non technique)                                                        |

### 5.5 Contenu et administration (hors code, mais sur le chemin critique)

- Définir les **catégories** de la carte `lyautey` (propres à la carte) : Bâtiments, Salles,
  Administration & vie scolaire, Santé, CDI & documentation, Restauration, Sport, Entrées & accès,
  Sanitaires, Espaces verts / forêt comestible (lien avec ForetMap), Parking. Chacune avec emoji,
  couleur **distincte et contrastée** (la palette de dix teintes du lot précédent), ordre.
- Saisir les lieux manquants et leurs **alias**, les **sous-titres courts** (c'est ce que lit un
  visiteur pressé), une photo par lieu (reconnaissable depuis l'extérieur).
- Vérifier le **calage GPS** de `lyautey` sur le terrain (trois points aux angles du site, échelle
  déduite affichée par le panneau admin) ; c'est ce qui rend « Me situer » crédible.
- Décider du **fond** (§8, Q2) et, si la capture OSM est conservée, en produire une version sans
  étiquettes imprimées, au même cadrage, avec l'attribution.

---

## 6. Phasage proposé

| Lot | Contenu                                                                                                                                                                                                                                                    | Dépend de | Effort indicatif |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| 0   | **Socle produit** : résolveur host généralisé, `plan.html` + `src/plan/main.jsx` « coquille », favicon/manifest/SW par produit, `FRONTEND_ORIGINS`, tests de routage, doc d'exploitation. Livrable : le host répond avec une page vide et le bon manifest. | Q5        | 2 j              |
| 1   | **Noyau carte partagé** : test de montage préalable, extraction `PctMapViewport` / layers, N1 (bornes), N2 (double-tap, pinch+pan), N3 (inertie), N8, N9, N10 ; ForetMap et Visite rebranchés, non-régression e2e mobile.                                  | —         | 4 à 5 j          |
| 2   | **Endpoint agrégé** `/api/plan/content` + réglages `ui.plan.*` + migration `search_aliases` + doc API.                                                                                                                                                     | Q3        | 1,5 j            |
| 3   | **Shell plan v1** : carte plein écran, recherche, chips, liste de résultats avec tris, feuille basse à crans, fiche, lien profond, « Y aller » en ligne droite. e2e `plan-search.spec.js`, `plan-sheet.spec.js`.                                           | 1, 2, Q1  | 5 à 6 j          |
| 4   | **Position** : point bleu, halo, cap, quatre états du bouton, toasts d'état, hors plan au bord. e2e avec `setGeolocation`.                                                                                                                                 | 3         | 2 j              |
| 5   | **Lisibilité** : N4 (pôle d'inaccessibilité), N5 (priorité et collisions), N6 (halo, emoji net), légende (N7) — bénéfices ForetMap inclus.                                                                                                                 | 1         | 3 j              |
| 6   | **Hors ligne et accès** : SW dédié (précache image + JSON), bandeau hors ligne, QR / liens profonds, éventuel code d'accès.                                                                                                                                | 3, Q5, Q9 | 2 j              |
| 7   | **Contenu Lyautey** : catégories, alias, photos, calage GPS terrain, fond de plan ; doc `docs/reference/plan/`.                                                                                                                                            | Q1, Q2    | hors dev         |
| 8   | (Option) **Étages** : cartes par niveau + sélecteur ; (option) **routage** sur graphe de chemins.                                                                                                                                                          | Q1, Q4    | 3 j / 5 j        |

Ordre conseillé : 0 → 1 → 2 → 3 → 4 → 5 → 6, avec le lot 7 mené en parallèle dès que Q1–Q3 sont
tranchées. Le lot 1 est le seul risqué pour l'existant ; il se livre seul, sur sa PR, avec le test
de montage et les e2e mobiles verts avant tout le reste.

---

## 7. Risques et points de vigilance

- **Refactor du noyau carte** : `map-views.jsx` et `useMapGestures.js` sont au cœur de ForetMap.
  Le post-mortem d'août (`docs/AUDIT_REFACTORING_APP_2026-08.md` §5) impose le test de montage
  préalable et l'attention à `no-use-before-define`. Pas de lot 1 sans ces deux garde-fous.
- **Alignement du fond** : tout changement d'image de fond au cadrage différent décale toutes les
  géométries en %. Figer le cadrage avant la saisie de contenu (lot 7) ; en cas de changement,
  écrire un script de remappage plutôt que de retracer.
- **Surfaces partagées** : SW, manifest et CSP sont servis à tous les hosts. Un SW ForetMap
  enregistré par erreur sur le host plan servirait `index.vite.html` hors ligne. Traiter au lot 0,
  tester en e2e.
- **Densité d'étiquettes** : sans N4–N5, une carte de lycée avec des dizaines de salles devient
  illisible au dézoom ; le masquage adaptatif actuel ne suffit qu'à un niveau.
- **GPS en intérieur et précision** : 5 à 30 m dehors, inutilisable dedans. Le point bleu doit
  afficher son halo honnêtement et le seuil 50 m rester ; les QR codes compensent en intérieur.
- **Données publiques** : l'endpoint sert le plan détaillé d'un établissement scolaire et ses
  ancres GPS. Le choix « public » est déjà celui de `GET /api/maps` (audit géoloc C5), mais il doit
  être **acté** pour ce produit (Q5).
- **Licence du fond OSM** : attribution ODbL obligatoire si la capture est conservée ; à afficher
  dans la fiche « À propos » du plan et dans les réglages.
- **Maintenance à deux vitesses** : trois produits sur un noyau commun exigent que toute évolution
  du noyau passe les e2e des trois. Prévoir un projet Playwright `plan-mobile` dès le lot 3.

---

## 8. Questions à trancher

Chaque question donne l'option recommandée en premier ; la réponse change le périmètre des lots.

1. **Étages et intérieur des bâtiments.** Le plan doit-il permettre de trouver une **salle** à un
   étage donné, ou seulement les bâtiments, entrées et services au sol ?
   _Recommandation_ : v1 au sol (bâtiments, services, entrées, extérieurs) ; étages en lot 8 avec
   une carte par niveau. Si les salles par étage sont indispensables dès la v1, le lot 3 grossit et
   le lot 7 (saisie) devient le chemin critique.

2. **Fond de plan et volumétrie réelle.** Combien de zones, repères et catégories porte `lyautey`
   en production aujourd'hui ? Le fond est-il toujours la capture OSM étiquetée ? Existe-t-il un
   plan dessiné de l'établissement (plan d'évacuation, plan architecte) exploitable ?
   _Recommandation_ : un fond **dessiné, sans texte imprimé**, à fort contraste, au même cadrage
   que l'existant (ou remappé par script) ; à défaut, capture OSM sans étiquettes avec attribution.
   Un export anonymisé de `zones`/`map_markers`/`location_categories` pour `lyautey` permettrait de
   dimensionner N5 et les tris.

3. **Source de vérité des lieux et visibilité.** Tables carte (recommandé, catégories incluses,
   édition dans les fiches habituelles) ou couche visite (éditorial riche, `is_active`, mais copie
   à resynchroniser et sans catégories) ? Comment cacher un lieu du plan sans le supprimer de
   ForetMap : catégorie exclue par réglage (recommandé), ou nouveau champ ?

4. **Itinéraire.** « Y aller » en ligne droite avec distance (recommandé pour la v1), ou vrai
   routage sur un réseau de chemins à dessiner (accessibilité PMR, portes fermées, sens) ? Le
   routage exige un nouvel outil de saisie prof et un graphe à entretenir.

5. **Accès.** Entièrement public (recommandé, cohérent avec `GET /api/maps` déjà public et avec
   des QR codes affichés sur site), ou protégé par un code établissement (cookie signé, léger) ?
   Question liée : peut-on publier les ancres GPS et le plan détaillé d'un lycée ?

6. **Langues.** Français seul (recommandé pour la v1, locale fr-FR du projet), ou aussi arabe et
   anglais pour les parents et les visiteurs ? Le bilinguisme touche les fiches (deux champs par
   texte) et la recherche (alias par langue).

7. **Parcours pour les formations.** Faut-il des **listes ordonnées de lieux** (« Accueil des
   nouveaux professeurs : entrée, vie scolaire, salle des profs, CDI… »), sans validation, juste
   pour enchaîner « suivant » ? Léger à faire si oui (un réglage JSON), mais c'est une fonctionnalité
   de plus à documenter.

8. **Nom de code et hosts.** `plan` comme identifiant de produit (dossier `src/plan/`, préfixe
   `/api/plan`, réglages `ui.plan.*`) et `planlyautey.` comme préfixe de host — avec `www.` accepté
   comme pour GL ? Un domaine de préproduction est-il souhaité ?

9. **QR codes et liens profonds.** Souhaités dès la v1 ? Si oui, les identifiants de lieux doivent
   être **stables** (ils le sont : `VARCHAR(64)` posés à la création) et le format d'URL figé avant
   impression.

10. **Hors ligne.** Requis (PWA installable, plan mémorisé) ou simple cache navigateur ? Le coût est
    faible (lot 6) mais engage le SW par produit dès le lot 0.

11. **Mesure d'usage.** Aucune (recommandé : rien n'est envoyé au serveur, comme pour la position),
    ou un compteur anonyme d'ouvertures et de recherches sans résultat (utile pour enrichir les
    alias) ?

---

## 9. Références externes (inspiration, avec sources)

Conformément à la règle du projet (`.cursor/rules/foretmap-external-inspiration.mdc`), les
approches ci-dessous sont citées pour être reprises **en les adaptant**, en respectant les
licences :

- **Leaflet** (BSD-2-Clause, <https://github.com/Leaflet/Leaflet>) — modèle d'inertie de pan
  (`Map.Drag`, vélocité lissée et décélération), bornes `maxBounds` avec rappel élastique, gestion
  du double-tap et du pinch avec point médian vivant. À réimplémenter dans `useMapGestures`, pas à
  importer (ForetMap rend en % d'image, pas en tuiles).
- **polylabel** de Mapbox (ISC, <https://github.com/mapbox/polylabel>) — pôle d'inaccessibilité
  d'un polygone pour placer l'étiquette « le plus à l'intérieur ». Petit (≈ 150 lignes), sans
  dépendance ; importable ou réécrit.
- **Material Design — Bottom sheets** (<https://m3.material.io/components/bottom-sheets>) et le
  comportement de la fiche de lieu de Google Maps / Apple Plans — crans, poignée, carte visible
  au-dessus.
- **OpenStreetMap — attribution ODbL** (<https://www.openstreetmap.org/copyright>) — mention
  obligatoire si la capture OSM reste le fond.
- **MazeMap** et les plans de campus universitaires — références d'UX pour recherche de salles,
  sélecteur d'étage et QR codes de localisation ; aucune reprise de code.
- **lucide** (ISC) — déjà utilisé pour le chrome (`src/shared/icons.jsx`) ; icônes loupe,
  boussole, couches, position.

---

## 10. Ce que cet audit ne fait pas

- Aucune modification de code, de schéma ni de réglage. Aucun chiffre de production n'a été
  consulté (le dépôt n'en contient pas pour `lyautey`).
- Pas de maquette visuelle : elle a plus de valeur une fois Q1, Q2 et Q3 tranchées, et se fera
  sur le canevas de design partagé pour être retouchée à la main.
- Pas de décision à la place du propriétaire du projet sur les onze questions du §8.
