import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useGlTenirEquipe } from '../../hooks/useGlTenirEquipe.js';
import { useGlTenirRetour } from '../../hooks/useGlTenirRetour.js';
import { useGlTenirTiroir } from '../../hooks/useGlTenirTiroir.js';
import { useGlTempsReelCoupe } from '../../hooks/useGlTempsReelCoupe.js';
import { GLTenirBandeau } from './GLTenirBandeau.jsx';
import { GLTenirMoment } from './GLTenirMoment.jsx';
import { GLTenirTiroir } from './GLTenirTiroir.jsx';
import { OLU_LIGNE_COMPTES } from '../../constants/tenirTextes.js';
import {
  aucunGesteDuTour,
  bandeauxDuMoment,
  empreinteDuTiroir,
  estSousVoile,
  momentDeLEquipe,
  tourEstJoue,
} from '../../utils/glTenirMoment.js';

/** La tablette a déjà dit « Le Marché et le Seuil… » dans cet onglet. */
const CLE_COMPTES_DITS = 'gl_olu_comptes_dits';

function comptesDejaDits() {
  try {
    return window.sessionStorage.getItem(CLE_COMPTES_DITS) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * Écran d'équipe en trois choses (« Tenir à deux », chantier « écrans de séance », étape 4) :
 * le **plateau** (grand, la scène du jeu), **une** carte du moment (ce que l'équipe a à faire
 * maintenant) et Olu. Un bandeau fin porte la mascotte, la phase, le sablier et les bourses ; un
 * tiroir « L'équipe », fermé par défaut, garde le reste.
 *
 * Même composant pour la tablette d'équipe (`GLTeamSessionView`) et pour le compte d'un élève
 * (`AppGL`, onglet du plateau). Le plateau est reçu tout fait (`board`, un `GLMapView` en
 * présentation `tenir`) : ce conteneur ne sait rien de la carte, il lui donne sa place.
 *
 * Aucune règle ici : les gestes montrés sont ceux de `tenir.permissions`, que le serveur rejoue.
 * L'écran **cache** un geste fermé, il n'en ouvre aucun. La surface « tableau » garde l'ancien
 * écran (`GLTenirEquipeView`) : garde-fou 12.
 */
export function GLTenirEcranEquipe({
  gameState,
  tenir,
  teamId,
  onReloadGame = null,
  /** `onJeter(code?)` ouvre l'assistant de sort ; `null` : l'écran ne propose aucun sort. */
  onJeter = null,
  /** Résultat de `useGlChasse` (fouille au clic, question, carnet) ; `null` hors chasse. */
  chasse = null,
  /** Modules G&L (`rewardsEnabled` conditionne « Mes badges ») ; `null` = tout allumé. */
  modules = null,
  /** Tablette d'équipe (lien de classe) : ni badges ni chimère à proposer ; « Changer d'équipe ». */
  tablette = false,
  onChangerEquipe = null,
  /** Ouvre la fiche ou le mot du glossaire d'une piste (M22) ; `null` sur la tablette d'équipe. */
  onOuvrirPiste = null,
  /** Le plateau, déjà monté (`<GLMapView presentation="tenir" … />`). */
  board = null,
  /** Jeton de la session : sert à savoir si le temps réel est coupé. */
  token = null,
}) {
  const phaseServie = tenir?.round?.phase || null;
  const tourOuvert = !!phaseServie && phaseServie !== 'clos';
  // Olu dit une fois, sur la tablette, où s'ouvrent le Marché et le Seuil — pas tant que le
  // Marché est fermé pour la partie (escalier du chapitre 1, ou réglage du prof).
  const [comptesDits, setComptesDits] = useState(comptesDejaDits);
  const noterComptesDits = useCallback(() => {
    setComptesDits(true);
    try {
      window.sessionStorage.setItem(CLE_COMPTES_DITS, '1');
    } catch (_) {
      /* stockage indisponible : la ligne se redira à la prochaine ouverture de l'écran */
    }
  }, []);
  const ligneDeLEcran =
    tablette && tourOuvert && tenir?.settings?.marche !== false && !comptesDits
      ? OLU_LIGNE_COMPTES
      : null;

  const equipe = useGlTenirEquipe({
    gameState,
    tenir,
    teamId,
    onReloadGame,
    chasse,
    sortsDisponibles: !!onJeter,
    ligneDeLEcran,
    onLigneDeLEcranDite: noterComptesDits,
  });
  const {
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
    maintenant,
    encordeePar,
    presence,
    jetEnSuspens,
    jetEnAttente,
  } = equipe;

  const [pending, setPending] = useState(null);
  const [sortsOuverts, setSortsOuverts] = useState(false);
  const tiroirId = useId();
  const tourCle = `${round?.number || 0}:${round?.phase || ''}`;
  const { retour, acquitter } = useGlTenirRetour({
    verdict: chasse?.dernierVerdict,
    caseFeedback: caseQuestion.feedback,
    tourCle,
  });
  // Tant que le carnet charge, le contenu du tiroir n'est pas connu : rien n'y est « nouveau ».
  const tiroir = useGlTenirTiroir({
    empreinte:
      chasse && !chasse.carnet
        ? null
        : empreinteDuTiroir({ carnet: chasse?.carnet, reserve, absents: presence?.absents }),
  });

  // Le tour ou la phase a changé : ce qui était ouvert n'a plus cours. La saisie des dés et la
  // liste des sorts se referment ; une question périmée s'oublie (le serveur a fermé
  // « répondre » et repris la main : on ne lui demande rien).
  const oublierCase = caseQuestion.oublier;
  const oublierChasse = chasse?.oublierQuestion || null;
  const tourCleVue = useRef(tourCle);
  useEffect(() => {
    if (tourCleVue.current === tourCle) return;
    tourCleVue.current = tourCle;
    setPending(null);
    setSortsOuverts(false);
    oublierCase?.();
    oublierChasse?.();
  }, [tourCle, oublierCase, oublierChasse]);

  // « Relire l'écran » : ce que faisait « Actualiser ». L'icône ne se montre que si le temps
  // réel est coupé ou si l'état est périmé ; au retour de la connexion, l'écran se relit seul.
  const rafraichirTour = tourApi.refresh;
  const rafraichirCarnet = chasse?.refresh || null;
  const relire = useCallback(() => {
    rafraichirTour();
    rafraichirCarnet?.();
    onReloadGame?.();
  }, [rafraichirTour, rafraichirCarnet, onReloadGame]);
  const tempsReelCoupe = useGlTempsReelCoupe(token, { onRetour: relire });

  if (!pret) return null;

  const fouilleMode = !!chasse?.fouilleMode;
  const aLance = !!maVue?.hasRolledDiceThisRound;
  const cleDeRelecture = `${tourCle}:${events.length}`;
  const moment = momentDeLEquipe({
    peripetie,
    mainAilleurs,
    appareils: tenir.equipe?.appareils,
    questionCase: !!caseQuestion.question,
    questionChasse: !!chasse?.question,
    jetEnSuspens,
    saisieDes: pending === 'lancer',
    jetEnAttente,
    retour,
    maintenant,
    fouilleMode,
    fouillesRestantes: fouilles ? fouilles.restantes : null,
    des,
    sortsOuverts,
    phase: round?.phase || null,
    partieFinie: gameState?.game?.status === 'ended',
    spectateur: tenir.spectateur === true,
    surface: tenir.surface,
    tourJoue: tourEstJoue({ aLance, auCamp: !!maVue?.auCamp, fouilles }),
    presenceOuverte: !!presence,
    aucunGeste: aucunGesteDuTour({ aLance, fouilles }),
  });
  const lignes = bandeauxDuMoment({
    etatPerime,
    encordeePar,
    unDe: !!maVue?.unDe,
    desProchainJet: maVue?.desProchainJet,
    enRetrait: !!tenir.enRetrait,
    sousVoile: estSousVoile({
      fouilles,
      pathIndex: maVue?.pathIndex,
      voilePosition: tenir.state?.voilePosition,
    }),
  });
  const onGeste = (geste) => {
    // Le geste suivant acquitte le retour resté à l'écran.
    acquitter();
    if (geste === 'lancer') setPending('lancer');
    else if (geste === 'repondre') {
      if (questionDue) caseQuestion.presenter(questionDue.markerId);
    } else if (geste === 'fouiller') chasse?.setFouilleMode(true);
    else if (geste === 'lire') tiroir.ouvrir('carnet');
    else if (geste === 'jeter') setSortsOuverts((v) => !v);
  };
  // La présence se dit dans la carte du moment tant que l'équipe n'a rien joué ; ensuite, dans
  // le tiroir. Jamais aux deux endroits à la fois.
  const presenceAuTiroir = moment.presence ? null : presence;

  return (
    <section
      className={`gl-tenir-ecran${tablette ? ' gl-tenir-ecran--tablette' : ''}${
        moment.fouille ? ' is-fouille' : ''
      }`}
      aria-label={`Équipe ${team.name}`}
      data-testid="gl-tenir-equipe"
      data-surface={tenir.surface || undefined}
    >
      <GLTenirBandeau
        team={team}
        round={round}
        sablier={sablier}
        membres={mates}
        tiroirOuvert={tiroir.ouvert}
        tiroirId={tiroirId}
        nouveaute={tiroir.nouveau}
        onTiroir={tiroir.basculer}
        reconnexion={tempsReelCoupe || !!etatPerime}
        onReconnecter={relire}
        occupe={tourApi.busy}
      />
      <div className="gl-tenir-ecran__corps">
        <div
          className={`gl-tenir-ecran__plateau${moment.fouille ? ' is-fouille' : ''}`}
          data-testid="gl-tenir-plateau"
        >
          {board}
        </div>
        <div className="gl-tenir-ecran__action" data-testid="gl-tenir-action">
          <GLTenirMoment
            moment={moment}
            lignes={lignes}
            gameId={gameId}
            teamName={team.name}
            settings={settings}
            equipe={tenir.equipe || null}
            caseQuestion={caseQuestion}
            chasse={chasse}
            jetEnSuspens={jetEnSuspens}
            des={des}
            peripetie={peripetie}
            retour={retour}
            presence={presence}
            membres={mates}
            olu={olu}
            cleDeRelecture={cleDeRelecture}
            occupe={tourApi.busy}
            erreurs={[tourApi.error, caseQuestion.error, chasse?.error]}
            onGeste={onGeste}
            onArreterFouille={() => chasse?.setFouilleMode(false)}
            onContinuer={acquitter}
            onOuvrirPiste={onOuvrirPiste}
            onGarderJet={() => tourApi.garderJet()}
            onRelance={onJeter ? (code) => onJeter(code) : null}
            onLancer={async (body) => {
              await tourApi.lancer(body);
              setPending(null);
            }}
            onQuitterSaisie={() => setPending(null)}
            onPasserPeripetie={passerPeripetie}
            onPresences={(absents) => tourApi.presences(absents)}
            onArrivee={(playerId) => tourApi.arrivee(playerId)}
            onJeterSort={onJeter ? (code) => onJeter(code) : null}
            onRecharger={onReloadGame}
          />
        </div>
        <GLTenirTiroir
          ouvert={tiroir.ouvert}
          section={tiroir.section}
          id={tiroirId}
          onFermer={tiroir.fermer}
          gameId={gameId}
          casesAVenir={casesAVenir}
          reserve={reserve}
          chasse={chasse}
          peutLire={!!perms.lire}
          tablette={tablette}
          onChangerEquipe={onChangerEquipe}
          modules={modules}
          presence={presenceAuTiroir}
          membres={mates}
          spectateur={tenir.spectateur === true}
          occupe={tourApi.busy}
          onPresences={(absents) => tourApi.presences(absents)}
          onArrivee={(playerId) => tourApi.arrivee(playerId)}
          cleDeRelecture={cleDeRelecture}
        />
      </div>
    </section>
  );
}
