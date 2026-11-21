/* Service worker « foret » — GÉNÉRÉ par scripts/build-pwa.js depuis
 * src/shared/pwa/swTemplate.js : ne pas éditer, modifier le gabarit puis relancer le build. */
const CACHE_NAME = "foretmap-foret-ebedfeca";
const OFFLINE_PATH = "/offline.html";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/index.vite.html",
  "/offline.html",
  "/manifest.json",
  "/app-logo-n3.png",
  "/icon.svg",
  "/favicon-n3.png",
  "/favicon.ico",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
  "/assets/main-CJdLHo9V.js",
  "/assets/main-BbRfE2ej.css",
  "/assets/foretmap-styles-Bsspg_Iw.css",
  "/assets/rolldown-runtime-XKyaHtl9.js",
  "/assets/VisitMascotFallbackSvg-Ce2TorQR.js",
  "/assets/icons-DLPkQdsV.js",
  "/assets/react-vendor-C4JJtGyn.js",
  "/assets/localDataCleanup-BKE3ianb.js",
  "/assets/localDataCleanup-BpdSH9YF.css",
  "/assets/dragReleaseClickGuard-Da0-xQ_m.js",
  "/assets/dragReleaseClickGuard-DKelHO6a.css",
  "/assets/journalDraftQueue-Rb0xnV81.js",
  "/assets/ImageLightboxProvider-BdYyJxBo.js",
  "/assets/ImageLightboxProvider-CHfSN3Av.css",
  "/assets/markdown-B5v0KHmz.js",
  "/assets/socket-io-DuHRd8Ke.js",
  "/assets/PublicSettingsContext-DH-i1Sok.js",
  "/assets/MarkdownTextarea-D6FWVQTc.js",
  "/assets/TotpChallenge-CvAe_QXs.js",
  "/assets/preload-helper-BLdHbfdN.js",
  "/assets/useGatingSummary-DsNcqg7N.js",
  "/assets/journalUi-UgQ6rUaW.js",
  "/assets/PendingSessionNotice-DqRVU7B1.js",
  "/assets/authRegisterValidation-DIIPbhqO.js",
  "/assets/pseudoValidation-7hQu5GGq.js",
  "/assets/visit-views-DVTThA4I.js",
  "/assets/HelpPanel-CfB4oRW8.js",
  "/assets/visitMascotInteractionApply-BBd1_QhE.js",
  "/assets/mapViewMascotMotion-CVEZuKMA.js",
  "/assets/MapActionButton-B4z_KzPT.js",
  "/assets/MapActionButton-DAIf9iDP.css",
  "/assets/useGuidedTour-B7m7l1p4.js",
  "/assets/placeFocusSettings-D7fXJyLf.js",
  "/assets/datetime-fr-K_Iwf9JI.js",
  "/assets/biodivPlantForm-D1qHv1Iw.js",
  "/assets/AppDialogsProvider-CLrGM_4q.js",
  "/assets/useMapGuidance-Dpmo9t8n.js",
  "/assets/useLatestRequest-PugkjQhX.js",
  "/assets/placeSearch-D5MGmDsl.js",
  "/assets/mascotBehaviorEngine-CmOkZgGR.js",
  "/assets/authenticatedShellParts-C3XigLpf.js",
  "/assets/authenticatedShellParts-BlZYbj6M.css",
  "/assets/EmptyState-CcNEDmBc.js",
  "/assets/EmptyState-Bi1a0lIo.css",
  "/assets/map-views-DkZG9IDR.js",
  "/assets/map-views-B6R-4ZV6.css",
  "/assets/enovSpaceTypes-CYdfR77P.js",
  "/assets/LtiArrivee-CLD_Rv0I.js",
  "/assets/PrivacyNoticePage-BNSIbIil.js",
  "/assets/VisitMapMascotRive-BdDkZ01D.js",
  "/assets/rive-DaBxRbDG.js",
  "/assets/VisitMapMascotSpritesheet-DlF8lzfU.js",
  "/assets/VisitMapMascotSpriteCut-BZKOQCFb.js",
  "/assets/PlantCatalogPreview-BbKSSH_6.js",
  "/assets/PlantRangeGauge-BENouAf2.js",
  "/assets/foretmap-views-Bh8upf2z.js",
  "/assets/UserJournalView-IM3Oz-_O.js",
  "/assets/JournalBookView-BRpEuz-l.js",
  "/assets/JournalImportCard-ZXpkfdQr.js",
  "/assets/fmJournalMeta-C3KBdgp-.js",
  "/assets/tutorials-views-voobYNb2.js",
  "/assets/stats-views-CFb7Mnvy.js",
  "/assets/personalDataExport-DBtF4p8D.js",
  "/assets/DefaultAvatarCredit-rzl6xubG.js",
  "/assets/presenceListPatch-C9hg_MYL.js",
  "/assets/profiles-views-9i65wFtf.js",
  "/assets/audit-views-B-GZs_co.js",
  "/assets/audit-views-Dch46PjI.css",
  "/assets/localDateInput-zbHxKPcz.js",
  "/assets/settings-admin-views-cNC82FU3.js",
  "/assets/DataList-B37SFsna.js",
  "/assets/placeStatus-Q1NnX946.js",
  "/assets/MediaLibraryMenu-yRrXWRyK.js",
  "/assets/GatingPolicyEditor-CW9O5d63.js",
  "/assets/mascotPackEditorModel-IE4lSXnP.js",
  "/assets/ForetMapReferenceDocsPanel-C5-WNCvD.js",
  "/assets/TourOverridesEditor-Bkrq51nJ.js",
  "/assets/media-library-views-oqgjD_x9.js",
  "/assets/forum-views-DI9OTJxE.js",
  "/assets/SharedForumView-DyCgfNVW.js",
  "/assets/VisitMascotPackManager-LPmZ_qdU.js",
  "/assets/MascotPackWysiwygEditor-Czq_HPmG.js",
  "/assets/pedago-views-CpEHl39p.js",
  "/assets/pedago-views-Dk6gg_JV.css",
  "/assets/FoodWebGraph-dJRuhDCi.js",
  "/assets/LearningGatingLocksPanel-D0mVhYWO.js",
  "/assets/about-views-C35zcGqI.js",
];

