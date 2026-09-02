# Audit — « Plan Lyautey » (`planlyautey.olution.info`) : un plan de repérage mobile dérivé de ForetMap (septembre 2026)

> **Statut : audit et cadrage, sans aucune modification de code — décisions du propriétaire intégrées
> (§8).** Relevé effectué sur la tête de
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
> les risques (§7), **les décisions prises et les propositions détaillées** (§8) et ce que chaque
> application y gagne (§8.10).

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

**Les décisions sont prises** (§8.1) : sol seulement en v1, français, accès paramétrable, QR codes et
liens profonds, hors ligne si possible **pour toutes les apps**, compteur d'usage anonyme, parcours pour
les formations à développer, host `planlyautey.olution.info`. Deux informations du propriétaire pèsent
sur la suite : le fond actuel est **extrait de Google Maps** (risque de licence à lever, §8.2) et la carte
`lyautey` porte **de nombreux types de repères fortement superposés** (le désencombrement devient un lot
à part entière, §8.3). Enfin, une exigence transverse : **chaque brique construite doit profiter à
ForetMap, à la Visite et à GL** (matrice §8.10).

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
choix de la source de vérité (§8.4).

**Volumétrie connue.** Le dépôt ne contient pour `lyautey` que 12 bâtiments tracés en % sur une
capture OpenStreetMap (`sql/zones_lyautey_batiments.sql`, générés par
`scripts/gen-zones-lyautey-batiments.js:4-15`), avec cet avertissement : les pourcentages ne
s'alignent **que** si le fond de la carte est cette même image, au même cadrage. La carte `foret`
compte 36 zones et 21 repères (`data/import/foret-comestible-garden.sql:3`). L'audit BDD d'août
donne 108 lignes pour toute la couche visite en prod. Le contenu réel de `lyautey` en production
n'est pas dans le dépôt ; le propriétaire signale de nombreux types de repères fortement superposés (§8.3).

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

### U11 — Fond de plan : capture d'un service tiers et alignement fragile (majeur)

Le tracé Lyautey versionné suit une capture OpenStreetMap « étiquetée »
(`gen-zones-lyautey-batiments.js:6-9`) ; le fond réellement en place est, selon le propriétaire,
**extrait de Google Maps** (§8.2). Dans les deux cas le nom des bâtiments est **imprimé dans
l'image** — donc redondant avec les étiquettes, et illisible au zoom. Toute nouvelle capture au cadrage différent décale toutes les zones
(`:12-15`). Une image OSM publiée doit porter l'attribution ODbL « © les contributeurs
OpenStreetMap » ; une capture Google Maps pose un problème de licence plus sérieux (§8.2). Aucune
mention d'attribution n'existe dans le code aujourd'hui.

### U12 — Le modèle est plat : une image par carte, pas d'étages (tranché : sol en v1)

`maps` porte **une** `map_image_url` ; zones et repères sont 2D. Un lycée a des étages, et « se
repérer dans les lieux » signifie souvent trouver une salle au 2ᵉ. Le modèle peut l'absorber
(une carte par niveau, par exemple `lyautey`, `lyautey-1`, `lyautey-2`, et un sélecteur d'étage
dans le plan), mais la décision est prise : sol seulement en v1, étages en lot 10 (§8.1).

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
distance ; le mode boussole et le vrai routage sont détaillés en §8.5.

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
où il est même sans GPS (décision prise, §8.1).

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
  ForetMap que les profs connaissent. Détail et proposition de visibilité en §8.4.
