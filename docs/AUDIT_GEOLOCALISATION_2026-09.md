# Audit du système de géolocalisation (septembre 2026)

> **Statut : audit seul, sans modification de code.** Relevé effectué sur la tête de la
> branche d'audit (base `main`, merge PR #386, `package.json` 1.137.4), par lecture
> exhaustive du code, des migrations, des tests et de la documentation. Chaque constat
> porte une référence `fichier:ligne` vérifiable. Ce que le système fait bien est signalé
> aussi — et il y en a beaucoup.
>
> Périmètre : tout ce qui touche à la géolocalisation dans le monorepo — suivi GPS de la
> mascotte sur la carte de travail, calage GPS des plans (outil prof), parsing de
> coordonnées, API et stockage. Vérification faite : **aucun autre usage de la
> géolocalisation n'existe** (ni côté Visite, ni côté GL — les correspondances `grep`
> dans `routes/rbac.js`, `students.js`, `auth.js` sont des faux positifs sur
> « existin`gPs`eudo »).

---

## 1. En une page

Le système de géolocalisation est **petit, bien découpé et bien testé** : ~700 lignes de
code réparties en couches nettes (acquisition capteur → transformation affine → suivi
mascotte → UI), ~730 lignes de tests sur 8 fichiers, une API validée des deux côtés, et
une propriété de confidentialité forte tenue de bout en bout : **la position de l'élève ne
quitte jamais son appareil**.

Trois constats méritent une action, un seul est sérieux :

1. **La validation des ancres ignore toujours le repère géographique** (C1, majeur).
   C'est la reprise du §3.1 de `docs/AUDIT_BDD_2026-08.md` : un calage dont les points GPS
   sont quasi confondus ou incohérents en échelle passe la validation serveur comme la
   validation front, et produit une transformation absurde. Le cas s'est **déjà produit en
   production** (carte `foret`, facteur 26 entre échelles implicites). Le recalage terrain
   est réservé au propriétaire du projet, mais le **garde-fou côté code** — la partie
   « contrôle de plausibilité d'échelle » du point 1 du plan d'action d'août — n'exige
   aucun relevé de terrain et n'a jamais été livré.

2. **Deux erreurs d'acquisition sont invisibles pour l'élève** (C2, moyen) : en cas de
   `POSITION_UNAVAILABLE` ou `TIMEOUT`, la bannière affiche « Acquisition de la position
   GPS… » indéfiniment — le message d'erreur existe dans le hook mais n'est consommé nulle
   part.

3. **Une position périmée peut être rejouée à la réactivation du suivi** (C3, mineur),
   et un calage dégénéré s'affiche comme « vous êtes hors zone » (C4, mineur), ce qui
   oriente l'élève vers un faux diagnostic.

Le reste est de l'ordre du signalement : ancres GPS exposées sans authentification
(acceptable pour un établissement public, à garder en tête — C5), micro-optimisations
possibles (C6, C7), pas d'e2e sur le flux GPS (C8).

---

## 2. Cartographie du système

Le flux complet, de l'écran du prof au déplacement de la mascotte :