// Entrées HTML servies en network-first (correspondance exacte du pathname).
const HTML_ENTRIES = [
  "/",
  "/index.html",
  "/index.vite.html",
];

// API en lecture « stale-while-revalidate » (correspondance par suffixe du pathname).
const API_STALE_WHILE_REVALIDATE = [
  "/api/maps",
  "/api/visit/content",
  "/api/glossary/terms",
];

// Lectures « stale-while-revalidate » reconnues par motif (fiche d'un terme du glossaire…).
const API_STALE_WHILE_REVALIDATE_PATTERNS = [
  "^/api/glossary/terms/[^/]+$",
].map(
  (source) => new RegExp(source),
);

// API en lecture « network-first » (correspondance exacte du pathname).
const API_NETWORK_FIRST = [
  "/api/zones",
  "/api/plants",
  "/api/map/markers",
  "/api/tasks",
  "/api/task-projects",
  "/api/tutorials",
  "/api/settings/public",
  "/api/tutorials/me/read-ids",
  "/api/species-observations/me",
];

// Lectures « network-first » reconnues par motif (listes de photos d'un lieu, aperçu d'un
// tutoriel…), utiles hors ligne après une préparation de sortie terrain.
const API_NETWORK_FIRST_PATTERNS = [
  "^/api/zones/[^/]+/photos$",
  "^/api/map/markers/[^/]+/photos$",
  "^/api/tutorials/\\d+/view$",
  "^/uploads/.+\\.pdf$",
  "^/tutos/.+\\.pdf$",
].map(
  (source) => new RegExp(source),
);