- **Un endpoint agrégé public** `GET /api/plan/content?map_id=lyautey` (`routes/plan/content.js`) :
  carte (`label`, `map_image_url`, `frame_padding_px`, `georef`, `gps_enabled`), catégories, zones et
  repères **allégés** (pas d'historique de cultures, pas de `species`, pas de `visit_body_json`),
  photo principale par lieu, alias. Cache mémoire par carte avec invalidation sur `gardenChanged`
  (le mécanisme existe : `lib/visitContentCache.js`), `ETag`, `Cache-Control: max-age=60,
stale-while-revalidate`. Une requête au lieu de quatre, et un contrat stable pour le SW.
- **Visibilité par lieu** : aujourd'hui rien ne permet de cacher une zone de la carte de travail
  sans la supprimer (aucun champ `is_public` ni `archived` sur `zones` et `map_markers`). La
  proposition retenue est la **visibilité par surface** (catégorie et lieu), détaillée en §8.4.
- **Alias de recherche** : nouveau champ `search_aliases` (TEXT, liste `;`) sur `zones` et
  `map_markers` par migration idempotente, éditable dans la fiche « Modifier » et dans l'inventaire
  admin « Zones & repères ». Sans lui, « CDI » ne trouve pas « Centre de documentation ».
- **Réglages** : `ui.plan.map_id` (défaut `lyautey`), `ui.plan.title`, `ui.plan.welcome_hint`,
  `ui.plan.category_order`, `ui.plan.hidden_category_ids`, `ui.plan.attribution` (texte OSM) —
  scope `public`, dans `lib/settings.js`, éditables depuis Paramètres admin.
- **Aucune écriture, aucune authentification** : pas de `/api/plan/auth`, pas de JWT, pas de
  session. Le rate limiter global suffit. L'accès est paramétrable (§8.7) : public par
  défaut, ou code établissement en cookie signé (le pattern HMAC de `routes/visit.js:26-83`).

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
`PlanRouteSheet.jsx` (parcours), `PlanCompassSheet.jsx` (« Y aller »), `PlanOfflineBanner.jsx`. Lien profond `?lieu=<id>` et
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
- Remplacer le **fond extrait de Google Maps** (§8.2) par un plan dessiné ou un export OSM sans
  étiquettes imprimées, au même cadrage, avec l'attribution due.

---

## 6. Phasage proposé (révisé après décisions)

| Lot | Contenu                                                                                                                                                                                                                                                                                              | Dépend de | Effort indicatif |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| 0   | **Socle multi-produit** : registre des produits (`lib/products.js`) alimentant le résolveur de host, le fallback SPA, le favicon, le manifest et le service worker **par produit** (§8.8) ; `plan.html` + `src/plan/main.jsx` coquille ; `FRONTEND_ORIGINS` ; tests de routage ; doc d'exploitation. | —         | 3 j              |
| 1   | **Noyau carte partagé** `src/shared/pct-map/` : test de montage préalable, extraction viewport/couches, N1 bornes, N2 double-tap et pinch+pan, N3 inertie, N8, N9, N10 ; ForetMap et Visite rebranchés ; e2e mobile verts.                                                                           | —         | 4 à 5 j          |
| 2   | **Données** : migration `search_aliases` + visibilité par surface (§8.4), endpoint agrégé `GET /api/plan/content`, réglages `ui.plan.*`, doc API.                                                                                                                                                    | —         | 2 j              |
| 3   | **Shell plan v1** : carte plein écran, recherche, chips, résultats et tris, feuille basse à crans, fiche, lien profond `?lieu=`, « Y aller » en ligne droite. e2e `plan-*.spec.js` sur `mobile-chromium`.                                                                                            | 1, 2      | 5 à 6 j          |
| 4   | **Désencombrement des repères** (§8.3) : regroupement au dézoom, priorité par catégorie, éventail au tap, étiquettes de repères au zoom seulement — livré dans le noyau, donc aussi sur la carte ForetMap.                                                                                           | 1, 3      | 3 j              |
| 5   | **Position** : point bleu, halo, cap, mode boussole de « Y aller » (§8.5), toasts d'état, hors plan au bord. e2e avec `setGeolocation`.                                                                                                                                                              | 3         | 2 j              |
| 6   | **Lisibilité** : N4 pôle d'inaccessibilité, N5 collisions et priorité des étiquettes de zones, N6 halo, légende N7.                                                                                                                                                                                  | 1         | 3 j              |
| 7   | **Hors ligne, accès, compteur** : SW et manifest par produit branchés sur le plan (§8.8), garde d'accès paramétrable (§8.7), compteur d'usage (§8.9), QR codes.                                                                                                                                      | 0, 3      | 3 j              |
| 8   | **Parcours** (§8.6) : tables, API, panneau admin dans ForetMap, mode « suivant » dans le plan, export PDF avec QR.                                                                                                                                                                                   | 2, 3      | 4 j              |
| 9   | **Contenu Lyautey** (hors dev) : rapport de densité, fond de plan (§8.2), catégories, alias, sous-titres, photos, calage GPS terrain ; doc `docs/reference/plan/`.                                                                                                                                   | 2         | —                |
| 10  | (Suite) PWA GL, graphe de chemins et vrai routage (§8.5), étages.                                                                                                                                                                                                                                    | 0, 5, 8   | à cadrer         |

Ordre conseillé : 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, le lot 9 en parallèle dès le lot 2. Le lot 1
reste le seul risqué pour l'existant et se livre seul, sur sa PR.

---

## 7. Risques et points de vigilance

- **Refactor du noyau carte** : `map-views.jsx` et `useMapGestures.js` sont au cœur de ForetMap.
  Le post-mortem d'août (`docs/AUDIT_REFACTORING_APP_2026-08.md` §5) impose le test de montage
  préalable et l'attention à `no-use-before-define`. Pas de lot 1 sans ces deux garde-fous.
- **Fond de plan issu de Google Maps** : risque de licence (§8.2). Toute image de fond publiée
  dans une application doit avoir un droit d'usage clair ; le remplacement est peu coûteux tant
  que le cadrage est conservé ou remappé par script.
- **Alignement du fond** : tout changement d'image au cadrage différent décale toutes les
  géométries en %. Figer le cadrage avant la saisie de contenu ; en cas de changement, écrire un
  script de remappage plutôt que de retracer.
- **Repères superposés** : sans le lot 4, un plan avec de nombreux repères empilés est illisible
  au dézoom et ambigu au tap. C'est le risque UX numéro un signalé par le propriétaire.
- **Surfaces partagées** : SW, manifest et CSP sont servis à tous les hosts aujourd'hui. Le
  registre des produits du lot 0 doit les rendre conscients du produit avant tout déploiement du
  troisième host, sinon le SW ForetMap peut servir `index.vite.html` hors ligne sur le plan.
- **GPS en intérieur et précision** : 5 à 30 m dehors, inutilisable dedans. Le point bleu affiche
  son halo honnêtement ; les QR codes compensent en intérieur.
- **Données publiques** : l'endpoint sert le plan détaillé d'un établissement scolaire et ses
  ancres GPS. Le mode d'accès est paramétrable (§8.7) ; le choix par défaut doit être acté à la
  mise en production.
- **Maintenance à trois produits** : toute évolution du noyau passe les e2e des trois. Prévoir un
  projet Playwright `plan-mobile` dès le lot 3.

---

## 8. Décisions prises et propositions détaillées

### 8.1 Récapitulatif des décisions

| #   | Question                       | Décision                                                                        | Conséquence                                                                                  |
| --- | ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Étages                         | **Sol seulement en v1**                                                         | Pas de sélecteur d'étage ; le modèle « une image par carte » suffit ; étages en lot 10       |
| 2   | Fond de plan                   | **Extrait de Google Maps** ; nombreux types de repères, **forte superposition** | Alerte licence (§8.2) ; lot 4 « désencombrement » devient prioritaire (§8.3)                 |
| 3   | Source de vérité et visibilité | **À creuser** → proposition §8.4                                                | Tables carte + visibilité par surface                                                        |
| 4   | Itinéraire                     | **Simple**, proposition attendue → §8.5                                         | « Y aller » en ligne droite + mode boussole ; graphe de chemins en lot 10                    |
| 5   | Accès                          | **Paramétrable**                                                                | Garde d'accès partagée, public ou code (§8.7)                                                |
| 6   | Langues                        | **Français**                                                                    | Aucun champ bilingue ; locale fr-FR                                                          |
| 7   | Parcours pour les formations   | **À développer** → §8.6                                                         | Lot 8, bénéficie aussi à la Visite et aux séances ForetMap                                   |
| 8   | Host                           | **`planlyautey.olution.info`**                                                  | Préfixe `planlyautey.` dans le registre des produits, `www.` accepté comme pour GL           |
| 9   | QR codes et liens profonds     | **Oui**                                                                         | `?lieu=<id>` et `?parcours=<id>` dès la v1 ; identifiants stables                            |
| 10  | Hors ligne                     | **Si possible**, et pour les autres apps                                        | SW et manifest par produit (§8.8), ForetMap déjà partiellement équipé, GL à équiper          |
| 11  | Mesure d'usage                 | **Compteur**                                                                    | Compteur anonyme partagé (§8.9)                                                              |
| —   | Bénéfice pour toutes les apps  | **Exigence transverse**                                                         | Matrice §8.10 ; chaque brique nouvelle vit dans `src/shared/`, `lib/` ou le registre produit |

### 8.2 Le fond extrait de Google Maps : un risque à lever avant la mise en ligne

Les conditions d'utilisation de Google Maps (Google Maps Platform Terms of Service et les « Geo
Guidelines » de Google) interdisent en principe deux usages qui correspondent exactement au cas
présent : **réutiliser une capture d'écran comme fond de carte dans une application ou un site**
(hors des API Maps, qui ne sont pas utilisées ici) et **dériver des données par tracé** sur
l'imagerie Google (les polygones de bâtiments sont précisément un tracé). Le risque est faible en
pratique pour un lycée, mais il est réel pour une application publique, et il est **gratuit à
éviter** :

