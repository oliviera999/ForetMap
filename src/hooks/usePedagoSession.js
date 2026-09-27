import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  readStoredPedagoSession,
  writeStoredPedagoSession,
} from '../components/pedago/SessionsView.jsx';
import { notifyLearningGatingChanged } from '../shared/utils/learningGatingEvents.js';
import {
  consumeSessionLinkFromLocation,
  clearPendingSessionLink,
} from '../utils/pedagoSessionLink.js';

/**
 * Traduit l'action d'une étape de séance en navigation dans l'application (fonction pure :
 * toutes les cibles sont fournies par l'appelant).
 *
 * @param {{ action?: { type: string, payload?: object } }|null} step
 * @param {object} nav cibles de navigation du shell : `navigateTab`, `setPlantCatalogPreview`,
 *   `openPlantCatalogPreviewById`, `openPedagoFoodWeb`, `chooseMap`, `idKeysAvailable`,
 *   `individualsAvailable`, `setPedagoIdKeysInitialKey`, `setPedagoQuizQuestionCode`,
 *   `setPedagoQuizNotionId`, `setPedagoQuizNotionNiveau`, `setPedagoGlossaryCode`,
 *   `setPedagoEntry`, `setPedagoMapRouteRequest`
 */
export function runPedagoSessionStepAction(step, nav) {
  if (!step?.action) return;
  const { type, payload = {} } = step.action;
  nav.setPlantCatalogPreview(null);
  if (type === 'message') {
    nav.navigateTab('sessions');
    return;
  }
  if (type === 'open_id_key') {
    // Module éteint : l'étape reste lisible dans le bandeau, sans ouvrir un onglet masqué
    // que `useTabNavigationGuards` renverrait aussitôt vers la carte.
    if (!nav.idKeysAvailable) {
      nav.navigateTab('sessions');
      return;
    }
    nav.setPedagoIdKeysInitialKey(payload.keyIdOrSlug || null);
    nav.navigateTab('id-keys');
    return;
  }
  if (type === 'open_plant') {
    const pid = payload.plantId != null ? Number(payload.plantId) : null;
    if (Number.isFinite(pid) && pid > 0) nav.openPlantCatalogPreviewById(pid);
    else nav.navigateTab('plants');
    return;
  }
  if (type === 'open_foodweb') {
    nav.openPedagoFoodWeb(payload.highlightPlantId ?? null, payload.mapId ?? null);
    return;
  }
  if (type === 'open_quiz') {
    const code = payload.questionCode ? String(payload.questionCode).trim().toUpperCase() : null;
    nav.setPedagoQuizQuestionCode(code || null);
    nav.setPedagoQuizNotionId(payload.notionId ? String(payload.notionId).trim() : null);
    nav.setPedagoQuizNotionNiveau(
      payload.notionNiveau ? String(payload.notionNiveau).trim() : null,
    );
    nav.navigateTab('quiz');
    return;
  }
  if (type === 'open_glossary') {
    const c = payload.termCode ? String(payload.termCode).trim() : '';
    if (c) nav.setPedagoGlossaryCode(c);
    nav.navigateTab('glossary');
    return;
  }
  const map = payload.mapId ? String(payload.mapId).trim() : '';
  if (type === 'open_individual') {
    if (!nav.individualsAvailable) {
      nav.navigateTab('sessions');
      return;
    }
    if (map) nav.chooseMap(map);
    const iid = Number(payload.individualId);
    nav.setPedagoEntry((prev) => ({
      ...prev,
      individualId: Number.isInteger(iid) && iid > 0 ? iid : null,
    }));
    nav.navigateTab('individuals');
    return;
  }
  if (type === 'open_nested_groups') {
    if (map) nav.chooseMap(map);
    const plantIds = (Array.isArray(payload.plantIds) ? payload.plantIds : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    nav.setPedagoEntry((prev) => ({
      ...prev,
      nestedGroups: { plantIds, mapId: map || null, nonce: Date.now() },
    }));
    nav.navigateTab('nested-groups');
    return;
  }
  if (type === 'open_map_route') {
    if (map) nav.chooseMap(map);
    const slug = payload.routeSlug ? String(payload.routeSlug).trim() : '';
    if (slug) nav.setPedagoMapRouteRequest({ slug, nonce: Date.now() });
    nav.navigateTab('map');
  }
}

/**
 * Séance pédagogique en cours, sortie du shell `App` (étape B2 de la piste B, audit du
 * 25/09/2026, § 3.3 ligne 4) : séance active (mémorisée pour l'onglet), exécution côté
 * serveur (démarrage, fin, badges), navigation d'étape en étape, dialogue de fin et lien
 * direct `?seance=slug` (lancé dès que l'utilisateur est authentifié).
 *
 * La séance impose son niveau (décision du 25/09/2026) : public visé et niveau de notion,
 * exposés par `imposedLevel` / `imposedNotionNiveau` tant que le module est disponible.
 *
 * @param {{
 *   available: boolean,
 *   authenticated: boolean,
 *   onToast: (message: string) => void,
 *   navigation: object,
 * }} options `navigation` : cibles de `runPedagoSessionStepAction`
 */
export function usePedagoSession({ available, authenticated, onToast, navigation }) {
  const {
    navigateTab,
    setPlantCatalogPreview,
    openPlantCatalogPreviewById,
    openPedagoFoodWeb,
    chooseMap,
    idKeysAvailable,
    individualsAvailable,
    setPedagoIdKeysInitialKey,
    setPedagoQuizQuestionCode,
    setPedagoQuizNotionId,
    setPedagoQuizNotionNiveau,
    setPedagoGlossaryCode,
    setPedagoEntry,
    setPedagoMapRouteRequest,
  } = navigation;

  const [activeSession, setActiveSession] = useState(() => readStoredPedagoSession());
  const [completedSession, setCompletedSession] = useState(null);
  const [pendingSessionSlug, setPendingSessionSlug] = useState(() =>
    consumeSessionLinkFromLocation(),
  );
  const [runsVersion, setRunsVersion] = useState(0);

  const dispatchStep = useCallback(
    (step) =>
      runPedagoSessionStepAction(step, {
        navigateTab,
        setPlantCatalogPreview,
        openPlantCatalogPreviewById,
        openPedagoFoodWeb,
        chooseMap,
        idKeysAvailable,
        individualsAvailable,
        setPedagoIdKeysInitialKey,
        setPedagoQuizQuestionCode,
        setPedagoQuizNotionId,
        setPedagoQuizNotionNiveau,
        setPedagoGlossaryCode,
        setPedagoEntry,
        setPedagoMapRouteRequest,
      }),
    [
      navigateTab,
      setPlantCatalogPreview,
      openPlantCatalogPreviewById,
      openPedagoFoodWeb,
      chooseMap,
      idKeysAvailable,
      individualsAvailable,
      setPedagoIdKeysInitialKey,
      setPedagoQuizQuestionCode,
      setPedagoQuizNotionId,
      setPedagoQuizNotionNiveau,
      setPedagoGlossaryCode,
      setPedagoEntry,
      setPedagoMapRouteRequest,
    ],
  );

  const persistSession = useCallback((next) => {
    const prevId = readStoredPedagoSession()?.id || null;
    setActiveSession(next);
    writeStoredPedagoSession(next);
    // Entrée ou sortie de séance : le niveau imposé change, donc aussi les questions qui
    // verrouillent les fiches — les résumés affichés se rechargent.
    if (prevId !== (next?.id || null)) notifyLearningGatingChanged({ kind: 'pedago_session' });
  }, []);

  const postRun = useCallback(
    (sessionId, kind) => {
      if (!authenticated || !sessionId) return Promise.resolve(null);
      return api(
        `/api/pedago-sessions/${encodeURIComponent(sessionId)}/runs/${kind}`,
        'POST',
      ).catch(() => null);
    },
    [authenticated],
  );

  const startSession = useCallback(
    async (session) => {
      if (!session?.steps?.length) return false;
      if (authenticated && session.id) {
        try {
          await api(`/api/pedago-sessions/${encodeURIComponent(session.id)}/runs/start`, 'POST');
        } catch (err) {
          if (err?.body?.locked) {
            onToast(err.body.error || 'Cette séance est encore verrouillée.');
            return false;
          }
        }
      }
      const next = {
        id: session.id,
        slug: session.slug,
        title: session.title,
        templateKey: session.templateKey,
        // La séance impose son niveau (décision du 25/09/2026) : public visé et niveau de
        // notion, relus par `BiodivPedagoProvider` ; le serveur, lui, reçoit l'identifiant.
        level: session.level || null,
        notionNiveau: session.config?.notionNiveau || null,
        steps: session.steps,
        stepIndex: 0,
      };
      persistSession(next);
      dispatchStep(next.steps[0]);
      return true;
    },
    [authenticated, persistSession, dispatchStep, onToast],
  );

  const exitSession = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  const goStep = useCallback(
    (delta) => {
      const prev = activeSession;
      if (!prev?.steps?.length) return;
      const nextIndex = prev.stepIndex + delta;
      if (nextIndex < 0) return;
      if (nextIndex >= prev.steps.length) {
        persistSession(null);
        setCompletedSession(prev);
        postRun(prev.id, 'complete').then((res) => {
          setRunsVersion((v) => v + 1);
          if (Array.isArray(res?.rewards) && res.rewards.length) {
            setCompletedSession((cur) =>
              cur && cur.id === prev.id ? { ...cur, newRewards: res.rewards } : cur,
            );
          }
        });
        return;
      }
      const next = { ...prev, stepIndex: nextIndex };
      persistSession(next);
      dispatchStep(next.steps[nextIndex]);
    },
    [activeSession, persistSession, dispatchStep, postRun],
  );

  const currentStep = activeSession?.steps?.[activeSession.stepIndex] || null;

  /** Charge une séance par identifiant ou slug, puis la démarre. */
  const launchSession = useCallback(
    async (idOrSlug) => {
      const key = String(idOrSlug || '').trim();
      if (!key) return false;
      let session = null;
      try {
        session = await api(`/api/pedago-sessions/${encodeURIComponent(key)}`);
        if (!session?.steps?.length) throw new Error('empty');
      } catch {
        onToast('Cette séance n’est plus disponible.');
        return false;
      }
      return startSession(session);
    },
    [startSession, onToast],
  );

  // Lien direct `?seance=slug` : lancé une seule fois, dès que l'utilisateur est authentifié.
  useEffect(() => {
    if (!pendingSessionSlug || !authenticated) return;
    const slug = pendingSessionSlug;
    setPendingSessionSlug(null);
    clearPendingSessionLink();
    launchSession(slug);
  }, [pendingSessionSlug, authenticated, launchSession]);

  const imposedLevel = available ? activeSession?.level || null : null;
  const imposedNotionNiveau = available ? activeSession?.notionNiveau || null : null;

  return useMemo(
    () => ({
      available,
      activeSession,
      currentStep,
      completedSession,
      setCompletedSession,
      runsVersion,
      imposedLevel,
      imposedNotionNiveau,
      startSession,
      launchSession,
      exitSession,
      goStep,
    }),
    [
      available,
      activeSession,
      currentStep,
      completedSession,
      runsVersion,
      imposedLevel,
      imposedNotionNiveau,
      startSession,
      launchSession,
      exitSession,
      goStep,
    ],
  );
}
