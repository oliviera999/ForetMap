# Prompt agent (Cursor / Claude Code) — Traceurs, ressources tierces et déconnexion

> À soumettre tel quel à l'agent (Cursor ou Claude Code), à la racine du dépôt, sur la branche
> `feat/traceurs-rgpd` (qui porte ce fichier) : elle sert de branche de travail pour les lots A à D.
> Établi sur `main` @ `aec631b` (v1.216.4) le 24/10/2026. Si `main` a bougé, vérifier d'abord que
> les fichiers cités existent encore et adapter les chemins.

---

## Rôle et cadre

Tu interviens sur ForêtMap en développeur senior. Réponds, commente et documente **en français**.
Applique `CLAUDE.md` et les règles de `.cursor/rules/` : SQL paramétré, logger Pino, tests dans le
même lot, `docs/API.md` pour toute route publique nouvelle ou modifiée, `docs/reference/` pour tout
changement visible, `CHANGELOG.md` sous `[Non publié]`, **ne pas toucher au champ `version`**, marque
jamais en dur.

**Objectif** : que ForêtMap reste dispensée de bandeau cookies (art. 82 de la loi Informatique et
Libertés, lignes directrices CNIL 2020) en fermant les quatre écarts relevés par l'audit du
24/10/2026, sur **toutes les surfaces sauf G&L** :

| Surface                                   | Produit (`lib/products.js`) | Front                                             |
| ----------------------------------------- | --------------------------- | ------------------------------------------------- |
| ForêtMap (élèves, profs, visite publique) | `foret`                     | `src/main.jsx`, `src/App.jsx`                     |
| Plan public                               | `plan`                      | `src/plan/AppPlan.jsx`                            |
| Plan des personnels                       | `staff`                     | `src/staff/main.jsx` → `AppPlan` (variante staff) |
| Plan e-nov                                | `enov`                      | `src/enov/main.jsx` → `AppPlan` (variante enov)   |

### Interdit absolu : Gnomes & Licornes

Ne lis, ne modifie, ne teste rien sous `routes/gl/`, `src/gl/`, `lib/gl*`, `lib/gl-pack/`,
`gl.html`, ni aucune migration ou table `gl_*`. La politique CSP servie au produit `gl` (y compris
`/gl/intro/`) doit rester **octet pour octet identique** à aujourd'hui : un test doit le prouver.
Les commits ne portent pas le préfixe `(gl)`.

### Lis d'abord

- `lib/csp.js` (en-tête complet : il explique chaque directive) et le montage CSP dans `server.js`
  (≈ l. 311-327, `buildPolicyTable`, `resolveCspVariant`, `resolveExternalAssetsModeForCsp`).
- `lib/remoteMedia.js`, `routes/media.js`, `tests/remote-media.test.js`.
- `src/shared/privacy/externalAssets.js` (`resolveExternalImageUrl`, `PROXIED_IMAGE_HOSTS`).
- `lib/tutorialViewExternalAssets.js`, `lib/tutorialViewSanitize.js`.
- `src/components/TutorialPreviewModal.jsx` et ses appelants.
- `src/App.jsx` (`handleLogout`, ≈ l. 1048-1085), `src/utils/localDataCleanup.js`,
  `src/services/api.js` (`clearStoredSession`), `src/plan/AppPlan.jsx` (`logout`, ≈ l. 1054),
  `src/plan/planApi.js` (`submitPlanLogout`), `src/plan/staffSession.js`.
- `routes/plan.js`, `routes/enov-plan.js`, `routes/staff-plan.js` (routes `POST /logout`).
- `public/sw.js`, `src/shared/pwa/swTemplate.js`, `scripts/build-pwa.js` (`PWA_PROFILES`).
- `lib/settings/privacy.js`, `src/constants/settingsAdminMeta.js`, `src/utils/appPublicSettings.js`.
- `src/shared/privacy/privacyNoticeContent.js`, `tests/privacy-notice.test.js`.
- `docs/AUDIT_RGPD_2026-09-28.md`, `docs/AUDIT_SECURITE_RGPD_2026-09-30.md` (contexte, constats S-5, S-8, § 7, AP4).