- **La géométrie ne dépend pas du fond.** Zones et repères sont en % de l'image ; changer d'image
  au **même cadrage** ne déplace rien. Si le cadrage change, un script de remappage (une affine
  entre les deux cadrages, calculée sur trois points communs, comme le calage GPS) déplace tout
  d'un coup — c'est le pendant, côté image, de `src/utils/mapGeoTransform.js`.
- **Options de remplacement, par ordre de préférence** :
  1. **Plan dessiné de l'établissement** (plan d'évacuation, plan architecte, plan d'accueil) :
     contraste choisi, aucun texte imprimé, aucun problème de droit ; c'est ce que font tous les
     plans de campus. À exporter en PNG ou SVG au cadrage de l'existant.
  2. **Export OpenStreetMap** (ODbL, tracé autorisé) avec la mention « © les contributeurs
     OpenStreetMap » affichée dans « À propos » — le script `gen-zones-lyautey-batiments.js` a
     d'ailleurs été tracé sur une vue OSM. Un rendu **sans étiquettes** est possible avec un style
     personnalisé.
  3. **Photo aérienne** dont l'établissement détient les droits (drone, prestataire).
- **Ce qu'il faut de toute façon** : figer le cadrage de référence (largeur, hauteur, emprise)
  dans la fiche de la carte, et écrire dans le réglage `ui.plan.attribution` la mention due.

