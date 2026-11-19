import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { useGlTenirOlu } from '../../hooks/useGlTenirOlu.js';
import { useGlQuestionDeCase } from '../../hooks/useGlQuestionDeCase.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourDesSaisie } from '../mj/GLTourDesSaisie.jsx';
import { GLTenirQuestionCard } from './GLTenirQuestionCard.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';
import { GLRewardsPanel } from '../GLRewardsPanel.jsx';
import { GLOluBulle } from './GLOluBulle.jsx';
import { GLPeripetieOverlay } from './GLPeripetieOverlay.jsx';
import { GLBestiairePanel } from './GLBestiairePanel.jsx';
import { GLSablier } from './GLSablier.jsx';
import { GLPresencePanel } from './GLPresencePanel.jsx';
import { GLSortsParMoment } from './GLSortsParMoment.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLCeQuiChange } from './GLCeQuiChange.jsx';
import { GLEquipeAppareils } from './GLEquipeAppareils.jsx';
import { GL_EQUIPE_ETAT_EVENT } from '../../services/glEquipeEtatEvents.js';
import { MESSAGE_ETAT_PERIME } from '../../../shared/glMainCore.js';
import { ROLES_EN_CONSEIL, maintenantVousPouvez } from '../../../shared/glSortMomentsCore.js';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';

const VERDICT_TEXTES = {
  froid: 'Froid : la page dort plus loin.',
  tiede: 'Tiède : on s’approche.',
  chaud: 'Chaud : la page est tout près.',
  zone: 'Une page dort ici : réponds à sa question.',
  deja_trouvee: 'Cette page est déjà trouvée.',
  palie: 'Cette zone a pâli : les Gnomes savent la réparer.',
  page_trouvee: 'Page trouvée ! Elle entre au carnet de la classe.',
  pas_encore: 'Pas encore : la page dort encore ici.',
};

/** Durée d'affichage de « L'équipe a déjà joué ce geste. Voici où vous en êtes. » (ms). */
const AVIS_ETAT_PERIME_MS = 12000;

const PHASE_LABELS = {
  ouverture: 'ouverture',
  jeu: 'jeu',
  souffle: 'souffle',
  clos: 'tour clos',
};

/**
 * Écran d'équipe (surfaces hybride et tablette) : les cinq gestes en boutons, grisés par
 * `tenir.permissions` (le serveur rejoue le calcul ; le client ne fait que griser).
 * `onJeter(code?)` ouvre l'assistant de sort (pré-sélectionné sur `code`, ex. Relance) ;
 * `onFouiller` bascule le plateau en mode fouille ;
 * `onLire` ouvre le carnet de la classe ; `onRepondre` présente la question de la case.
 */