// Délai d'attente du réseau des lectures network-first (HTML, API), en millisecondes ;
// 0 = pas de délai. Au-delà, la copie en cache part si elle existe.
const NETWORK_TIMEOUT_MS = 4000;

// Stratégie des entrées HTML : "app-shell" (copie de cette version tout de suite) ou
// "network-first" (réseau d'abord, avec délai).
const HTML_STRATEGY = "app-shell";

const IMAGE_FONT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.avif', '.svg', '.ico', '.webp', '.woff2', '.woff'];

// Images et fontes vont dans un cache à part, borné : photos d'élèves et de zones
// s'accumulaient sans limite ni durée de vie (docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md).
// Nom stable d'un build à l'autre : les photos survivent à une mise à jour de l'application.
const IMAGE_CACHE_NAME = "foretmap-foret-images";
const IMAGE_CACHE_MAX_ENTRIES = 200;
const IMAGE_CACHE_MAX_AGE_MS = 604800000;

// Cache « sortie terrain » : ce que l'élève a demandé de garder avant de partir (photos des
// lieux et des espèces, aperçus de tutoriels…). Nom stable, non borné par la purge des
// images, vidé à chaque nouvelle préparation et à la déconnexion (médias d'élèves).
const TERRAIN_CACHE_NAME = "foretmap-foret-terrain";
const TERRAIN_HEADER = 'X-Foretmap-Terrain';
// Posé sur une copie servie faute de réponse du réseau : le client y lit un réseau inutilisable.
const SW_CACHE_FALLBACK_HEADER = 'X-Foretmap-SW-Cache';

function isHtmlEntry(pathname) {
  return HTML_ENTRIES.some((entry) => pathname === entry);
}

function isStaleWhileRevalidateApi(pathname) {
  return (
    API_STALE_WHILE_REVALIDATE.some((suffix) => pathname.endsWith(suffix)) ||
    API_STALE_WHILE_REVALIDATE_PATTERNS.some((re) => re.test(pathname))
  );
}

function isNetworkFirstApi(pathname) {
  return (
    API_NETWORK_FIRST.some((exact) => pathname === exact) ||
    API_NETWORK_FIRST_PATTERNS.some((re) => re.test(pathname))
  );
}

function wantsTerrainCopy(request) {
  const headers = request && request.headers;
  return !!headers && typeof headers.get === 'function' && headers.get(TERRAIN_HEADER) === '1';
}

function putInTerrainCache(key, response) {
  if (!response || !response.ok) return;
  const clone = response.clone();
  caches.open(TERRAIN_CACHE_NAME).then((cache) => cache.put(key, clone)).catch(() => undefined);
}

