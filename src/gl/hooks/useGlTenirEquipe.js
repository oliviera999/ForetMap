import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlTenirTour } from './useGlTenirTour.js';
import { useGlTenirOlu } from './useGlTenirOlu.js';
import { useGlQuestionDeCase } from './useGlQuestionDeCase.js';
import { GL_EQUIPE_ETAT_EVENT } from '../services/glEquipeEtatEvents.js';
import { MESSAGE_ETAT_PERIME } from '../../shared/glMainCore.js';
import { maintenantVousPouvez } from '../../shared/glSortMomentsCore.js';

/** Durée d'affichage de « L'équipe a déjà joué ce geste. Voici où vous en êtes. » (ms). */
export const AVIS_ETAT_PERIME_MS = 12000;

/** Une péripétie plus vieille que cela n'est plus présentée (ms). */
const PERIPETIE_MAX_MS = 10 * 60 * 1000;

/**
 * « Tenir à deux » — ce qu'un écran d'équipe sait de son tour : l'instantané du tour, la question
 * de case, Olu, la péripétie à passer, l'état périmé, la main d'un autre appareil, et tout ce
 * qui s'en déduit (cases à venir, réserve, présences, jet en suspens, gestes ouverts).
 *
 * Une seule logique pour les deux rendus : l'écran en trois choses (`GLTenirEcranEquipe`,
 * surfaces hybride et tablette) et l'ancien écran empilé (`GLTenirEquipeView`, gardé pour la
 * surface « tableau »). Le hook ne décide d'aucun droit : il lit `tenir.permissions`, que le
 * serveur rejoue à chaque geste.
 *
 * @param {object} p
 * @param {object|null} p.gameState état de la partie (`toGameViewModel`)
 * @param {object|null} p.tenir bloc `gameState.tenir`
 * @param {number|null} p.teamId équipe de cet écran
 * @param {Function} [p.onReloadGame] relit l'état de la partie
 * @param {object|null} [p.chasse] résultat de `useGlChasse` (`null` hors chasse)
 * @param {boolean} [p.sortsDisponibles] l'écran sait ouvrir l'assistant de sort
 * @param {object|null} [p.ligneDeLEcran] ligne d'Olu que l'écran dit lui-même, une fois
 * @param {Function} [p.onLigneDeLEcranDite]
 */
