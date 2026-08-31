import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import {
  DATA_REFRESH_INTERVAL_MS,
  FETCH_ALL_AUTO_DEBOUNCE_MS,
  getFetchAllLoopAbortReason,
} from '../constants/app-runtime';
import {
  canSkipFetchAllCycle,
  isValidSyncState,
  resolveChangedSyncDomains,
} from '../utils/fetchAllSyncGate.js';
import { allowedMapIdsForScope, pickDefaultMapId, resolveScopedMapId } from '../utils/appMapScope';
import { mapsForAffiliationScope } from '../utils/mapAffiliation';
import { keepPrevIfEqual } from '../utils/stableCollection';
import { partitionByArchived } from '../utils/taskArchive';
import { safeLocalStorageGetItem } from '../utils/browserStorage.js';

/** Référence stable partagée par tous les états « pas de carte » (évite un re-render inutile). */
const DEFAULT_MAPS = [];
/** Sentinelle « domaine non rechargé » du refetch ciblé de fetchAll (état conservé). */
const FETCH_DOMAIN_SKIPPED = Symbol('foretmap-fetch-domain-skipped');
/**
 * Sentinelle « domaine en échec » : la requête a épuisé ses réessais.
 *
 * Auparavant l'échec retournait `[]`, qui était appliqué à l'état : une coupure serveur de
 * quelques secondes **vidait la carte, les tâches et les plantes** à l'écran — lu par
 * l'utilisateur comme une déconnexion et une perte de données. Et comme l'erreur était
 * avalée, le compteur d'échecs ne montait jamais : le bandeau « Serveur indisponible » et
 * le repli à 2 min n'étaient quasiment jamais atteints. On conserve désormais l'état
 * précédent et on compte l'échec.
 */
const FETCH_DOMAIN_FAILED = Symbol('foretmap-fetch-domain-failed');

/** Vrai si le résultat d'un domaine doit être appliqué à l'état (ni sauté, ni en échec). */
function isApplicableDomainResult(value) {
  return value !== FETCH_DOMAIN_SKIPPED && value !== FETCH_DOMAIN_FAILED;
}
/** Intervalle de repli quand le serveur est jugé indisponible (3 échecs consécutifs). */
const SERVER_DOWN_REFRESH_MS = 120000;

/** Carte active mémorisée en localStorage au dernier changement de plan. */
function readStoredActiveMapId() {
  return String(safeLocalStorageGetItem('foretmap_active_map', '') || '').trim();
}

/**
 * Données partagées de l'app ForetMap et leur cycle de rechargement (`fetchAll`),
 * extraits de `src/App.jsx` : états de domaine (cartes, zones, tâches, plantes,
 * repères, tutoriels), polling différentiel via `/api/sync-state`, refetch ciblé par
 * domaine, gestion « serveur indisponible » et amorçage/debounce du rechargement.
 *
 * @param {object} params
 * @param {object} params.context Instantané de contexte lu par `fetchAll` : rôle effectif,
 *   visite publique, affiliation élève, droit tutoriels et cartes par défaut. **Doit être
 *   mémoïsé** — il pilote le debounce du rechargement automatique.
 * @param {boolean} params.contextReady Réglages publics chargés (déclenche un cycle).
 * @param {boolean} params.hasAuthenticatedShell Session établie (élève ou prof).
 * @param {{ current: object|null }} params.studentRef Session élève courante (lecture stable).
 * @param {() => void} params.forceLogout Déconnexion forcée (compte supprimé).
 * @param {(data: object, options?: object) => void} params.mergeAuthMeResponse Fusion `/api/auth/me`.
 */
