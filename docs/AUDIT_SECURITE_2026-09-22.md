# Audit — Sécurité d'accès aux données (foretmap / planlyautey / proflyautey)

> Portée : la **politique d'accès côté serveur** des trois surfaces servies par le même
> backend — routes REST liées à une carte (zones, repères, catégories, parcours, contenus de
> visite, cartes), gardes d'accès (`lib/accessGate.js`, `lib/planAccess.js`,
> `lib/staffPlanAccess.js`, `lib/mapAccess.js`), filtrage par surface et par audience
> (`lib/locationSurfaces.js`, `lib/locationAudience.js`), médias `/uploads`, socket.io,
> service workers PWA, en-têtes et limitation de débit. Rédigé le **2026-09-22** sur la branche
> `claude/admiring-johnson-kqj6o1` (base `main`, v1.172.0).
>
> **État au 22 septembre 2026 (second passage, même jour)** : l'état des lieux a été validé et
> les lots **P0 (A–E)** et **M** ont été livrés. Les constats **S1 à S6** sont **traités**, avec
> un filet de non-régression (`tests/security-surfaces.test.js`, neuf cas). Le §11 rend compte
> de la livraison, le §12 du scan de secrets. **S7 à S11 restent ouverts** (lots F–L, P1/P2).
>
> Le document reste rédigé au présent de l'audit : c'est l'état **constaté le matin du 22
> septembre** qui est décrit, avant correctif. Chaque constat traité porte une ligne
> **« Corrigé »** qui dit où.
>
> **Mise à jour du 22 septembre 2026, soir** : les lots **F** et **G** sont livrés — **S7 et
> S8 sont traités** (§2.7, §2.8).
>
> **Mise à jour du 23 septembre 2026** : les lots **H à L** sont livrés — **S9, S10 et S11 sont
> traités**, et la revue d'en-têtes du lot L est faite (§13). **Tous les constats S1 à S12 sont
> désormais traités.** Reste ouvert le **seul point bloquant** avant publication du code : le
> dump de production dans l'historique Git (§12), dont la remédiation relève d'une décision du
> responsable de traitement.
>
> **Note d'exécution — les chiffres sont mesurés, pas estimés.** L'application a été montée
> localement sur le fixture anonymisé (`foretmap_local`, migré à la volée : 7 cartes, dont
> `lyautey` avec 36 zones et 44 repères), et chaque constat a été **reproduit par requête HTTP
> réelle**. Les 123 routes `GET` ForetMap atteignables ont été sondées anonymement une par une.
> Le fixture reproduit la **structure** de production, pas ses libellés (anonymisés).
>
> Fichiers lus : `server.js`, `lib/accessGate.js`, `lib/planAccess.js`, `lib/staffPlanAccess.js`,
> `lib/mapAccess.js`, `lib/shared/mapScopeCore.js`, `lib/locationSurfaces.js`,
> `lib/locationAudience.js`, `lib/productResolver.js`, `lib/products.js`,
> `lib/uploadsPrivatePaths.js`, `lib/uploads.js`, `lib/imageThumb.js`, `lib/realtime.js`,
> `lib/shared/presenceCore.js`, `lib/rateLimit.js`, `lib/loginThrottle.js`,
> `lib/passwordReset.js`, `lib/settings.js`, `lib/csp.js`, `scripts/build-pwa.js`,
> `routes/zones.js`, `routes/map.js`, `routes/maps.js`, `routes/map-categories.js`,
> `routes/plan.js`, `routes/staff-plan.js`, `routes/visit.js`, `routes/map-routes.js`,
> `routes/auth.js`, `routes/students.js`, `routes/quiz.js`.

---

## 1. Verdict

**Le constat d'observation externe du 22/09/2026 est confirmé, et sa formulation est exacte :
le code d'accès protège l'écran, pas les données.**

La nuance importante, que l'observation externe ne pouvait pas voir, est que **ce n'est pas une
absence de politique d'accès**. ForêtMap en possède une, complète et soignée : gardes par cookie
signé HMAC (`lib/accessGate.js`), périmètre par carte (`lib/mapAccess.js`), visibilité par
surface (`lib/locationSurfaces.js`), audience par rôle et par groupe (`lib/locationAudience.js`),
résolution du produit par host (`lib/productResolver.js`). Chacune de ces pièces fonctionne.

Le défaut est de **câblage**, et il est systématique : la politique est appliquée sur les
**points d'entrée composites** de chaque surface (`/api/plan/content`, `/api/staff-plan/content`,
`/api/map-routes`), mais **pas sur les routes génériques** (`/api/zones`, `/api/map/markers`,
`/api/maps`, `/api/map-categories`) qui servent exactement les mêmes lignes de base. Fermer le
plan par un code ferme la porte d'entrée et laisse les fenêtres ouvertes.

Mesure, plan en mode `code`, requêtes **anonymes**, sur la même carte `lyautey` :

| Route                                    | HTTP  | Données renvoyées à un anonyme  |
| ---------------------------------------- | ----- | ------------------------------- |
| `/api/plan/content?map_id=lyautey`       | `401` | refusé ✅                       |
| `/api/staff-plan/content?map_id=lyautey` | `401` | refusé ✅                       |
| `/api/map-routes`                        | `401` | refusé ✅                       |
| `/api/zones?map_id=lyautey`              | `200` | **36 zones**                    |
| `/api/map/markers?map_id=lyautey`        | `200` | **44 repères**                  |
| `/api/map-categories?map_id=lyautey`     | `200` | **11 catégories**               |
| `/api/maps`                              | `200` | **7 cartes + géoréférencement** |
| `/api/visit/content?map_id=lyautey`      | `200` | **211 Ko**                      |

**Go/no-go pour le lien jury (dépôt 15/11/2026) : NO-GO en l'état.** Les correctifs P0 du §7
sont la condition d'un go. Ils sont circonscrits — la matière existe, il s'agit de la brancher —
et l'échéance de début novembre reste tenable. **`proflyautey` doit rester en 503** jusqu'à ce
que les tests du §8 passent : c'est la surface qui portera les consignes réservées aux
personnels, et c'est elle que le §2.5 montre aujourd'hui contournable par une route générique.

> **Mise à jour du 22 septembre 2026, après livraison des lots P0 (§11).** Les constats S1 à
> S6 et S12 sont traités et couverts par des tests ; les mesures du §11.3 montrent la carte
> `lyautey` fermée sur toutes les routes anonymes. Le **go** pour le lien jury reste
> subordonné à deux vérifications qui ne relèvent pas du code et n'ont **pas** été faites ici :
> rejouer les mesures **sur la production** (celles du §11.3 portent sur le fixture), et
> vérifier que `ui.plan.selectable_map_ids` y déclare bien les cartes attendues — la garde
> vaut ce que vaut cette déclaration. **`proflyautey` reste en 503** : sa réouverture est une
> décision d'exploitation, distincte de ce correctif.

---