Recommandation : lancer la production d'un fond dessiné dès le lot 9, et remplacer la capture
Google avant toute mise en ligne publique.

### 8.3 Repères nombreux et superposés : la stratégie de désencombrement

Le signalement « de nombreux types de repères, avec une forte superposition » change une
priorité : sans traitement, le plan ressemble à un tas d'emojis empilés au dézoom, et un tap sur
la pile ouvre le mauvais lieu. Le noyau partagé (lot 1) doit donc inclure, dès le lot 4 :

1. **Regroupement au dézoom** (clustering) : à chaque commit de transformation, les repères dont
   les pastilles se recouvrent à l'écran sont fusionnés en une **pastille de groupe** (compteur +
   emoji dominant + couleur de la catégorie majoritaire). Algorithme simple par grille écran
   (cellule ≈ 44 px), sans dépendance, pur et testable (`shared/pct-map/clusterMarkers.js`).
   Seuil réglable par produit ; sur ForetMap, désactivable par la barre d'outils.
2. **Un tap sur un groupe** : si le groupe se sépare en zoomant, zoom animé sur son enveloppe ;
   sinon (repères réellement au même endroit), **éventail** : les repères s'écartent en cercle
   autour du point pour être touchés un par un (le « spiderfy » des cartes web), ou, plus simple
   et plus accessible, la **liste des lieux du groupe** monte dans la feuille basse.
3. **Priorité par catégorie** : chaque catégorie porte un rang (nouveau champ `priority` ou
   réutilisation de `sort_order`) ; au dézoom, les catégories de faible priorité disparaissent
   avant les autres (les sanitaires avant les entrées). Une catégorie peut être marquée « visible
   seulement au zoom ».
4. **Étiquettes de repères** : jamais toutes affichées. Au dézoom, l'emoji seul ; au zoom, le nom
   des repères prioritaires ; toujours le nom du repère sélectionné et de ses voisins immédiats.
   Le masquage adaptatif existant (`mapOverlayZoneLabels.js`) s'étend aux repères.
5. **Couches par défaut** : un réglage `ui.plan.default_category_ids` définit ce qui est visible à
   l'ouverture ; les chips permettent d'ajouter le reste. Un plan lisible commence par montrer
   peu.
6. **Rapport de densité** (lot 9, script en lecture seule) : nombre de repères par catégorie, par
   cellule de 2 % du plan, paires distantes de moins de 1 % — pour régler les seuils sur les
   données réelles au lieu de deviner. Le script est aussi utile à l'inventaire admin ForetMap
   (doublons, empilements).