Avant d'écrire du code, rends un **plan court** (fichiers touchés par lot, nouveaux réglages, tests
prévus) et attends ma validation.

---

## Lot A — Déconnexion : `Clear-Site-Data` et purge du cache du service worker

### Constat

À la déconnexion, `handleLogout` efface la session, les files hors ligne du compte et les photos
`/uploads/` du cache du service worker (`purgeCachedUserMedia`). Les **réponses d'API
authentifiées** gardées par le service worker (`/api/tasks`, `/api/zones`, `/api/plants`,
`/api/map/markers`, `/api/task-projects`, `/api/tutorials`, `/api/tutorials/me/read-ids`,
`/api/species-observations/me`, motifs `apiNetworkFirstPatterns`), indexées avec
`__fm_sw_user=<empreinte du jeton>`, **restent sur l'appareil**. Sur une tablette partagée, elles
sont lisibles dans les outils du navigateur. Côté plans, la charge `/api/plan/content` et
`/api/enov/content` (stale-while-revalidate) reste en cache après « Se déconnecter » même quand le
plan est fermé par un code. Le serveur n'envoie aucun `Clear-Site-Data`.

### À faire

1. **ForêtMap — nouvelle route `POST /api/auth/logout`** (dans `routes/auth.js`, hors GL) :
   publique (aucune authentification exigée, toujours `200`, ne révèle pas si quelqu'un était
   connecté), `Cache-Control: no-store`, et l'en-tête `Clear-Site-Data` décrit au point 3.
   Limite de débit légère (réutiliser le limiteur existant des routes d'auth). Documenter dans
   `docs/API.md`.
2. **Plans** : ajouter le même en-tête aux trois `POST /logout` existants (`routes/plan.js`,
   `routes/enov-plan.js`, `routes/staff-plan.js`) sans changer le reste de leur comportement
   (effacement du laissez-passer, journal `staff_plan.access.code_released`).
3. **Contenu de l'en-tête** — helper unique `lib/clearSiteData.js` :
   - par défaut : `Clear-Site-Data: "cache"` ;
   - nouveau réglage admin `privacy.logout_clear_site_data_scope` (`lib/settings/privacy.js`,
     `settingsAdminMeta.js`, réglages publics) : `cache` (défaut) | `cache_storage`. En
     `cache_storage`, l'en-tête devient `"cache", "storage"`. Libellé admin explicite :
     « Mode borne / tablette partagée : efface aussi tout le stockage du site sur l'appareil
     (préférences, actions hors ligne non envoyées de **tous** les comptes, mode hors ligne
     jusqu'au prochain chargement) » ;
   - **ne jamais émettre `"cookies"`** : cette directive vise tout le domaine enregistrable,
     sous-domaines compris. Elle effacerait les laissez-passer des autres produits, le cookie de
     visite anonyme et les cookies de G&L. Test obligatoire ;
   - ne jamais émettre `"executionContexts"` (rechargement forcé, perte d'état).
4. **Purge côté client, toujours** (l'en-tête seul ne suffit pas : prise en charge inégale selon
   les navigateurs pour les réponses `fetch`, Safari partiel, et `"storage"` est tout ou rien) :
   - dans `src/utils/localDataCleanup.js`, ajouter `purgeCachedAuthenticatedApi()` : supprime de
     **tous** les caches de l'origine les entrées dont l'URL porte `__fm_sw_user`, en plus des
     `/uploads/` déjà traités. Meilleur effort, ne rejette jamais ;
   - l'appeler dans `handleLogout` **à chaque déconnexion**, que
     `privacy.clear_local_data_on_logout` soit actif ou non (ces copies portent des données de
     compte, pas des préférences) ;
   - appeler `POST /api/auth/logout` en `fetch(..., { method: 'POST', keepalive: true,
credentials: 'same-origin' })` **après** la confirmation éventuelle des actions non
     envoyées, et sans bloquer : hors ligne, la déconnexion locale aboutit quand même ;
   - en mode `cache_storage`, l'appel au serveur part **après** la confirmation (sinon les
     actions non envoyées seraient effacées sans prévenir) ; le message de confirmation doit le
     dire ;
   - **plans** : dans `AppPlan.logout`, purger aussi les entrées de `/api/plan/content`,
     `/api/plan/settings`, `/api/enov/content`, `/api/enov/settings` quand la surface est en
     mode d'accès par code (la copie hors ligne ne doit pas survivre au rendu du laissez-passer).
     Plan des personnels : vérifier qu'aucune API n'est en cache (c'est déjà le principe de
     `PWA_PROFILES.staff`) et le figer par un test.
5. **Ne pas casser le hors ligne** : `"cache"` vide le cache HTTP, pas le précache du service
   worker ; l'application doit toujours s'ouvrir hors réseau après une déconnexion. Le vérifier
   en e2e.

### Tests

- `tests/clear-site-data.test.js` : valeur de l'en-tête selon le réglage ; absence de
  `"cookies"` et `"executionContexts"` dans toutes les combinaisons ; présence sur les quatre
  routes de déconnexion ; `200` sans session ; `no-store`.
- `tests-ui/` : `purgeCachedAuthenticatedApi` (faux `caches`) retire `__fm_sw_user` et
  `/uploads/`, garde les bundles, icônes, polices et entrées publiques ; `handleLogout` l'appelle
  même avec `clear_local_data_on_logout = false`.
- `e2e/logout-cache.spec.js` (Chromium) : connexion élève → ouverture des tâches (le service
  worker met `/api/tasks` en cache) → déconnexion → `caches` ne contient plus aucune URL avec
  `__fm_sw_user` ; la réponse de `/api/auth/logout` porte `Clear-Site-Data` ; rechargement hors
  ligne : l'écran de connexion s'affiche.

---

## Lot B — Relais d'images étendu à tous les hôtes publics, CSP resserrée par produit

### Constat

En mode `local` (`privacy.external_assets_mode`, défaut), seules les images Wikimedia passent par
`GET /api/media/remote`. Toute autre URL d'image saisie dans une fiche espèce, un repère, une
visite, un tutoriel, un carnet ou un plan est chargée **directement** chez le tiers, qui reçoit
l'adresse IP de l'élève ou du visiteur. La CSP le permet (`img-src 'self' https: data: blob:`),
car la politique est commune à tous les produits, G&L compris (avatars DiceBear).

### À faire

1. **Relais généralisé** (`lib/remoteMedia.js`) :
   - accepter tout hôte HTTPS **public**, port 443, sans identifiants dans l'URL ; Wikimedia garde
     son traitement actuel (vignettes, liste blanche de paramètres) ;
   - **protection SSRF** sans nouvelle dépendance : remplacer le `fetch` par `https.request` avec
     une option `lookup` qui résout toutes les adresses (`dns.lookup(..., { all: true })`) et
     **refuse** si l'une est privée, de bouclage, lien-local, CGNAT (100.64/10), multicast,
     réservée, non spécifiée, IPv4 mappée en IPv6 vers une de ces plages, ou une IP littérale
     non publique (`net.BlockList`). La connexion part sur l'adresse validée (pas de seconde
     résolution : pas de rebinding DNS). Revalidation à **chaque** redirection (déjà le cas, à
     conserver) ;
   - contenu : `Content-Type` image obligatoire **et** vérification des octets magiques
     (JPEG, PNG, GIF, WebP, AVIF ; SVG accepté seulement s'il commence par une déclaration XML ou
     `<svg`, et toujours servi avec l'en-tête `sandbox` existant de `routes/media.js`) ;
   - paramètres d'URL : conservés pour les hôtes génériques (beaucoup de CDN en ont besoin), mais
     longueur bornée ; le quota amont par IP (AP4) et le plafond de cache restent la garde contre
     le remplissage du disque. Ajouter un **quota par hôte** amont ;
   - **pas de relais ouvert** : pour les hôtes non Wikimedia, exiger `Sec-Fetch-Site: same-origin`
     quand l'en-tête est présent (navigateurs récents), sinon un `Referer` de même origine ;
     refuser `403` dans le cas contraire. Les quotas restent la garde contre un client forgé ;
   - nouveaux réglages admin : `privacy.remote_media_hosts_mode` = `any_public` (défaut) |
     `allowlist`, et `privacy.remote_media_hosts` (liste d'hôtes, sert de liste blanche en mode
     `allowlist`, ignorée sinon) ; `privacy.remote_media_blocked_hosts` (liste noire, toujours
     appliquée). Lecture via `getSettingValue` au moment de la requête ;
   - journal Pino : hôte, taille, statut, sans l'IP du demandeur en clair (réutiliser la
     politique `redact`).
2. **Côté client** (`src/shared/privacy/externalAssets.js`) : en mode `local`,
   `resolveExternalImageUrl` relaie **toute** URL `https:` d'une autre origine (plus seulement
   `PROXIED_IMAGE_HOSTS`). Les URL relatives, `data:`, `blob:` et de même origine restent telles
   quelles. Les URL `http:` ne sont jamais chargées : afficher le repli (`FallbackImage`).
