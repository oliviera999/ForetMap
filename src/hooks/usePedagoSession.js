import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  readStoredPedagoSession,
  writeStoredPedagoSession,
} from '../components/pedago/SessionsView.jsx';
import { notifyLearningGatingChanged } from '../shared/utils/learningGatingEvents.js';
import { markRewardsCelebrated } from '../shared/rewards/useRewardsCelebration.js';
import {
  consumeSessionLinkFromLocation,
  clearPendingSessionLink,
} from '../utils/pedagoSessionLink.js';
import { PEDAGO_STEP_ACTION as A } from '../shared/enums/pedagoStepActions.js';
import { tutorialPreviewPayload } from '../components/TutorialPreviewModal.jsx';

/**
 * Traduit l'action d'une étape de séance en navigation dans l'application (fonction pure :
 * toutes les cibles sont fournies par l'appelant).
 *
 * @param {{ action?: { type: string, payload?: object } }|null} step
 * @param {object} nav cibles de navigation du shell : `navigateTab`, `setPlantCatalogPreview`,
 *   `openPlantCatalogPreviewById`, `openPedagoFoodWeb`, `chooseMap`, `idKeysAvailable`,
 *   `individualsAvailable`, `setPedagoIdKeysInitialKey`, `setPedagoQuizQuestionCode`,
 *   `setPedagoQuizNotionId`, `setPedagoQuizNotionNiveau`, `setPedagoGlossaryCode`,
 *   `setPedagoEntry`, `setPedagoMapRouteRequest` ; et, fournies par `usePedagoSession`
 *   lui-même (pas par le shell), `openSessionTutorial` / `closeSessionTutorial`
 */