| Couche              | Fichier                                      | Rôle                                                                                       |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Stockage            | `migrations/148_map_georef.sql`              | `maps.geo_anchors_json` (3 ancres `{xp,yp,lat,lng}`), `maps.gps_enabled`                   |
| Validation serveur  | `lib/mapGeoref.js`                           | bornes, non-colinéarité (repère %), tolérance chaînes, normalisation API (`withMapGeoref`) |
| API écriture        | `routes/settings.js:463-506`                 | `PUT /api/settings/admin/maps/:id/georef` (permission `admin.settings.write`)              |
| API lecture         | `routes/maps.js:11-37`                       | `GET /api/maps` (public, cache mémoire 20 s, repli si colonnes absentes)                   |
| Transformation      | `src/utils/mapGeoTransform.js`               | affine 3 points géo↔% (Cramer 3×3), bornes du plan                                         |
| Parsing de saisie   | `src/utils/geoCoordParse.js`                 | décimal FR, DMS, hémisphères, paires collées, URLs Google Maps / OSM                       |
| Acquisition capteur | `src/hooks/useGeolocation.js`                | `watchPosition` démarré/arrêté explicitement, statuts, **jamais d'envoi serveur**          |
| Suivi mascotte      | `src/hooks/useMascotGpsFollow.js`            | seuil de précision 50 m, marge hors-zone 5 %, conversion + `moveTo`                        |
| UI élève            | `src/components/map/MapViewToolbar.jsx:379`  | bouton « 📍 Me suivre » (rendu seulement si plan éligible)                                 |
| UI élève            | `src/components/MascotGpsStatusBanner.jsx`   | bannière de statut (actif / refusé / hors zone / signal faible)                            |
| Outil prof          | `src/components/settings/MapGeorefPanel.jsx` | pose des 3 repères au clic, saisie tolérante, « Ma position », aperçu de contrôle          |
| Branchement         | `src/components/map-views.jsx:327-331`       | éligibilité : `gps_enabled` **et** mode `view` **et** mascotte visible                     |

Documentation à jour et cohérente avec le code : `docs/API.md:657` (lecture),
`docs/API.md:887` (écriture), `docs/reference/foretmap/carte-et-zones.md` (calage et
formats de saisie, §« Comment saisir les coordonnées du calage »),
`docs/reference/foretmap/visite-et-mascottes.md:255` (la Visite n'a volontairement pas de
guidage GPS). Aucun marqueur « 🔧 À implémenter » ne concerne la géolocalisation.

---

## 3. Ce qui est bien fait

- **Confidentialité par construction.** La position de l'élève reste 100 % côté client :
  `useGeolocation.js` et `useMascotGpsFollow.js` ne font aucun appel réseau, et l'audit
  d'écriture du calage ne journalise que `has_anchors`/`gps_enabled`, jamais de
  coordonnées (`routes/settings.js:500-503`). La seule remontée de coordonnées vers le
  serveur est le calage posé par le prof — c'est l'objet même de la fonctionnalité.
- **Double défense sur `gps_enabled`.** À l'écriture, le flag est forcé à `false` sans
  ancres valides (`routes/settings.js:491`) ; à la lecture, `withMapGeoref` le force à
  nouveau si le JSON stocké ne parse pas ou n'est plus valide (`lib/mapGeoref.js:102`).
  Un état incohérent en base ne peut pas allumer le bouton côté élève.
- **Validation serveur sérieuse** : exactement 3 points, bornes `xp/yp ∈ [0,100]`,
  `lat ∈ [−90,90]`, `lng ∈ [−180,180]`, non-colinéarité, réduction aux 4 champs attendus
  (`sanitizeAnchors`), tolérance aux chaînes à virgule décimale — filet documenté comme
  tel (`lib/mapGeoref.js:19-34`).
- **Parsing de saisie remarquable** (`src/utils/geoCoordParse.js`) : virgule décimale
  française, DMS avec toutes les variantes typographiques, hémisphères N/S/E/W/O, paires
  collées, URLs Google Maps et OpenStreetMap — avec un principe explicite et tenu :
  « ne jamais deviner », `48,85` n'est jamais lu comme une paire. C'est la réponse
  directe au §3.1.b de l'audit BDD (longitude au signe probablement inversé, saisie
  `Number(...)` trop permissive) et elle est convaincante.
- **Choix mathématique adapté et documenté** : une affine à 6 paramètres absorbe
  translation, échelle anisotrope (donc le facteur cos(lat) du plan local), rotation et
  cisaillement — pour un site de quelques centaines de mètres, c'est le bon outil, et le
  commentaire d'en-tête de `mapGeoTransform.js` explique pourquoi.
- **Dégradé propre en tout point** : repli SQL si les colonnes de la migration 148
  manquent (`routes/maps.js:21-26`), `supported` masque toute l'UI GPS sans capteur,
  `moveTo` re-clampe la position au viewport (`useMapViewMascot.js:184`), la marge de
  5 % évite de perdre la mascotte en bord de plan pour quelques mètres de dérive GPS.