3. **Recenser les `<img>` qui contournent le résolveur** et les y faire passer. Au minimum, déjà
   repérés : `src/shared/journal/useJournalEmbedTitles.js` (vignette construite en chaîne HTML),
   `src/plan/components/PlanPlaceSheet.jsx`, `PlanTopBar.jsx`, `PlanMapStage.jsx`,
   `src/components/visit/VisitDetailPanel.jsx`, `VisitEditorialPhotoUi.jsx`,
   `VisitMediaEditor.jsx`, `src/components/biodiv/BiodivLocationMaps.jsx`,
   `src/components/stats-views.jsx`, `src/shared/pct-map/PctImageLayer.jsx`,
   `src/shared/media/MediaLibraryGalleryTile.jsx` (`<video>`). Passe sur tous les `<img>`,
   `<video>`, `<source>`, `srcset` et `background-image` de `src/` hors `src/gl/`.
4. **HTML servi par le serveur** (`lib/tutorialViewExternalAssets.js`) : en mode `local`,
   réécrire vers le relais toutes les URL `https:` tierces des attributs `src`, `poster`,
   `srcset` (chaque candidat), des `style="…url(…)…"` et des `url(…)` dans les `<style>`, pas
   seulement Wikimedia. Garder le retrait des `@import` Google Fonts.