Sur la carte ForetMap, 1 à 4 s'appliquent à l'identique et corrigent le même problème de
lisibilité signalé par l'audit d'homogénéité (E4, D2).

### 8.4 Source de vérité et visibilité : une proposition

**Source de vérité : les tables carte** (`zones`, `map_markers`, `location_categories`,
`zone_photos`, `marker_photos`), pour trois raisons : elles seules portent les **catégories** ;
elles sont éditées dans les fiches que les professeurs utilisent déjà (et dans l'inventaire admin
« Zones & repères », qui permet l'édition en masse) ; la couche visite est une copie ponctuelle
qui se désynchronise (`docs/reference/foretmap/visite-et-mascottes.md:270-274`).

**Textes** : les champs `visit_subtitle`, `visit_short_description`, `visit_details_title`,
`visit_details_text`, déjà servis par `GET /api/zones` et `GET /api/map/markers`, deviennent les
**« textes publics »** d'un lieu, lus par la Visite **et** par le plan. Aucun changement de
schéma ; un simple renommage des libellés dans les formulaires (« Textes visite » → « Textes
publics (visite et plan) ») et dans la doc de référence.

**Visibilité par surface** — la vraie question, et la brique qui profite à toutes les apps.
Aujourd'hui trois mécanismes disjoints existent : `maps.is_active` (carte entière),
`visit_zones.is_active` / `visit_markers.is_active` (Visite seule), et « Infrastructure » sur les
catégories (comportement, pas visibilité). Proposition : introduire la notion de **surface**
(`map` = carte de travail ForetMap, `visit` = Visite, `plan` = Plan Lyautey), et la poser à deux
niveaux :

- sur **`location_categories`** : un champ `surfaces` (SET `map,visit,plan`, défaut les trois).
  Décocher `plan` sur la catégorie « Zones de culture » retire d'un coup tout le jardin du plan ;
  décocher `map` sur « Salles » évite d'encombrer la carte de travail des élèves ;
- sur **chaque lieu** : un champ `hidden_surfaces` (SET, défaut vide) pour l'exception (une salle
  fermée cette année, un repère de chantier). Une case à cocher par surface dans la fiche
  « Modifier » et dans l'inventaire admin, avec l'édition par lot.

Règle : un lieu est visible sur une surface s'il n'y est pas masqué **et** qu'au moins une de ses
catégories y est visible (un lieu sans catégorie est visible partout). Migration idempotente,
deux colonnes, valeurs par défaut rétrocompatibles ; `visit_*.is_active` reste en place pour la
Visite jusqu'à ce qu'on décide de l'y rabattre. Chaque endpoint de lecture prend `?surface=` et
filtre côté serveur, pour que le plan ne reçoive jamais ce qu'il ne doit pas montrer.

**Alias de recherche** : champ `search_aliases` (TEXT, liste séparée par `;`) sur `zones` et
`map_markers`, éditable dans la fiche et l'inventaire, indexé par le moteur de recherche
partagé — utile au plan (« CDI », « infirmerie », « G12 ») comme à la carte ForetMap (« mare » /
« bassin »).

### 8.5 Itinéraire : simple en v1, un graphe partagé ensuite

**v1 — « Y aller » sans graphe.** Quand un lieu est sélectionné et que la position est connue :

- la carte se recadre sur l'enveloppe « moi + lieu » ; une **ligne droite** discrète les relie,
  avec la **distance** (« 120 m ») et, sur un site scolaire, un temps indicatif (à 4 km/h) ;
- un **mode boussole** en plein écran de la feuille basse : une grande flèche qui pointe vers le
  lieu en tenant compte du cap de l'appareil (`DeviceOrientation`, permission explicite sur iOS),
  la distance dessous, qui décroît en marchant. C'est le pattern « Localiser » d'Apple et il est
  remarquablement efficace sur un campus ouvert, sans aucune donnée de chemins ;
- sans cap disponible, la flèche est absolue (nord en haut) et la carte suffit.

Coût : ~150 lignes dans `PctPositionLayer` et un composant `PlanCompassSheet`. Aucune saisie
prof.