## 2. Constats

### 2.1 — S1 (P0, critique) · Le code du plan ne protège pas les données

**Corrigé** (lots A/B/D) : `lib/surfaceAccess.js` — `withLocationSurface` exige sur les routes génériques le laissez-passer de la surface, et borne la réponse aux cartes qui y sont déclarées. Mesure d'après correctif, plan en mode `code` : les six routes du tableau du §1 répondent `401` sans le code, et `200` avec.

`ui.plan.access_mode = 'code'` ferme `/api/plan/content` et `/api/map-routes`, et **rien
d'autre**. Les quatre routes génériques qui portent la même matière répondent `200` à un
visiteur sans code (tableau du §1).

**Cause racine**, `lib/shared/mapScopeCore.js:64-69` :

```js
function canBypassMapScope(auth) {
  if (!auth || auth.userId == null || auth.userId === '') return true;
  // …
}
```

Un lecteur **anonyme** n'est pas « hors périmètre » : il est **non borné**. C'est un choix
documenté en tête de `lib/mapAccess.js` (« le périmètre cloisonne des classes entre elles, il ne
ferme pas le site »), cohérent tant que toute carte est publique — et faux depuis que `lyautey`
existe. Le périmètre par carte ne s'applique donc qu'aux comptes élèves ; le visiteur sans
compte, lui, voit tout.

### 2.2 — S2 (P0, critique) · `hidden_surfaces` n'est filtré que si le client le demande

**Corrigé** (lot C) : le filtrage est inconditionnel — `filterRowsForSurface` s'applique à partir de la surface du serveur, que `?surface=` soit absent, présent ou contradictoire. Couvert par le test « non-régression S2 », qui rejoue les cinq formes d'appel.

Le serveur **sait** filtrer par surface — et le fait correctement quand on le lui demande :

| Requête anonyme                                      | Repères renvoyés |
| ---------------------------------------------------- | ---------------- |
| `/api/map/markers?map_id=lyautey&surface=plan`       | **42**           |
| `/api/map/markers?map_id=lyautey` _(sans paramètre)_ | **44**           |

Les deux repères d'écart sont exactement ceux marqués `hidden_surfaces = ['plan']` — ils
ressortent en clair, avec leur marquage, dès que le client omet `?surface=`.

Dans `routes/map.js` et `routes/zones.js`, le filtre est conditionné à la présence du
paramètre :

```js
const surfaced = surfaceQuery.value
  ? result.filter((row) => isVisibleOnSurface(row, surfaceQuery.value))
  : result; // ← aucun paramètre = aucun filtrage
```

Ce n'est donc pas « le filtrage est fait côté client » : le filtrage **existe côté serveur**,
mais il est **facultatif et à l'initiative de l'appelant**. Un masquage qu'on obtient en le
demandant n'est pas un masquage.

### 2.3 — S3 (P0, critique) · La surface est un paramètre du client

**Corrigé** (lot A) : `lib/shared/surfaceCore.js` décide la surface à partir du produit résolu par host et de l'état d'authentification. `?surface=` ne s'applique plus qu'en **intersection**. La surcharge `X-Foretmap-Product` n'est honorée qu'hors production (et dans le harnais e2e, qui tourne volontairement en `NODE_ENV=production`).

`readSurfaceQuery(req.query.surface)` : la surface — donc la politique de visibilité — est
déclarée par l'appelant. L'exigence cible (« surface déterminée côté serveur, Host ou origine,
jamais par un paramètre client ») n'est pas remplie sur ces routes.

La brique nécessaire **existe déjà** : `resolveProductFromRequest(req)` (`lib/productResolver.js`)
résout le produit par préfixe de host, et le registre `lib/products.js` connaît les quatre
produits, `staff` (`proflyautey.`, `stafflyautey.`) compris. Elle n'est simplement pas branchée
sur les routes de données.

**Point de vigilance pour la correction** : `resolveProductFromRequest` accepte une surcharge par
en-tête `X-Foretmap-Product`, prévue pour les tests et l'e2e. Si la surface devient une décision
serveur, cette surcharge doit être **restreinte hors production**, faute de quoi elle rouvrirait
par en-tête ce que le host vient de fermer.

### 2.4 — S4 (P0, important) · Omettre `map_id` élargit l'accès

**Corrigé** (lot B) : `intersectSurfaceMapScope` ramène toute lecture, avec ou sans `map_id`, aux cartes de la surface. Mesure d'après correctif, anonyme sur le produit ForêtMap : `/api/zones` rend 69 zones de 5 cartes au lieu de 118 de 7 — `lyautey` n'en fait plus partie.

| Requête anonyme                   | Renvoyé                       |
| --------------------------------- | ----------------------------- |
| `/api/zones?map_id=lyautey`       | 36 zones (1 carte)            |
| `/api/zones`                      | **118 zones — les 7 cartes**  |
| `/api/map/markers?map_id=lyautey` | 44 repères (1 carte)          |
| `/api/map/markers`                | **95 repères — les 7 cartes** |

Le code prévoit ce cas (`resolveScopedMapFilter` ramène la liste au périmètre du compte) et le
commentaire est explicite : « sinon la garde ne tiendrait qu'à l'omission d'un paramètre ». Mais
comme le périmètre d'un anonyme vaut `null` (§2.1), la réduction ne s'applique pas à lui : la
garde tient bel et bien à l'omission d'un paramètre, pour celui qui n'a pas de compte.

### 2.5 — S5 (P0, critique) · La surface `staff` est servie à l'anonyme par la route générique

**Corrigé** (lot D) : sur le produit `staff`, les routes génériques passent par `resolveStaffPlanViewer` — le même lecteur que `/api/staff-plan/content`. `?surface=staff` depuis une autre surface ne peut plus qu'intersecter, donc jamais élargir.

`/api/staff-plan/content` est correctement gardé (`401`, §1) — `lib/staffPlanAccess.js` est la
pièce la plus rigoureuse de l'ensemble : rôle authentifié, code plus court (7 j contre 30),
rôle endossé bas, journalisation de chaque ouverture, lecteur synthétique sans permission.

Mais la même matière sort par la porte d'à côté :

```
/api/map/markers?map_id=lyautey&surface=staff   →   200, 44 repères, sans authentification
```

Le durcissement porte sur l'**endpoint composite** de la surface, pas sur les **lignes**. Tant
que `proflyautey` n'expose que des lieux déjà présents ailleurs, la portée reste celle de S1.
**Le jour où des consignes réservées aux personnels y sont saisies, ce chemin les expose** —
sauf si elles passent par `location_notes`, dont l'audience est filtrée ligne à ligne par
`lib/locationAudience.js` (aucun complément réservé n'est sorti dans la mesure ci-dessus, `0`
note renvoyée). C'est la raison de fond de maintenir `proflyautey` en 503 : la garde de la
surface n'est pas encore une garde des données.

### 2.6 — S6 (P0, moyen) · Géoréférencement exposé à toutes les surfaces