5. **CSP par produit** (`lib/csp.js`, `server.js`) : ajouter la dimension produit à
   `buildPolicyTable` (produit × mode × variante), produit résolu comme ailleurs
   (`resolveProductFromRequest` / `resolveSecureProductId`).
   - `foret`, `plan`, `staff`, `enov` en mode `local` : `img-src 'self' data: blob:` ;
     `media-src 'self' data: blob:` (inchangé) ;
   - mode `external` : comportement actuel conservé pour ces quatre produits ;
   - `frame-src` : `'self' https:` pour `foret` seulement (tutoriels de type lien, protégés par
     la façade du lot C) ; `'self'` pour `plan`, `staff`, `enov` (aucune iframe tierce) ;
   - **`gl` : politique strictement inchangée**, variante `/gl/intro/` comprise ;
   - mettre à jour l'en-tête de `lib/csp.js` (chaque directive y est justifiée).
6. **Inventaire avant mise en production** : script `scripts/inventory-remote-media-hosts.js`
   (lecture seule, base locale ou de préproduction) qui liste, par table et colonne, les hôtes
   d'images distantes présents en base (photos d'espèces, médias de visite, repères, tutoriels,
   carnet, réglages de marque…), avec le nombre d'URL `http:` qui ne s'afficheront plus. **Ne
   parcourt aucune table `gl_*`.** Sortie console + CSV dans `tmp/` (non versionné).