**v2 (lot 10) — graphe de chemins partagé.** Si l'usage montre des visiteurs perdus entre deux
bâtiments (le compteur de « Y aller » abandonnés le dira), on ajoute une couche **chemins** :
polylignes en % tracées par un professeur avec l'éditeur de polygones existant
(`src/shared/pct-map/PctPolygonEditOverlay.jsx`, mode « ligne ouverte »), nœuds partagés aux
intersections, attributs (escalier, PMR, fermé le soir). Routage par Dijkstra sur les nœuds, avec
accrochage du départ et de l'arrivée au segment le plus proche ; tout en pur JavaScript, testable.
La même couche sert ForetMap (chemins du jardin, distances entre zones pour les tâches) et
prolonge le concept de **chemin numéroté** que GL a déjà sur ses plateaux
(`src/shared/glBoardPathCore.js`) : un seul modèle de « chemin en % » pour les trois produits.

### 8.6 Parcours : des listes ordonnées de lieux, sans validation

**Ce que c'est.** Un parcours est une liste ordonnée de lieux avec un titre, une description,
un public (« Nouveaux professeurs », « Journée portes ouvertes », « Formation sécurité »), et pour
chaque étape un texte court facultatif (« Ici, on récupère son badge »). Aucune validation :
l'utilisateur avance avec « suivant » / « précédent », peut sauter, peut quitter.

**Modèle** (migration idempotente) : `map_routes` (`id`, `map_id`, `slug`, `title`,
`description`, `audience`, `surfaces` SET, `is_published`, `sort_order`, `created_at`,
`updated_at`) et `map_route_steps` (`route_id`, `position`, `target_type` zone|marker,
`target_id`, `step_title`, `step_text`). Réutilise le couple `target_type`/`target_id` déjà
employé par `visit_media` et `visit_seen_*`.

**Côté plan.** Entrée par lien profond `?parcours=<slug>` (QR à l'accueil) ou par une chip
« Parcours » qui liste ceux publiés pour la surface `plan`. En mode parcours, la feuille basse
montre l'étape courante (titre, texte, distance si GPS), la carte recadre sur l'étape, les autres
lieux sont masqués sauf les étapes (numérotées 1, 2, 3 sur le plan). « Y aller » pointe vers
l'étape courante. Rien n'est enregistré ; la position dans le parcours est mémorisée sur
l'appareil seulement.

**Côté ForetMap (administration).** Un sous-onglet « Parcours » dans Réglages → Carte : liste,
création, réordonnancement des étapes par glisser-déposer (le pattern existe pour les photos),
choix des lieux par la recherche partagée, cases « visible sur : plan / visite », bouton
**« Exporter en PDF »** — une page par parcours avec la liste des étapes et un **QR code** vers le
lien profond, imprimable pour l'accueil (`pdfkit` est déjà une dépendance, utilisée pour les
tutoriels ; un générateur de QR sans dépendance externe ou une petite bibliothèque MIT est à
citer au moment du choix). Permission : `zones.manage`.

**Ce que gagnent les autres apps.** La Visite peut proposer un parcours comme **visite guidée
ordonnée** (aujourd'hui elle n'a que des cibles plates, `docs/VISIT_MAP_GEOMETRY.md`), la mascotte
marchant d'étape en étape ; ForetMap peut ouvrir un parcours comme **feuille de séance** (« les
cinq zones à voir aujourd'hui ») dans la vue Cartes & tâches. Les tables, l'API et l'éditeur
sont les mêmes ; seul le rendu diffère.

### 8.7 Accès paramétrable : une garde partagée

Réglage `ui.plan.access_mode` = `public` (défaut) ou `code`. En mode `code`, un code
d'établissement (quelques caractères, changeable) est stocké **haché** dans les réglages admin ;
le visiteur le saisit une fois, reçoit un cookie signé HMAC (le mécanisme existe déjà pour la
progression anonyme de la Visite, `routes/visit.js:26-83`, avec `VISIT_COOKIE_SECRET`), valable
30 jours, et l'endpoint agrégé refuse sans cookie. Un lien profond peut porter le code
(`?code=…`) pour que les QR codes internes fonctionnent sans saisie.

Généralisation : `lib/accessGate.js` (création et vérification du cookie, comparaison du code en
temps constant, limitation des essais par `lib/rateLimit.js`) et un composant
`shared/components/AccessCodeGate.jsx`. La **Visite invitée** de ForetMap peut alors passer du
tout-ou-rien `allow_guest_visit` à `public` / `code` / `off`, et GL dispose du même verrou pour
une partie ouverte aux invités.