export function runPedagoSessionStepAction(step, nav) {
  if (!step?.action) return;
  const { type, payload = {} } = step.action;
  nav.setPlantCatalogPreview(null);
  // Le tutoriel d'une étape précédente ne reste pas ouvert par-dessus la suivante.
  nav.closeSessionTutorial?.();
  if (type === A.MESSAGE) {
    nav.navigateTab('sessions');
    return;
  }
  if (type === A.OPEN_TUTORIAL) {
    // Le tutoriel s'ouvre par-dessus l'onglet Séances (consigne lisible à la fermeture) :
    // aucun onglet du shell n'est requis, l'aperçu est rendu par le bandeau de séance.
    nav.navigateTab('sessions');
    const tid = Number(payload.tutorialId);
    const slug = payload.tutorialSlug ? String(payload.tutorialSlug).trim() : '';
    nav.openSessionTutorial?.({
      tutorialId: Number.isInteger(tid) && tid > 0 ? tid : null,
      tutorialSlug: slug || null,
    });
    return;
  }
  if (type === A.OPEN_ID_KEY) {
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
  if (type === A.OPEN_PLANT) {
    const pid = payload.plantId != null ? Number(payload.plantId) : null;
    if (Number.isFinite(pid) && pid > 0) nav.openPlantCatalogPreviewById(pid);
    else nav.navigateTab('plants');
    return;
  }
  if (type === A.OPEN_FOODWEB) {
    nav.openPedagoFoodWeb(payload.highlightPlantId ?? null, payload.mapId ?? null);
    return;
  }
  if (type === A.OPEN_QUIZ) {
    const code = payload.questionCode ? String(payload.questionCode).trim().toUpperCase() : null;
    nav.setPedagoQuizQuestionCode(code || null);
    nav.setPedagoQuizNotionId(payload.notionId ? String(payload.notionId).trim() : null);
    nav.setPedagoQuizNotionNiveau(
      payload.notionNiveau ? String(payload.notionNiveau).trim() : null,
    );
    nav.navigateTab('quiz');
    return;
  }
  if (type === A.OPEN_GLOSSARY) {
    const c = payload.termCode ? String(payload.termCode).trim() : '';
    if (c) nav.setPedagoGlossaryCode(c);
    nav.navigateTab('glossary');
    return;
  }
  if (type === A.OPEN_FRESQUE) {
    if (!nav.fresqueAvailable) {
      nav.navigateTab('sessions');
      return;
    }
    nav.setPedagoEntry((prev) => ({
      ...prev,
      fresque: { deckId: payload.deckId ? String(payload.deckId).trim() : null, nonce: Date.now() },
    }));
    nav.navigateTab('fresque');
    return;
  }
  const map = payload.mapId ? String(payload.mapId).trim() : '';
  if (type === A.OPEN_INDIVIDUAL) {
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
  if (type === A.OPEN_NESTED_GROUPS) {
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
  if (type === A.OPEN_MAP_ROUTE) {
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
    fresqueAvailable = true,
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

  // Tutoriel d'une étape `open_tutorial` : état porté ici, aperçu rendu par
  // `PedagoSessionBanner` (aucune cible nouvelle demandée au shell).
  const [sessionTutorial, setSessionTutorial] = useState(null);
  const tutorialRequestRef = useRef(0);

  const closeSessionTutorial = useCallback(() => {
    tutorialRequestRef.current += 1;
    setSessionTutorial(null);
  }, []);

  /** Marque lu le tutoriel affiché (bouton « J'ai lu » de l'aperçu). */
  const markSessionTutorialRead = useCallback((tutorialId) => {
    setSessionTutorial((cur) =>
      cur && Number(cur.tutorial?.id) === Number(tutorialId) ? { ...cur, isRead: true } : cur,
    );
  }, []);

  /**
   * Charge puis affiche le tutoriel d'une étape. Par identifiant : `GET /api/tutorials/:id`
   * (404 si désactivé). Par slug seul (étape écrite hors API, par une migration) : recherche
   * dans la liste des tutoriels actifs. Une réponse arrivée après un changement d'étape est
   * ignorée.
   */
  const openSessionTutorial = useCallback(
    async ({ tutorialId = null, tutorialSlug = null } = {}) => {
      const requestId = tutorialRequestRef.current + 1;
      tutorialRequestRef.current = requestId;
      setSessionTutorial(null);
      if (!tutorialId && !tutorialSlug) {
        onToast('Cette étape n’a pas de tutoriel : préviens ton professeur.');
        return;
      }
      let tutorial = null;
      try {
        if (tutorialId) {
          tutorial = await api(`/api/tutorials/${encodeURIComponent(tutorialId)}`);
        } else {
          const list = await api('/api/tutorials');
          tutorial = (Array.isArray(list) ? list : []).find((t) => t.slug === tutorialSlug) || null;
        }
      } catch {
        tutorial = null;
      }
      if (tutorialRequestRef.current !== requestId) return;
      const payload = tutorialPreviewPayload(tutorial);
      if (!payload) {
        onToast('Ce tutoriel n’est plus disponible. Tu peux continuer la séance.');
        return;
      }
      setSessionTutorial({ tutorial: payload, isRead: false, canAcknowledge: false });
      if (!authenticated) return;
      // Accusé de lecture : proposé seulement une fois l'état « déjà lu » connu.
      api('/api/tutorials/me/read-ids')
        .then((res) => {
          if (tutorialRequestRef.current !== requestId) return;
          const ids = Array.isArray(res?.tutorial_ids) ? res.tutorial_ids.map(Number) : [];
          setSessionTutorial((cur) =>
            cur ? { ...cur, isRead: ids.includes(Number(payload.id)), canAcknowledge: true } : cur,
          );
        })
        .catch(() => {});
    },
    [authenticated, onToast],
  );

  const dispatchStep = useCallback(
    (step) =>
      runPedagoSessionStepAction(step, {
        openSessionTutorial,
        closeSessionTutorial,
        navigateTab,
        setPlantCatalogPreview,
        openPlantCatalogPreviewById,
        openPedagoFoodWeb,
        chooseMap,
        idKeysAvailable,
        individualsAvailable,
        fresqueAvailable,
        setPedagoIdKeysInitialKey,
        setPedagoQuizQuestionCode,
        setPedagoQuizNotionId,
        setPedagoQuizNotionNiveau,
        setPedagoGlossaryCode,
        setPedagoEntry,
        setPedagoMapRouteRequest,
      }),
    [
      openSessionTutorial,
      closeSessionTutorial,
      navigateTab,
      setPlantCatalogPreview,
      openPlantCatalogPreviewById,
      openPedagoFoodWeb,
      chooseMap,
      idKeysAvailable,
      individualsAvailable,
      fresqueAvailable,
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

  // Un seul avertissement « progression non enregistrée » par séance : une étape qui échoue
  // à s'enregistrer (réseau) ne doit pas noyer l'élève sous les toasts.
  const progressWarnedRef = useRef(null);

  /** Mémorise l'étape côté serveur (reprise dans un autre onglet, un autre jour). */
  const postProgress = useCallback(
    (sessionId, stepIndex) => {
      if (!authenticated || !sessionId) return;
      api(`/api/pedago-sessions/${encodeURIComponent(sessionId)}/runs/progress`, 'POST', {
        step: stepIndex,
      }).catch(() => {
        if (progressWarnedRef.current === sessionId) return;
        progressWarnedRef.current = sessionId;
        onToast(
          'Ton avancée n’a pas pu être enregistrée : vérifie ta connexion. Tu peux continuer la séance.',
        );
      });
    },
    [authenticated, onToast],
  );

  /**
   * Démarre une séance, ou la **reprend** à l'étape mémorisée par le serveur (lot 5).
   * `restart` : repartir de l'étape 1 sans recompter de démarrage.
   */
  const startSession = useCallback(
    async (session, { restart = false } = {}) => {
      if (!session?.steps?.length) {
        onToast('Cette séance n’a pas encore d’étape : préviens ton professeur.');
        return false;
      }
      const stepCount = session.steps.length;
      const local = readStoredPedagoSession();
      // Même séance déjà ouverte dans cet onglet : on y retourne sans appel serveur.
      if (!restart && local?.id && local.id === session.id) {
        const idx = Math.min(Math.max(0, local.stepIndex || 0), stepCount - 1);
        const next = { ...local, steps: session.steps, stepIndex: idx };
        persistSession(next);
        dispatchStep(next.steps[idx]);
        return true;
      }
      let stepIndex = 0;
      let resumed = false;
      if (authenticated && session.id) {
        try {
          const res = await api(
            `/api/pedago-sessions/${encodeURIComponent(session.id)}/runs/start`,
            'POST',
            restart ? { restart: true } : undefined,
          );
          const serverStep = Number(res?.run?.currentStep);
          if (res?.resumed && Number.isInteger(serverStep) && serverStep > 0) {
            stepIndex = Math.min(serverStep, stepCount - 1);
            resumed = true;
          }
        } catch (err) {
          if (err?.body?.locked) {
            onToast(err.body.error || 'Cette séance est encore verrouillée.');
            return false;
          }
          if (err?.body?.code === 'SESSION_EMPTY') {
            onToast(err.body.error || 'Cette séance n’a pas encore d’étape.');
            return false;
          }
          // Séance en brouillon ouverte par un gestionnaire (404 côté élève) : pas de trace,
          // c'est attendu. Sinon, on prévient : la séance se suit, mais sans reprise.
          if (err?.status !== 404) {
            progressWarnedRef.current = session.id;
            onToast(
              'Séance ouverte sans connexion au serveur : ton avancée ne sera pas enregistrée.',
            );
          }
        }
      }
      if (progressWarnedRef.current && progressWarnedRef.current !== session.id) {
        progressWarnedRef.current = null;
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
        stepIndex,
      };
      persistSession(next);
      dispatchStep(next.steps[stepIndex]);
      if (resumed) onToast(`Reprise de « ${session.title} » à l’étape ${stepIndex + 1}.`);
      return true;
    },
    [authenticated, persistSession, dispatchStep, onToast],
  );

  /**
   * Quitter = mettre en pause : l'étape reste mémorisée côté serveur, la séance se reprend
   * depuis l'onglet Séances (la confirmation est demandée par le bandeau).
   */
  const exitSession = useCallback(() => {
    closeSessionTutorial();
    persistSession(null);
  }, [persistSession, closeSessionTutorial]);

  const completeSession = useCallback(
    (prev) => {
      closeSessionTutorial();
      persistSession(null);
      setCompletedSession(prev);
      if (!authenticated || !prev.id) return;
      api(`/api/pedago-sessions/${encodeURIComponent(prev.id)}/runs/complete`, 'POST')
        .then((res) => {
          const rewards = Array.isArray(res?.rewards) ? res.rewards : [];
          // Une seule fenêtre de fin : les badges gagnés s'affichent dans « Séance terminée » ;
          // marqués fêtés ici, ils ne rouvrent ni « Nouveau badge ! » par-dessus, ni ailleurs.
          if (rewards.length) {
            markRewardsCelebrated(rewards.map((r) => r.key));
            setCompletedSession((cur) =>
              cur && cur.id === prev.id ? { ...cur, newRewards: rewards } : cur,
            );
          }
        })
        .catch((err) => {
          setCompletedSession((cur) =>
            cur && cur.id === prev.id
              ? {
                  ...cur,
                  saveError:
                    err?.body?.error ||
                    'La fin de séance n’a pas pu être enregistrée (connexion). Tes badges arriveront à la prochaine séance terminée.',
                }
              : cur,
          );
        })
        .finally(() => setRunsVersion((v) => v + 1));
    },
    [authenticated, persistSession, closeSessionTutorial],
  );

  const goStep = useCallback(
    (delta) => {
      const prev = activeSession;
      if (!prev?.steps?.length) return;
      const nextIndex = prev.stepIndex + delta;
      if (nextIndex < 0) return;
      if (nextIndex >= prev.steps.length) {
        completeSession(prev);
        return;
      }
      const next = { ...prev, stepIndex: nextIndex };
      persistSession(next);
      dispatchStep(next.steps[nextIndex]);
      postProgress(prev.id, nextIndex);
    },
    [activeSession, persistSession, dispatchStep, postProgress, completeSession],
  );

  /** Fermeture de la fenêtre de fin : les badges montrés sont « vus » (`seen_at`). */
  const closeCompletedSession = useCallback(() => {
    setCompletedSession((cur) => {
      if (cur?.newRewards?.length) api('/api/rewards/me/seen', 'POST').catch(() => {});
      return null;
    });
  }, []);

  const currentStep = activeSession?.steps?.[activeSession.stepIndex] || null;

  /** Charge une séance par identifiant ou slug, puis la démarre. */
  const launchSession = useCallback(
    async (idOrSlug) => {
      const key = String(idOrSlug || '').trim();
      if (!key) return false;
      let session = null;
      try {
        session = await api(`/api/pedago-sessions/${encodeURIComponent(key)}`);
      } catch {
        onToast('Cette séance n’est plus disponible.');
        return false;
      }
      // Séance sans étape : `startSession` le dit à l'élève au lieu de rester muet.
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
      closeCompletedSession,
      runsVersion,
      imposedLevel,
      imposedNotionNiveau,
      sessionTutorial,
      closeSessionTutorial,
      markSessionTutorialRead,
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
      closeCompletedSession,
      runsVersion,
      imposedLevel,
      imposedNotionNiveau,
      sessionTutorial,
      closeSessionTutorial,
      markSessionTutorialRead,
      startSession,
      launchSession,
      exitSession,
      goStep,
    ],
  );
}