**Corrigé** (lot E), mais **pas comme prévu**. Le plan annonçait d'omettre `georef` pour les surfaces « qui n'en ont pas besoin ». À l'implémentation, un test a montré que la Visite **s'en sert** : `src/components/visit-views.jsx` affiche la position du lecteur sur un terrain d'apprentissage. Retirer les ancres aurait cassé la fonction sans rien protéger. Ce qui fuyait, ce sont les ancres de `lyautey` — fermées par le périmètre de surface du lot B, qui sort la carte du catalogue public. Le catalogue `/api/maps` est en outre gardé comme les autres routes sur les surfaces à laissez-passer.

`GET /api/maps` renvoie anonymement les 7 cartes avec `georef` (ancrages lat/lng) et
`gps_enabled` — 6 des 7 sont géoréférencées, `lyautey` comprise. Le plan public n'a pas besoin
des ancrages d'une carte qu'il n'affiche pas, et aucune surface n'a besoin du catalogue complet.

### 2.7 — S7 (P1) · Les métadonnées EXIF des photos ne sont jamais retirées

**Corrigé** (lot F) : `lib/imageMetadata.js` retire EXIF/GPS, IPTC et XMP, posé sur les **deux
points de passage** de l'écriture (`saveBase64ToDisk`, `writeBufferToDisk`) plutôt que sur les
vingt appelants. L'orientation est appliquée avant d'être jetée. Le stock antérieur se traite
par `scripts/strip-uploads-exif.js` (lecture seule par défaut). Filet :
`tests/uploads-exif.test.js`, dont un cas passe par la vraie route
`POST /api/zones/:id/photos` jusqu'au fichier servi publiquement.

**Trouvé au passage** : quatre scripts de migration appelaient l'écriture **sans `await`**
(`migrate-images-to-disk`, `gl-import-wp`, `migrate-sqlite-to-mysql` ×2). Le défaut était
latent — l'écriture partait sans que personne l'attende — et le travail ajouté par le retrait
des métadonnées l'aurait rendu réel. Corrigé dans le même lot ; les routes de production, elles,
attendaient déjà toutes correctement.

Recherche de `exif` sur tout le dépôt (hors `node_modules`) : **aucune occurrence**.

Les originaux sont écrits tels quels — `lib/uploads.js` :

```js
await fs.promises.writeFile(absolutePath, buf); // saveBase64ToDisk
await fs.promises.writeFile(absolutePath, buffer); // writeBufferToDisk
```

Seule la **vignette** passe par `sharp(...).rotate()` (`lib/imageThumb.js`), qui supprime les
métadonnées en sortie — mais elle est générée **à côté** de l'original, qui reste servi. Les
familles `zones/`, `markers/`, `students/`, `tasks/` étant publiques sous `/uploads`, une photo
prise au téléphone conserve ses **coordonnées GPS**, son horodatage et son modèle d'appareil,
téléchargeables sans authentification. Sur un établissement où les photos sont prises par des
élèves mineurs sur site, c'est le constat P1 le plus concret.

### 2.8 — S8 (P1) · Le service worker du plan conserve les données sur l'appareil

**Corrigé** (lot G) — mais pas en retirant `/api/plan/content` du cache, ce que l'arbitrage
annoncé envisageait. Le hors-ligne est la raison d'être de cette stratégie : un visiteur qui
scanne le QR code à l'entrée de l'établissement n'a pas toujours de réseau. Deux mécanismes
plutôt qu'un retrait :

1. **Éviction sur refus d'autorisation** (`src/shared/pwa/swTemplate.js`) — une 401/403 au
   rafraîchissement retire l'entrée du cache. Le contenu périmé part **une dernière fois**,
   la réponse étant déjà rendue quand le réseau tranche ; le chargement suivant renvoie à
   l'écran de code. Ce résidu est le prix du hors-ligne, et il est documenté dans le gabarit
   plutôt que passé sous silence.
2. **La politique d'API entre dans le nom du cache** (`scripts/build-pwa.js`, `precacheHash`).
   `activate` supprimait déjà tout cache dont le nom diffère, mais le hash ne couvrait que le
   précache : retirer une route de l'allowlist ne purgeait rien tant qu'aucun bundle ne
   bougeait. C'est ce qui manquait à la « purge versionnée » que le constat appelait.

**Trouvé au passage** : `putInCache` mémorisait **toute** réponse, 401 et 500 comprises —
l'erreur d'un instant devenait la réponse hors ligne pour la durée du cache. Seules les
réponses valides sont désormais mémorisées.

Le profil `staff`, qui ne met aucune API en cache, est inchangé : c'était déjà le bon choix.

`scripts/build-pwa.js` :

- produit `plan` : `apiStaleWhileRevalidate: ['/api/plan/content', '/api/plan/settings']` ;
- produit `staff` : `apiStaleWhileRevalidate: []`, `apiNetworkFirst: []` — **aucune API mise en
  cache**, avec le commentaire « et c'est le point du produit ». Ce choix est juste et doit être
  conservé tel quel.

Conséquence pour le plan public : le contenu (entrées, loge, infirmerie) persiste dans le cache
du navigateur **après changement ou révocation du code**. Une purge versionnée des caches
existants est à prévoir avec le correctif.

### 2.9 — S9 (P2) · Pas de `robots.txt`

`GET /robots.txt` renvoie `200` **avec le HTML de repli de la SPA** — le fichier n'existe pas.
Rien n'empêche l'indexation de `planlyautey` ni, à son activation, de `proflyautey`. Aucun
`noindex` ni en-tête `X-Robots-Tag` n'est posé par produit.

> **Corrigé** — lot **J** (23/09) : `robots.txt` par produit et `X-Robots-Tag: noindex,
nofollow, noarchive` sur les surfaces gardées (`lib/robotsRoutes.js`, drapeau `indexable` au
> registre `lib/products.js`). Filet : `tests/security-robots.test.js`. Détail : §13.4.

### 2.10 — S10 (P2) · `/api/settings/public` renseigne sur la topologie

**95 clés** sont déclarées `scope: 'public'`, dont :

| Clé                                  | Ce qu'elle apprend à un anonyme                     |
| ------------------------------------ | --------------------------------------------------- |
| `ui.plan.access_mode`                | si le plan est ouvert, fermé par code, ou désactivé |
| `ui.plan.public_base_url`            | l'URL de la surface plan                            |
| `ui.staff_plan.access_mode`          | **que `proflyautey` existe**, et son état           |
| `ui.auth.allow_register`             | si l'inscription est ouverte                        |
| `ui.auth.allow_google_auto_register` | si l'auto-inscription Google est ouverte            |