/** Copie de secours marquée comme telle (le corps n'est pas relu, seulement réemballé). */
function markAsCacheFallback(response) {
  if (!response) return response;
  try {
    const headers = new Headers(response.headers);
    headers.set(SW_CACHE_FALLBACK_HEADER, '1');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (_) {
    return response;
  }
}

/** Bundles hachés par Vite : immuables, donc cache-first sans risque de version obsolète. */
function isHashedAsset(pathname) {
  return pathname.includes('/assets/');
}

function isScriptOrStyle(pathname) {
  return pathname.endsWith('.css') || pathname.endsWith('.js');
}

function isImageOrFont(pathname) {
  return IMAGE_FONT_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

/**
 * Une réponse d'autorisation refusée : le laissez-passer a été révoqué, le code changé, ou
 * le rôle du lecteur a évolué. Le cache qui porte encore l'ancienne réponse doit être vidé,
 * sans quoi l'appareil rejouerait indéfiniment un contenu auquel il n'a plus droit
 * (docs/AUDIT_SECURITE_2026-09-22.md, constat S8).
 */
function isAuthRefusal(response) {
  return !!response && (response.status === 401 || response.status === 403);
}

/**
 * Empreinte courte d'un jeton (FNV-1a, deux germes). Sert à séparer des comptes dans le
 * cache, pas à protéger le jeton : la Cache API indexe par URL seule, les en-têtes
 * (Authorization compris) n'en font pas partie
 * (https://developer.mozilla.org/docs/Web/API/Cache/put).
 */
function authCachePartition(token) {
  function fnv(seed) {
    let h = seed >>> 0;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  return fnv(0x811c9dc5) + fnv(0x811c9dc5 ^ 0x9e3779b9);
}

function authorizationOf(request) {
  const headers = request && request.headers;
  if (!headers || typeof headers.get !== 'function') return '';
  return String(headers.get('Authorization') || headers.get('authorization') || '');
}

/**
 * Clé de cache d'une lecture. Sans jeton (visite anonyme, coquille HTML, fichiers) : la
 * requête telle quelle, partagée. Avec jeton : la même URL plus une empreinte du compte.
 * Sans cela, le délai réseau et le « stale-while-revalidate » resservent sur une tablette
 * partagée la réponse du compte précédent — y compris les lieux réservés de la visite,
 * que la déconnexion laisse en cache parce qu'elle les croit publics.
 */
function cacheKeyFor(request) {
  const auth = authorizationOf(request);
  const url = new URL(request.url);
  // Code d'accès d'un lien de plan (`?code=`, QR code interne) : il ouvre le plan une fois,
  // puis quitte l'adresse ; il n'a rien à faire dans la clé d'une copie hors ligne, qui le
  // garderait sur l'appareil. La requête réseau, elle, part telle quelle.
  const hadCode = url.searchParams.has('code');
  if (hadCode) url.searchParams.delete('code');
  if (!auth) return hadCode ? url.toString() : request;
  url.searchParams.set('__fm_sw_user', authCachePartition(auth));
  return url.toString();
}

/**
 * Clé de cache d'une image. Les médias d'élèves (`/uploads/students/…`, forum, tâches…)
 * sont lus par URL **signée** (`?exp=…&sig=…`, lib/uploadsSignedUrls.js) dont la requête
 * change toutes les heures : la garder dans la clé remplirait le cache borné de doublons de
 * la même photo et ferait manquer, hors ligne, la copie déjà téléchargée. La clé retire donc
 * `exp` et `sig` ; la requête réseau, elle, part avec sa signature. La purge des médias
 * à la déconnexion (`/uploads/` dans le chemin) reste inchangée.
 */
function imageCacheKeyFor(request) {
  const key = cacheKeyFor(request);
  const url = new URL(typeof key === 'string' ? key : request.url);
  if (!url.pathname.includes('/uploads/') || !url.searchParams.has('sig')) return key;
  url.searchParams.delete('sig');
  url.searchParams.delete('exp');
  return url.toString();
}

/** Retire une entrée du cache (révocation) — sans bruit si elle n'y était pas. */
function evictFromCache(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.delete(cacheKeyFor(request))).catch(() => undefined);
}

/** Le serveur interdit toute copie (images privées : `private, no-store`). */
function forbidsStorage(response) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  return /no-store/i.test(String(headers.get('Cache-Control') || ''));
}

function putInCache(request, response) {
  // Seules les réponses valides sont mémorisées. Auparavant une 401 ou une 500 devenait la
  // réponse servie hors ligne : l'erreur d'un instant se figeait pour la durée du cache.
  const key = cacheKeyFor(request);
  if (response && response.ok && !forbidsStorage(response)) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(key, clone));
    if (wantsTerrainCopy(request)) putInTerrainCache(key, response);
  } else if (isAuthRefusal(response)) {
    evictFromCache(request);
  }
  return response;
}