### Tests

- `tests/remote-media.test.js` (à étendre, les attentes de refus d'hôte changent) : hôte public
  accepté ; refus `127.0.0.1`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `100.64/10`,
  `::1`, `fc00::/7`, `fe80::/10`, `::ffff:127.0.0.1`, IP décimale ou octale ; nom qui résout
  vers une IP privée ; redirection vers un hôte privé ; port non 443 ; `http:` ; type de contenu
  menteur (octets magiques) ; `Sec-Fetch-Site: cross-site` refusé ; liste noire et mode liste
  blanche ; quota par hôte.
- `tests/csp.test.js` : table produit × mode × variante ; `img-src` sans `https:` pour les quatre
  produits en `local` ; **politique `gl` égale à la valeur actuelle** (instantané) ;
  `frame-src 'self'` pour les plans.
- `tests-ui/` : `resolveExternalImageUrl` relaie un hôte quelconque, laisse passer
  relatif / `data:` / `blob:` / même origine, refuse `http:`.
- `tests/` : réécriture du HTML de tutoriel (`srcset`, `style`, `<style>`, `poster`).
- e2e : une fiche avec une photo d'un hôte tiers s'affiche via `/api/media/remote` et aucune
  violation CSP n'est remontée sur `/api/csp-report` pendant le parcours élève et le plan public.

---

## Lot C — Tutoriels de type lien : façade « cliquer pour charger »

### Constat

`TutorialPreviewModal` charge l'URL externe d'un tutoriel (`type = 'link'`, `preview_url`) dans
une iframe **dès l'ouverture**. YouTube, Google Docs, Canva, Genially… peuvent alors déposer leurs
propres cookies et traceurs sans consentement préalable (CNIL, contenus tiers intégrés). Le
composant est utilisé dans la carte, les tâches, les fiches espèces et la **visite publique**
(parents, visiteurs).

### À faire

1. Pour toute source qui n'est pas de l'origine de l'application
   (`isAppOriginPreviewSource` faux), afficher d'abord une **façade** à la place de l'iframe :
   - nom de l'hôte (`new URL(source).hostname`), phrase courte : « Ce contenu est hébergé par
     <hôte>. L'afficher ici permet à ce service de déposer ses propres cookies et de connaître
     votre adresse IP. » (tutoiement pour les élèves, vouvoiement pour la visite publique et les
     personnels, comme `privacyNoticeContent.js`) ;
   - bouton « Afficher ici » (cible ≥ 44 px) qui monte l'iframe ;
   - lien « Ouvrir dans un nouvel onglet » (`rel="noopener noreferrer"`) ;
   - lien vers la notice de confidentialité de l'application ;
   - mémoriser l'accord **par hôte et pour la session de navigation seulement**
     (`sessionStorage`, clé `foretmap.embedConsent.session.v1`, lecture/écriture en try/catch) :
     rien de persistant, pas d'écran de retrait à prévoir.
2. **YouTube** : réécrire `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`,
   `youtube.com/embed/` vers `https://www.youtube-nocookie.com/embed/<id>` (garder `start`/`t`).
   La façade reste obligatoire : le mode « nocookie » écrit quand même dans le stockage du
   navigateur à la lecture.
3. Ajouter `referrerPolicy="no-referrer"` à l'iframe tierce ; garder le `sandbox` actuel.
4. Aucune iframe tierce ne doit se monter avant le clic : test de non-régression.

### Tests

- `tests-ui/TutorialPreviewModal.test.jsx` : source tierce → façade, pas d'iframe ; clic → iframe
  avec `no-referrer` et `sandbox` ; source de même origine → iframe directe ; accord mémorisé pour
  le même hôte dans la session, pas pour un autre ; `sessionStorage` qui lève → façade à chaque
  fois, sans erreur.
- `tests-ui/` : réécriture des URL YouTube (cinq formes, horodatage conservé, URL non YouTube
  inchangée).

---

## Lot D — Notice de confidentialité et documentation

1. `src/shared/privacy/privacyNoticeContent.js`, section « Ce qui est gardé sur ton/votre
   appareil », pour `foret`, `plan`, `staff`, `enov` (pas `gl`) :
   - ajouter les cookies techniques de connexion : `foretmap_oauth_state`,
     `foretmap_oauth_mode`, `foretmap_oauth_origin` (connexion Google) et `foretmap_lti_oidc`
     (connexion depuis Moodle), **10 minutes**, durées recopiées des constantes
     (`OAUTH_STATE_TTL_MS` dans `routes/auth.js`, `TTL_MS` dans `lib/lti/oidc.js`) selon la
     convention du fichier (table `R`, aucune durée inventée) ;
   - remplacer la phrase sur Google Fonts et Wikimedia : en mode `local`, « les images d'autres
     sites passent par le serveur de l'application : ton navigateur ne contacte pas ces sites » ;
   - mentionner la façade des contenus externes et ce que fait la déconnexion (effacement des
     copies de l'appareil ; en mode borne, effacement complet).
2. `tests/privacy-notice.test.js` : étendre les contrôles de cohérence durées ↔ constantes.
3. `docs/API.md` : `POST /api/auth/logout`, en-tête `Clear-Site-Data` des trois `POST /logout`,
   comportement étendu de `GET /api/media/remote` (codes `403`, `400`, `502`, `507`).
4. `docs/reference/exploitation/vos-donnees.md` et `modele-de-securite.md` : relais, CSP par
   produit, déconnexion, nouveaux réglages.
   `docs/reference/foretmap/taches-tutoriels-et-validation.md` : façade des tutoriels-liens
   (côté prof : la vidéo ne se lance plus d'office).
5. `docs/audits/` : court document daté `AUDIT_TRACEURS_2026-10-24.md` qui reprend les quatre
   constats, les correctifs et ce qui reste hors périmètre (jeton de session dans le
   `localStorage` : choix de sécurité, pas d'obligation cookies ; révocation serveur des jetons
   à la déconnexion : non traitée ici). Le référencer dans l'index des audits.
6. `CHANGELOG.md` sous `[Non publié]`, une entrée par lot.

---

## Organisation

- Une branche (`feat/traceurs-rgpd`), une PR (minutes CI comptées), **un commit par lot** A → B → C → D, PR en brouillon
  jusqu'au lot D.
- Avant chaque commit : `npm run lint`, `npm run format:check`, `npm test`, `npm run test:ui`.
  Avant de passer la PR en « Ready for review » : `npm run build` puis `npm run test:e2e` sur les
  nouveaux scénarios.
- Aucune migration SQL n'est attendue (les réglages vivent dans `app_settings`). Si tu en crées
  une malgré tout, vérifie le numéro contre les PR ouvertes (`.cursor/rules/foretmap-pr-merge-conflict.mdc`).
- Si un point de ce prompt contredit le code ou une règle du dépôt, arrête-toi et signale-le
  au lieu de trancher seul.

## Livrable attendu en fin de session

1. Résumé par lot : fichiers modifiés, réglages ajoutés (clé, valeurs, défaut), tests ajoutés.
2. Sortie du script d'inventaire des hôtes d'images (si une base est disponible), avec les URL
   `http:` à corriger à la main.
3. Procédure de recette manuelle en dix lignes maximum : tablette partagée (deux comptes
   successifs), plan fermé par code, tutoriel YouTube, fiche avec photo tierce, onglet Réseau et
   Application des outils du navigateur.