Aucun secret n'y transite, mais l'ensemble compose une carte de reconnaissance gratuite. À
réduire au strict nécessaire au front de **chaque** produit (le front du plan n'a pas besoin de
connaître l'état de la surface personnels).

> **Corrigé** — lot **K** (23/09) : `/api/settings/public` borné au périmètre de chaque
> produit (`lib/publicSettingsScope.js`) ; `ui.staff_plan.*` ne sort plus sur aucune surface
> publique. Filet : `tests/security-public-surface.test.js`. Détail : §13.5.

### 2.11 — S11 (P1, piège de configuration) · Deux réglages d'inscription indépendants

`ui.auth.allow_register` est vérifié en un seul point (`routes/auth.js:528`, `POST /api/auth/register`).
L'auto-inscription Google est gardée par un réglage **distinct**,
`ui.auth.allow_google_auto_register` (`routes/auth.js:1222`, défaut `false`).

Les deux gardes sont réelles et leurs défauts sont sûrs — mais **fermer l'inscription ne ferme
pas l'auto-inscription Google**. Un administrateur qui décoche « autoriser l'inscription » croit
raisonnablement avoir fermé la création de comptes. À traiter comme un point d'ergonomie des
réglages, pas comme une faille.

> **Corrigé** — lot **I** (23/09) : `ui.auth.allow_register` devient l'interrupteur général
> de la création de comptes (`lib/registrationPolicy.js`), et les libellés d'administration le
> disent. Filet : `tests/security-registration-policy.test.js`. Détail : §13.3.

---

### 2.12 — S12 (P0, critique) · La Visite publique n'avait **aucune** liste blanche de cartes

_Constat ajouté le 22 septembre 2026 pendant la correction, absent du premier passage._

Le plan public refuse une carte non déclarée depuis le lot 8 — `resolvePlanMap`
(`lib/planContent.js`) vérifie `?map_id=` contre `ui.plan.selectable_map_ids` et répond
« Carte introuvable » sinon. La Visite, elle, n'avait **rien** :

```js
async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested; // ← n'importe quel identifiant, tel quel
  return resolveDefaultMapId('visit');
}
```

`GET /api/visit/content?map_id=lyautey` servait donc le plan du lycée — **36 zones et 47
repères, tous `is_active = 1`** — à un visiteur sans compte, en 211 Ko, sur une route dont le
premier passage avait noté l'ouverture (§4.2) sans en mesurer la portée. C'est, en volume, la
**plus grosse fuite anonyme** de la carte `lyautey` : plus large que les routes génériques, et
elle ne dépendait d'aucun paramètre à deviner.

**Corrigé** (lot B) : `resolveVisitMapIdForViewer` applique à la Visite la liste blanche que le
plan avait déjà. Un gestionnaire de lieux n'est pas borné — il prépare les contenus de visite
carte par carte depuis la console.

## 3. Ce qui est déjà conforme — et qu'il ne faut pas défaire

Vérifié et mesuré. Ces points n'appellent **aucun correctif** ; ils sont listés pour qu'une
future passe ne les « corrige » pas par inadvertance.

| Domaine                           | État constaté                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **socket.io — handshake**         | `io.use()` exige un JWT valide ; connexion anonyme **refusée** (mesuré : `unauthorized`)                                                     |
| **socket.io — présence**          | `canSubscribePresence()` exige une permission (`stats.read.*`, `teacher.access`, `admin`/`n3boss`) ; aucune diffusion d'identité aux invités |
| **`/uploads` — listage**          | `express.static(..., { index: false })` : pas de listage de répertoire                                                                       |
| **`/uploads` — familles privées** | `observations/`, `task-logs/`, `user-journal/` refusés en accès direct (403), forçant le passage par la route qui autorise                   |
| **`/uploads` — SVG**              | CSP `sandbox` + `Content-Disposition: attachment` : XSS stocké neutralisé                                                                    |
| **Code du plan**                  | bcrypt, `authLimiter` (fenêtre 15 min) **posé sur la route** `POST /api/plan/access`, cookie HMAC HttpOnly/SameSite/Secure                   |
| **Mot de passe oublié**           | jeton **haché** en base, TTL 60 min, réponse neutre (pas d'énumération de comptes)                                                           |
| **Impersonation**                 | `requirePermission('admin.impersonate')` + journal d'audit (`auth_impersonate_start`)                                                        |
| **Connexion**                     | `loginThrottle` : verrouillage exponentiel plafonné à 15 min                                                                                 |
| **Isolement GL ↔ ForêtMap**       | un JWT `product:'gl'` est rejeté hors `/api/gl/*` (403), frontière `/gl` vs `/glossary` traitée explicitement                                |
| **QCM**                           | `/api/quiz/questions` expose 650 questions **sans aucun champ de réponse** — vérifié champ par champ                                         |
| **En-têtes**                      | `helmet` actif ; CSP imposée + `Report-Only` avec collecteur borné à 16 ko                                                                   |
| **Débit**                         | limiteur général `/api/` (1200/min) + `authLimiter` strict sur les chemins d'authentification de chaque produit                              |
| **`POST /api/students/register`** | malgré son nom, ce n'est **pas** une inscription ouverte : `requireAuth` + vérification que l'appelant est bien l'élève visé                 |

---

## 4. Inventaire des routes

671 routes déclarées : **343 ForêtMap**, **328 G&L**. La détection statique des gardes s'est
révélée peu fiable (nombre d'entre elles sont portées par des constantes locales ou par
`router.use()`), l'inventaire d'autorité est donc **la mesure** : les 123 routes `GET` ForêtMap
atteignables ont été sondées anonymement.

**Résultat : 31 chemins sur 123 répondent `200` avec du contenu à un appelant non authentifié.**
Répartition des codes sur 246 sondes (avec et sans `map_id`) : `200` × 62, `401` × 168,
`404` × 8, `503` × 6, `500` × 2.

### 4.1 Routes liées à une carte ou à une surface — le cœur du P0

| Route                          | Auth actuelle                        | Rôle requis | Périmètre renvoyé à un anonyme  | Surfaces             | Comportement cible                                                         |
| ------------------------------ | ------------------------------------ | ----------- | ------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `GET /api/zones`               | `authenticate` _(facultative)_       | —           | **118 zones, 7 cartes**         | map/visit/plan/staff | Surface déduite du host ; refus par défaut hors surface publique           |
| `GET /api/zones/:id`           | `authenticate` _(facultative)_       | —           | zone de n'importe quelle carte  | idem                 | idem + vérification que la zone appartient à la surface                    |
| `GET /api/map/markers`         | `authenticate` _(facultative)_       | —           | **95 repères, 7 cartes**        | idem                 | idem ; `hidden_surfaces` filtré **toujours**                               |
| `GET /api/maps`                | `authenticate` _(facultative)_       | —           | **7 cartes + géoréférencement** | toutes               | Catalogue réduit à la surface ; `georef` seulement si la surface l'utilise |
| `GET /api/map-categories`      | `authenticate` + `requireMapAccess`  | —           | **11 catégories**               | idem                 | Catégories `surfaces` filtrées côté serveur                                |
| `GET /api/visit/content`       | `authenticate` _(facultative)_       | —           | **211 Ko**                      | visit                | Réservé à la surface `visit`                                               |
| `GET /api/map-routes`          | `authenticate` + `requirePlanAccess` | —           | `401` ✅                        | plan/staff           | conforme                                                                   |
| `GET /api/plan/content`        | `requirePlanAccess`                  | —           | `401` ✅                        | plan                 | conforme                                                                   |
| `GET /api/plan/settings`       | aucune                               | —           | `200` (coquille : titre, mode)  | plan                 | acceptable (écran de saisie du code) — à réduire                           |
| `GET /api/staff-plan/content`  | `resolveStaffPlanViewer`             | personnel+  | `401` ✅                        | staff                | conforme                                                                   |
| `GET /api/staff-plan/settings` | aucune                               | —           | `200` (149 o)                   | staff                | à réduire (révèle l'existence de la surface)                               |

### 4.2 Autres routes ouvertes à l'anonyme (mesurées)

| Route                                                               | Octets renvoyés                  | Appréciation                                                   |
| ------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `GET /api/plants`                                                   | 923 760                          | corpus pédagogique — ouverture assumée, mais poids à revoir    |
| `GET /api/quiz/questions`                                           | 173 385                          | 650 questions, **sans réponses** — acceptable                  |
| `GET /api/tasks`                                                    | 131 297                          | 83 tâches, aucune affectation nominative — à confirmer en prod |
| `GET /api/glossary/terms`                                           | 68 703                           | contenu pédagogique — acceptable                               |
| `GET /api/tutorials` (+ `/view`, `/download/html`, `/download/pdf`) | 15 351 / 21 790 / 14 722 / 6 791 | fiches pédagogiques — acceptable                               |
| `GET /api/settings/public`                                          | 13 197                           | **95 clés** — §2.10                                            |
| `GET /api/food-web/*`                                               | 205 – 1 090                      | contenu pédagogique — acceptable                               |
| `GET /api/task-projects`                                            | 1 156                            | à vérifier : noms de projets                                   |
| `GET /api/auth/google/callback`                                     | 1 573                            | page d'erreur OAuth, sans jeton — acceptable                   |

### 4.3 socket.io

| Événement                                                           | Sens    | Garde                                                                  |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| _handshake_                                                         | entrant | JWT obligatoire — anonyme **refusé** (mesuré)                          |
| `subscribe:map`                                                     | entrant | authentifié ; `mapId` du handshake — **périmètre carte non revérifié** |
| `subscribe:gl-game`                                                 | entrant | `canAccessGlGame()`                                                    |
| `subscribe:gl-class`                                                | entrant | authentifié + appartenance                                             |
| `presence:*`                                                        | sortant | `canSubscribePresence()` — permission encadrement                      |
| `tasks/students/garden/forum/context_comments/observations:changed` | sortant | salles de domaine, rejointes après authentification                    |
| `gl:game:event`, `gl:spell_cast:draft`                              | sortant | salle de partie G&L                                                    |

`subscribe:map` mérite une vérification au même titre que les routes REST : la salle est
rejointe sur un `mapId` fourni par le client, sans passer par `canAccessMapId()`. Les
événements de domaine ne portent pas de données de lieu, la portée est donc faible aujourd'hui —
mais c'est le même schéma de confiance que §2.3.

---

## 5. Origine du défaut

Le modèle d'accès s'est construit par **ajouts successifs de surfaces** sur une base conçue
publique : d'abord la forêt comestible (tout est public, c'est le but), puis la Visite, puis le
Plan Lyautey, puis le plan des personnels (migration `260`). À chaque étape, la garde a été
posée sur **le point d'entrée de la nouvelle surface** — ce qui est la bonne réaction — sans
revenir sur l'hypothèse fondatrice des routes génériques : « une lecture sans session est une
lecture publique ».

Cette hypothèse est inscrite noir sur blanc dans `lib/mapAccess.js` et dans
`lib/shared/mapScopeCore.js:65`. Elle était vraie pour la forêt comestible. Elle est fausse
depuis `lyautey`. **C'est le seul point à renverser** — le reste du chantier en découle.

---

## 6. Ce que le correctif ne doit pas casser

- La **Visite publique** et la forêt comestible doivent rester ouvertes sans compte : le refus
  par défaut se décide **par surface**, pas globalement.
- Le **périmètre par groupe** (`group_scopes.map_id`) doit continuer de cloisonner les classes
  entre elles pour les comptes élèves — il s'ajoute à la garde de surface, il ne la remplace pas.
- Le **lecteur synthétique** du code personnels (rôle sans permission) doit le rester : il ne
  faut pas qu'un porteur de code devienne gestionnaire de lieux.
- Le service worker `staff` ne met **aucune** API en cache : à conserver.

---

## 7. Plan de correction — **P0 et M livrés, P1/P2 ouverts**

### P0 — avant tout lien transmis au jury · **livré** (voir §11)

| Lot   | Objet                                                                                                                                                                                                                                                                             | Traite |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **A** | **Surface serveur.** Middleware unique déduisant la surface du produit résolu par host + état d'authentification ; `?surface=` n'est plus qu'un filtre **restrictif** à l'intérieur de la surface, jamais élargissant. Surcharge `X-Foretmap-Product` restreinte hors production. | S3     |
| **B** | **Refus par défaut.** `canBypassMapScope` ne rend plus `true` pour un anonyme : un lecteur sans session est borné aux cartes de sa surface. Les cartes ouvertes (forêt, visite) sont déclarées explicitement, pas déduites de l'absence de compte.                                | S1, S4 |
| **C** | **Filtrage inconditionnel.** `hidden_surfaces` et `surfaces` de catégorie appliqués **toujours**, sur la surface résolue en A, pour zones, repères, catégories et contenus de visite.                                                                                             | S2     |
| **D** | **Gardes sur les routes génériques.** `requirePlanAccess` / garde `staff` étendues à `/api/zones`, `/api/map/markers`, `/api/map-categories`, `/api/maps` quand la surface résolue est `plan` ou `staff`.                                                                         | S1, S5 |
| **E** | **Géoréférencement.** `georef` / `gps_enabled` omis pour les surfaces qui ne les exploitent pas ; catalogue `/api/maps` réduit à la surface.                                                                                                                                      | S6     |

Lot A d'abord : B, C, D et E s'appuient sur la surface qu'il établit.

### P1

| Lot   | Objet                                                                                                                                                  | Traite |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **F** | **EXIF.** Réécriture des images à l'import via `sharp` (métadonnées retirées, orientation appliquée) + script de nettoyage des originaux déjà stockés. | S7     |
| **G** | **Caches PWA.** Purge versionnée des caches du plan ; arbitrage sur le maintien de `/api/plan/content` en cache.                                       | S8     |
| **H** | **socket.io.** `subscribe:map` vérifié par `canAccessMapId()`.                                                                                         | §4.3   |
| **I** | **Réglages d'inscription.** Regroupement ou dépendance explicite entre `allow_register` et `allow_google_auto_register`.                               | S11    |

### P2

| Lot   | Objet                                                                                                          | Traite |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------ |
| **J** | `robots.txt` par produit + `X-Robots-Tag: noindex` sur `planlyautey` et `proflyautey`.                         | S9     |
| **K** | Réduction de `/api/settings/public` au nécessaire **par produit**.                                             | S10    |
| **L** | CORS restreint aux trois origines ; revue des en-têtes.                                                        | —      |
| **M** | **Scan de secrets sur tout l'historique Git** — préalable **bloquant** à toute publication sous licence libre. | —      |

Le lot M est indépendant des autres et peut démarrer immédiatement : il conditionne la
publication du code, pas le lien jury.

---

## 8. Tests exigés — **livrés pour P0** (`tests/security-surfaces.test.js`)

1. **Matrice surface × route × authentification** (`tests/security-surfaces.test.js`, supertest) :
   pour chaque route du §4.1 et chaque surface, un appel sans authentification et sans code doit
   rendre `401`/`403` ou une charge filtrée. Table pilotée par les données, pour qu'une route
   nouvelle ne puisse pas être ajoutée sans entrée dans la matrice.
2. **Non-régression `hidden_surfaces`** : un repère marqué `hidden_surfaces = ['plan']` ne doit
   **jamais** sortir sur la surface `plan`, **`?surface=` absent, présent, ou contradictoire**.
   C'est le test qui aurait attrapé S2.
3. **Non-régression « omission de paramètre »** : `/api/zones` sans `map_id` ne doit pas renvoyer
   plus que `/api/zones?map_id=<carte de la surface>`.
4. **Surcharge d'en-tête** : `X-Foretmap-Product` ne doit pas changer la surface en production.
5. **e2e** : sur `planlyautey`, un `401` renvoie à l'écran de code ; sur `proflyautey`, à l'écran
   de connexion — sans écran blanc ni boucle.
6. **EXIF** : une image porteuse de GPS importée puis relue ne doit plus porter de métadonnées.

---

## 9. Note « modèle de sécurité » — qui voit quoi

**Extraite le 23 septembre 2026** vers
[`docs/reference/exploitation/modele-de-securite.md`](reference/exploitation/modele-de-securite.md),
les lots P0 étant livrés et mesurés : c'est là qu'elle vit désormais, en langue non technique,
à l'usage des administrateurs et de la direction. Le tableau ci-dessous en reste la forme
courte, pour qui lit cet audit.

Elle n'a volontairement pas été publiée avant : elle aurait décrit une politique que le code
n'appliquait pas encore.

| Surface                  | Host            | Entrée                                       | Voit                                                              | Ne voit jamais                                                                       |
| ------------------------ | --------------- | -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Visite / forêt**       | `foretmap.*`    | libre                                        | cartes déclarées publiques, lieux non masqués sur `visit`         | `lyautey`, lieux masqués, compléments réservés                                       |
| **ForêtMap authentifié** | `foretmap.*`    | compte élève / personnel                     | cartes du périmètre de ses groupes, audience de son rôle          | cartes hors périmètre, audiences supérieures                                         |
| **Plan public**          | `planlyautey.*` | libre, ou code si `access_mode = 'code'`     | carte `lyautey`, lieux visibles sur `plan`                        | lieux `hidden_surfaces: plan`, compléments réservés, géoréférencement, autres cartes |
| **Plan personnels**      | `proflyautey.*` | compte personnel (rôle RBAC) ou code partagé | lieux visibles sur `staff` + compléments réservés de son audience | audiences supérieures ; un porteur de code n'est jamais gestionnaire                 |

**Trois règles invariantes :**

1. **La surface est décidée par le serveur** (host + état d'authentification), jamais par le client.
2. **Refus par défaut** : une carte n'est visible sur une surface que si elle y est déclarée.
3. **Le filtrage est une propriété de la réponse, pas une option de la requête** : `hidden_surfaces`
   et l'audience s'appliquent quelle que soit la forme de l'appel.

---

## 10. Limites de cet audit

- Mesures faites sur le **fixture anonymisé** migré localement, pas sur la production : la
  structure et les volumes sont représentatifs, les libellés ne le sont pas. Les constats du
  22/09 portant sur les libellés réels (« loge visiteurs », « infirmerie ») sont repris de
  l'observation externe et **non revérifiés ici**.
- Les **routes d'écriture** (POST/PUT/DELETE) n'ont pas été sondées : les sonder aurait modifié
  des données. Leurs gardes ont été lues, non mesurées. Une passe dédiée reste à faire.
- Les **328 routes G&L** n'ont pas été sondées individuellement : l'isolement produit a été
  vérifié, le détail de leurs gardes non.
- Le **scan de secrets sur l'historique Git** a depuis été lancé : voir §12.

---

## 11. Livraison des lots P0 (A–E) — 22 septembre 2026

### 11.1 Ce qui a été écrit

| Fichier                                                                                             | Rôle                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lib/shared/surfaceCore.js` _(neuf)_                                                                | **Noyau pur** : décide la surface (produit × authentification), et l'intersection de `?surface=`  |
| `lib/surfaceAccess.js` _(neuf)_                                                                     | Garde `withLocationSurface` : laissez-passer de la surface, cartes déclarées, filtrage des lignes |
| `lib/visitRouteShared.js`                                                                           | `resolveVisitMapIdForViewer` — la liste blanche qui manquait à la Visite (S12)                    |
| `lib/locationCategories.js`                                                                         | `listCategories` accepte **plusieurs** surfaces (intersection)                                    |
| `lib/settings.js`                                                                                   | Réglage `ui.visit.selectable_map_ids` (portée `admin`, pas `public` — cf. S10)                    |
| `routes/zones.js`, `routes/map.js`, `routes/map-categories.js`, `routes/maps.js`, `routes/visit.js` | Branchement de la garde                                                                           |
| `tests/security-surfaces.test.js` _(neuf)_                                                          | Neuf cas : la matrice du §8, exécutable                                                           |

### 11.2 La décision de conception, en une phrase

**Une carte réservée à une surface gardée n'est pas servie sur la surface publique tant qu'un
administrateur ne l'y a pas explicitement mise.** `ui.visit.selectable_map_ids` fait autorité
dès qu'il est renseigné ; à défaut, la Visite sert les cartes actives **moins** celles
déclarées pour les plans (`ui.plan.map_id`, `ui.staff_plan.*`). C'est ce qui ferme `lyautey`
sans rien déclarer à la main, et sans fermer les terrains d'apprentissage.

### 11.3 Mesures après correctif

Même environnement et même méthode qu'au premier passage (fixture migré, plan en mode `code`) :

| Requête **anonyme**                                         | Avant                 | Après                   |
| ----------------------------------------------------------- | --------------------- | ----------------------- |
| `/api/zones?map_id=lyautey` _(host foretmap)_               | `200` — 36 zones      | `400` Carte introuvable |
| `/api/map/markers?map_id=lyautey` _(host foretmap)_         | `200` — 44 repères    | `400` Carte introuvable |
| `/api/visit/content?map_id=lyautey`                         | `200` — 211 Ko        | `400` Carte introuvable |
| `/api/zones` _(sans `map_id`)_                              | 118 zones / 7 cartes  | 69 zones / 5 cartes     |
| `/api/map/markers` _(sans `map_id`)_                        | 95 repères / 7 cartes | 47 repères / 5 cartes   |
| `/api/zones?map_id=lyautey` _(host planlyautey, sans code)_ | `200` — 36 zones      | `401` code requis       |
| `/api/maps` _(host planlyautey, sans code)_                 | `200` — 7 cartes      | `401` code requis       |

Et la garde n'enferme pas dehors — **avec** le bon code, sur `planlyautey` :
`/api/plan/content` `200`, `/api/zones` 36 zones, `/api/map-categories` 11 catégories,
et `/api/map/markers` **42** repères : les deux marqués `hidden_surfaces: ['plan']` sont
filtrés, `?surface=` absent, présent ou contradictoire — S2 fermé.

### 11.4 Ce qui a été corrigé en cours de route

**Le lot E a été resserré.** Le plan annonçait d'omettre `georef` pour « les surfaces qui n'en
ont pas besoin ». À l'implémentation, deux tests de `tests/settings-maps-georef.test.js` sont
tombés — et la lecture du front a montré que la **Visite s'en sert** : `visit-views.jsx` affiche
la position du lecteur sur un terrain d'apprentissage. Retirer les ancres aurait cassé la
fonction sans rien protéger : ce qui fuyait, ce sont les ancres de `lyautey`, déjà fermées par
le périmètre de surface du lot B. Le retrait a donc été annulé, et le catalogue `/api/maps`
simplement gardé comme les autres routes. Un correctif de sécurité qui casse une fonction
d'usage est un correctif qu'on finit par désactiver.

### 11.5 Vérifications

- `npm test` — **3882 passés, 0 échec** (2 ignorés), dont les 9 nouveaux cas.
- `npm run test:ui` — **4652 passés**. `npm run test:content` — **64 passés**.
- `npm run lint` — 0 erreur. `npm run format:check` — conforme.
- **Efficacité du filet vérifiée** : en neutralisant volontairement le filtrage de surface et la
  liste blanche, 4 des 9 cas tombent. Un test de sécurité qui ne rougit jamais ne prouve rien.
- Six tests de `tests/plan-content.test.js` ont dû être **authentifiés** : ils écrivaient en tant
  que professeur puis relisaient **anonymement**, c'est-à-dire qu'ils figeaient le comportement
  vulnérable. Leur intention (exposition de `hidden_surfaces`, sémantique de `?surface=`) est
  conservée à l'identique.

### 11.6 Ce qui reste ouvert

S7 (EXIF), S8 (caches PWA), S9 (`robots.txt`), S10 (`/api/settings/public`), S11 (réglages
d'inscription) — lots F à L, P1 et P2, non engagés.

---

## 12. Lot M — scan de secrets sur l'historique Git

### 12.1 Méthode, et un faux négatif évité

Le dépôt était cloné en **superficiel** (`.git/shallow`, 104 commits depuis le 17 septembre)
alors que le projet en compte **3 421** depuis le 18 mars 2026 : un premier scan n'a couvert que
**3 %** de l'historique. Le clone a été complété (`git fetch --unshallow`) avant de recommencer
sur les **44 030 blobs** réellement présents.

Un second faux négatif a été écarté en chemin : `grep -I` sur le flux `git cat-file --batch`
classe l'ensemble comme binaire (le flux contient des images) et ne rend **rien**. C'est le
genre de « zéro résultat » rassurant qui ne prouve rien — la passe a été refaite sans `-I`.

### 12.2 Ce qui est propre

Aucune occurrence, sur l'historique complet : secret client Google (`GOCSPX-`), clé AWS
(`AKIA…`), clé privée réelle, jeton signé (JWT), URI de base de données avec identifiants,
jeton Slack / OpenAI / GitHub. La seule ligne `BEGIN PRIVATE KEY` est un **gabarit commenté**
de `.env.example`. `.env`, `.env.local` et `.env.production` n'ont **jamais** été versionnés.
`sql/biodiv_pedago_seed.sql` ne contient aucune adresse e-mail.

### 12.3 **Un blocage pour la publication**

> **`sql/foretmap_bdd_complete.sql` — dump de production de 4,3 Mo — est dans l'historique.**

|            |                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ajouté par | `6b11e9fe4` — _feat(biodiv): glossaire, QCM et réseau trophique v1.59.1_                                                                                                                               |
| Retiré par | `7167ac0e2` — _fix(sécurité): retirer le dump de production versionné (données personnelles)_                                                                                                          |
| Contenu    | **36 adresses e-mail** (`@lyceelyautey.org`, `@pedagolyautey.org`, `@gmail.com`…), **41 hachages bcrypt**, 94 tables dont `users`, `forum_posts`, `observation_logs`, `context_comments`, `user_roles` |

Le retrait a porté sur la **tête**, pas sur l'historique : le blob reste accessible à tout
clone. Pour un dépôt privé, l'exposition est celle des personnes qui ont accès au dépôt ; **à la
publication sous licence libre, elle devient publique** — données personnelles d'élèves et de
personnels d'un établissement scolaire, dont des mineurs.

**Conséquence : le dépôt ne peut pas être publié en l'état.** Trois actions, dans cet ordre,
et aucune n'est à prendre seul :

1. **Réécrire l'historique** (`git-filter-repo` ou BFG) pour retirer le blob, puis forcer la
   mise à jour de toutes les références. Opération **destructive et coordonnée** : elle change
   tous les identifiants de commit, invalide chaque clone et chaque PR ouverte. Elle demande une
   fenêtre annoncée, et n'a pas été engagée ici.
2. **Considérer les 41 mots de passe comme compromis** : réinitialisation forcée des comptes
   concernés. Le facteur bcrypt 10 protège contre l'usage immédiat, pas contre une attaque hors
   ligne patiente.
3. **Tracer l'incident RGPD** : 36 personnes identifiables, établissement scolaire, mineurs
   probables. La qualification relève du responsable de traitement, pas de cet audit.

Les trois autres blobs porteurs de hachages sont `tests/tasks-validate-rbac.test.js` — des
fixtures de test, sans portée.

### 12.4 Limite

Le scan repose sur des **motifs**. Un secret sans forme reconnaissable (mot de passe court en
clair dans un commentaire, jeton maison sans préfixe) n'est pas détecté. Ce qui précède établit
qu'aucun secret **de forme connue** subsiste, pas qu'il n'y en a aucun.

---

## 13. Livraison des lots P1/P2 restants (H à L) — 23 septembre 2026

Les lots **F** et **G** ayant été livrés la veille (S7, S8), ce lot ferme les quatre constats
restants : **S9**, **S10**, **S11** et la revue d'en-têtes annoncée en **L**. Aucun d'eux n'est
critique — aucun n'ouvre de données. Ils partagent en revanche un même défaut de forme : ils
laissent l'application **se décrire** plus qu'elle n'en a besoin, ou laissent une garde ne pas
tenir la promesse que son libellé fait à l'administrateur.

### 13.1 Ce qui a été écrit

| Fichier                                               | Rôle                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `lib/realtime.js`                                     | **Lot H** — `subscribe:map` passe par `canAccessMapId()` ; un refus quitte la salle courante |
| `lib/registrationPolicy.js` _(neuf)_                  | **Lot I** — `allow_register` devient l'interrupteur général de la création de comptes        |
| `routes/auth.js`                                      | Les deux chemins d'inscription lisent la même politique                                      |
| `lib/robotsRoutes.js` _(neuf)_                        | **Lot J** — `/robots.txt` par produit + `X-Robots-Tag` sur les surfaces gardées              |
| `lib/products.js`, `plan.html`                        | Drapeau `indexable` au registre ; `<meta name="robots">` sur l'entrée du plan                |
| `lib/publicSettingsScope.js` _(neuf)_                 | **Lot K** — `/api/settings/public` borné au périmètre de chaque produit                      |
| `lib/securityHeaders.js` _(neuf)_                     | **Lot L** — `Permissions-Policy` ; politique CORS journalisée au démarrage                   |
| `tests/security-realtime-map-scope.test.js` _(neuf)_  | Lot H — trois cas (poignée de main, `subscribe:map`, compte non borné)                       |
| `tests/security-registration-policy.test.js` _(neuf)_ | Lot I — trois cas (fermé ferme les deux chemins, ouvert garde son réglage propre)            |
| `tests/security-robots.test.js` _(neuf)_              | Lot J — quatre cas (HTML, API, surface publique non dé-référencée)                           |
| `tests/security-public-surface.test.js` _(neuf)_      | Lots K et L — cinq cas                                                                       |

### 13.2 Lot H — le périmètre de groupe ne s'arrêtait pas à la socket

`subscribe:map` ne vérifiait que l'**existence** de la carte (`mapExists`). Un compte ForêtMap
authentifié mais borné par le périmètre de son groupe pouvait donc s'abonner à n'importe quelle
carte — `lyautey` comprise — et recevoir ensuite tous ses signaux de mutation. La charge utile
ne porte pas de contenu (un motif, des identifiants), mais elle trahit l'activité d'une carte
qu'on n'a pas le droit de lire : qui édite, et quand.

Ce n'est pas un oubli de règle, c'est un oubli de **lieu** : la règle existait
(`requireMapAccess` sur les routes HTTP), elle n'avait simplement pas été portée sur le second
canal. Une connexion socket vit bien plus longtemps qu'une requête — c'est précisément là
qu'une vérification manquante dure.

Le refus **quitte** la salle courante au lieu de la conserver : si le périmètre change pendant
la session, changer de carte ne doit pas laisser le flux précédent ouvert.

### 13.3 Lot I — une garde que l'administrateur croyait avoir posée

`ui.auth.allow_register` fermait le formulaire d'inscription ;
`ui.auth.allow_google_auto_register` fermait la création à la première connexion Google. Les
deux gardes étaient réelles et leurs défauts sûrs — mais **fermer l'inscription ne fermait pas
l'auto-inscription Google**.

Le correctif ne supprime pas le second réglage : il reste utile pour n'autoriser la connexion
Google qu'aux comptes existants, inscriptions ouvertes par ailleurs. Il le **subordonne** au
premier, et les libellés d'administration le disent désormais. Une garde qu'on croit avoir
posée doit tenir.

### 13.4 Lot J — une adresse indexée est une adresse qu'on n'a plus à deviner

Le dépôt ne servait aucun `robots.txt` (`GET /robots.txt` rendait le HTML de repli de la SPA) et
aucune réponse ne portait `X-Robots-Tag`, hors `/api/staff-plan/content`.

Deux garde-fous sont posés, parce qu'ils n'échouent pas ensemble : un `robots.txt` **par
produit** (ce qu'un robot lit avant de parcourir) et `X-Robots-Tag: noindex, nofollow,
noarchive` sur **toute** réponse d'un produit non référençable (ce qui vaut pour une adresse
déjà connue d'un moteur, qu'un `robots.txt` ne retirerait jamais de l'index). Le drapeau vit au
registre (`lib/products.js`, champ `indexable`) : ajouter un produit, c'est ajouter une entrée,
pas un `if`.

### 13.5 Lot K — la carte de reconnaissance

95 clés `scope: 'public'` étaient servies **identiques à tous les hosts**. Au premier rang,
`ui.staff_plan.access_mode` apprenait à n'importe quel visiteur de `foretmap.*` que la surface
des personnels existe et dans quel état elle est — alors qu'elle n'est pas encore ouverte.

Le registre n'est pas touché : c'est la **réponse** qui est bornée au périmètre de chaque
produit (`lib/publicSettingsScope.js`). La liste a été établie à partir des valeurs par défaut
du front (`src/utils/appPublicSettings.js`), qui énumèrent exactement les sections fusionnées.
Constat utile au passage : les fronts du plan et du plan personnels **n'appellent pas** cette
route — ils lisent `/api/plan/content` et `/api/staff-plan/content`, qui portent leur garde.

### 13.6 Lot L — ce qui était déjà en place, et ce qui manquait

**CORS était déjà borné** : en production, `buildCorsOptions()` rend `origin: false` (same-origin
seulement) à défaut de `FRONTEND_ORIGINS`. Rien à corriger ; la politique effective est
désormais **journalisée au démarrage**, pour qu'un opérateur la constate sans relire le code.

Manquait `Permissions-Policy`, que `helmet` ne pose pas. Elle laisse `geolocation=(self)` — la
géolocalisation est une fonction du produit, y compris sur la Visite — et refuse ce dont le code
ne se sert pas. `camera` reste à `(self)` plutôt qu'à `()` : les champs de téléversement portent
`capture="environment"`, et la directive ne gouverne que `getUserMedia`. Ne pas parier sur le
comportement d'un navigateur futur pour une photo prise par un élève sur le terrain.

### 13.7 Ce qui reste ouvert

- **Le dump de production dans l'historique Git** (§12) : remédiation non engagée, décision du
  responsable de traitement. C'est le **seul point bloquant** avant publication du code.
- **Les mesures sur la production** : tout ce qui précède est mesuré sur le fixture anonymisé.
  Avant un lien transmis au jury, rejouer les sondes du §11.3 sur la production, et y vérifier
  `ui.plan.selectable_map_ids`.
- `proflyautey` reste à **503**, conformément à la consigne.