- **Cycle de vie du capteur maîtrisé** : `watchPosition` ne démarre qu'à la demande,
  `clearWatch` au stop et au démontage, pas de double démarrage
  (`useGeolocation.js:52`).
- **Couverture de test réelle** (~730 lignes, 8 fichiers) : identité et inversibilité de
  la transformation (`tests/map-geo-transform.test.js`), validation d'ancres
  (`tests/map-georef-anchors.test.js`), API complète — 401, 400 colinéaire, aller-retour,
  conservation quand `anchors` est omis, coordonnées en chaîne, `gps_enabled` forcé
  (`tests/settings-maps-georef.test.js`), hooks (`tests-ui/hooks/useGeolocation.test.js`,
  `useMascotGpsFollow.test.js`), parsing (`tests-ui/utils/geoCoordParse.test.js`), UI
  (`tests-ui/components/MapGeorefPanel.test.jsx`, `MascotGpsStatusBanner.test.jsx`).
- **UX prof soignée** : pose des repères au clic avec avance automatique, champs
  `type="text"` + `inputMode="decimal"` (le piège du `type="number"` reformaté par la
  locale est documenté dans le code même, `MapGeorefPanel.jsx:297-299`), erreurs de
  saisie par champ, et un **aperçu de contrôle** (« centre du plan ≈ lat, lng »,
  `MapGeorefPanel.jsx:88-91`) qui est aujourd'hui le seul garde-fou contre un calage
  incohérent — voir C1.

---

## 4. Constats

### C1 — La validation des ancres ignore toujours le repère géographique

**Gravité : majeure. Constat hérité du §3.1 de `docs/AUDIT_BDD_2026-08.md`, toujours
ouvert côté code.**

Les deux validations — front (`src/utils/mapGeoTransform.js:39-42`) et serveur
(`lib/mapGeoref.js:55-57`) — testent la non-colinéarité **uniquement dans le repère % du
plan**. Rien ne contrôle le triangle formé par les trois points **GPS** :

- Deux ancres aux coordonnées GPS identiques (ou quasi identiques) passent la validation
  si leurs positions sur le plan diffèrent. Le système résolu côté front devient alors
  singulier ou quasi singulier : `solve3x3` calcule le déterminant de la matrice
  `[[lng, lat, 1], …]` et le compare à `COLLINEAR_EPSILON = 1e-12`
  (`mapGeoTransform.js:15,56`). Or pour un site scolaire, les écarts de coordonnées sont
  de l'ordre de 10⁻⁴ à 10⁻³ degré : le déterminant « normal » vaut 10⁻⁸ à 10⁻⁶. Un seuil
  **absolu** à 10⁻¹² ne rejette donc que les cas exactement dégénérés, jamais les cas
  quasi dégénérés — qui produisent des coefficients énormes et projettent la mascotte
  n'importe où. L'audit BDD l'a mesuré en production : la carte `foret` avait un
  déterminant cent fois plus proche de la singularité que la carte saine `lyautey`, et un
  facteur **26** entre les échelles implicites de deux paires d'ancres.
- Aucun contrôle de **cohérence d'échelle** : si la paire A→B implique 0,04 m/% et la
  paire A→C 1,14 m/%, aucune affine ne peut réconcilier les trois points, mais le calage
  est accepté sans un mot.

Le plan d'action d'août (point 1) couplait recalage terrain et garde-fou logiciel ; le
point est resté « réservé » car le relevé de terrain appartient au propriétaire du projet
(§8 du même audit). Mais **le garde-fou logiciel est dissociable** et livrable sans
terrain :

**Recommandation.**

1. Côté serveur (`lib/mapGeoref.js`) et côté panneau prof, calculer les distances
   géodésiques approx. (plan local, cos(lat)) des trois paires d'ancres et les échelles
   implicites m/% correspondantes ; **rejeter** (serveur) et **expliquer** (panneau)
   quand le ratio min/max des échelles dépasse un seuil franc (p. ex. 3), ou quand
   l'aire du triangle GPS est quasi nulle rapportée à son périmètre (colinéarité
   relative, pas un epsilon absolu).
