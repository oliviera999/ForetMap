# Audit charge serveur — page Biodiversité et écrans de liste (septembre 2026)

> **Rattachement** : complète [`AUDIT_STABILITE_PERF_2026-09.md`](AUDIT_STABILITE_PERF_2026-09.md)
> (point d'entrée stabilité/charge). Les audits précédents ont mesuré le **régime nominal**
> (polling, mémoire, coût par requête authentifiée) et l'ont trouvé sain — « ~10–15 requêtes/min
> par utilisateur actif, très loin du rate limit ». Le présent audit porte sur ce que ce chiffre
> ne couvre pas : le **pic d'ouverture d'un écran de liste**, et en premier lieu le **catalogue
> de biodiversité affiché avec toutes les espèces**.

## 0. Portée, méthode et limites

**Portée.** `routes/plants.js`, `routes/context-comments.js`, `routes/learning-gating.js`,
`routes/glossary.js`, `routes/food-web.js`, `routes/quiz.js`, `routes/observations.js`,
`lib/learningGatingSummary.js`, `lib/learningGatingAcknowledge.js`, `lib/gatingPolicyLoad.js`,
`lib/shared/contextCommentsCore.js`, `database.js` (domaines `sync-state`) ; côté client
`src/components/foretmap-views.jsx` (PlantViewer / PlantManager),
`src/components/biodiv/**`, `src/components/context-comments.jsx`,
`src/hooks/usePlantObservationCounts.js`, `useGatingSummary.js`,
`src/shared/hooks/useLearningGatingSummary.js`.

**Méthode.** Lecture de code et comptage statique des appels HTTP et des requêtes SQL sur le
chemin d'ouverture de chaque écran. Les volumétries viennent du jeu versionné
`sql/biodiv_pedago_seed.sql` et `sql/quiz_foretmap_data.sql` :

| Table                  | Lignes versionnées |
| ---------------------- | ------------------ |
| `plants`               | **78**             |
| `glossary_terms`       | 175                |
| `quiz_questions`       | 131                |
| `species_interactions` | 69                 |

**Limites.** Aucun profilage en production (ni base MySQL de prod, ni `DEPLOY_SECRET` dans la
session d'audit). Les coûts annoncés sont des **comptages de requêtes** et des **ordres de
grandeur**, pas des relevés. Le poids des réponses est calculé en rejouant le jeu versionné
(script d'estimation jetable, non versionné) : il approxime la sérialisation réelle à quelques
pour-cent près. Le catalogue de production peut déjà dépasser 78 fiches — tous les chiffres
ci-dessous sont **linéaires en nombre de fiches**, ce qui est précisément le problème.

---

## 1. Ce que coûte réellement une ouverture du catalogue biodiversité

Le catalogue élève (`PlantViewer`) rend **toutes** les fiches filtrées d'un coup
(`filtered.map(...)`, `src/components/foretmap-views.jsx:726`) — ni pagination, ni
virtualisation. Chaque carte (`PlantBiodiversityCatalogPreviewCard`) déclenche, **au montage et
sans attendre le moindre clic**, six appels API :

| Origine                                                         | Appels HTTP / carte | Requêtes SQL / carte |
| --------------------------------------------------------------- | ------------------- | -------------------- |
| `PlantPedagoFetchedSections` → `/api/plants/:id/interactions`   | 1                   | 3                    |
| `PlantPedagoFetchedSections` → `/api/plants/:id/glossary-terms` | 1                   | 2                    |
| `PlantPedagoFetchedSections` → `/api/plants/:id/quiz-questions` | 1                   | 2                    |
| `ContextComments` → liste d'aperçu                              | 1                   | 4–5                  |
| `ContextComments` → `refreshTotal` (`page_size=1`)              | 1                   | 4–5                  |
| `ContextComments` → `GET /api/settings/public`                  | 1                   | 0 (cache 15 s)       |
| **Total par carte**                                             | **6**               | **15–17**            |

À quoi s'ajoutent trois appels de page :

| Appel                                        | SQL                                |
| -------------------------------------------- | ---------------------------------- |
| `GET /api/plants`                            | 1 (ou 0 : cache mémoire 20 s)      |
| `GET /api/plants/me/observation-counts`      | 3                                  |
| `GET /api/learning/gating/summary` (60 refs) | **~180 à 240, en série** (cf. §B4) |

**Bilan pour 78 fiches, un seul élève, une seule ouverture :**

|                            | Volume                      |
| -------------------------- | --------------------------- |
| Appels HTTP                | **≈ 471**                   |
| Requêtes SQL               | **≈ 1 400**                 |
| Charge utile `/api/plants` | **117 kio** (16,5 kio gzip) |

**Pour une classe de 25 postes ouvrant l'onglet ensemble :** ≈ **11 800 requêtes HTTP** et
≈ **35 000 requêtes SQL** en quelques secondes, sur un pool de **30 connexions**
(`database.js`), sur mutualisé.

La vue **professeur** (`PlantManager`) ne monte pas `PlantPedagoFetchedSections` : elle coûte
3 appels par carte, soit ≈ **237 appels** pour le même catalogue. C'est trois fois moins, et
toujours plus d'un ordre de grandeur au-dessus du régime nominal mesuré en août.

### 1.1 Conséquence immédiate : le rate limit tombe avant le serveur

`generalLimiter` plafonne à **1200 requêtes/min/IP** (`lib/rateLimit.js`, défaut de
`FORETMAP_API_RATE_LIMIT_PER_MIN`). En établissement, **toute la classe sort par la même
adresse publique**. Trois élèves ouvrant le catalogue dans la même minute suffisent à saturer
le quota :

- 3 × 471 = **1413 > 1200** → **429 pour tout le monde sur cette IP**, y compris la connexion,
  le polling et les autres onglets, pendant le reste de la fenêtre.

Ce n'est pas une hypothèse de charge : c'est le comportement nominal de la page telle qu'elle
est écrite aujourd'hui, avec 78 fiches. Le seuil sera franchi par **deux** élèves dès que le
catalogue atteindra ~100 fiches.

### 1.2 Pourquoi les tests de charge existants ne l'ont pas vu

`load/artillery-light.yml`, `artillery.yml` et `artillery-10vu.yml` simulent l'ouverture du
catalogue par **un seul `GET /api/plants`**. Le scénario mesure donc **1 requête là où le
navigateur en émet 471**. Les rapports de `load/reports/` sont valides pour ce qu'ils
mesurent — ils ne disent rien de l'écran réel.

---

## 2. Constats — page Biodiversité

### B1. [BLOQUANT] Rafale N×6 : chaque carte va chercher ses données toute seule

`src/components/biodiv/PlantCatalogPreview.jsx:110-190` monte, dans **chaque** carte de la
grille, `PlantPedagoFetchedSections` et `ContextComments`.

- `PlantSummaryBlocks.jsx:128-162` : un `useEffect` sur `plantId` lance trois appels en
  parallèle (`/interactions`, `/glossary-terms`, `/quiz-questions`). Aucune condition
  d'ouverture, aucun `IntersectionObserver` : les 78 cartes de la page interrogent le serveur
  même si l'élève ne descend jamais plus bas que la troisième.
- `context-comments.jsx:154-163,195` : la section de commentaires, **même repliée**,
  charge l'aperçu, recharge le total (`page_size=1`, uniquement pour un compteur) et va lire
  `GET /api/settings/public` — alors que ces réglages sont déjà servis par
  `PublicSettingsContext`, importé dans le même arbre.

Le volet « commentaires » de ce constat avait **déjà été relevé** en août
(`docs/AUDIT_GENERAL_2026-08.md` §6, « Rafale de requêtes N×3 sur le catalogue Biodiversité,
risque de 429 ») : il est **toujours ouvert**, et le bloc pédagogique ajouté depuis a doublé
la rafale.

Côté serveur, les trois routes pédagogiques refont chacune un contrôle d'existence
(`SELECT id, name FROM plants WHERE id = ?`) avant la jointure utile
(`routes/plants.js:446-522`) : 78 × 3 = **234 vérifications d'existence** pour des fiches que
le client vient de recevoir en entier dans `GET /api/plants`.

**Remède** — deux gestes indépendants, l'un et l'autre suffisants pour diviser la rafale :

1. **Regrouper.** Un point d'entrée de lot par écran, sur le modèle de
   `/api/learning/gating/summary` : `GET /api/plants/pedago-summary?plant_ids=1,2,3` renvoyant
   interactions + termes + questions en **trois requêtes SQL groupées** (`WHERE plant_id IN (…)`)
   pour toute la page. Idem pour les compteurs de commentaires :
   `GET /api/context-comments/counts?contextType=plant&contextIds=…`.
2. **Différer.** Ne charger le bloc pédagogique et l'aperçu des commentaires qu'à
   l'**ouverture réelle** de la fiche (modale d'aperçu, dépli de la section) ou à l'entrée dans
   le viewport. Le contenu n'est de toute façon pas visible avant.

Et, dans tous les cas : lire les emojis de réaction depuis `usePublicSettings()` — cela
supprime **N appels** `/api/settings/public` pour zéro perte.

**Traité (lot 1).** Option retenue : **différer**, poussée à sa conclusion. Le catalogue
n'affiche plus les fiches dépliées mais des **vignettes** (`PlantCatalogTile`) qui
n'émettent **aucune requête** — tout ce qu'elles montrent vient déjà de `GET /api/plants`.
La fiche complète s'ouvre au clic dans `PlantCatalogPreviewModal`, déjà montée par `App`
et déjà utilisée depuis la carte, le glossaire, le quiz et le réseau trophique : les six
appels par fiche ne sont donc plus émis que pour **la fiche réellement ouverte**.
Couverture : `tests-ui/components/PlantCatalogTiles.test.jsx` — aucun appel par fiche au
montage de la grille, nombre d'appels indépendant du nombre de fiches, clic → ouverture.

### B2. [MAJEUR] Aucune borne d'affichage : le catalogue entier est monté d'un coup

`foretmap-views.jsx:726` (élève) et `:250` (prof) rendent l'intégralité de `filteredPlants`.
Tout le reste — B1, les images, le coût mémoire du DOM — est **linéaire en nombre de fiches**,
sans plafond. Une borne d'affichage est le remède le plus économique : elle divise B1 par le
même facteur sans toucher à aucune route.

**Remède** : premier lot borné (24 cartes) + « Voir plus » ou chargement à l'approche du bas de
page. Le compteur affiché (« X / Y êtres vivants à l'écran ») reste vrai et devient même plus
informatif.

**Sans objet en l'état (lot 1).** Les vignettes ne coûtent plus rien par fiche : le DOM d'une
vignette est une poignée de nœuds, sans requête et sans rendu Markdown. La borne d'affichage
reste la parade si le catalogue devait dépasser quelques centaines de fiches — elle n'est plus
nécessaire aujourd'hui.

### B3. [MAJEUR] Les appels dépendants des filtres n'ont pas d'anti-rebond

`foretmap-views.jsx:673-684` dérive les identifiants envoyés aux deux appels de page
(`usePlantObservationCounts`, `useGatingSummary`) de **`filteredPlants`**, pas de `plants`.
Or `filteredPlants` change à **chaque frappe** dans le champ de recherche
(`usePlantCatalogFilters.js:40-47`), et ni `usePlantObservationCounts.js:24-52` ni
`useLearningGatingSummary.js:69-83` ne diffèrent leur appel.

Conséquence : taper « menthe » émet **jusqu'à 12 requêtes** (6 frappes × 2 appels), dont
autant d'exécutions du résumé de conditionnement — le plus cher de l'application (B4).

S'y ajoute un effet plus lourd : filtrer **démonte** les cartes exclues et **remonte** celles
qui reviennent (clés `p.id`). Effacer le champ de recherche relance donc la rafale B1 sur toutes
les cartes réapparues. Une session d'élève qui essaie trois recherches peut à elle seule
consommer le quota de l'IP.

Le précédent existe dans le même dépôt : `GlossaryView.jsx:103-109` diffère de **280 ms** quand
une recherche est en cours. Il n'a pas été appliqué ici.

**Remède** : (a) dériver les identifiants de `plants` (stable) et non de `filteredPlants` — les
compteurs et annonces des fiches masquées ne coûtent rien de plus et évitent tout rechargement
au filtrage ; (b) à défaut, appliquer le même anti-rebond de 280 ms ; (c) mémoriser les données
par carte au niveau de la vue plutôt que dans la carte, pour que le remontage ne rappelle pas
le serveur.

**Sans objet (lot 1), garde-fou levé (lot 2).** Le volet lourd — le remontage des cartes et sa
rafale — a disparu avec les vignettes : filtrer ne monte plus rien. Restent les deux appels de
**page**, qui repartent à chaque changement de filtre ; leur coût est désormais borné et
constant côté serveur (B4), et le plafond de 60 qui rendait le choix de la source délicat est
levé. Le remède (a) reste applicable si l'on veut supprimer jusqu'à ces deux appels.

### B4. [MAJEUR] `/api/learning/gating/summary` : 3 à 4 requêtes SQL **par ressource**, en série

`lib/learningGatingSummary.js:120-133` boucle sur les références et appelle `getChallengeState`
pour chacune. Le préchargement des bonnes réponses (`correctCodesPreload`) évite bien un
`SELECT` par ressource — mais le reste ne l'est pas :
`lib/learningGatingAcknowledge.js:236-312` exécute par référence
`loadResourcePolicy` (1), `loadTypePolicy` (1, la **même ligne `resource_type = '*'` relue à
chaque tour**), `loadApprovedGatingLinks` (1) et, dès qu'un délai de re-tentative est configuré,
`getResourceCooldownState` (1).

Avec le plafond `SUMMARY_MAX_REFS = 60`, **une seule requête HTTP** déclenche donc
**180 à 240 requêtes SQL séquentielles**. C'est le motif exact que l'audit de septembre a
corrigé côté G&L pour le marché (constat G1, « 1 + 4N » → 6 requêtes constantes) ; il est resté
en place ici.

**Effet de bord fonctionnel** : le plafond de 60 est **inférieur au catalogue** (78 fiches). Au
delà de la 60ᵉ carte, l'annonce du contrôle de compréhension est **silencieusement absente** —
l'élève retombe sur le comportement que cette annonce existe pour éviter. Le plafond n'est ni
signalé au client, ni aligné sur la taille de la page.

**Remède** : charger la page en requêtes groupées — une requête pour toutes les politiques
(`resource_ref IN (…) OR resource_ref = '*'`), une pour tous les liens, une pour tous les
verrous —, puis dérouler le calcul en mémoire (il est déjà purement calculatoire, cf.
`AUDIT_STABILITE_PERF_2026-09.md` §5). Coût cible : **3 requêtes constantes**. Ensuite
seulement, relever ou paginer le plafond de 60.

**Traité (lot 2).** Trois chargements groupés (`loadResourcePolicies`,
`loadApprovedGatingLinksForRefs`, `loadResourceCooldownRows`) lancés en parallèle, puis
`getChallengeState` déroule les mêmes règles en mémoire à partir d'un `preload`. Le chemin
unitaire (`GET /gating/challenge`) est inchangé : sans `preload`, les requêtes par ressource
restent. Le plafond passe de 60 à **200**, aligné sur celui des compteurs d'observation — les
fiches au-delà de la 60ᵉ retrouvent leur annonce. Couverture :
`tests/learning-gating-summary-batch.test.js` — payload **strictement identique** à
l'algorithme unitaire sur un jeu couvrant politique par ressource, politique de type, liens
multiples, verrou posé et fiche sans lien ; coût SQL **constant** (≤ 6 requêtes pour 1 comme
pour 20 fiches). Réserve honnête : côté G&L, `resolveGlChapterGranularity` reste appelé par
ressource — le groupage porte sur les politiques, les liens et les verrous.

### B5. [MOYEN] `GET /api/plants` : `SELECT *` complet, sans projection de liste

`routes/plants.js:430-444` renvoie toutes les colonnes de `plants`, enrichies. Le commentaire
en place justifie le `SELECT *` par le fait que le front ne refait pas de `GET /plants/:id` :
c'est exact et le choix reste défendable — mais il fixe le coût de la liste au coût de la fiche
complète, pour tout le monde et à chaque cycle de synchronisation où le domaine `plants` a bougé.

Mesure (jeu versionné rejoué) :

| Fiches | JSON brut | gzip     |
| ------ | --------- | -------- |
| 78     | 117 kio   | 16,5 kio |
| 150    | 226 kio   | 31 kio   |
| 300    | 451 kio   | 61 kio   |
| 500    | 752 kio   | 100 kio  |

La compression est bien active (`server.js:172`), ce qui protège la bande passante mais **pas**
le CPU : sérialisation + gzip de ~120 kio à chaque réponse non mise en cache, multipliés par le
nombre de clients.

Deux points annexes sur la même route :

- **Double enrichissement au hit de cache** : `plantsListCache` stocke déjà les lignes
  enrichies, et la ligne 433 refait `cached.map(enrichPlantRow)` sur ces lignes enrichies. Le
  résultat est identique (l'opération est idempotente), mais on reconstruit 78 objets pour rien
  à chaque hit. Renvoyer directement la valeur cachée suffit.
- Le cache est correctement invalidé sur écriture de fiche (`invalidatePlantsListCache`) et son
  TTL de 20 s absorbe bien les rafales de classe. Ce point est **sain**.

**Remède** : projection « liste » (colonnes réellement affichées sur une carte) + route de
détail pour la fiche ouverte ; ou, si l'on veut garder un seul aller-retour, retirer de la
liste les colonnes les plus lourdes jamais lues en carte. Gain immédiat sans changement de
contrat : supprimer le double `map`.

**Traité en partie (lot 2).** Le double enrichissement au hit de cache est supprimé. La
projection « liste » **n'est pas faite** : depuis le lot 1, la fiche complète est rendue à
l'ouverture à partir de la ligne déjà en mémoire, donc scinder la réponse imposerait un
aller-retour supplémentaire par fiche ouverte — l'inverse de ce que cet audit cherche. Le
`SELECT *` reste donc assumé, et le poids de la réponse reste linéaire en nombre de fiches.

### B6. [MOYEN] Un clic « espèce découverte » fait recharger tout le catalogue à toute la classe

`database.js:173-181` range `user_plant_observation_events` dans le domaine de synchronisation
**`plants`**. Or cette table ne participe **à aucun octet** de la réponse `GET /api/plants` :
elle n'alimente que `/api/plants/me/observation-counts`, que le cycle `fetchAll` ne rappelle
pas.

Résultat : chaque acquittement d'observation — le geste central de l'activité biodiversité —
incrémente le compteur `plants`, et **tous les clients connectés** rechargent le catalogue
complet (117 kio) au cycle suivant, pour une réponse identique au bit près. Une séance où
25 élèves cliquent chacun quelques espèces maintient le domaine `plants` en mouvement permanent :
le polling différentiel, dont c'est exactement le rôle d'éviter cela, ne saute plus jamais ce
domaine.

Même remarque, plus faible, pour `quiz_questions` et `glossary_terms` : elles n'entrent pas
dans la charge utile de `/api/plants` (elles ne sont lues que par les routes par fiche du
constat B1) et sont déjà couvertes par le domaine `tutorials`.

**Remède** : retirer `user_plant_observation_events` (et, après vérification,
`quiz_questions` / `glossary_terms`) de `SYNC_DOMAIN_TABLES.plants`. Le mapping se veut une
« union large des tables que la route référence » : la règle utile est plutôt **les tables dont
une écriture change la réponse renvoyée au cycle `fetchAll`**.

**Traité (lot 2).** `plants` se réduit à la seule table `plants`. Piège rencontré et refermé :
sortir une table d'un domaine ne suffit pas — une écriture qui ne correspond à **aucun**
domaine déclenche le repli conservateur, qui bumpe _tous_ les domaines. Les quatre tables
concernées (`user_plant_observation_events`, `species_interactions`, `glossary_term_species`,
`quiz_question_species`) rejoignent donc `SYNC_IGNORED_TABLES_RE`. Couverture :
`tests/audit-biodiv-charge-hygiene.test.js` — une écriture sur les observations ne bouge
**aucun** compteur, une écriture sur `plants` bumpe toujours le sien.

### B7. [MOYEN] Les compteurs d'observation du site sont recalculés par utilisateur

`routes/plants.js:154-190` exécute deux `GROUP BY` (le mien, celui du site) sur
`user_plant_observation_events` pour jusqu'à 200 fiches, **à chaque ouverture de l'écran, de
chaque utilisateur**, et à chaque changement de filtre (B3). Les index nécessaires existent
(`idx_upoe_user_plant`, `idx_upoe_plant`) — le coût unitaire est donc raisonnable aujourd'hui.
Mais la table grossit d'une ligne par clic, sans purge : le compteur **site** est un agrégat
global recalculé N fois pour une valeur identique pour tous.

**Remède** : cache mémoire à TTL court (le motif `getNamedMemoryTtlCache` est déjà utilisé pour
la liste des plantes) sur le seul volet « site », ou compteur dénormalisé sur `plants`
incrémenté à l'acquittement. Accessoirement, `user_plant_observation_events` mériterait
d'entrer dans le périmètre de `scripts/purge-audit-logs.js` (rétention « historique », cf. C3
de l'audit consolidé) — c'est aujourd'hui la seule table de la famille biodiversité à croître
sans borne.

**Traité en partie (lot 3).** Le volet « site » passe par un cache mémoire de 15 s
(`plants:site-observations:v1`) : une classe entière qui ouvre le catalogue ne demande plus
qu'une fois l'agrégat commun. Le volet personnel reste relu à chaque appel. **Reste à faire** :
l'entrée de la table dans le périmètre de purge.

### B8. [MOYEN] 78 photos « héro » en priorité haute, sans chargement paresseux

`src/components/biodiv/PlantMetaSections.jsx:82-88` rend l'image principale avec
`fetchPriority="high"` et **sans `loading="lazy"`** — alors que la galerie repliable, juste en
dessous, est correctement paresseuse (`:152`). Le navigateur tente donc de charger en priorité
haute autant d'images que de cartes.

Pour les photos externes (Wikimedia), le coût est chez le client et chez Wikimedia. Pour les
photos **téléversées** (`/uploads/…`, `POST /api/plants/:id/photo-upload`), c'est **notre**
serveur qui sert 78 images pleine résolution d'un coup — pendant que 471 requêtes API attendent
sur les mêmes connexions. Les en-têtes de cache sont bien posés sur `/uploads` (`server.js:354`),
ce qui limite la répétition mais pas la première ouverture.

**Remède** : `loading="lazy"` partout, `fetchPriority="high"` réservé à la première carte (ou
supprimé). Une variante vignette pour les photos locales (le module `lib/imageThumb.js` existe
déjà, mais ne sert aujourd'hui que zones et repères) serait le gain suivant.

**Traité en partie (lot 1).** La grille ne charge plus que les miniatures des vignettes, en
`loading="lazy"` et sans `fetchPriority`. `fetchPriority="high"` reste sur la photo héro de la
**fiche ouverte**, où il est justifié : une seule image, celle que le lecteur regarde. Reste à
faire : la variante vignette côté serveur pour les photos téléversées.

### B9. [MINEUR] Un appel Wikimedia Commons par carte concernée

`PlantMetaSections.jsx:23-63` : quand la photo est renseignée par une **catégorie** Commons (et
non un lien direct), chaque carte interroge `commons.wikimedia.org` au montage pour résoudre une
vignette. Charge externe, pas serveur — mais elle s'ajoute au même goulot de connexions du
navigateur, et elle est refaite à chaque remontage (B3). Résoudre la vignette une fois à
l'enregistrement de la fiche (ou la mémoriser côté module, comme `useGlossaryLinkIndex` le fait
pour le glossaire) supprimerait l'aller-retour.

**Sans objet en grille (lot 1).** La vignette n'affiche qu'une photo **directe** ; une photo
renseignée par catégorie retombe sur l'emoji. L'appel Commons ne subsiste que dans la fiche
ouverte — une fois, pour la fiche lue.

---

## 3. Revue onglet par onglet

Passe complète sur **tous** les onglets de ForetMap, après les lots 1 à 3, pour vérifier si
le motif du catalogue se répète ailleurs. Question posée à chaque écran : **le coût
d'ouverture croît-il avec le contenu affiché ?** C'est cela, et non le coût unitaire d'une
requête, qui a fait tomber le catalogue.

| Onglet                    | Public          | Appels à l'ouverture                                        | Croît avec le contenu | Verdict                       |
| ------------------------- | --------------- | ----------------------------------------------------------- | --------------------- | ----------------------------- |
| **Biodiversité**          | élèves + profs  | 3                                                           | non                   | **sain** (lots 1-3)           |
| **Glossaire**             | élèves + profs  | 3 (catégories, termes, annonce) + 1 par terme ouvert        | non                   | **sain — c'est le modèle**    |
| **Quiz** (élève)          | élèves          | 2 (catégories, progression) puis 2 par question tirée       | non                   | **sain**                      |
| **Réseau trophique**      | élèves + profs  | 2 (graphe, zones) — **+1 catalogue complet côté prof**      | non                   | **T2**                        |
| **Carte**                 | élèves + profs  | 0 (données du contexte) ; fiches à l'ouverture d'une modale | non                   | **sain**                      |
| **Visite**                | public + élèves | 1 (`/api/visit/content`, **caché** par version d'écriture)  | non                   | **sain**                      |
| **Carnet d'observations** | élèves          | 1 (borné à 500 depuis le lot 3)                             | non                   | **sain**                      |
| **Forum**                 | élèves + profs  | 2 (fils, groupes) **+1 redondant**                          | non                   | **T3**                        |
| **Tâches**                | élèves + profs  | données du contexte **+1 par tuile** (commentaires)         | **oui**               | **P1 — partiellement traité** |
| **Tutoriels**             | élèves + profs  | données du contexte **+1 par tutoriel** (commentaires)      | **oui**               | **P2 — partiellement traité** |
| **Stats**                 | profs           | 3 (quiz, stats agrégées, groupes)                           | non                   | **sain**                      |
| **Profils**               | profs           | 4, dont `/api/stats/all`                                    | non                   | sain, cf. note                |
| **Médiathèque**           | profs           | 2 appels, mais **30 requêtes SQL**                          | non                   | **T1**                        |

Deux enseignements de cette revue.

**Le glossaire faisait déjà bien.** Liste compacte à gauche, fiche complète à droite, chargée
au clic — un appel de détail par terme réellement ouvert. C'est exactement le modèle vers
lequel le lot 1 a fait converger le catalogue biodiversité. Le motif fautif n'était donc pas
une fatalité de l'application : c'était une exception, et elle est levée.

**Le motif « une requête par élément affiché » ne subsiste que dans les commentaires de
contexte** (tâches et tutoriels, constats P1 et P2). Le lot 2 l'a divisé par trois ; le
ramener à zéro demande le même arbitrage d'usage que pour le catalogue.

### T1. [MOYEN] Médiathèque — 30 requêtes SQL dont 15 balayages de table, sans cache

`lib/mediaLibraryUsage.js:455-476` — `collectMediaLibraryUsage` boucle sur **15 tables
sources** et exécute, pour chacune, un `SHOW COLUMNS` puis un `SELECT … LIMIT 800`. Soit
**30 requêtes SQL et 15 balayages** à chaque ouverture de l'onglet, sans aucun cache. C'est,
depuis le traitement de B4, la route la plus chère de l'application.

Le public est restreint (`teacher.access`) et l'écran peu fréquenté : le risque de saturation
est faible, contrairement au catalogue. Mais le coût est fixe et payé intégralement à chaque
consultation, et il **croît avec la taille des tables** — pas avec ce que l'écran affiche.

**Remède** : cache mémoire à version d'écriture (motif `lib/shared/writeVersionCache.js`, déjà
utilisé par le contenu de visite et la charge publique du plan) — l'usage des médias ne change
qu'à l'écriture. À défaut, un TTL de quelques minutes.

### T2. [MINEUR] Réseau trophique — le catalogue complet retéléchargé pour trois champs

`src/components/pedago/FoodWebView.jsx:104` — la vue professeur appelle `GET /api/plants`
pour construire la liste déroulante des espèces, dont elle ne garde que `{ id, name, emoji }`.
Soit **117 kio** transférés et désérialisés pour trois champs, alors que `DataContext` porte
déjà `plants` — la même liste, déjà en mémoire, déjà rafraîchie par le cycle de
synchronisation.

**Remède** : lire `plants` depuis `useData()`, comme le font le catalogue et la carte. Quelques
lignes, aucun changement visible.

### T3. [MINEUR] Forum — le `GET /api/settings/public` redondant y subsiste

`src/components/forum-views.jsx:113-124` porte encore l'appel exact que le lot 2 a retiré de
`ContextComments` : relire les réglages publics pour en extraire les emojis de réaction, alors
que `PublicSettingsContext` les fournit déjà. Un appel par ouverture du forum — sans commune
mesure avec la rafale du catalogue, mais c'est le même geste, et il reste à faire au même
endroit qu'ailleurs.

**Remède** : identique au lot 2 — `usePublicSettings()` au lieu de l'appel.

### T4. [INFO] Effet de bord positif du plafond relevé (B4)

Le glossaire demande l'annonce du contrôle pour **tous** les termes listés
(`GlossaryView.jsx:42-46`), soit 175 dans le jeu versionné. Avec l'ancien plafond de
60 références, **115 termes n'avaient aucune annonce** — silencieusement, comme les 18 fiches
biodiversité au-delà de la 60ᵉ. Le passage à 200 les rétablit, et le chargement groupé fait
que cela ne coûte rien de plus en SQL.

### T5. [INFO] Points vérifiés et jugés sains

- **Carte** : zones, repères et plantes viennent du contexte ; les fiches ne sont chargées
  qu'à l'ouverture d'une modale.
- **Visite** : `GET /api/visit/content` agrège huit requêtes SQL mais passe par un cache à
  version d'écriture — c'est le seul point d'entrée non authentifié qui agrège, et il est
  correctement protégé.
- **Quiz** : le tirage et la présentation sont unitaires ; l'enrichissement glossaire après
  réponse (`QuizView.jsx:38-51`) fait un appel par terme lié, mais sur deux ou trois termes.
- **Stats** et **Profils** : agrégats chargés en requêtes groupées (`Promise.all`, maps),
  public restreint. `/api/stats/all` est chargé aussi par l'écran Profils — c'est un appel de
  page, pas un par ligne.

## 3.bis Autres pages exposées au même motif

### P1. [MAJEUR] Liste des tâches — `ContextComments` par tuile

`src/components/tasks/TaskTileCard.jsx:793-800` monte une section de commentaires **par tuile**.
Même mécanique que B1, moins le bloc pédagogique : **3 appels par tâche affichée**. Une classe
avec 40 tâches actives ouvre l'onglet Tâches à **120 requêtes** par élève. C'est l'onglet le
plus fréquenté de l'application.

**Traité en partie (lot 2).** `ContextComments` n'émet plus qu'**un** appel au montage au lieu
de trois : les emojis de réaction viennent du contexte des réglages publics, et le total comme
la pastille « non lus » sont lus dans la réponse de la liste — qui les portait déjà. L'onglet
Tâches passe donc de 3N à **N** appels (40 tuiles : 120 → 40). Ramener ce N à zéro demanderait
soit un chargement au dépli, soit un point d'entrée de lot : c'est le même arbitrage d'usage
que pour le catalogue, à trancher séparément. Couverture :
`tests-ui/components/ContextComments.test.jsx`.

### P2. [MAJEUR] Liste des tutoriels — idem

`src/components/tutorials-views.jsx:798-805` : 3 appels par tutoriel listé. Même remède que B1
(compteurs en lot + chargement au dépli). `src/components/visit/VisitTutorialsSection.jsx:155`
applique le même motif, mais **gardé par `studentId`** : la visite publique n'émet donc pas ces
appels — le garde est bon, il manque juste ailleurs.

**Traité en partie (lot 2)**, par le même correctif que P1 : 3N → N.

### P3. [MAJEUR] Catalogue biodiversité côté professeur

`foretmap-views.jsx:250-400` : pas de bloc pédagogique, mais `ContextComments` par carte →
236 appels pour 78 fiches. Traité par le même correctif que B1 et B2.

**Traité (lot 1).** La vue professeur affiche les mêmes vignettes que la vue élève ; les
~180 lignes de carte qui **dupliquaient** `PlantBiodiversityCatalogPreviewCard` ont disparu, et
l'édition passe en fenêtre. La fiche n'est plus rendue qu'à un seul endroit.

### P4. [MOYEN] Glossaire — liste complète non cachée côté serveur

`routes/glossary.js:34-66` : `SELECT` de tous les termes actifs (175 lignes), sans pagination ni
cache serveur, **et le filtre `q` est appliqué en JavaScript après avoir tout chargé**. Le client
protège bien la répétition (`useGlossaryLinkIndex` mémorise l'index une fois par session,
`GlossaryView` diffère la recherche de 280 ms), donc l'exposition réelle est d'un appel par
session — mais chacun repart en base.

`GET /api/glossary/terms/:code` coûte, lui, **6 requêtes** (terme, relations sortantes,
entrantes, plantes, tutoriels, questions). `QuizView.jsx:38-51` l'appelle **une fois par terme**
lié à une question (`Promise.allSettled` sur les codes) alors qu'il ne lit que `linkedPlants` :
un N+1 déclenché depuis le client, borné mais gratuit à supprimer.

**Remède** : cache mémoire à TTL (motif `getNamedMemoryTtlCache`, comme la liste des plantes) sur
la liste des termes ; filtre `q` poussé en SQL ; pour le quiz, une route dédiée
« plantes liées à ces termes » en une requête.

**Traité en partie (lot 3).** La liste **sans filtre** — le cas courant, celui de l'index des
auto-liens chargé une fois par session et par utilisateur — passe par un cache mémoire de 30 s.
Volontairement **non fait** : pousser le filtre `q` en SQL changerait la sémantique de
correspondance (`glossaryTermMatchesQuery` fait un affinage en JS que `LIKE` ne reproduit pas à
l'identique), et cacher une clé par recherche libre exposerait le cache à une explosion de clés
pour un gain nul. La route de lot pour le quiz reste à faire.

### P5. [MOYEN] `/api/quiz/questions` sans borne, et `ORDER BY RAND()` au tirage

**Traité en partie (lot 3).** Le tirage abandonne `ORDER BY RAND()` pour un décalage aléatoire
sur la clé primaire (compte + `LIMIT 1 OFFSET n`) : même distribution, plus de tri de la
sélection entière à chaque clic. Volontairement **non fait** : borner `/api/quiz/questions`
tronquerait le catalogue admin qui s'en sert, et pousser son filtre `q` en SQL changerait la
sémantique de correspondance — même raison que pour le glossaire.

`routes/quiz.js:213-275` renvoie **toutes** les questions actives (131 aujourd'hui) sans `LIMIT`,
et filtre `q` en mémoire après chargement — même motif que le glossaire.

`routes/quiz.js:172-210` (`/api/quiz/draw`) tire au sort avec `ORDER BY RAND() LIMIT 1` : MySQL
matérialise et trie **toute** la sélection à chaque tirage. Sur 131 questions c'est indolore ;
sur une classe entière qui enchaîne les tirages, c'est un tri complet par clic, et le coût croît
avec le catalogue. Le motif classique (tirer un `id` au hasard dans l'intervalle, ou
`ORDER BY RAND()` sur la seule colonne clé puis jointure) est nettement moins cher.

### P6. [MINEUR] Réseau trophique — vue complète sans borne

`routes/food-web.js:87-121` : sans `mapId` ni `zoneId`, la route renvoie **tout** `v_food_web`
(69 interactions aujourd'hui, jointures sur `plants`). Sain à cette volumétrie ; à surveiller si
le réseau est saisi à grande échelle, puisque rien ne le borne.

### P7. [MINEUR] Carnet d'observations d'un élève sans `LIMIT`

`routes/observations.js:49-62` : `SELECT o.*` de **toutes** les observations d'un élève, sans
borne ni pagination (la route professeur `/all`, elle, plafonne à 100). Les observations portent
du texte libre et référencent des images ; sur une année scolaire complète, la réponse grossit
sans plafond.

**Traité (lot 3).** Borne de 500 entrées, les plus récentes d'abord (`STUDENT_NOTEBOOK_MAX_ROWS`),
documentée dans `docs/API.md`. Un carnet dépasse rarement quelques dizaines d'entrées sur une
année ; la troncature reste **théoriquement visible** au-delà de 500 — c'est le compromis
assumé, faute de pagination sur cet écran.

### P8. [MINEUR] `LIMIT` interpolé plutôt que paramétré

`lib/shared/contextCommentsCore.js:138` et `routes/forum.js:211,335` composent
`LIMIT ${pageSize} OFFSET ${offset}`. Les valeurs sont bornées en amont (`parsePageQuery`), donc
**aucune injection n'est atteignable** — c'est le même constat que **G5** de l'audit consolidé,
qui a été corrigé côté journal G&L et marché mais laissé ici. À aligner par cohérence de
convention (« SQL toujours paramétré »).

**Traité (lot 3).** Les quatre derniers `LIMIT`/`OFFSET` alimentés par une valeur de requête
sont paramétrés : commentaires de contexte, forum ForetMap (fils et messages), forum G&L et
journal d'audit. Les `LIMIT` qui subsistent interpolent des **constantes de module**
(`MAX_ROWS`, `ADMIN_*_LIST_LIMIT`), pas des entrées. Couverture :
`tests/audit-biodiv-charge-hygiene.test.js`.

---

## 4. Vérifié et sain

- **Cache de la liste des plantes** : `getNamedMemoryTtlCache('plants:list:v1')`, TTL 20 s,
  invalidé à chaque écriture de fiche (création, édition, suppression, import). Absorbe
  correctement la rafale d'une classe sur `GET /api/plants`.
- **Compression** : active sur `/api/*` (`server.js:172`), avec exclusions pertinentes
  (Socket.IO, exports, modèles d'import).
- **Cache des fichiers statiques** : `dist/assets/*` immuables, `/uploads/*.{jpg,png,…}` avec
  `Cache-Control` public.
- **Polling différentiel** : sonde `/api/sync-state` + refetch ciblé par domaine — le mécanisme
  est bon ; c'est son **mapping** qui est trop large pour `plants` (B6).
- **Index** : présents sur les colonnes de filtrage chaudes de la famille biodiversité
  (`idx_plants_name`, `idx_upoe_user_plant`, `idx_upoe_plant`, `idx_si_from`, `idx_si_to`).
- **Hydratation d'auth** : rôle, permissions et groupes sont cachés ; il reste **une** requête
  non cachée par requête authentifiée (`SELECT is_active, token_epoch FROM users`), volontaire
  (révocation immédiate). Coût acceptable en régime nominal — c'est le **nombre de requêtes**
  (B1) qui le rend visible, pas son coût unitaire.
- **Anti-rebond du glossaire** (280 ms) et **index de glossaire mémorisé par module** : le bon
  motif existe déjà dans le dépôt, il n'a simplement pas été appliqué au catalogue.
- **Pagination du forum** : bornée et paramétrée côté page (`page_size` plafonné à 50).

---

## 5. Ordre de traitement suggéré (suivi)

Le plan initial a été revu après arbitrage produit : plutôt que d'alléger fiche par fiche une
grille qui affiche tout, le **lot 1** a changé la forme de l'écran — vignettes + fiche en
fenêtre, sur le modèle déjà employé partout ailleurs dans l'application. Plusieurs remèdes du
plan sont devenus sans objet. Le **lot 2** a dégraissé ce qui restait sur le chemin chaud, le
**lot 3** a traité l'hygiène et la tenue dans la durée.

| Priorité | Constat                                                                     | Statut                                                                                    |
| -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1        | **B1** emojis via `usePublicSettings()` + compteurs de commentaires en lot  | **traité** (lots 1 et 2) — 3 appels par section → 1, partout                              |
| 2        | **B2** borne d'affichage de la grille                                       | **sans objet** (lot 1) — les vignettes ne coûtent plus rien par fiche                     |
| 3        | **B1** bloc pédagogique : route de lot ou chargement au dépli               | **traité** (lot 1) — chargé à l'ouverture de la fiche                                     |
| 4        | **B3** identifiants dérivés de `plants` + anti-rebond                       | **sans objet** (lot 1) — plus de carte à monter ; garde-fou levé par B4                   |
| 5        | **B4** résumé de conditionnement en requêtes groupées                       | **traité** (lot 2) — 3 requêtes constantes, plafond 60 → 200                              |
| 6        | **B6** retirer `user_plant_observation_events` du domaine `plants`          | **traité** (lot 2)                                                                        |
| 7        | **B8** `loading="lazy"` / `fetchPriority`                                   | **traité en partie** (lot 1) — reste la vignette serveur des photos téléversées           |
| 8        | **P1/P2** même traitement que B1 sur tâches et tutoriels                    | **traité en partie** (lot 2) — 3N → N ; le N restant demande un arbitrage d'usage         |
| 9        | **B5** projection de liste + double enrichissement                          | **traité en partie** (lot 2) — double `map` supprimé ; projection écartée, cf. §B5        |
| 10       | **B7 / P4 / P5 / P7 / P8** caches, bornes et hygiène SQL                    | **traité en partie** (lot 3) — cf. chaque constat pour ce qui a été volontairement écarté |
| 11       | **T1** cache d'usage de la médiathèque (30 requêtes SQL, 15 balayages)      | à faire — public restreint, mais route la plus chère restante                             |
| 12       | **T2** réseau trophique : lire `plants` du contexte au lieu de le refetcher | à faire — quelques lignes, 117 kio économisés par ouverture côté prof                     |
| 13       | **T3** forum : emojis via `usePublicSettings()`                             | à faire — même geste que le lot 2, au même endroit qu'ailleurs                            |

### Ce qui reste ouvert, et pourquoi

- **B5** — projection « liste » de `GET /api/plants` : écartée. Depuis le lot 1, la fiche est
  rendue à partir de la ligne déjà en mémoire ; scinder la réponse coûterait un aller-retour
  par fiche ouverte. Le poids de la liste reste linéaire en nombre de fiches.
- **B7** — `user_plant_observation_events` n'entre toujours pas dans le périmètre de
  `scripts/purge-audit-logs.js` : c'est la seule table de la famille biodiversité à croître
  sans borne.
- **B8** — pas de vignette serveur pour les photos téléversées (`lib/imageThumb.js` ne sert
  aujourd'hui que zones et repères).
- **P1/P2** — la section de commentaires coûte encore **un** appel par tuile de tâche et par
  tutoriel listé. Le ramener à zéro suppose un chargement au dépli ou un point d'entrée de
  lot : même arbitrage d'usage que pour le catalogue, à trancher.
- **P4/P5** — filtres `q` laissés en JS : les pousser en SQL changerait la sémantique de
  correspondance. Route de lot « plantes liées à ces termes » pour le quiz : à faire.
- **P6** — réseau trophique : le graphe lui-même est sain à la volumétrie actuelle ; reste le
  refetch du catalogue complet côté prof (T2).
- **T1/T2/T3** — relevés par la revue onglet par onglet (§3), non traités : cache d'usage de la
  médiathèque, catalogue refetché par le réseau trophique, `/api/settings/public` redondant du
  forum.
- **G&L** — `resolveGlChapterGranularity` reste appelé par ressource dans le résumé groupé.

### Bilan chiffré

|                                        | Avant                              | Après les trois lots                  |
| -------------------------------------- | ---------------------------------- | ------------------------------------- |
| Ouverture du catalogue biodiversité    | ≈ 471 appels, ≈ 1 400 requêtes SQL | **3 appels**, ≈ 15 requêtes SQL       |
| Ouverture d'**une** fiche              | 0 (déjà chargée)                   | 4 appels — pour la seule fiche lue    |
| Filtrer / rechercher dans le catalogue | relance la rafale complète         | 2 appels de page, à coût SQL constant |
| Onglet Tâches (40 tuiles)              | 120 appels                         | **40 appels**                         |
| `/gating/summary` (60 réfs)            | ~180 à 240 requêtes SQL en série   | **≤ 6, constantes**                   |

## 6. Comment le mesurer

1. **Scénario de charge réaliste — fait.** [`load/artillery-biodiv.yml`](../load/artillery-biodiv.yml)
   rejoue la rafale réelle dans ses deux régimes. Mesure du 6 septembre 2026, **380 utilisateurs
   virtuels identiques de part et d'autre** (rapport :
   [`load/reports/biodiv-summary.md`](../load/reports/biodiv-summary.md)) :

   |               | Avant       | Après       |
   | ------------- | ----------- | ----------- |
   | Requêtes HTTP | **23 180**  | **1 520**   |
   | Débit         | 135 req/s   | 8 req/s     |
   | Médiane / p95 | 2 ms / 4 ms | 3 ms / 5 ms |

   **Le serveur n'était pas lent : on lui en demandait quinze fois trop.** Les temps de réponse
   sont identiques dans les deux régimes — c'est le _nombre_ de requêtes qui a changé, ce qui
   confirme que le point de rupture était le plafond par adresse IP, pas le CPU. Le facteur
   mesuré (15,2) est une **borne basse** : le scénario ne rejoue que 20 fiches sur 78, et
   seulement les routes publiques (le volet commentaires, authentifié, n'est pas simulé).

2. **Compteur de requêtes en test.** Le motif existe déjà
   (`tests/gl-market-trades-batch.test.js` compare un compteur de requêtes SQL avant/après) :
   il s'applique tel quel au résumé de conditionnement (B4) et aux routes de lot proposées.
3. **En production.** `GET /api/admin/diagnostics` expose `metrics.http429` et
   `recentHttp429` : un pic de 429 corrélé aux heures de séance est la signature directe de
   §1.1, et le moyen le plus rapide de confirmer le diagnostic sans instrumentation nouvelle.
4. **Bout en bout — fait.** `e2e/plants-biodiversity.spec.js` compte, dans un vrai navigateur
   sur l'application servie, les requêtes émises à l'ouverture de l'onglet : **3 appels de
   catalogue pour 64 vignettes**, aucun appel par fiche, aucun appel de commentaires ; puis le
   clic ouvre la fiche et charge les données de **cette seule fiche**.

   Écrire ce scénario a mis au jour un défaut sans rapport avec la charge : le sélecteur
   `.teacher-main .top-tabs` de la fixture d'authentification partagée matchait **deux**
   éléments depuis la navigation prof en trois pôles (commit `d507007`), et le mode strict de
   Playwright refusait le locator. **Les seize specs qui passent par `enableTeacherMode`
   échouaient donc toutes** — vérifié en rejouant `teacher-auth-map.spec.js` sur la fixture
   d'origine (échec) puis corrigée (succès). `clickTasksTab` filtrait déjà avec `.first()` ;
   ce point-là avait été oublié. La correction tient en une ligne.