### 8.8 Hors ligne pour toutes les apps : ce qui existe, ce qu'il faut

**État réel.**

| Produit  | Manifest                                         | Service worker                                                                                                                                                                                                                                                                                                         | Verdict                                        |
| -------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| ForetMap | `public/manifest.json` (nom, icônes, raccourcis) | `public/sw.js` v8, écrit à la main : précache statique, HTML network-first avec `offline.html`, API zones/plantes/repères/tâches network-first, `/api/maps` et `/api/visit/content` stale-while-revalidate, JS/CSS network-first, images cache-first ; enregistré dans `src/main.jsx:19-50` avec rechargement contrôlé | installable, consultation hors ligne partielle |
| GL       | aucun                                            | aucun (`src/gl/` ne référence ni `serviceWorker` ni `manifest.json`)                                                                                                                                                                                                                                                   | rien                                           |
| Plan     | à créer                                          | à créer                                                                                                                                                                                                                                                                                                                | —                                              |

Le SW ForetMap est servi **à tous les hosts** (`server.js:302-310`, `Service-Worker-Allowed: /`)
mais n'est enregistré que par `src/main.jsx` ; comme chaque host est une origine distincte, le
cache du navigateur est déjà cloisonné par produit. Le vrai problème est que sa liste de
précache est statique et que la stratégie est codée en dur pour ForetMap.

**Proposition : un service worker généré par produit à partir d'un gabarit commun.**

- Un gabarit `src/shared/pwa/sw-template.js` paramétré par un objet `{ product, cacheName,
precache[], htmlEntry, apiStrategies[] }` ; la stratégie « HTML network-first + `offline.html` »,
  « JS/CSS network-first », « images cache-first » et « API stale-while-revalidate » sont les
  fonctions déjà écrites dans `public/sw.js`, extraites telles quelles.
- Au build, un script `scripts/build-pwa.js` (enchaîné par `build-safe.js`, comme les
  `sync-*-lib`) lit le manifeste Vite (`build.manifest: true`) et produit `dist/sw-foret.js`,
  `dist/sw-gl.js`, `dist/sw-plan.js` avec la **liste exacte des bundles hachés** de chaque entrée
  — fini la liste manuelle et le network-first sur JS/CSS (des fichiers hachés peuvent passer en
  cache-first), et `dist/manifest-<product>.webmanifest` avec nom, icônes, `start_url`, `scope`
  et couleur de thème propres.
- Côté serveur, `/sw.js` et `/manifest.json` deviennent des routes qui choisissent le fichier
  selon le produit résolu par le host (`lib/productResolver.js`), avec `no-store` sur le SW.
  L'enregistrement dans chaque `main.jsx` reste identique (`withAppBase('/sw.js')`).
- Par produit, ce qui est mis en cache :
  - **Plan** : l'image du plan, `GET /api/plan/content`, les photos principales (cache-first
    borné en nombre), les parcours publiés. Bandeau « Hors ligne — plan mémorisé ».
  - **ForetMap** : l'existant, plus les images de cartes, moins le network-first sur les bundles
    hachés. Les écritures hors ligne (tâches, observations) restent hors périmètre ; la file
    « vu » de la Visite (`src/utils/visitProgressClient.js`) est le modèle si un jour on veut
    les mettre en file.
  - **GL** : les plateaux, sprites et musiques de la partie en cours, `/api/gl/*` en lecture
    (chapitres, lore, marché) en stale-while-revalidate ; les actions de jeu (dés, achats, QCM)
    exigent le réseau et l'affichent clairement. Une PWA GL installable sur tablette est un gain
    immédiat en classe, même sans écriture hors ligne.

Réponse à la question posée : **oui, c'est possible pour les autres apps**, et c'est même plus
simple de le faire une fois pour trois que de laisser un SW manuel par produit. Le lot 0 pose
le gabarit et les routes ; chaque produit branche sa configuration quand il est prêt.

### 8.9 Compteur d'usage : anonyme, partagé, utile aux contenus