/**
 * Réseau d'abord, avec délai d'attente facultatif — sur le modèle de l'option
 * `networkTimeoutSeconds` de la stratégie `NetworkFirst` de Workbox (Google, licence MIT ;
 * https://developer.chrome.com/docs/workbox/modules/workbox-strategies ,
 * source : https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-strategies/src/NetworkFirst.ts ).
 * Même contrat, réécrit ici sans la dépendance :
 *   - le réseau répond avant le délai → sa réponse (mise en cache si valide) ;
 *   - le délai expire → la copie en cache si elle existe ; SINON on continue d'attendre le
 *     réseau (une page qui arrive tard vaut mieux qu'une page vide) ;
 *   - le réseau échoue → la copie en cache, puis le repli (`offline.html` pour le HTML).
 * La réponse réseau arrivée après le délai met quand même le cache à jour : `waitUntil`
 * garde le service worker en vie le temps de l'écrire.
 *
 * @param {Request} request
 * @param {() => Promise<Response|undefined>} [fallback]
 * @param {{ event?: FetchEvent, timeoutMs?: number }} [options]
 */
function networkFirst(request, fallback, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 0;
  const key = cacheKeyFor(request);
  const network = fetch(request).then((response) => putInCache(request, response));
  if (options.event && typeof options.event.waitUntil === 'function') {
    options.event.waitUntil(network.then(() => undefined, () => undefined));
  }
  const networkOrCache = network.catch(() =>
    caches
      .match(key)
      .then((cached) => (cached ? markAsCacheFallback(cached) : fallback ? fallback() : undefined)),
  );
  if (timeoutMs <= 0) return networkOrCache;
  let timer = null;
  const cacheAfterTimeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      caches
        .match(key)
        .then((cached) => resolve(cached ? markAsCacheFallback(cached) : undefined), () => resolve(undefined));
    }, timeoutMs);
  });
  return Promise.race([networkOrCache, cacheAfterTimeout]).then((response) => {
    clearTimeout(timer);
    // Délai écoulé sans copie en cache : on attend le réseau (ou son repli).
    return response || networkOrCache;
  });
}

/** Une nouvelle version du service worker est installée et attend d'être appliquée. */
function hasWaitingUpdate() {
  const registration = self.registration;
  return !!(registration && registration.waiting);
}

/**
 * Coquille d'application : la page HTML précachée par cette version, servie sans attendre le
 * réseau. Clé sans la requête (`?code=`, `?lti=…`) : le HTML est un fichier statique, la
 * requête ne sert qu'au script de la page. Sans copie, ou si une version attend d'être
 * appliquée, on retombe sur le network-first avec délai (puis la page hors ligne).
 */
function appShell(request, event) {
  const shellKey = new URL(request.url).pathname;
  const fallbackToNetwork = () =>
    networkFirst(request, () => caches.match(OFFLINE_PATH), { event, timeoutMs: NETWORK_TIMEOUT_MS });
  if (hasWaitingUpdate()) return fallbackToNetwork();
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.match(shellKey))
    .catch(() => undefined)
    .then((cached) => cached || fallbackToNetwork());
}

function cacheFirst(request) {
  const key = cacheKeyFor(request);
  return caches.match(key).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => putInCache(request, response));
  });
}

/** Copie plus vieille que la durée de vie du cache d'images (en-tête `Date` de la réponse). */
function isExpiredImage(response) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  const date = Date.parse(String(headers.get('Date') || ''));
  return Number.isFinite(date) && Date.now() - date > IMAGE_CACHE_MAX_AGE_MS;
}

/** Retire les entrées les plus anciennes au-delà de la borne (`keys()` suit l'ordre d'ajout). */
function trimImageCache(cache) {
  return cache.keys().then((keys) => {
    const excess = keys.length - IMAGE_CACHE_MAX_ENTRIES;
    if (excess <= 0) return undefined;
    return Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  });
}