export function useAppDataSync({
  context,
  contextReady,
  hasAuthenticatedShell,
  studentRef,
  forceLogout,
  mergeAuthMeResponse,
}) {
  const [maps, setMaps] = useState(DEFAULT_MAPS);
  const [activeMapId, setActiveMapId] = useState(readStoredActiveMapId);
  const [zones, setZones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskProjects, setTaskProjects] = useState([]);
  // Archives isolées (prof) : hors listes actives partagées pour ne pas polluer carte/modales.
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [archivedTaskProjects, setArchivedTaskProjects] = useState([]);
  const [plants, setPlants] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [tutorials, setTutorials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshMs, setRefreshMs] = useState(DATA_REFRESH_INTERVAL_MS);
  const [serverDown, setServerDown] = useState(false);
  // Vrai pendant une relance manuelle déclenchée par « Réessayer maintenant » :
  // désactive brièvement le bouton pour éviter les doubles clics (le rafraîchissement
  // automatique toutes les 2 min n'est pas affecté).
  const [retryingServer, setRetryingServer] = useState(false);

  const failCountRef = useRef(0);
  /** Dernières cartes connues : repli quand `/api/maps` échoue (voir fetchAll). */
  const lastMapsRef = useRef(DEFAULT_MAPS);
  /** Promesse du chargement global en cours ; les appels suivants s’y accrochent et peuvent demander une nouvelle passe. */
  const fetchAllRunPromiseRef = useRef(null);
  const fetchAllPendingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  /** Sync-state `{ key, bootId, writes }` du dernier cycle fetchAll complet réussi (polling différentiel). */
  const lastSyncStateRef = useRef(null);
  const syncSkipCountRef = useRef(0);
  /** Instantané des paramètres lus par fetchAll (évite de recréer fetchAll à chaque rendu). */
  const fetchAllContextRef = useRef({});

  // Snapshot lu par fetchAll : posé en effet (pas pendant le rendu — fragile en
  // rendu concurrent, un rendu interrompu pourrait laisser un snapshot jamais
  // commité). Le décalage d'un tick est absorbé par la boucle fetchAllPendingRef.
  useEffect(() => {
    fetchAllContextRef.current = { activeMapId, ...context };
  });

  const fetchAll = useCallback(() => {
    if (fetchAllRunPromiseRef.current) {
      fetchAllPendingRef.current = true;
      return fetchAllRunPromiseRef.current;
    }
    const job = (async () => {
      const jobStartedAt = Date.now();
      let loopIterations = 0;
      try {
        // Tant qu’une action (ex. changement de statut) a demandé un rafraîchissement pendant la passe en cours, on relit le ref à jour.
        while (true) {
          loopIterations += 1;
          const abortReason = getFetchAllLoopAbortReason({ loopIterations, jobStartedAt });
          if (abortReason === 'iterations') {
            console.warn('[ForetMap] fetchAll : plafond d’itérations atteint');
            break;
          }
          if (abortReason === 'wall') {
            console.warn('[ForetMap] fetchAll : délai maximal dépassé');
            setServerDown(true);
            setRefreshMs(SERVER_DOWN_REFRESH_MS);
            break;
          }
          fetchAllPendingRef.current = false;
          const snap = fetchAllContextRef.current;
          const {
            activeMapId: mapIdState,
            effectiveIsTeacher: isTeacherSnap,
            showPublicVisit: visitSnap,
            studentAffiliation,
            canManageTutorials: canTutorialsSnap,
            defaultMapStudent,
            defaultMapTeacher,
            defaultMapVisit,
          } = snap;

          // Polling différentiel (audit charge serveur, piste 4) : si aucune écriture
          // en base depuis le dernier cycle complet réussi dans le même contexte
          // client, on saute le cycle (1 requête légère au lieu de ~8). Toute erreur
          // de sonde ou redémarrage serveur → cycle complet (comportement historique).
          const syncContextKey = JSON.stringify({
            snap,
            studentId: studentRef.current?.id ?? null,
          });
          let syncState = null;
          // Pas de sonde au tout premier chargement : elle ajouterait un aller-retour
          // avant les premières données. La baseline s'établit au cycle suivant.
          if (initialFetchDoneRef.current) {
            try {
              const probed = await api('/api/sync-state');
              if (isValidSyncState(probed)) syncState = probed;
            } catch (_) {
              syncState = null;
            }
          }
          if (
            canSkipFetchAllCycle({
              prev: lastSyncStateRef.current,
              next: syncState,
              contextKey: syncContextKey,
              consecutiveSkips: syncSkipCountRef.current,
            })
          ) {
            syncSkipCountRef.current += 1;
            // Le serveur a répondu : l'état « serveur indisponible » n'a plus lieu d'être.
            failCountRef.current = 0;
            setServerDown(false);
            if (!fetchAllPendingRef.current) break;
            continue;
          }
          syncSkipCountRef.current = 0;

          // Domaines dont la requête a échoué pendant CE cycle : pilote à la fois la
          // conservation de l'état affiché et le comptage « serveur indisponible ».
          let domainFailures = 0;
          try {
            const safeApi = async (request) => {
              try {
                return await request();
              } catch (err) {
                if (err instanceof AccountDeletedError) throw err;
                domainFailures += 1;
                console.error(err);
                return FETCH_DOMAIN_FAILED;
              }
            };

            const mapScope = {
              isTeacher: isTeacherSnap,
              isPublicVisit: visitSnap,
              affiliation: studentAffiliation,
            };
            const restrictedMapIds = allowedMapIdsForScope(mapScope);

            const mapsRes = await safeApi(() => api('/api/maps'));
            // `/api/maps` en échec : on repart des cartes déjà connues. Sans elles,
            // `resolvedMapId` deviendrait nul, `mapQuery` vide, et TOUS les autres domaines
            // seraient « rechargés » à vide — l'écran se viderait pour une seule requête ratée.
            const mapsFailed = mapsRes === FETCH_DOMAIN_FAILED;
            const safeMaps = mapsFailed
              ? lastMapsRef.current
              : Array.isArray(mapsRes) && mapsRes.length > 0
                ? mapsRes
                : DEFAULT_MAPS;
            if (!mapsFailed) setMaps(safeMaps);
            lastMapsRef.current = safeMaps;

            const visibleAllowedMaps = mapsForAffiliationScope(safeMaps, restrictedMapIds);
            const resolvedMapId = resolveScopedMapId({
              visibleMaps: visibleAllowedMaps,
              allowedMapIds: restrictedMapIds,
              currentMapId: mapIdState,
              defaultMapId: pickDefaultMapId({
                isTeacher: isTeacherSnap,
                isPublicVisit: visitSnap,
                defaults: {
                  student: defaultMapStudent,
                  teacher: defaultMapTeacher,
                  visit: defaultMapVisit,
                },
              }),
            });
            const mapQuery = resolvedMapId ? `map_id=${encodeURIComponent(resolvedMapId)}` : '';

            // Refetch ciblé (compteurs par domaine de /api/sync-state) : seuls les
            // domaines dont le compteur a bougé sont rechargés — `/api/maps` reste
            // toujours rechargée (minuscule, et nécessaire à la résolution de carte).
            // Un changement de carte pendant le cycle invalide le ciblage : les
            // domaines non rechargés porteraient encore les données de l'ancienne carte.
            const changedDomains =
              resolvedMapId !== mapIdState
                ? null
                : resolveChangedSyncDomains({
                    prev: lastSyncStateRef.current,
                    next: syncState,
                    contextKey: syncContextKey,
                  });
            const needsDomain = (domain) => !changedDomains || changedDomains.has(domain);
            const skipDomain = () => Promise.resolve(FETCH_DOMAIN_SKIPPED);

            const tutorialsEndpoint = canTutorialsSnap
              ? '/api/tutorials?include_inactive=1'
              : '/api/tutorials';
            // Polling / sync : tâches et projets **actifs** seulement. Les archives
            // (prof) se chargent à l'ouverture de la vue « Archivés » via loadArchivedTasks
            // — évite de sérialiser tout l'historique à chaque cycle (pression LVE).
            // `Promise.resolve([])` sans carte active reste un vide **légitime** (rien à
            // afficher), à distinguer d'un échec réseau — d'où safeApi sans valeur de repli.
            const [z, t, taskProjectsRes, p, m, tu] = await Promise.all([
              needsDomain('zones')
                ? safeApi(() => (mapQuery ? api(`/api/zones?${mapQuery}`) : Promise.resolve([])))
                : skipDomain(),
              needsDomain('tasks')
                ? safeApi(() => (mapQuery ? api(`/api/tasks?${mapQuery}`) : Promise.resolve([])))
                : skipDomain(),
              needsDomain('tasks')
                ? safeApi(() =>
                    mapQuery ? api(`/api/task-projects?${mapQuery}`) : Promise.resolve([]),
                  )
                : skipDomain(),
              needsDomain('plants') ? safeApi(() => api('/api/plants')) : skipDomain(),
              needsDomain('markers')
                ? safeApi(() =>
                    mapQuery ? api(`/api/map/markers?${mapQuery}`) : Promise.resolve([]),
                  )
                : skipDomain(),
              needsDomain('tutorials') ? safeApi(() => api(tutorialsEndpoint)) : skipDomain(),
            ]);

            if (resolvedMapId !== mapIdState) {
              setActiveMapId(resolvedMapId);
            }
            // keepPrevIfEqual : conserve la référence quand le contenu n'a pas
            // changé → pas de re-render global du DataContext à chaque poll.
            // FETCH_DOMAIN_SKIPPED : domaine non rechargé (compteur inchangé) → état conservé.
            // FETCH_DOMAIN_FAILED : requête en échec → état conservé aussi (jamais vidé).
            if (isApplicableDomainResult(z)) setZones((prev) => keepPrevIfEqual(prev, z));
            if (isApplicableDomainResult(t)) {
              if (Array.isArray(t)) {
                // Actives seules (le backend force déjà active hors ?archived=) ;
                // partition de sécurité si un client envoie encore archived=all.
                const { active: activeTasks } = partitionByArchived(t);
                setTasks((prev) => keepPrevIfEqual(prev, activeTasks));
              } else
                console.warn(
                  '[ForetMap] GET /api/tasks : réponse non tableau, état tâches inchangé',
                );
            }
            if (isApplicableDomainResult(taskProjectsRes)) {
              const { active: activeProjects } = partitionByArchived(
                Array.isArray(taskProjectsRes) ? taskProjectsRes : [],
              );
              setTaskProjects((prev) => keepPrevIfEqual(prev, activeProjects));
            }
            if (isApplicableDomainResult(p)) setPlants((prev) => keepPrevIfEqual(prev, p));
            if (isApplicableDomainResult(m)) setMarkers((prev) => keepPrevIfEqual(prev, m));
            if (isApplicableDomainResult(tu)) setTutorials((prev) => keepPrevIfEqual(prev, tu));
            if (!isTeacherSnap && needsDomain('authMe')) {
              const sess = studentRef.current;
              if (sess?.id && !sess.preview_mode) {
                const sid = sess.id;
                api('/api/auth/me')
                  .then((d) => {
                    if (studentRef.current?.id !== sid) return;
                    const hasSideEffects =
                      d?.taskEnrollment != null ||
                      typeof d?.forumParticipate === 'boolean' ||
                      typeof d?.contextCommentParticipate === 'boolean' ||
                      typeof d?.refreshedToken === 'string' ||
                      d?.autoProfilePromotion;
                    if (!hasSideEffects) return;
                    mergeAuthMeResponse(d, { studentIdForMatch: sid });
                  })
                  .catch(() => {});
              }
            }
            if (domainFailures > 0) {
              // Cycle partiel : au moins un domaine porte encore des données d'avant la
              // coupure. Pas de baseline — sans quoi le polling différentiel considérerait
              // ces domaines à jour et ne les rechargerait qu'à la prochaine écriture.
              lastSyncStateRef.current = null;
              failCountRef.current += 1;
              if (failCountRef.current >= 3) {
                setServerDown(true);
                setRefreshMs(SERVER_DOWN_REFRESH_MS);
              }
            } else {
              failCountRef.current = 0;
              setRefreshMs(DATA_REFRESH_INTERVAL_MS);
              setServerDown(false);
              // Cycle complet réussi : baseline du polling différentiel. `syncState` a été
              // sondé AVANT les refetchs — une écriture arrivée pendant le cycle rendra
              // donc le prochain compteur différent → refetch (conservateur, jamais stale).
              lastSyncStateRef.current = syncState
                ? {
                    key: syncContextKey,
                    bootId: syncState.bootId,
                    writes: syncState.writes,
                    domains: syncState.domains,
                  }
                : null;
            }
          } catch (e) {
            if (e instanceof AccountDeletedError) forceLogout();
            else {
              console.error(e);
              const isServerSide = e.status == null || e.status >= 500;
              if (isServerSide) {
                failCountRef.current += 1;
                if (failCountRef.current >= 3) {
                  setServerDown(true);
                  setRefreshMs(SERVER_DOWN_REFRESH_MS);
                }
              }
            }
          }
          if (!fetchAllPendingRef.current) break;
        }
      } finally {
        fetchAllRunPromiseRef.current = null;
        initialFetchDoneRef.current = true;
        setLoading(false);
      }
    })();
    fetchAllRunPromiseRef.current = job;
    return job;
  }, [forceLogout, mergeAuthMeResponse, studentRef]);

  /**
   * Relance immédiate des données depuis le bandeau « Serveur indisponible » : réarme
   * le compteur d'échecs et l'intervalle nominal, puis attend `fetchAll`. Le bandeau
   * reste visible et le bouton désactivé le temps de la tentative ; `fetchAll` pilote
   * lui-même la sortie de l'état `serverDown` (succès → masqué, échec → toujours affiché).
   */
  const retryServerNow = useCallback(async () => {
    if (retryingServer) return;
    setRetryingServer(true);
    failCountRef.current = 0;
    setRefreshMs(DATA_REFRESH_INTERVAL_MS);
    try {
      await fetchAll();
    } finally {
      setRetryingServer(false);
    }
  }, [retryingServer, fetchAll]);

  // Premier chargement dès qu'une session existe (aucun debounce : l'écran est vide).
  useEffect(() => {
    if (!hasAuthenticatedShell) return undefined;
    if (initialFetchDoneRef.current) return undefined;
    void fetchAll();
    return undefined;
  }, [hasAuthenticatedShell, fetchAll]);

  useEffect(() => {
    if (!hasAuthenticatedShell) return undefined;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!cancelled) void fetchAll();
    }, FETCH_ALL_AUTO_DEBOUNCE_MS);
    // Debounce standard : sur changement de deps, on annule le fetch en attente et on
    // reprogramme. Le fetch initial est déjà garanti par l'effet ci-dessus (fetchAll
    // immédiat tant que initialFetchDoneRef est faux) ; ne pas annuler ici accumulait
    // des timers et déclenchait plusieurs fetchAll pendant les rafales de deps au boot.
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [hasAuthenticatedShell, activeMapId, contextReady, context, fetchAll]);

  /**
   * Charge les tâches/projets archivés de la carte active (prof, vue « Archivés »).
   * Séparé du poll pour ne pas sérialiser l'historique à chaque cycle.
   */
  const loadArchivedTasks = useCallback(async () => {
    const mapId = String(activeMapId || '').trim();
    if (!mapId) return;
    if (!context?.effectiveIsTeacher) return;
    try {
      const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
      const [t, projects] = await Promise.all([
        api(`/api/tasks?${mapQuery}&archived=archived`),
        api(`/api/task-projects?${mapQuery}&archived=archived`).catch(() => []),
      ]);
      const archTasks = Array.isArray(t) ? partitionByArchived(t).archived : [];
      // Si le backend a déjà filtré archived=archived, partition peut tout mettre en archived
      // ou tout en active selon archived_at — partitionByArchived trie sur archived_at.
      const listTasks = Array.isArray(t)
        ? t.filter((row) => row && row.archived_at != null && String(row.archived_at).trim() !== '')
        : [];
      const listProjects = Array.isArray(projects)
        ? projects.filter(
            (row) => row && row.archived_at != null && String(row.archived_at).trim() !== '',
          )
        : [];
      setArchivedTasks((prev) => keepPrevIfEqual(prev, listTasks.length ? listTasks : archTasks));
      setArchivedTaskProjects((prev) => keepPrevIfEqual(prev, listProjects));
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else console.error('[ForetMap] chargement archives tâches', e);
    }
  }, [activeMapId, context?.effectiveIsTeacher, forceLogout]);

  return {
    maps,
    activeMapId,
    setActiveMapId,
    zones,
    setZones,
    tasks,
    setTasks,
    taskProjects,
    setTaskProjects,
    archivedTasks,
    setArchivedTasks,
    archivedTaskProjects,
    setArchivedTaskProjects,
    plants,
    setPlants,
    markers,
    setMarkers,
    tutorials,
    loading,
    refreshMs,
    serverDown,
    retryingServer,
    fetchAll,
    retryServerNow,
    loadArchivedTasks,
  };
}