**Principe.** Aucun identifiant, aucun cookie, aucune adresse IP conservée. Le client envoie des
**événements nommés** par `navigator.sendBeacon('/api/usage', …)` (ne bloque rien, part même à
la fermeture de l'onglet) ; le serveur **agrège par jour** dans une table
`usage_counters (day, product, event, key, count)` avec `INSERT … ON DUPLICATE KEY UPDATE
count = count + 1`. Limitation par `lib/rateLimit.js`, corps borné, liste blanche des noms
d'événements par produit (sinon 400), `key` limité à 64 caractères et normalisé.

**Événements du plan** : `open` (ouverture), `search` (une recherche, sans le texte),
`search_empty` (**avec** le texte normalisé, c'est ce qui alimente les alias : « bibli » sans
résultat trois fois par semaine devient un alias de « CDI »), `place_open` (`key` = id du lieu),
`locate` (bouton « Me situer »), `go` (« Y aller »), `route_start` / `route_step` (parcours),
`offline_view`.

**Pour les autres apps** : ForetMap compte les ouvertures d'onglets et de fiches (quel écran est
réellement utilisé — l'audit d'homogénéité en avait besoin pour arbitrer les 13 entrées de la
navigation), GL compte les entrées de chapitres et les usages de sorts. Le tableau de bord admin
(Réglages → Usage) montre les compteurs par jour et par produit, avec export CSV via `exceljs`
déjà présent ; la liste des `search_empty` du plan devient un bouton « créer l'alias ».

Ce compteur ne remplace pas `GET /api/visit/stats` (qui mesure des sessions et des parcours
complets, avec identité élève) : il est plus pauvre par construction, et c'est ce qui le rend
acceptable partout sans consentement.

### 8.10 Ce que chaque app gagne

| Brique (où elle vit)                                                       | ForetMap (carte de travail)                        | Visite                                         | GL                                                                        | Plan Lyautey                     |
| -------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Noyau carte `src/shared/pct-map/` : bornes, double-tap, inertie, pinch+pan | oui, remplace `useMapGestures` (688 l.)            | oui, remplace le pan/zoom de `visit-views.jsx` | pinch-zoom sur les plateaux (`GLPctMapCanvas.jsx`, sans zoom aujourd'hui) | cœur                             |
| Désencombrement des repères (§8.3)                                         | oui (E4, D2 de l'audit UI)                         | oui                                            | plateaux denses                                                           | cœur                             |
| Étiquettes : pôle d'inaccessibilité, collisions, halo                      | oui                                                | oui                                            | feuillets zones                                                           | oui                              |
| Feuille basse à crans (`shared/components/BottomSheet`)                    | fiche de lieu sur mobile à la place de la modale   | fiche de lieu                                  | fiches de repères, marché                                                 | cœur                             |
| Visibilité par surface et alias (§8.4)                                     | carte moins encombrée, recherche plus tolérante    | remplace à terme `visit_*.is_active`           | —                                                                         | cœur                             |
| Registre des produits, SW et manifest par produit (§8.8)                   | SW à jour automatiquement, bundles hachés en cache | idem                                           | **PWA installable**, plateaux hors ligne                                  | PWA hors ligne                   |
| Garde d'accès (§8.7)                                                       | Visite invitée : public / code / off               | idem                                           | parties invitées sous code                                                | accès paramétrable               |
| Parcours (§8.6)                                                            | feuille de séance                                  | visite guidée ordonnée                         | —                                                                         | cœur                             |
| Compteur d'usage (§8.9)                                                    | usage réel des onglets                             | ouvertures de fiches                           | chapitres, sorts                                                          | recherches sans résultat → alias |
| Graphe de chemins (§8.5, lot 10)                                           | chemins du jardin, distances                       | —                                              | unifie le « chemin numéroté » des plateaux                                | vrai routage                     |
| Position GPS découplée de la mascotte                                      | « Me suivre » sans mascotte visible                | guidage sur le terrain (aujourd'hui absent)    | —                                                                         | point bleu                       |

Règle de construction pour tenir cette promesse : **aucune brique nouvelle ne vit dans
`src/plan/`** si elle n'est pas spécifique au plan. Le shell plan assemble ; tout ce qui se
généralise part dans `src/shared/`, `lib/` ou le registre des produits, avec ses tests, et
ForetMap l'adopte dans le même lot ou le suivant.

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
- Pas de maquette visuelle : les décisions étant prises, c'est l'étape suivante, sur le canevas de
  design partagé pour être retouchée à la main.
- Les décisions du §8.1 sont celles du propriétaire du projet ; les propositions §8.2 à §8.9 restent
  à valider avant le lot correspondant.
