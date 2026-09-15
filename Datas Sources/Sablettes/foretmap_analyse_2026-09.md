# ForêtMap — analyse fine (v1.156.8) et dossier « littoral atlantique »

_Audit réalisé le 15/09/2026 sur l'instance publique foretmap.olution.info (bundles front, service worker, en-têtes HTTP, endpoints publics `/api/zones`, `/api/plants`, `/api/maps`, `/api/map/markers`, `/api/visit/content`, `/api/tutorials`, `/api/quiz/categories`). Périmètre : tout ForêtMap **hors Gnomes & Licornes** (routes `/api/gl/_`, tables `gl\__`, assets GL ignorés). Aucun endpoint authentifié n'a été sollicité._

---

## 1. Ce que l'application est aujourd'hui

ForêtMap est une SPA React (build Vite/rolldown, 63 chunks), servie par un backend Node/Express avec temps réel Socket.IO, installable en PWA (service worker généré par `scripts/build-pwa.js`, raccourcis « Carte » et « Mes tâches »). L'authentification combine comptes locaux, Google OAuth et LTI (Moodle), avec RBAC par profils, impersonation admin et journal d'audit.

Les grands domaines fonctionnels repérés dans les routes API :

| Domaine      | Routes / modules                                                                                                     | Rôle                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Cartographie | `/api/maps`, `/api/zones`, `/api/map/markers`, `/api/map-routes` (+ PDF), `/api/map-categories`                      | 7 cartes (dont 3 littorales inactives), zones polygonales, repères, parcours, géoréférencement GPS / boussole |
| Biodiversité | `/api/plants` (+ autofill, PlantNet, photos, interactions, import), `FoodWebGraph`, `/api/food-web`                  | 230 fiches « êtres vivants », réseau trophique                                                                |
| Pédagogie    | `/api/tasks`, `/api/task-projects`, `/api/tutorials`, `/api/quiz`, `/api/glossary`, `/api/learning-links` (+ gating) | tâches de jardinage validées, 24 tutoriels, 16 catégories de quiz, glossaire, verrous d'apprentissage         |
| Visite       | `/api/visit/*`, mascottes (sprites, Rive), `GuidedTourOverlay`                                                       | mode visiteur/parents, visite guidée, progression                                                             |
| Social       | `/api/forum`, `/api/context-comments`, `/api/user-journal`                                                           | forum, commentaires contextuels, journal utilisateur                                                          |
| Pilotage     | `/api/stats`, `/api/audit`, `/api/admin/usage`, `/api/settings/admin/system/*`                                       | statistiques, exports, diagnostics, logs, redémarrage                                                         |

C'est un outil déjà très riche. Les marges de progrès portent moins sur « ajouter des écrans » que sur la **qualité des données**, la **performance réseau**, la **conformité** et surtout le **passage d'une app de jardin à une app de terrain** (relevés, protocoles, littoral).

---

## 2. Constats et optimisations techniques

### 2.1 Performance — gains immédiats

**API non compressée (priorité 1).** `/api/plants` part en clair : 423 Ko sans `Content-Encoding`, alors que les assets statiques sont servis en Brotli. S'y ajoutent `/api/zones` (257 Ko), `/api/map/markers` (114 Ko) et `/api/visit/content` (115 Ko), soit environ 900 Ko de JSON brut au chargement d'une carte. Activer `compression()` dans Express (ou `mod_deflate` côté cPanel/Passenger) divise ce volume par 6 à 8. C'est une ligne de code et le gain le plus fort de tout l'audit, surtout en 4G dans la cour ou sur le terrain.

**Pas de `Cache-Control` sur l'API.** Les ETag faibles existent : il suffit d'ajouter `Cache-Control: private, no-cache` pour que le navigateur revalide en 304 au lieu de retélécharger.

**Payloads trop larges.** La carte n'a pas besoin des 45 champs de chaque fiche. Proposer `GET /api/plants?fields=id,name,emoji,photo,map_ids` pour la liste et charger la fiche complète au clic. Dans `/api/zones`, `points` est une chaîne JSON encodée dans du JSON (double sérialisation, coordonnées à 14 décimales) : renvoyer un tableau natif arrondi à 2–3 décimales en pourcentage suffit largement.

**Bundle initial.** `main.js` pèse 485 Ko minifié et 22 chunks sont préchargés, dont des éléments inutiles à un visiteur anonyme : `MarkdownTextarea` (éditeur), `journalUi`, `socket-io`, `spriteCutCatalogEntry` (120 Ko), `downloadAuthedFile`. La feuille `visitMascotPackExtras.css` fait 249 Ko à elle seule. Pistes : charger Socket.IO seulement après authentification, lazy-loader les éditeurs derrière les routes admin/enseignant, purger ou découper la CSS mascotte.

