import { useState } from 'react';
import { useGlTenirEquipe } from '../../hooks/useGlTenirEquipe.js';
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
import { ROLES_EN_CONSEIL } from '../../../shared/glSortMomentsCore.js';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';
import { PHASE_AUCUN_TOUR, titreDuTour } from '../../constants/tenirPhases.js';
import { TENIR_VERDICT_TEXTES as VERDICT_TEXTES } from '../../constants/tenirTextes.js';

/**
 * Écran d'équipe **empilé**, celui d'avant le chantier « écrans de séance » : les cinq gestes en
 * boutons, grisés par `tenir.permissions` (le serveur rejoue le calcul ; le client ne fait que
 * griser). Depuis le 20/11/2026 il ne sert plus que la surface **« tableau »** (garde-fou 12 :
 * au tableau, rien ne change sans décision) ; les surfaces hybride et tablette montrent l'écran
 * en trois choses, `GLTenirEcranEquipe`. Les deux lisent le même hook, `useGlTenirEquipe`.
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
  const {
    pret,
    gameId,
    tourApi,
    caseQuestion,
    olu,
    perms,
    events,
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
    sortsOuvertsParLEscalier,
    maintenant,
    encordeePar,
    presence,
    jetEnSuspens,
    jetEnAttente,
  } = useGlTenirEquipe({
    gameState,
    tenir,
    teamId,
    onReloadGame,
    chasse,
    sortsDisponibles: !!onJeter,
  });
  const [pending, setPending] = useState(null);
  const [carnetOuvert, setCarnetOuvert] = useState(false);
  // Lot 2 : « Jeter un sort » déplie les sorts rangés par moment du tour.
  const [sortsOuverts, setSortsOuverts] = useState(false);
  const [badgesOuverts, setBadgesOuverts] = useState(false);
  if (!pret) return null;

  const surface = tenir.surface || 'tableau';
  const fouilleMode = !!chasse?.fouilleMode;
  const lectureEnVeillee =
    !perms.lire &&
    tenir.settings?.lecture_pendant_tour === false &&
    !!round?.phase &&
    round.phase !== 'clos';
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
  const verdict = chasse?.dernierVerdict || null;
  const numeroJet = jetEnSuspens ? numeroCase(jetEnSuspens.index) : null;

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
          {round ? titreDuTour(round) : PHASE_AUCUN_TOUR}
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
      {/* Au camp : trois lignes pour le chapitre suivant (le peuple, les sorts, le plateau). */}
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
          key={`des-${des}`}
          count={des}
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
          {fouilleMode ? ' · touchez le plateau pour fouiller' : ''}
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