/**
 * Images et fontes : cache d'abord, dans un cache borné en taille et en âge. Une copie
 * expirée est redemandée au réseau, et resservie seulement s'il ne répond pas. Un refus
 * d'accès (401/403) ou une disparition (404) retire la copie : une photo dont l'accès a été
 * révoqué ou qui a été supprimée n'est plus rejouée depuis l'appareil.
 */
function imageCacheFirst(request) {
  const key = imageCacheKeyFor(request);
  const terrain = wantsTerrainCopy(request);
  return caches.match(key).then((cached) => {
    if (cached && !isExpiredImage(cached)) {
      if (terrain) putInTerrainCache(key, cached);
      return cached;
    }
    return fetch(request)
      .then((response) => {
        if (response && response.ok && !forbidsStorage(response)) {
          if (terrain) putInTerrainCache(key, response);
          const clone = response.clone();
          caches
            .open(IMAGE_CACHE_NAME)
            .then((cache) => cache.delete(key).then(() => cache.put(key, clone)).then(() => trimImageCache(cache)))
            .catch(() => undefined);
        } else if (response && (isAuthRefusal(response) || response.status === 404 || forbidsStorage(response))) {
          evictFromCache(request);
          caches.open(IMAGE_CACHE_NAME).then((cache) => cache.delete(key)).catch(() => undefined);
          caches.open(TERRAIN_CACHE_NAME).then((cache) => cache.delete(key)).catch(() => undefined);
        }
        return response;
      })
      .catch((err) => {
        if (cached) return cached;
        throw err;
      });
  });
}

/**
 * Lecture « stale-while-revalidate » : la réponse mémorisée part tout de suite, le réseau
 * rafraîchit derrière. C'est ce qui rend le plan consultable sans réseau — un visiteur qui
 * scanne le QR code à l'entrée de l'établissement n'a pas toujours de connexion.
 *
 * **Révocation** : si le rafraîchissement revient en 401/403, l'entrée est retirée du cache.
 * Le contenu périmé a donc pu être servi **une dernière fois** (la réponse était déjà partie
 * quand le réseau a tranché) ; le chargement suivant renvoie à l'écran de code. Servir le
 * réseau d'abord supprimerait ce dernier affichage, mais au prix du hors-ligne, qui est la
 * raison d'être de cette stratégie.
 *
 * **Exception** : une requête en `cache: 'no-store'` ou `'reload'` (déconnexion plan /
 * e-nov) ne reprend jamais la copie : sinon « Se déconnecter » laissait le plan ouvert.
 */