**Service worker.** `/api/zones` et `/api/plants` sont en _network-first_ : hors ligne, ça fonctionne, mais en réseau lent l'utilisateur attend le timeout. Pour des données qui changent peu, _stale-while-revalidate_ (comme `/api/maps`) serait plus fluide. Le précache inclut `/pwa-screenshot-*.png` (inutile en cache) et `/index.vite.html` (à vérifier).

### 2.2 Sécurité et conformité (RGPD / protection des mineurs)

La CSP stricte est en **report-only** ; seule `img-src` est appliquée. Après analyse des rapports `/api/csp-report`, il faut basculer en mode appliqué.

Google Fonts est chargé depuis `fonts.googleapis.com` : l'IP de chaque élève est transmise à Google. Auto-héberger Playfair Display et DM Sans (comme la police emoji l'est déjà) règle la question RGPD et retire une dépendance CSP.

`/robots.txt` renvoie le HTML de la SPA (fallback) : servir un vrai fichier. Côté bonnes nouvelles, les endpoints sensibles testés (`forum`, `stats`, `audit`, `site-issues`) répondent bien 401 à un anonyme.

Rappel de l'existant, toujours valable : noms réels et emails institutionnels dans le dump, d'où l'intérêt d'un script de dump anonymisé versionné dans le dépôt, ainsi que les deux chantiers déjà identifiés (dates `varchar(32)` → `DATETIME`, `audit_log` en `latin1`).

### 2.3 Qualité des données — le vrai chantier

Sur les 230 fiches de `/api/plants` :

| Problème                               | Constat                                                                             | Correctif proposé                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Règne incohérent                       | « Végétaux » (5), « Animaux » (1), `NULL` (7) à côté de « Végétal (Chlorobiontes) » | ENUM normalisé + migration                                                                                                    |
| Rang taxonomique bilingue              | `espece`/`species`, `genre`/`genus`, `ordre`/`order` ; 82 `NULL`                    | ENUM anglais (convention GBIF), libellé FR côté UI                                                                            |
| Objets non vivants typés comme espèces | Bois mort, Compost, Litière, Crottes, Fruits tombés, Carton, Biofilm                | nouvelle colonne `entity_kind` : `organisme` / `matiere_organique` / `communaute` — ils restent des nœuds du réseau trophique |
| Textes sans accents                    | 6 fiches (« Sous-espece… l abeille »)                                               | passe de correction                                                                                                           |
| Statut biogéographique absent          | aucune distinction indigène / introduit / envahissant                               | colonnes `origin_status` et `iucn_status` (voir §3)                                                                           |
| Photos d'organes                       | feuille manquante 209/230, fleur 201, fruit 221                                     | campagne photo élèves (tâche validable)                                                                                       |
| Espèces non placées                    | 183/230 sans `map_ids`                                                              | lier les fiches aux zones, ou afficher « observée dans l'établissement »                                                      |
| Cycle de vie                           | 80 vides                                                                            | complétion via autofill                                                                                                       |

Sur les 104 zones : 74 sans espèce, 63 sans texte de visite. Les trois cartes littorales (Sablettes, Dayat, Oued Melah) totalisent 30 zones **toutes vides**, avec des coquilles à corriger : « Tiphaie » → Typhaie, « Marée à végétation basse » → **Mare** à végétation basse, « pavillonaire » → pavillonnaire, et « Dayat de **Darb Ouazza** » → Dar Bouazza. Plusieurs noms sont dupliqués (Typhaie, Ceinture de joncs, Plateau est, Fond de vallée) : si ce sont des polygones disjoints d'un même habitat, un support **multipolygone** évitera les doublons dans la recherche et les statistiques. La carte N³ n'est pas géoréférencée alors que les autres le sont.

Les 24 tutoriels contiennent environ 8 paires quasi-doublons (« Rempotage » / « Le rempotage », « Compostage » / « Le compostage », « Semences » / « Les semences »…) : à fusionner, ou à assumer explicitement comme versions « élève » / « enseignant » avec un champ `audience`.

Côté contenu vivant, la présence de la **Gambusie** et du **Tilapia du Nil** en aquaponie est une excellente accroche pédagogique… à condition que la fiche dise que ce sont des espèces introduites, la gambusie figurant parmi les poissons envahissants les plus répandus au monde. D'où l'importance de `origin_status`.

---

## 3. Regard pédagogique (lycée, et collège pour n³)

L'app sait déjà **montrer** et **faire faire** (tâches validées). Ce qui manque pour coller aux programmes, c'est **faire mesurer et raisonner**.