export function GLTenirEquipeView({
  gameState,
  tenir,
  teamId,
  onReloadGame,
  onJeter = null,
  onFouiller = null,
  onLire = null,
  onRepondre = null,
  /** Résultat de `useGlChasse` (fouille au clic, question, carnet) ; `null` hors chasse. */
  chasse = null,
  /** Modules G&L (`rewardsEnabled` conditionne « Mes badges ») ; `null` = tout allumé. */
  modules = null,
  /**
   * Tablette d'équipe (session ouverte par le lien de classe) : même écran, sans ce qui
   * appartient à un compte (« Mes badges », proposition d'une chimère).
   */
  tablette = false,
  /**
   * Ouvre la fiche ou le mot du glossaire d'une piste de réponse (M22) ; `null` là où l'écran
   * n'a pas d'onglets (tablette d'équipe) : le texte de la piste suffit.
   */
  onOuvrirPiste = null,
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
  const [pending, setPending] = useState(null);
  const [carnetOuvert, setCarnetOuvert] = useState(false);
  // Lot 2 : « Jeter un sort » déplie les sorts rangés par moment du tour.
  const [sortsOuverts, setSortsOuverts] = useState(false);
  const [badgesOuverts, setBadgesOuverts] = useState(false);
  const [peripetiesPassees, setPeripetiesPassees] = useState(() => new Set());
  const perms = tenir?.permissions || {};
  const events = gameState?.events || [];
  const olu = useGlTenirOlu({
    teamId,
    gameId,
    events,
    teams: gameState?.teams || [],
    enabled: !!gameId && !!tenir?.enabled,
  });
  // Péripétie de mon équipe non encore passée (case événement sans texte, spec § 13).
  const peripetie = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.eventType !== 'peripetie' || Number(e.teamId) !== Number(teamId)) continue;
      const id = e.payload?.id || `evt-${e.id}`;
      if (peripetiesPassees.has(id)) return null;
      const age = Date.now() - new Date(e.createdAt || 0).getTime();
      if (Number.isFinite(age) && age > 10 * 60 * 1000) return null;
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
  // À l'échéance, le grisé se lève de lui-même, que la relecture aboutisse ou non (réseau
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
  if (!tenir?.enabled || !team) return null;

  const surface = tenir.surface || 'tableau';
  const fouilles = chasse?.carnet?.fouilles || null;
  // E4 : réserve de la caravane de l'équipe (servie seulement à ses membres et au prof).
  const reserve =
    tenir.settings?.surplus_reserve !== false
      ? (tenir.reserves || []).find((r) => Number(r.teamId) === Number(teamId)) || null
      : null;
  const fouilleMode = !!chasse?.fouilleMode;
  const questionDue =
    (round?.questionsEnAttente || []).find((q) => Number(q.teamId) === Number(teamId)) || null;
  // Les six cases à venir (lot 2) : affichées gratuitement avant le jet.
  const maVue = (tourApi.tour?.teams || []).find((t) => Number(t.id) === Number(teamId)) || null;
  const casesAVenir =
    round?.phase === 'jeu' && maVue && !maVue.hasRolledDiceThisRound && !maVue.auCamp
      ? maVue.casesAVenir || []
      : [];
  const lectureEnVeillee =
    !perms.lire &&
    tenir.settings?.lecture_pendant_tour === false &&
    !!round?.phase &&
    round.phase !== 'clos';
  // Escalier du chapitre 1 (M8) : ce qui n'est pas encore ouvert n'est pas montré (jamais
  // grisé). Les sorts arrivent à la séance 3 ; le Marché, à la séance 4, a son propre accès.
  const escalier = tenir.escalier || null;
  const sortsOuvertsParLEscalier = !escalier || escalier.sorts.length > 0;
  const gestes = [
    ...(sortsOuvertsParLEscalier
      ? [
          [
            'jeter',
            sortsOuverts ? 'Fermer les sorts' : 'Jeter un sort',
            onJeter ? () => setSortsOuverts((v) => !v) : null,
          ],
        ]
      : []),
    ['lancer', 'Lancer', null],
    [
      'repondre',
      questionDue ? 'Répondre à la question' : 'Répondre',
      onRepondre || (questionDue ? () => caseQuestion.presenter(questionDue.markerId) : null),
    ],
    [
      'fouiller',
      fouilleMode ? 'Annuler la fouille' : 'Fouiller',
      chasse ? () => chasse.setFouilleMode(!fouilleMode) : onFouiller,
    ],
    [
      'lire',
      // Lot 2 (profil « court ») : pendant le tour, lire et tenir une page attendent la veillée.
      lectureEnVeillee ? 'À lire en veillée' : 'Lire',
      chasse ? () => setCarnetOuvert((v) => !v) : onLire,
    ],
  ];
  // « Maintenant, vous pouvez… » (M8) : les gestes possibles à cet instant, chacun avec l'appel
  // du rôle (M10). Un conseil, jamais un contrôle : les boutons restent ceux des droits servis.
  const pagesATenir = (chasse?.carnet?.pages || []).filter(
    (p) => p.attendUnLecteur && p.trouveePar && p.trouveePar.type !== team.type,
  ).length;
  const maintenant = maintenantVousPouvez({
    perms,
    phase: round?.phase || null,
    aLance: !!maVue?.hasRolledDiceThisRound,
    auCamp: !!maVue?.auCamp,
    des: maVue?.desProchainJet || tenir.settings?.des_count || 2,
    questionDue: !!questionDue,
    fouillesRestantes: fouilles ? fouilles.restantes : null,
    pagesATenir,
    sortsOuverts: sortsOuvertsParLEscalier && !!onJeter,
    defis: tenir.settings?.defis !== false,
    effectif: mates.length,
  });
  const verdict = chasse?.dernierVerdict || null;
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
  const numeroJet = jetEnSuspens ? numeroCase(jetEnSuspens.index) : null;
  // Jet saisi (dés physiques) que le prof n'a pas encore validé ni refusé : lu dans le tour, pour
  // que la mention parte avec la saisie — et s'affiche sur tous les appareils de l'équipe.
  const jetEnAttente = (round?.desEnAttente || []).some((s) => Number(s.teamId) === Number(teamId));

  return (
    <section
      className={`gl-tenir-equipe${fouilleMode ? ' is-fouille' : ''}`}
      data-testid="gl-tenir-equipe"
    >
      <header className="gl-tenir-equipe__head">
        <h3>
          {team.name}{' '}
          <small className="gl-hint">
            · {team.type === 'unicorn' ? 'licornes' : 'gnomes'} · {surface}
          </small>
        </h3>
        <p className="gl-hint">
          {round
            ? `Tour ${round.number} — ${PHASE_LABELS[round.phase] || round.phase}`
            : 'Aucun tour ouvert : attends le prof.'}
          {tenir.enRetrait ? ' · en retrait jusqu’à la fin du tour' : ''}
        </p>
        <GLButton
          type="button"
          variant="ghost"
          onClick={() => tourApi.refresh().then(onReloadGame)}
        >
          Actualiser
        </GLButton>
      </header>
      {/* Sablier du tour : même état que la console du prof ; l'équipe le voit sans le régler. */}
      {sablier?.phase && round?.phase === 'jeu' ? (
        <GLSablier
          mode="phase"
          secondes={sablier.phase.secondes}
          restantSecondes={sablier.phase.restantSecondes}
          enPause={sablier.phase.enPause}
          doneHint="le sablier a sonné : finissez votre geste"
          testId="gl-sablier-phase"
        />
      ) : null}
      {encordeePar ? (
        <p className="gl-tenir-equipe__encorde" role="status" data-testid="gl-tenir-encorde">
          <strong>L’équipe {encordeePar.name} vous encorde.</strong> Le meilleur de vos deux jets
          vaut pour les deux.
        </p>
      ) : null}
      {/* Au camp : trois lignes pour le chapitre suivant (ton peuple, tes sorts, le plateau). */}
      {gameState?.game?.status === 'ended' ? <GLCeQuiChange gameId={gameId} /> : null}
      {/* Quand un autre appareil tient la main, l'écran dit qui joue : rien d'autre à proposer. */}
      {maintenant.length && !mainAilleurs ? (
        <section
          className="gl-tenir-maintenant"
          aria-labelledby="gl-tenir-maintenant-titre"
          data-testid="gl-tenir-maintenant"
        >
          <h4 id="gl-tenir-maintenant-titre">Maintenant, vous pouvez…</h4>
          <ul>
            {maintenant.map((m) => (
              <li key={m.geste} data-geste-possible={m.geste}>
                <strong>{m.role || 'Toute l’équipe'}</strong> : {m.texte}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {etatPerime ? (
        <p className="gl-tenir-main" role="status" data-testid="gl-tenir-etat-perime">
          {etatPerime}
        </p>
      ) : null}
      <GLEquipeAppareils
        gameId={gameId}
        equipe={
          tenir.equipe && mainServie && !mainAilleurs
            ? { ...tenir.equipe, main: null }
            : tenir.equipe || null
        }
        spectateur={tenir.spectateur === true}
        onChanged={onReloadGame}
      />
      <GLPresencePanel
        presence={presence}
        mates={mates}
        busy={tourApi.busy}
        onConfirmer={(absents) => tourApi.presences(absents)}
        onArrivee={(playerId) => tourApi.arrivee(playerId)}
      />
      <ul className="gl-tenir-equipe__bourses">
        {mates.map((m) => (
          <li key={m.playerId}>
            {m.pseudo || `${m.firstName} ${m.lastName}`.trim()}
            {m.powerPoints != null ? <span className="gl-hint"> 💎 {m.powerPoints}</span> : null}
          </li>
        ))}
      </ul>
      {reserve ? (
        <p className="gl-hint" data-testid="gl-tenir-reserve">
          Réserve de la caravane : 💎 {reserve.power}
          <span className="fm-visually-hidden">
            {' '}
            (les gains au-dessus du plafond y vont ; elle paie d’abord les sorts de l’équipe)
          </span>
        </p>
      ) : null}
      <div className="gl-tenir-equipe__gestes">
        {gestes.map(([key, label, handler]) => (
          <GLButton
            key={key}
            type="button"
            disabled={
              !perms[key] ||
              tourApi.busy ||
              !!mainAilleurs ||
              (key === 'repondre' && !onRepondre && !questionDue)
            }
            aria-disabled={!perms[key]}
            data-geste={key}
            onClick={() => {
              if (key === 'lancer') setPending('lancer');
              else handler?.();
            }}
          >
            {label}
          </GLButton>
        ))}
      </div>
      {jetEnSuspens ? (
        <section
          className="gl-tenir-equipe__jet-suspens gl-gameplay-block"
          role="status"
          data-testid="gl-tenir-jet-suspens"
        >
          <p>
            <strong>Jet de l’équipe : {jetEnSuspens.total}</strong>
            {jetEnSuspens.faces?.length > 1 ? ` (${jetEnSuspens.faces.join(' + ')})` : ''} → case{' '}
            {numeroJet ?? '?'}
            {jetEnSuspens.label ? ` « ${jetEnSuspens.label} »` : ''}
          </p>
          {jetEnSuspens.question ? (
            <p>Une question attend sur cette case.</p>
          ) : jetEnSuspens.effectSummary ? (
            <p>Effet de la case : {jetEnSuspens.effectSummary}</p>
          ) : null}
          <p className="gl-hint">
            La case ne s’applique pas encore. Gardez ce jet, ou lancez Relance pour l’annuler : la
            mascotte revient et l’équipe rejette les dés.
          </p>
          <div className="gl-inline-actions">
            <GLButton
              type="button"
              disabled={tourApi.busy}
              onClick={() => tourApi.garderJet()}
              data-testid="gl-tenir-garder-jet"
            >
              Garder ce jet
            </GLButton>
            {onJeter ? (
              <GLButton
                type="button"
                variant="ghost"
                disabled={tourApi.busy}
                onClick={() => onJeter(jetEnSuspens.relanceSpellCode || null)}
                data-testid="gl-tenir-relance"
              >
                Relance…
              </GLButton>
            ) : null}
          </div>
        </section>
      ) : null}
      {sortsOuverts && onJeter ? (
        <GLSortsParMoment
          gameId={gameId}
          refreshKey={`${round?.number || 0}:${round?.phase || ''}:${events.length}`}
          disabled={!perms.jeter || tourApi.busy}
          onJeter={(code) => onJeter(code)}
        />
      ) : null}
      {casesAVenir.length ? (
        <p className="gl-tenir-equipe__cases" data-testid="gl-tenir-cases-a-venir">
          <strong>Les {casesAVenir.length} cases à venir :</strong>{' '}
          {casesAVenir
            .map((c) => `${numeroCase(c.index) ?? '?'}${c.label ? ` ${c.label}` : ''}`)
            .join(' · ')}
        </p>
      ) : null}
      {pending === 'lancer' && perms.lancer ? (
        <p className="gl-hint gl-role-conseil">{ROLES_EN_CONSEIL.lancer}</p>
      ) : null}
      {pending === 'lancer' && perms.lancer ? (
        <GLTourDesSaisie
          key={`des-${maVue?.desProchainJet || tenir.settings?.des_count || 2}`}
          count={maVue?.desProchainJet || tenir.settings?.des_count || 2}
          desMode={tenir.settings?.des_mode_effectif || 'serveur'}
          disabled={tourApi.busy}
          onLancer={async (body) => {
            await tourApi.lancer(body);
            setPending(null);
          }}
        />
      ) : null}
      {jetEnAttente ? (
        <p className="gl-hint" role="status">
          Jet saisi : en attente du clic du prof.
        </p>
      ) : null}
      {maVue?.unDe ? (
        <p className="gl-hint gl-tenir-equipe__un-de" role="status" data-testid="gl-tenir-un-de">
          {/* Le tour où le seul dé est dû, l'écran le dit au présent. */}
          {maVue.desProchainJet === 1
            ? 'Ce tour-ci : un seul dé.'
            : 'Au prochain tour : un seul dé.'}
        </p>
      ) : null}
      {chasse && fouilles ? (
        <p className="gl-hint" data-testid="gl-tenir-fouilles">
          Fouilles ce tour : {fouilles.restantes}/{fouilles.quota}
          {fouilles.sousVoile ? ' · sous le voile' : ''}
          {fouilleMode ? ' · touche le plateau pour fouiller' : ''}
          {fouilleMode ? ` · ${ROLES_EN_CONSEIL.fouiller}` : ''}
        </p>
      ) : null}
      {verdict ? (
        <p className="gl-tenir-equipe__verdict" role="status" data-verdict={verdict.verdict}>
          {verdict.feedback || VERDICT_TEXTES[verdict.verdict] || ''}
        </p>
      ) : null}
      {/* M22 : la réponse d'une question de zone se lit sur le site — un lien, pas la réponse. */}
      {verdict?.piste?.texte ? (
        <p className="gl-tenir-equipe__piste" data-testid="gl-tenir-piste-reponse">
          {verdict.piste.texte}{' '}
          {onOuvrirPiste ? (
            <GLButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOuvrirPiste(verdict.piste)}
            >
              {verdict.piste.type === 'fiche' ? 'Ouvrir la fiche' : 'Ouvrir le glossaire'}
            </GLButton>
          ) : null}
        </p>
      ) : null}
      {caseQuestion.question ? (
        <GLTenirQuestionCard
          question={caseQuestion.question}
          title="La question de la case"
          submitLabel="Valider"
          delaiSecondes={Number(tenir.settings?.delai_debat_secondes) || 0}
          disabled={caseQuestion.busy}
          onAnswer={(choiceId) => caseQuestion.repondre(choiceId)}
          onClose={caseQuestion.fermer}
        />
      ) : caseQuestion.feedback ? (
        <p className="gl-tenir-equipe__verdict" role="status" data-testid="gl-tenir-case-retour">
          {caseQuestion.feedback}
        </p>
      ) : null}
      {caseQuestion.error ? <p className="gl-error-banner">{caseQuestion.error}</p> : null}
      {chasse?.question ? (
        <GLTenirQuestionCard
          question={chasse.question.question}
          title="Une page dort ici"
          disabled={chasse.busy}
          onAnswer={(choiceId) => chasse.repondre(choiceId)}
          onClose={chasse.clearQuestion}
        />
      ) : null}
      <GLDefisCasePanel gameId={gameId} refreshKey={events.length} />
      <GLOluBulle line={olu.line} speakerName={olu.speakerName} frozen={olu.frozen} />
      {chasse && carnetOuvert ? (
        <>
          <p className="gl-hint gl-role-conseil">{ROLES_EN_CONSEIL.lire}</p>
          <GLCarnetClasseView chasse={chasse} />
          <GLBestiairePanel gameId={gameId} canPropose={!tablette} />
        </>
      ) : null}
      {tablette ? null : (
        <div className="gl-inline-actions">
          <GLButton
            type="button"
            variant="ghost"
            size="sm"
            className="gl-rewards__toggle"
            aria-expanded={badgesOuverts}
            onClick={() => setBadgesOuverts((v) => !v)}
          >
            {badgesOuverts ? 'Fermer mes badges' : 'Mes badges'}
          </GLButton>
        </div>
      )}
      {badgesOuverts && !tablette ? (
        <GLRewardsPanel modules={modules} title="Mes badges" headingLevel={3} />
      ) : null}
      <GLPeripetieOverlay
        peripetie={peripetie}
        teamName={team.name}
        onPasser={passerPeripetie}
        busy={tourApi.busy}
      />
      {tourApi.error ? <p className="gl-error-banner">{tourApi.error}</p> : null}
      {chasse?.error ? <p className="gl-error-banner">{chasse.error}</p> : null}
    </section>
  );
}
