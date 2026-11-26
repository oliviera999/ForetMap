import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AccountDeletedError, getStoredSessionAccountKey } from '../services/api';
import {
  DATA_REFRESH_INTERVAL_MS,
  FETCH_ALL_AUTO_DEBOUNCE_MS,
  getFetchAllLoopAbortReason,
} from '../constants/app-runtime';
import {
  buildFetchAllSyncContextKey,
  canSkipFetchAllCycle,
  isValidSyncState,
  resolveFetchDomainsForCycle,
} from '../utils/fetchAllSyncGate.js';
import { pickDefaultMapId, resolveScopedMapId, visibleMapsForScope } from '../utils/appMapScope';
import { keepPrevIfEqual } from '../utils/stableCollection';
import { partitionByArchived } from '../utils/taskArchive';
import { readLastViewedMapId } from '../utils/lastViewedMap.js';
import { readLastDataSyncAt, rememberLastDataSyncAt } from '../utils/lastDataSync.js';
import {
  isDeviceOffline,
  isOfflineError,
  subscribeNetworkStatus,
} from '../shared/networkStatus.js';

/** Pagination tâches : hors fermeture statique de l'écran de connexion (budget U1). */
const loadTasksListResponse = () => import('../utils/tasksListResponse.js');

/** Échec imputable au serveur (réseau ou 5xx) — jamais quand l'appareil est hors ligne. */
function isServerSideFailure(err) {
  if (isOfflineError(err)) return false;
  return err?.status == null || err.status >= 500;
}

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