2. Dans `solve3x3`, remplacer le seuil absolu par un test **relatif** à l'échelle de la
   matrice (ou normaliser lat/lng autour de leur barycentre avant résolution — meilleure
   stabilité numérique au passage).
3. Afficher dans le panneau l'échelle déduite (« ≈ N m par % de plan », « plan ≈ L×H m »)
   à côté de l'aperçu du centre : un prof voit immédiatement qu'un plan de collège de
   « 4 mètres de large » est absurde.

### C2 — `POSITION_UNAVAILABLE` et `TIMEOUT` sont invisibles pour l'élève

**Gravité : moyenne (UX).**

Dans `useGeolocation.js:66-77`, seuls les refus de permission changent le `status`
(`denied`). Pour `POSITION_UNAVAILABLE` et `TIMEOUT`, le hook pose un message dans
`error`… que **personne ne lit** : ni `MascotGpsStatusBanner.jsx` (qui ne branche que sur
`status` et `feedback`, lignes 26-50), ni `MapViewToolbar.jsx:390-399`. Résultat : un
élève dans un bâtiment ou sans signal voit « ⏳ Acquisition de la position GPS… »
**indéfiniment**, sans aucune indication que l'acquisition a échoué et pourquoi.

**Recommandation.** Soit exposer un statut dédié (`error` distinct de `prompt`), soit
faire afficher `gps.error` par la bannière quand il est non nul et qu'aucune position
n'est encore arrivée. Un test de bannière couvrant ce cas fermerait le trou.

### C3 — Une position périmée peut être rejouée à la réactivation du suivi

**Gravité : mineure.**

`useGeolocation.stop()` (`useGeolocation.js:42-45`) coupe le watch mais **conserve**
`position` (et `error`). Au prochain `toggle()`, l'effet de suivi
(`useMascotGpsFollow.js:63-77`) se déclenche sur le changement de `active` avec l'ancienne
`geo.position` encore en état : la mascotte saute vers une position qui peut dater de
plusieurs minutes (le `maximumAge: 5000` ne borne que le cache du navigateur, pas l'état
du hook), avant que le premier fix frais n'arrive. Le `feedback` précédent réapparaît de
la même façon (il n'est masqué que tant que `active` est faux,
`useMascotGpsFollow.js:84`).

**Recommandation.** Purger `position` (et `feedback`) au `stop()`, ou ignorer dans
l'effet toute position dont le `timestamp` est antérieur au dernier `start()`.

### C4 — Un calage dégénéré s'affiche comme « vous êtes hors zone »

**Gravité : mineure (diagnostic trompeur).**

Quand `geoToPct` retourne `null` — transformation insoluble, le cas produit précisément
par C1 —, `useMascotGpsFollow.js:70-74` classe la situation en `out_of_bounds`, et
l'élève lit « Vous semblez hors de la zone du plan — rapprochez-vous pour réapparaître »
(`MascotGpsStatusBanner.jsx:38-43`). Or il peut être au milieu du site : c'est le calage
qui est en cause, pas sa position. Le message oriente élève **et** prof vers un faux
diagnostic (c'est exactement le symptôme qu'aurait produit la carte `foret` de l'audit
BDD).

**Recommandation.** Distinguer `pct == null` (→ feedback `bad_georef`, message « calage
GPS du plan invalide — signalez-le à un professeur ») de `pct` hors bornes (message
actuel). Trois lignes, un cas de test.

### C5 — Les ancres GPS sont servies sans authentification

**Gravité : à connaître, pas d'action requise aujourd'hui.**

