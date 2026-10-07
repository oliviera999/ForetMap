/**
 * « Préparer la sortie terrain » : avant de partir dans un coin sans réseau, l'élève (ou le
 * prof) précharge d'un geste ce qu'il consultera — données de la carte active, plan, photos
 * des zones et repères, photos des espèces, tutoriels — au lieu de ne retrouver hors ligne
 * que ce qu'il avait ouvert par hasard.
 *
 * Tout passe dans une **copie terrain** du service worker (en-tête `X-Foretmap-Terrain`), qui
 * survit aux mises à jour de l'application (la copie ordinaire des lectures est vidée à chaque
 * nouvelle version) et que la déconnexion efface comme le reste. Chaque préparation repart
 * d'une copie vide : elle ne grossit pas d'une sortie à l'autre.
 *
 * Limites honnêtes : les photos hébergées sur un autre site (Wikimedia…) ne passent pas par le
 * service worker (règles de sécurité du navigateur) ; elles sont seulement préchauffées dans le
 * cache ordinaire du navigateur, sans garantie. Les sites externes des tutoriels « lien » ne
 * sont pas copiés.
 */

import { TERRAIN_COPY_HEADER, api, withAppBase, withTerrainCapture } from './api';
import { plantPhotoList } from '../utils/plantPhotos.js';
import { tutorialPreviewPayload } from '../components/TutorialPreviewModal.jsx';

/** Nombre de téléchargements simultanés (réseau de terrain souvent faible). */
export const FIELD_TRIP_CONCURRENCY = 4;
/** Plafond de photos externes préchauffées (une par espèce). */
export const FIELD_TRIP_EXTERNAL_PHOTOS_MAX = 150;

/** Supprime la copie terrain précédente (caches dont le nom finit par `-terrain`). */
export async function clearTerrainCopy() {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return 0;
    let removed = 0;
    for (const name of await caches.keys()) {
      if (/-terrain$/.test(name) && (await caches.delete(name))) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

function sameOrigin(url, origin) {
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

function currentOrigin() {
  return typeof window !== 'undefined' && window.location ? window.location.origin : '';
}

/**
 * Adresses à précharger à partir des données déjà chargées.
 * @param {{ maps?: object[], zonePhotos?: object[], plants?: object[], tutorials?: object[],
 *   activeMapId?: string|null }} data
 * @param {string} [origin]
 * @returns {{ sameOrigin: string[], external: string[], documents: string[] }}
 */
export function collectFieldTripUrls(
  { maps = [], zonePhotos = [], plants = [], tutorials = [], activeMapId = null },
  origin = currentOrigin(),
) {
  const local = new Set();
  const external = new Set();
  const documents = new Set();
  const add = (url) => {
    const u = String(url || '').trim();
    if (!u || u.startsWith('data:') || u.startsWith('blob:')) return;
    if (sameOrigin(u, origin)) local.add(u);
    else if (external.size < FIELD_TRIP_EXTERNAL_PHOTOS_MAX) external.add(u);
  };
  for (const m of maps) {
    if (!activeMapId || m?.id === activeMapId) add(m?.map_image_url);
  }
  for (const p of zonePhotos) {
    add(p?.thumb_url);
    add(p?.image_url);
  }
  for (const plant of plants) {
    const [first] = plantPhotoList(plant);
    if (first) add(first.url);
  }
  for (const tu of tutorials) {
    if (!tu || tu.is_active === false || tu.type === 'link') continue;
    const preview = tutorialPreviewPayload(tu)?.preview_url;
    if (preview && sameOrigin(preview, origin)) documents.add(preview);
  }
  return { sameOrigin: [...local], external: [...external], documents: [...documents] };
}

async function runPool(items, worker, concurrency = FIELD_TRIP_CONCURRENCY) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function warmExternalImage(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(false);
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/**
 * Lance la préparation.
 * @param {object} params
 * @param {() => Promise<unknown>} params.refreshAll rechargement complet des données
 *   (`fetchAllFull` de `useAppDataSync`)
 * @param {() => { maps?: object[], zones?: object[], markers?: object[], plants?: object[],
 *   tutorials?: object[], activeMapId?: string|null }} params.getData données à jour, lues
 *   **après** le rechargement
 * @param {(progress: { done: number, total: number, step: string }) => void} [params.onProgress]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<{ ok: number, failed: number, external: number, durationMs: number }>}
 */
export async function prepareFieldTrip({
  refreshAll,
  getData,
  onProgress = () => {},
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
}) {
  const startedAt = Date.now();
  let ok = 0;
  let failed = 0;
  let done = 0;
  let total = 1;
  const step = (name) => onProgress({ done, total, step: name });
  const tick = (success) => {
    done += 1;
    if (success) ok += 1;
    else failed += 1;
    step('files');
  };

  await clearTerrainCopy();

  return withTerrainCapture(async () => {
    step('data');
    await refreshAll?.();
    const extraReads = ['/api/settings/public', '/api/tutorials/me/read-ids'];
    await Promise.all(
      extraReads.map((p) =>
        api(p).then(
          () => (ok += 1),
          () => (failed += 1),
        ),
      ),
    );

    const data = getData?.() || {};
    const activeMapId = data.activeMapId || null;
    const onMap = (item) => !activeMapId || !item?.map_id || item.map_id === activeMapId;
    const places = [
      ...(data.zones || [])
        .filter(onMap)
        .map((z) => `/api/zones/${encodeURIComponent(z.id)}/photos`),
      ...(data.markers || [])
        .filter(onMap)
        .map((m) => `/api/map/markers/${encodeURIComponent(m.id)}/photos`),
    ];
    total = places.length + 1;
    step('places');
    const zonePhotos = [];
    await runPool(places, async (path) => {
      try {
        const list = await api(path);
        if (Array.isArray(list)) zonePhotos.push(...list);
        tick(true);
      } catch {
        tick(false);
      }
    });

    const urls = collectFieldTripUrls({
      maps: data.maps,
      zonePhotos,
      plants: data.plants,
      tutorials: data.tutorials,
      activeMapId,
    });
    const files = [...urls.sameOrigin, ...urls.documents];
    total = done + files.length + urls.external.length;
    step('files');
    await runPool(files, async (url) => {
      if (!fetchImpl) return tick(false);
      try {
        const res = await fetchImpl(withAppBase(url), {
          headers: { [TERRAIN_COPY_HEADER]: '1' },
          credentials: 'same-origin',
        });
        // Le corps doit être lu : le service worker ne copie qu'une réponse complète.
        if (res?.ok) await res.blob?.();
        tick(!!res?.ok);
      } catch {
        tick(false);
      }
    });
    await runPool(urls.external, async (url) => tick(await warmExternalImage(url)));
    onProgress({ done: total, total, step: 'done' });
    return { ok, failed, external: urls.external.length, durationMs: Date.now() - startedAt };
  });
}