function staleWhileRevalidate(request) {
  const key = cacheKeyFor(request);
  const bypassCache = request.cache === 'no-store' || request.cache === 'reload';
  return caches.open(CACHE_NAME).then((cache) => cache.match(key).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(key, response.clone());
        } else if (isAuthRefusal(response)) {
          cache.delete(key);
        }
        return response;
      })
      .catch(() => null);
    if (cached && !bypassCache) {
      networkPromise.catch(() => {});
      return cached;
    }
    return networkPromise.then((response) => response || undefined);
  }));
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {
        // Une entrée absente ne doit pas faire échouer toute l'installation.
        return Promise.all(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))
        );
      }))
    // Pas de skipWaiting() ici (audit ForetMap du 19/11, F3) : une nouvelle version attend
    // (`registration.waiting`) que l'utilisateur l'applique par le bandeau (message
    // `SKIP_WAITING`). Sinon l'activation purgeait l'ancien cache sous un onglet encore
    // ouvert, qui perdait ses bundles chargés à la demande. La première installation, sans
    // version à remplacer, s'active d'elle-même.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name !== CACHE_NAME && name !== IMAGE_CACHE_NAME && name !== TERRAIN_CACHE_NAME)
        .map((name) => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  const url = new URL(event.request.url);
  // Le fetch() du worker relève de connect-src 'self' (CSP imposée) : une image tierce
  // interceptée ici serait bloquée, on la laisse au navigateur.
  if (url.origin !== self.location.origin) return;

  // HTML : coquille de cette version tout de suite (défaut) ; sinon network-first, repli
  // vers la page hors ligne.
  if (isHtmlEntry(url.pathname)) {
    if (HTML_STRATEGY === 'app-shell') {
      event.respondWith(appShell(event.request, event));
      return;
    }
    event.respondWith(
      networkFirst(event.request, () => caches.match(OFFLINE_PATH), {
        event,
        timeoutMs: NETWORK_TIMEOUT_MS,
      }),
    );
    return;
  }

  // Lecture « visite » : stale-while-revalidate (réponse immédiate + rafraîchissement réseau).
  if (isStaleWhileRevalidateApi(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Autres API cachées : network-first (avec délai), repli cache silencieux.
  if (isNetworkFirstApi(url.pathname)) {
    event.respondWith(networkFirst(event.request, null, { event, timeoutMs: NETWORK_TIMEOUT_MS }));
    return;
  }

  // Bundles hachés (/assets/*) : cache-first, ils ne changent jamais sous le même nom.
  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // JS/CSS non hachés : network-first SANS délai — ne jamais servir une version obsolète.
  if (isScriptOrStyle(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Images, icônes, fontes : cache-first, cache borné.
  if (isImageOrFont(url.pathname)) {
    event.respondWith(imageCacheFirst(event.request));
  }
});

const OFFLINE_DB_NAME = "foretmap-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_DB_STORES = {"photos":"photos","outbox":"outbox"};
const OUTBOX_SYNC_TAG = "foretmap-outbox";
const OUTBOX_REPLAYED_MESSAGE = "FORETMAP_OUTBOX_REPLAYED";
const OUTBOX_RETRYABLE_STATUSES = [401, 408, 429];

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.photos)) {
        db.createObjectStore(OFFLINE_DB_STORES.photos, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.outbox)) {
        db.createObjectStore(OFFLINE_DB_STORES.outbox, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readOutboxEntries(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(OFFLINE_DB_STORES.outbox, 'readonly').objectStore(OFFLINE_DB_STORES.outbox).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

function deleteOutboxEntry(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(OFFLINE_DB_STORES.outbox, 'readwrite');
    tx.objectStore(OFFLINE_DB_STORES.outbox).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function replayOutbox() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openOfflineDb();
  let sent = 0;
  let retryLater = false;
  try {
    const entries = (await readOutboxEntries(db)).sort(
      (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || (Number(a.queued_at) || 0) - (Number(b.queued_at) || 0),
    );
    for (const entry of entries) {
      if (!entry || !entry.url || !entry.token) continue;
      let res;
      try {
        res = await fetch(entry.url, {
          method: entry.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer ' + entry.token,
            'X-Foretmap-Queued-At': String(Number(entry.queued_at) || ''),
            'X-Foretmap-Replay': 'background-sync',
          },
          body: entry.body,
          credentials: 'same-origin',
        });
      } catch (_) {
        retryLater = true;
        break;
      }
      if (res.ok) {
        sent += 1;
        await deleteOutboxEntry(db, entry.id);
        continue;
      }
      if (res.status >= 400 && res.status < 500 && !OUTBOX_RETRYABLE_STATUSES.includes(res.status)) {
        await deleteOutboxEntry(db, entry.id);
        continue;
      }
      retryLater = true;
      break;
    }
  } finally {
    db.close();
  }
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const page of pages) page.postMessage({ type: OUTBOX_REPLAYED_MESSAGE, sent });
  // Une promesse rejetée demande au navigateur de reprogrammer la synchronisation.
  if (retryLater) throw new Error('Rejeu des écritures hors ligne : nouvel essai plus tard');
}

self.addEventListener('sync', (event) => {
  if (event.tag === OUTBOX_SYNC_TAG) event.waitUntil(replayOutbox());
});