/**
 * Données partagées de l'app ForetMap et leur cycle de rechargement (`fetchAll`),
 * extraits de `src/App.jsx` : états de domaine (cartes, zones, tâches, plantes,
 * repères, tutoriels), polling différentiel via `/api/sync-state`, refetch ciblé par
 * domaine, gestion « serveur indisponible » et amorçage/debounce du rechargement.
 *
 * @param {object} params
 * @param {object} params.context Instantané de contexte lu par `fetchAll` : rôle effectif,
 *   visite publique, droit tutoriels et cartes par défaut. **Doit être
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
  const [activeMapId, setActiveMapId] = useState(readLastViewedMapId);
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
  const [lastSyncAt, setLastSyncAt] = useState(readLastDataSyncAt);
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
  /** Dernier plan pour lequel zones/tâches/repères ont été hydratés avec succès. */
  const lastFetchedMapIdRef = useRef(null);
  /** Instantané des paramètres lus par fetchAll (évite de recréer fetchAll à chaque rendu). */
  const fetchAllContextRef = useRef({});
  /** Session authentifiée (lu par fetchAll / purge — pas dans les deps de fetchAll). */
  const hasAuthenticatedShellRef = useRef(hasAuthenticatedShell);

  // Snapshot lu par fetchAll : posé en effet (pas pendant le rendu — fragile en
  // rendu concurrent, un rendu interrompu pourrait laisser un snapshot jamais
  // commité). Le décalage d'un tick est absorbé par la boucle fetchAllPendingRef.
  useEffect(() => {
    fetchAllContextRef.current = { activeMapId, ...context };
  });

  useEffect(() => {
    hasAuthenticatedShellRef.current = hasAuthenticatedShell;
  }, [hasAuthenticatedShell]);

  /**
   * Remet à zéro les états domaine + marqueurs de sync (audit 26/11 S1).
   * À appeler dès qu'il n'y a plus de shell authentifié, pour ne pas afficher
   * les données du compte précédent pendant le debounce du prochain fetchAll.
   */
  const purgeDomainState = useCallback(() => {
    setMaps(DEFAULT_MAPS);
    lastMapsRef.current = DEFAULT_MAPS;
    setZones([]);
    setTasks([]);
    setTaskProjects([]);
    setArchivedTasks([]);
    setArchivedTaskProjects([]);
    setPlants([]);
    setMarkers([]);
    setTutorials([]);
    setLoading(true);
    setServerDown(false);
    setRetryingServer(false);
    failCountRef.current = 0;
    fetchAllPendingRef.current = false;
    initialFetchDoneRef.current = false;
    lastSyncStateRef.current = null;
    syncSkipCountRef.current = 0;
    lastFetchedMapIdRef.current = null;
  }, []);

  // Perte de session (logout / forceLogout) : purger immédiatement les données affichées.
  useEffect(() => {
    if (hasAuthenticatedShell) return undefined;
    purgeDomainState();
    return undefined;
  }, [hasAuthenticatedShell, purgeDomainState]);

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
          // Garde de session (audit 26/11 S2) : une réponse arrivée après logout /
          // changement de compte ne doit pas réécrire l'état domaine.
          const accountAtCycleStart = getStoredSessionAccountKey();
          const staleAccount = () =>
            !hasAuthenticatedShellRef.current ||
            getStoredSessionAccountKey() !== accountAtCycleStart;
          if (!accountAtCycleStart || staleAccount()) {
            break;
          }
          const snap = fetchAllContextRef.current;
          const {
            activeMapId: mapIdState,
            effectiveIsTeacher: isTeacherSnap,
            showPublicVisit: visitSnap,
            canManageTutorials: canTutorialsSnap,
            defaultMapStudent,
            defaultMapTeacher,
            defaultMapVisit,
          } = snap;

          // Polling différentiel (audit charge serveur, piste 4) : si aucune écriture
          // en base depuis le dernier cycle complet réussi dans le même contexte
          // client, on saute le cycle (1 requête légère au lieu de ~8). Toute erreur
          // de sonde ou redémarrage serveur → cycle complet (comportement historique).
          // Le plan actif est volontairement hors clé : un changement de carte ne doit
          // pas invalider la baseline ni recharger plantes/tutoriels (lot perf 11/2026).
          const syncContextKey = buildFetchAllSyncContextKey({
            studentId: studentRef.current?.id ?? null,
            effectiveIsTeacher: isTeacherSnap,
            showPublicVisit: visitSnap,
            canManageTutorials: canTutorialsSnap,
            defaultMapStudent,
            defaultMapTeacher,
            defaultMapVisit,
          });
          const requestedMapChanged =
            String(mapIdState || '') !== String(lastFetchedMapIdRef.current || '');
          let syncState = null;
          // Pas de sonde au tout premier chargement : elle ajouterait un aller-retour
          // avant les premières données. La baseline s'établit au cycle suivant.
          // Hors ligne, la sonde (jamais mise en cache) échouerait à coup sûr : cycle complet
          // directement, servi par les copies du service worker.
          if (initialFetchDoneRef.current && !isDeviceOffline()) {
            try {
              const probed = await api('/api/sync-state');
              if (staleAccount()) break;
              if (isValidSyncState(probed)) syncState = probed;
            } catch (err) {
              // Un compte supprimé se voit aussi depuis la sonde : sans ce cas, l'échec
              // était traité comme une simple sonde muette et la session restait ouverte
              // jusqu'à ce qu'un autre appel remonte le même 401.
              if (err instanceof AccountDeletedError) {
                forceLogout();
                return;
              }
              syncState = null;
            }
          }
          if (
            !requestedMapChanged &&
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

          // Domaines dont la requête a échoué pendant CE cycle : pilote la conservation de
          // l'état affiché (tout échec) et le comptage « serveur indisponible » (échecs
          // réseau / 5xx seulement, comme le catch global plus bas). Un domaine en 4xx
          // persistant (403, 404, 429) prouve au contraire que le serveur répond : il ne
          // doit pas lever le bandeau alors que le temps réel est au vert.
          let domainFailures = 0;
          let serverSideFailures = 0;
          try {
            const safeApi = async (request) => {
              try {
                return await request();
              } catch (err) {
                if (err instanceof AccountDeletedError) throw err;
                domainFailures += 1;
                if (isServerSideFailure(err)) serverSideFailures += 1;
                console.error(err);
                return FETCH_DOMAIN_FAILED;
              }
            };

            const mapsRes = await safeApi(() => api('/api/maps'));
            if (staleAccount()) break;
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

            // `/api/maps` est déjà borné au périmètre du compte par le serveur (groupes) :
            // on ne garde ici que la préférence pour les cartes actives.
            const visibleAllowedMaps = visibleMapsForScope(safeMaps);
            const resolvedMapId = resolveScopedMapId({
              visibleMaps: visibleAllowedMaps,
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

            // Refetch ciblé (compteurs /api/sync-state + changement de plan) :
            // `/api/maps` reste toujours rechargée (minuscule, résolution de carte).
            const effectiveMapChanged =
              String(resolvedMapId || '') !== String(lastFetchedMapIdRef.current || '');
            const changedDomains = resolveFetchDomainsForCycle({
              prev: lastSyncStateRef.current,
              next: syncState,
              contextKey: syncContextKey,
              mapChanged: effectiveMapChanged,
              allowMapScopedWithoutBaseline:
                initialFetchDoneRef.current && !!lastFetchedMapIdRef.current,
            });
            const needsDomain = (domain) => !changedDomains || changedDomains.has(domain);
            const skipDomain = () => Promise.resolve(FETCH_DOMAIN_SKIPPED);

            const tutorialsEndpoint = canTutorialsSnap
              ? '/api/tutorials?include_inactive=1'
              : '/api/tutorials';
            // Chemin critique post-connexion (carte / tâches) : zones, tâches, projets,
            // repères. Plantes + tutoriels suivent ensuite pour débloquer le loader plus tôt
            // (catalogue ~350 Ko sinon retarde toutes les fenêtres).
            // Polling : tâches/projets **actifs** seulement (archives via loadArchivedTasks).
            // Hors chrome prof : `surface=map` ; gestionnaires : liste complète.
            const [z, t, taskProjectsRes, m] = await Promise.all([
              needsDomain('zones')
                ? safeApi(() =>
                    mapQuery
                      ? api(`/api/zones?${mapQuery}${isTeacherSnap ? '' : '&surface=map'}`)
                      : Promise.resolve([]),
                  )
                : skipDomain(),
              needsDomain('tasks')
                ? safeApi(async () => {
                    if (!mapQuery) return [];
                    const { fetchAllTaskPages } = await loadTasksListResponse();
                    return fetchAllTaskPages(api, mapQuery);
                  })
                : skipDomain(),
              needsDomain('tasks')
                ? safeApi(() =>
                    mapQuery ? api(`/api/task-projects?${mapQuery}`) : Promise.resolve([]),
                  )
                : skipDomain(),
              needsDomain('markers')
                ? safeApi(() =>
                    mapQuery
                      ? api(`/api/map/markers?${mapQuery}${isTeacherSnap ? '' : '&surface=map'}`)
                      : Promise.resolve([]),
                  )
                : skipDomain(),
            ]);

            if (staleAccount()) break;

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
                // `fetchAllTaskPages` a déjà aplati l'enveloppe paginée.
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
            if (isApplicableDomainResult(m)) setMarkers((prev) => keepPrevIfEqual(prev, m));

            // Débloque l'UI principale dès que carte/tâches sont hydratables — sans
            // attendre le catalogue plantes ni les tutoriels (sensation « lent après
            // connexion » sur toutes les fenêtres).
            if (
              hasAuthenticatedShellRef.current &&
              getStoredSessionAccountKey() === accountAtCycleStart
            ) {
              initialFetchDoneRef.current = true;
              setLoading(false);
            }

            const [p, tu] = await Promise.all([
              needsDomain('plants') ? safeApi(() => api('/api/plants')) : skipDomain(),
              needsDomain('tutorials') ? safeApi(() => api(tutorialsEndpoint)) : skipDomain(),
            ]);

            if (staleAccount()) break;

            if (isApplicableDomainResult(p)) setPlants((prev) => keepPrevIfEqual(prev, p));
            if (isApplicableDomainResult(tu)) setTutorials((prev) => keepPrevIfEqual(prev, tu));
            if (needsDomain('authMe')) {
              const sess = studentRef.current;
              const isStudentSession = sess?.id && !sess.preview_mode;
              if (isStudentSession || isTeacherSnap) {
                const sid = isStudentSession ? sess.id : null;
                // Compte au départ de la requête (élève comme prof, audit du 19/11, F2) : une
                // réponse arrivée après une déconnexion ou un changement de compte est ignorée.
                const accountAtStart = getStoredSessionAccountKey();
                api('/api/auth/me')
                  .then((d) => {
                    if (sid && studentRef.current?.id !== sid) return;
                    if (!accountAtStart || getStoredSessionAccountKey() !== accountAtStart) return;
                    const hasSideEffects =
                      d?.taskEnrollment != null ||
                      typeof d?.forumParticipate === 'boolean' ||
                      typeof d?.contextCommentParticipate === 'boolean' ||
                      typeof d?.refreshedToken === 'string' ||
                      d?.autoProfilePromotion ||
                      (isTeacherSnap && d?.auth);
                    if (!hasSideEffects) return;
                    mergeAuthMeResponse(d, sid ? { studentIdForMatch: sid } : {});
                  })
                  .catch(() => {});
              }
            }
            if (domainFailures > 0) {
              // Cycle partiel : au moins un domaine porte encore des données d'avant la
              // coupure. Pas de baseline — sans quoi le polling différentiel considérerait
              // ces domaines à jour et ne les rechargerait qu'à la prochaine écriture.
              lastSyncStateRef.current = null;
              // Plan hydraté pour la coquille (zones/tâches) même si plantes/tutoriels ont
              // échoué : évite de re-tout-charger au prochain changement de plan.
              if (
                !mapsFailed &&
                isApplicableDomainResult(z) &&
                isApplicableDomainResult(t) &&
                isApplicableDomainResult(m)
              ) {
                lastFetchedMapIdRef.current = resolvedMapId || null;
              }
            } else {
              // Hors ligne, un cycle « réussi » ne fait que relire les copies du service
              // worker : il ne date pas les données.
              if (!isDeviceOffline()) {
                const now = Date.now();
                rememberLastDataSyncAt(now);
                setLastSyncAt(now);
              }
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
              lastFetchedMapIdRef.current = resolvedMapId || null;
            }
            if (serverSideFailures > 0) {
              failCountRef.current += 1;
              if (failCountRef.current >= 3) {
                setServerDown(true);
                setRefreshMs(SERVER_DOWN_REFRESH_MS);
              }
            } else {
              // Le serveur a répondu à tout (même par un 4xx) : plus d'indisponibilité.
              failCountRef.current = 0;
              setRefreshMs(DATA_REFRESH_INTERVAL_MS);
              setServerDown(false);
            }
          } catch (e) {
            if (e instanceof AccountDeletedError) forceLogout();
            else {
              console.error(e);
              if (isServerSideFailure(e)) {
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
        // Si la session a disparu pendant le cycle, purgeDomainState a déjà remis
        // loading/refs : ne pas les écraser ici (course logout → login).
        if (hasAuthenticatedShellRef.current && getStoredSessionAccountKey()) {
          initialFetchDoneRef.current = true;
          setLoading(false);
        }
      }
    })();
    fetchAllRunPromiseRef.current = job;
    return job;
  }, [forceLogout, mergeAuthMeResponse, studentRef]);

  /**
   * Cycle **complet** (sans polling différentiel) : tous les domaines sont relus. Sert à
   * « Préparer la sortie terrain », qui doit recopier chaque lecture, même inchangée. Une passe
   * déjà lancée est attendue d'abord : ses requêtes sont parties sans la demande de copie.
   */
  const fetchAllFull = useCallback(async () => {
    const running = fetchAllRunPromiseRef.current;
    if (running) await running.catch(() => {});
    lastSyncStateRef.current = null;
    return fetchAll();
  }, [fetchAll]);

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

  /*
   * Premier chargement dès qu'une session existe (aucun debounce : l'écran est vide),
   * mais **jamais avant les réglages publics** (`contextReady`) : `fetchAll` résout la
   * carte active, et il la résolvait sur les cartes par défaut codées en dur côté front
   * quand `/api/settings/public` n'avait pas encore répondu. La carte ainsi posée était
   * ensuite mémorisée sur l'appareil, et le réglage « plan ouvert par défaut » ne
   * s'appliquait plus jamais. `publicSettingsReady` passe à vrai même quand la requête
   * échoue : aucun risque de blocage du chargement.
   */
  useEffect(() => {
    if (!hasAuthenticatedShell || !contextReady) return undefined;
    if (initialFetchDoneRef.current) return undefined;
    void fetchAll();
    return undefined;
  }, [hasAuthenticatedShell, contextReady, fetchAll]);

  useEffect(() => {
    if (!hasAuthenticatedShell || !contextReady) return undefined;
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

  /*
   * Retour du réseau : synchronisation complète immédiate, sans attendre le prochain tick
   * du rafraîchissement automatique (suspendu hors ligne, voir `useAppDataPolling`).
   */
  useEffect(() => {
    if (!hasAuthenticatedShell || !contextReady) return undefined;
    return subscribeNetworkStatus((online) => {
      if (!online) return;
      failCountRef.current = 0;
      lastSyncStateRef.current = null;
      setRefreshMs(DATA_REFRESH_INTERVAL_MS);
      void fetchAll();
    });
  }, [hasAuthenticatedShell, contextReady, fetchAll]);

  /**
   * Charge les tâches/projets archivés de la carte active (prof, vue « Archivés »).
   * Séparé du poll pour ne pas sérialiser l'historique à chaque cycle.
   */
  const loadArchivedTasks = useCallback(async () => {
    const mapId = String(activeMapId || '').trim();
    if (!mapId) return;
    if (!context?.effectiveIsTeacher) return;
    const accountAtStart = getStoredSessionAccountKey();
    if (!accountAtStart || !hasAuthenticatedShellRef.current) return;
    try {
      const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
      const { fetchAllTaskPages } = await loadTasksListResponse();
      const [tRaw, projects] = await Promise.all([
        fetchAllTaskPages(api, `${mapQuery}&archived=archived`),
        api(`/api/task-projects?${mapQuery}&archived=archived`).catch(() => []),
      ]);
      if (!hasAuthenticatedShellRef.current || getStoredSessionAccountKey() !== accountAtStart) {
        return;
      }
      const t = Array.isArray(tRaw) ? tRaw : [];
      const archTasks = partitionByArchived(t).archived;
      // Si le backend a déjà filtré archived=archived, partition peut tout mettre en archived
      // ou tout en active selon archived_at — partitionByArchived trie sur archived_at.
      const listTasks = t.filter(
        (row) => row && row.archived_at != null && String(row.archived_at).trim() !== '',
      );
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
    lastSyncAt,
    retryingServer,
    fetchAll,
    fetchAllFull,
    retryServerNow,
    loadArchivedTasks,
  };
}