export function useGlTenirEquipe({
  gameState,
  tenir,
  teamId,
  onReloadGame = null,
  chasse = null,
  sortsDisponibles = false,
  ligneDeLEcran = null,
  onLigneDeLEcranDite = null,
}) {
  const gameId = gameState?.game?.id;
  const tourApi = useGlTenirTour({
    gameId,
    enabled: !!gameId && !!tenir?.enabled,
    onChanged: onReloadGame,
  });
  // Question de case due à l'arrivée du tour (lot 2) : « Répondre » la présente, même si un
  // sort a déplacé l'équipe entre-temps.
  const caseQuestion = useGlQuestionDeCase({
    gameId,
    onChanged: async () => {
      await tourApi.refresh();
      await onReloadGame?.();
    },
  });
  const [peripetiesPassees, setPeripetiesPassees] = useState(() => new Set());
  const perms = tenir?.permissions || {};
  const events = gameState?.events || [];
  const olu = useGlTenirOlu({
    teamId,
    gameId,
    events,
    teams: gameState?.teams || [],
    enabled: !!gameId && !!tenir?.enabled,
    ligneDeLEcran,
    onLigneDeLEcranDite,
  });
  // Péripétie de mon équipe non encore passée (case événement sans texte, spec § 13).
  const peripetie = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.eventType !== 'peripetie' || Number(e.teamId) !== Number(teamId)) continue;
      const id = e.payload?.id || `evt-${e.id}`;
      if (peripetiesPassees.has(id)) return null;
      const age = Date.now() - new Date(e.createdAt || 0).getTime();
      if (Number.isFinite(age) && age > PERIPETIE_MAX_MS) return null;
      return { id, texte: e.payload?.texte || '', eventId: e.id };
    }
    return null;
  }, [events, teamId, peripetiesPassees]);
  const passerPeripetie = useCallback(
    async (p) => {
      setPeripetiesPassees((prev) => new Set([...prev, p.id]));
      await tourApi.peripetiePasser(p.id, teamId);
    },
    [tourApi, teamId],
  );
  // Plusieurs appareils par équipe (M13). Un geste refusé parce que l'écran était périmé, ou
  // parce qu'un autre appareil tient la main : on recharge — « Voici où vous en êtes. »
  // Le message reste à l'écran quelques secondes : le rechargement efface les erreurs des gestes.
  const rafraichirTour = tourApi.refresh;
  const rafraichirCarnet = chasse?.refresh || null;
  const [etatPerime, setEtatPerime] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const recharger = (evt) => {
      if (evt?.detail?.code === 'ETAT_PERIME') {
        setEtatPerime(evt.detail.message || MESSAGE_ETAT_PERIME);
      }
      rafraichirTour();
      rafraichirCarnet?.();
      onReloadGame?.();
    };
    window.addEventListener(GL_EQUIPE_ETAT_EVENT, recharger);
    return () => window.removeEventListener(GL_EQUIPE_ETAT_EVENT, recharger);
  }, [rafraichirTour, rafraichirCarnet, onReloadGame]);
  useEffect(() => {
    if (!etatPerime) return undefined;
    const timer = setTimeout(() => setEtatPerime(''), AVIS_ETAT_PERIME_MS);
    return () => clearTimeout(timer);
  }, [etatPerime]);
  // Un autre appareil de l'équipe vient de jouer (la version d'état a avancé) : le tour et le
  // carnet de cet écran se relisent aussi — jet déjà fait, fouilles restantes, cases à venir.
  const versionEquipe = tenir?.equipe?.version ?? null;
  const [versionLue, setVersionLue] = useState(versionEquipe);
  useEffect(() => {
    if (versionEquipe == null || versionEquipe === versionLue) return;
    setVersionLue(versionEquipe);
    rafraichirTour();
    rafraichirCarnet?.();
  }, [versionEquipe, versionLue, rafraichirTour, rafraichirCarnet]);
  // La main d'un autre appareil échoit seule (60 s au plus) : l'écran se relit à l'échéance.
  // À l'échéance, l'écran se rallume de lui-même, que la relecture aboutisse ou non (réseau
  // hésitant) : aucun écran ne reste éteint sur une main que le serveur tient pour échue.
  const mainServie = tenir?.equipe?.main && !tenir.equipe.main.moi ? tenir.equipe.main : null;
  const cleMain = mainServie
    ? `${tenir.equipe.version}:${mainServie.geste}:${mainServie.prenom || ''}:${mainServie.resteSecondes}`
    : null;
  const [mainEchue, setMainEchue] = useState(null);
  const mainAilleurs = mainServie && cleMain !== mainEchue ? mainServie : null;
  const resteMain = mainAilleurs ? Number(mainAilleurs.resteSecondes) || 0 : null;
  useEffect(() => {
    if (resteMain == null) return undefined;
    const timer = setTimeout(
      () => {
        setMainEchue(cleMain);
        onReloadGame?.();
      },
      (resteMain + 1) * 1000,
    );
    return () => clearTimeout(timer);
  }, [resteMain, cleMain, onReloadGame]);
  // L'état de la partie (`tenir.round`, rechargé à chaque évènement temps réel) fait foi : le
  // prof change de phase ou règle le sablier sans que cet écran ait rien demandé. L'instantané
  // du tour, relu ci-dessous, ne fait que le compléter — et seulement s'il parle du même tour.
  const cleTour = `${events.length}:${tenir?.round?.number || 0}:${tenir?.round?.phase || ''}`;
  const cleTourLue = useRef(cleTour);
  useEffect(() => {
    if (cleTourLue.current === cleTour) return;
    cleTourLue.current = cleTour;
    rafraichirTour();
  }, [cleTour, rafraichirTour]);
  const roundServi = Number(tenir?.round?.number) > 0 ? tenir.round : null;
  const roundLu = tourApi.tour?.round || null;
  const round = useMemo(() => {
    if (!roundServi) return roundLu;
    return roundLu && Number(roundLu.number) === Number(roundServi.number)
      ? { ...roundLu, ...roundServi }
      : roundServi;
  }, [roundServi, roundLu]);
  const sablier = tenir?.sablier || tourApi.tour?.sablier || null;
  const team = useMemo(
    () => (gameState?.teams || []).find((t) => Number(t.id) === Number(teamId)) || null,
    [gameState, teamId],
  );
  const mates = useMemo(
    () => (gameState?.roster || []).filter((r) => Number(r.teamId) === Number(teamId)),
    [gameState, teamId],
  );

  const pret = !!tenir?.enabled && !!team;
  const settings = tenir?.settings || null;
  const fouilles = chasse?.carnet?.fouilles || null;
  // E4 : réserve de la caravane de l'équipe (servie seulement à ses membres et au prof).
  const reserve =
    settings?.surplus_reserve !== false
      ? (tenir?.reserves || []).find((r) => Number(r.teamId) === Number(teamId)) || null
      : null;
  const questionDue =
    (round?.questionsEnAttente || []).find((q) => Number(q.teamId) === Number(teamId)) || null;
  // Les six cases à venir (lot 2) : affichées gratuitement avant le jet.
  const maVue = (tourApi.tour?.teams || []).find((t) => Number(t.id) === Number(teamId)) || null;
  const casesAVenir =
    round?.phase === 'jeu' && maVue && !maVue.hasRolledDiceThisRound && !maVue.auCamp
      ? maVue.casesAVenir || []
      : [];
  const des = maVue?.desProchainJet || settings?.des_count || 2;
  // Escalier du chapitre 1 (M8) : ce qui n'est pas encore ouvert n'est pas montré (jamais
  // grisé). Les sorts arrivent à la séance 3 ; le Marché, à la séance 4, a son propre accès.
  const escalier = tenir?.escalier || null;
  const sortsOuvertsParLEscalier = !escalier || escalier.sorts.length > 0;
  // « Maintenant, vous pouvez… » (M8) : les gestes possibles à cet instant, chacun avec l'appel
  // du rôle (M10). Un conseil, jamais un contrôle : les gestes restent ceux des droits servis.
  const pagesATenir = team
    ? (chasse?.carnet?.pages || []).filter(
        (p) => p.attendUnLecteur && p.trouveePar && p.trouveePar.type !== team.type,
      ).length
    : 0;
  const maintenant = maintenantVousPouvez({
    perms,
    phase: round?.phase || null,
    aLance: !!maVue?.hasRolledDiceThisRound,
    auCamp: !!maVue?.auCamp,
    des,
    questionDue: !!questionDue,
    fouillesRestantes: fouilles ? fouilles.restantes : null,
    pagesATenir,
    sortsOuverts: sortsOuvertsParLEscalier && sortsDisponibles,
    defis: settings?.defis !== false,
    effectif: mates.length,
  });
  // Cordée offerte (lot 2) : l'équipe partenaire ne paie rien et n'a rien à accepter ; son écran
  // lui dit simplement qui l'encorde ce tour.
  const cordeeRecue =
    (round?.effets || []).find(
      (e) => e.kind === 'cordee' && Number(e.sourceTeamId) === Number(teamId),
    ) || null;
  const encordeePar = cordeeRecue
    ? (gameState?.teams || []).find((t) => Number(t.id) === Number(cordeeRecue.teamId)) || null
    : null;
  // Présences (lot 2) : « Il manque quelqu'un ? » tant que l'équipe n'a pas répondu.
  const presences = tourApi.tour?.presences || null;
  const presence = presences?.requise
    ? (presences.equipes || []).find((e) => Number(e.teamId) === Number(teamId)) || null
    : null;
  // Relance : jet de l'équipe dont la case s'affiche sans s'être appliquée.
  const jetEnSuspens =
    (round?.arriveesEnSuspens || []).find((a) => Number(a.teamId) === Number(teamId)) || null;
  // Jet saisi (dés physiques) que le prof n'a pas encore validé ni refusé : lu dans le tour, pour
  // que la mention parte avec la saisie — et s'affiche sur tous les appareils de l'équipe.
  const jetEnAttente = (round?.desEnAttente || []).some((s) => Number(s.teamId) === Number(teamId));

  return {
    pret,
    gameId,
    tourApi,
    caseQuestion,
    olu,
    perms,
    events,
    settings,
    peripetie,
    passerPeripetie,
    etatPerime,
    mainServie,
    mainAilleurs,
    round,
    sablier,
    team,
    mates,
    fouilles,
    reserve,
    questionDue,
    maVue,
    casesAVenir,
    des,
    escalier,
    sortsOuvertsParLEscalier,
    pagesATenir,
    maintenant,
    encordeePar,
    presence,
    jetEnSuspens,
    jetEnAttente,
  };
}