`GET /api/maps` est monté sans aucune garde (`server.js:495`, `routes/maps.js:11` — seul
le middleware global de readiness s'applique) : tout visiteur non connecté obtient
`georef`, donc les coordonnées GPS précises du site. Pour un lycée dont l'adresse est
publique, le risque réel est nul — mais la propriété mérite d'être **documentée comme un
choix** : si un jour un plan géoréférencé concernait un lieu non public (site naturel
sensible, parcelle privée), il faudrait soit conditionner `georef` à une session, soit
l'assumer explicitement. Une phrase dans `docs/API.md:657` suffirait.

### C6 — La transformation est re-résolue à chaque position GPS

**Gravité : négligeable (micro-perf).**

`geoToPct` refait la résolution complète (2 systèmes de Cramer 3×3) à chaque fix
(`mapGeoTransform.js:95-103`), soit environ une fois par seconde en suivi actif. Le coût
est infime ; si l'on y touche un jour, mémoïser `solveAffineFromAnchors` par jeu
d'ancres dans le hook suffit. À ne faire qu'à l'occasion d'un passage sur C1 (la
normalisation autour du barycentre s'implémente au même endroit).

### C7 — Objets recréés à chaque rendu dans les hooks

**Gravité : négligeable (hygiène React).**

`useGeolocation` retourne un objet neuf à chaque rendu (`useGeolocation.js:84`), ce qui
rend instables les dépendances `geo` de `useMascotGpsFollow` (`toggle` recréé, effet de
coupure rejoué à chaque rendu — sans bug, les gardes internes tenant). De même,
`completePoints` dans `MapGeorefPanel.jsx:82` change d'identité à chaque rendu et
invalide le `useMemo` de l'aperçu. Aucun dysfonctionnement observé ; à normaliser si l'on
retravaille ces fichiers, pas avant.

### C8 — Pas de test e2e du flux GPS

**Gravité : mineure (couverture).**

Aucun `e2e/*.spec.js` ne couvre le bouton « Me suivre ». C'est compréhensible (capteur),
mais Playwright sait simuler la géolocalisation nativement
(`context.setGeolocation(...)` + permission `geolocation`) : un scénario « plan calé →
bouton visible → position simulée → la mascotte bouge → position hors zone → bannière »
serait court et fermerait la seule couche non testée de bout en bout. Les tests unitaires
existants couvrent déjà chaque maillon isolément.

---

## 5. Plan d'action proposé

Par rapport bénéfice/effort décroissant. Rien ici ne demande de relevé de terrain — le
recalage de la carte `foret` elle-même reste le point « réservé » de l'audit BDD, entre
les mains du propriétaire du projet.

| #   | Action                                                                                                                                                                              | Gravité     | Effort | Réf.   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------ |
| 1   | Contrôle de plausibilité géographique des ancres : échelles m/% cohérentes, colinéarité **relative** côté GPS, rejet serveur + explication panneau + affichage de l'échelle déduite | **Majeure** | ½ j    | C1     |
| 2   | Surfacer les erreurs `POSITION_UNAVAILABLE`/`TIMEOUT` dans la bannière (+ test)                                                                                                     | Moyenne     | 1 h    | C2     |
| 3   | Feedback `bad_georef` distinct de `out_of_bounds` (+ test)                                                                                                                          | Mineure     | 1 h    | C4     |
| 4   | Purge de la position au `stop()` ou filtre par timestamp (+ test)                                                                                                                   | Mineure     | 1 h    | C3     |
| 5   | Scénario e2e Playwright avec géolocalisation simulée                                                                                                                                | Mineure     | 2 h    | C8     |
| 6   | Une phrase dans `docs/API.md` actant l'exposition publique des ancres                                                                                                               | Info        | 10 min | C5     |
| 7   | (opportuniste) mémoïsation de la transformation + normalisation barycentre ; stabilisation des identités d'objets                                                                   | Négligeable | —      | C6, C7 |

Les points 1 à 4 tiennent dans un seul lot cohérent « robustesse du calage GPS » ; le
point 1 devrait précéder tout recalage terrain de la carte `foret`, pour que la nouvelle
saisie soit contrôlée par la machine au moment où elle est faite.