En Seconde (« Biodiversité, résultat et étape de l'évolution »), les élèves doivent estimer une biodiversité, utiliser des méthodes d'échantillonnage et calculer des indices. En Terminale spécialité SVT, les thèmes sur les écosystèmes (interactions, dynamique, services écosystémiques et leur gestion) demandent de mobiliser des données réelles. En Enseignement scientifique, l'exploitation de données et le regard critique sur les sources sont centraux. ForêtMap possède le socle (espèces, zones, réseau trophique) mais pas encore l'outil de **relevé structuré** qui transforme une sortie en données exploitables.

Recommandations transversales : indexer chaque ressource (tutoriel, quiz, tâche, zone) par notion de programme et compétence travaillée ; faire du réseau trophique un exercice (construire, puis retirer une espèce et prédire l'effet) plutôt qu'un simple graphe ; exploiter le gating existant pour débloquer une sortie littorale après le module sécurité/marées.

---

## 4. Nouvelles fonctionnalités proposées (par ordre de valeur)

**4.1 Module « Relevé de terrain » (hors ligne).** Protocoles paramétrables : quadrat, transect, comptage point fixe (oiseaux), capture-recapture simulée. Chaque relevé = site, date, heure de marée, observateurs (groupe), liste espèce × abondance × photo. Fonctionne sans réseau (IndexedDB + synchronisation), ce que le SW rend déjà possible. Tables suggérées : `survey_protocols`, `surveys`, `survey_observations`.

**4.2 Indices calculés automatiquement.** À partir des relevés : richesse spécifique, Shannon H′, Simpson, équitabilité de Pielou, comparaison entre sites ou entre années. C'est littéralement le programme de Seconde, avec les données des élèves.

**4.3 Étagement littoral sur les cartes côtières.** Nouveau champ de zone `tidal_level` (supralittoral / médiolittoral supérieur, moyen, inférieur / infralittoral) et une vue « coupe d'estran » générée à partir des espèces associées. Couplé à un **indicateur de marée** (heure et coefficient de basse mer pour Casablanca/Mohammedia, saisi par l'enseignant ou importé) qui conditionne l'ouverture de la sortie.

**4.4 Statuts écologiques sur les fiches.** Badges « endémique du Maroc », « introduite », « envahissante », statut UICN, « protégée », « bio-indicatrice ». Filtre carte correspondant.

**4.5 Export Darwin Core.** Les observations validées par l'enseignant exportées en CSV Darwin Core, pour contribuer à GBIF ou à un partenaire scientifique (GREPOM, GOMAC). Sciences participatives réelles, valorisable pour le label e-nov.

**4.6 Phénologie.** Calendrier de présence (ex. faucon d'Éléonore présent d'avril à octobre, hivernants, floraisons) et courbes issues des relevés d'une année sur l'autre.

**4.7 Identification élargie.** PlantNet est déjà branché pour les plantes ; ajouter une clé de détermination simplifiée (arbre de questions) pour les invertébrés d'estran, plus pédagogique qu'une IA.

**4.8 Accessibilité.** Texte alternatif obligatoire à l'upload photo, contraste des polygones, navigation clavier sur la carte (RGAA).

---

## 5. Dossier littoral atlantique marocain (Essaouira → Tanger)

### 5.1 Les trois sites déjà cartographiés

**Plage des Sablettes et oued Nfifikh (Mohammedia).** Le littoral de Mohammedia alterne plages sableuses et platiers rocheux, traversé par les oueds El Maleh et Nfifikh ; la zone humide d'Oued El Maleh (~1 200 ha) est un site Ramsar depuis 2005. L'estuaire du Nfifikh est un cas d'étude fort : débit très faible pouvant s'annuler l'été, ensablement de l'embouchure, rejets d'eaux usées et mortalités de poissons signalées en 2022. Des Grandes Aigrettes y ont été observées près de l'estuaire et le Héron cendré niche à Mohammedia. Thème pédagogique : pollution, eutrophisation, bio-indicateurs, comparaison amont/aval.

**Daya de Dar Bouazza.** Dernière zone humide naturelle du Grand Casablanca, relique d'un plan d'eau autrefois bien plus vaste, située sur la grande voie migratoire Europe–Afrique. Plus de 180 espèces d'oiseaux y ont été observées (dont la Sarcelle marbrée, vulnérable), plus de 130 invertébrés, et six amphibiens dont le Discoglosse peint endémique du Maroc. Le site est déjà utilisé pour des sorties scolaires et fait l'objet de pressions foncières. Thème : zones humides, migration, services écosystémiques, conflits d'usage.

**Vallée de l'oued Melah.** À relier au site Ramsar d'Oued El Maleh ; les zones (plateaux, versants, fond de vallée, oued) se prêtent à un transect de végétation perpendiculaire au cours d'eau.

### 5.2 Autres sites de référence de la façade

L'archipel d'Essaouira-Mogador, Réserve biologique depuis 1980 et SIBE, accueille la plus grande colonie mondiale de faucon d'Éléonore (de 60 couples en 1980 à environ 1 500), avec une petite colonie continentale sur les falaises au nord de Salé. Les lagunes de Merja Zerga, Sidi Moussa et Oualidia (sites Ramsar) abritent les herbiers de zostère naine, espèce en déclin mondial. Le platier d'El Jadida / Sidi Bouzid est le site de référence pour les algues rouges et l'invasion par _Sargassum muticum_.

### 5.3 Inventaire de travail

Le fichier `littoral_inventaire.csv` joint (109 taxons, dont 44 documentés ; statuts UICN = évaluation mondiale) reprend les colonnes de `/api/plants` pour faciliter l'import. Chaque ligne porte une colonne `niveau_preuve` : **documenté** (source citée) ou **attendu** (espèce commune de la façade, à confirmer sur le terrain). Les `gbif_key` sont volontairement vides pour passer par l'autofill de l'app plutôt que de risquer une clé erronée.

Points saillants à intégrer dans les fiches :

- **Moules** : _Mytilus galloprovincialis_ domine les estrans d'El Jadida à Essaouira ; ses bancs abritent une faune d'amphipodes et d'isopodes dont la richesse chute de 25 à 50 % sur les stations polluées, ce qui en fait un bon indicateur. _Perna perna_ est présente plus au sud (Agadir) et à rechercher localement.
- **Algues** : _Gelidium sesquipedale_ (aujourd'hui _G. corneum_) est l'algue à agar surexploitée ; _Sargassum muticum_, signalée pour la première fois en Afrique sur la côte des Doukkala, prolifère notamment dans les secteurs pollués et profite de la surexploitation du gélidium. Les _Cystoseira_ (dont _C. tamariscifolia_), _Fucus spiralis_ et _Gelidium sesquipedale_ font partie du fonds atlantique marocain.
- **Épifaune** : sur les sargasses, les gastéropodes _Steromphala umbilicalis_, _S. pennanti_, _Rissoa parva_ et l'isopode _Dynamene bidentata_ sont caractéristiques.
- **Polychètes** : le Maroc compte une _Diopatra_ décrite de ses côtes, _D. marocensis_, très abondante.
- **Sanitaire** : des _Vibrio_ et _Salmonella_ ont été isolés dans des moules sauvages entre Agadir et Essaouira. Argument supplémentaire, avec la protection des milieux, pour la règle « on observe, on ne ramasse pas ».

### 5.4 Charte de sortie (cohérente avec la règle « pas de cueillette »)

Aucun prélèvement de coquillages, d'algues ou d'animaux ; les pierres retournées sont remises dans leur sens d'origine ; photo plutôt que récolte ; sortie calée sur la basse mer avec retour avant l'étale, jamais sur un platier isolé par la marée ; pas de dérangement des oiseaux (distance, silence), en particulier des hérons nicheurs et des limicoles en halte. Les textes de visite des cartes littorales doivent suivre le même registre que la forêt : ni « goûter », ni « ramasser ».

### 5.5 Sources principales

Go-South Bulletin 14 (2017) et 15 (2018) sur les oiseaux et l'herpétofaune de Dar Bouazza ; GREPOM (suivi du faucon d'Éléonore, 2021) ; Sabour et al. 2013, _Aquatic Invasions_ (Sargassum) ; Regional Studies in Marine Science 2024 (crustacés des bancs de moules, Azemmour–Essaouira) ; Gillet 2017, Institut scientifique de Rabat (polychètes) ; thèse Bououarour (herbiers de _Zostera noltei_) ; Mannas et al. 2014, _SpringerPlus_ (Vibrio/Salmonella) ; CHM-CBD Maroc (algues marines, faune marine) ; presse régionale 2022 (oued Nfifikh).

---

## 6. Feuille de route suggérée

| Sprint        | Contenu                                                                                              | Nature                            |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1 (½ journée) | compression API, Cache-Control, robots.txt, Google Fonts auto-hébergées                              | code (Claude Code)                |
| 2             | normalisation taxonomique, `entity_kind`, `origin_status`, `iucn_status`, correction coquilles zones | migrations SQL documentées + code |
| 3             | import de l'inventaire littoral, textes de visite des 3 cartes, activation des cartes                | contenu                           |
| 4             | module Relevé de terrain + indices de biodiversité                                                   | fonctionnalité                    |
| 5             | étagement littoral, marées, charte de sortie gatée                                                   | fonctionnalité + pédagogie        |
| 6             | export Darwin Core, phénologie, CSP appliquée, dump anonymisé                                        | consolidation                     |
