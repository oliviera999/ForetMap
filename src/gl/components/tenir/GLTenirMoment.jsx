import { EmptyState } from '../../../shared/components/EmptyState.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourDesSaisie } from '../mj/GLTourDesSaisie.jsx';
import { GLDefisEntree } from '../defis/GLDefisEntree.jsx';
import { GLTenirQuestionCard } from './GLTenirQuestionCard.jsx';
import { GLOluBulle } from './GLOluBulle.jsx';
import { messagePourEquipe } from '../../constants/glPanneReseau.js';
import { GLPeripetieOverlay } from './GLPeripetieOverlay.jsx';
import { GLPresencePanel } from './GLPresencePanel.jsx';
import { GLSortsParMoment } from './GLSortsParMoment.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLCeQuiChange } from './GLCeQuiChange.jsx';
import { GLEquipeAppareils } from './GLEquipeAppareils.jsx';
import { ROLES_EN_CONSEIL } from '../../../shared/glSortMomentsCore.js';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';

/** Pictogramme (décoratif) des états où il n'y a rien à toucher. */
const PICTOS = Object.freeze({
  jet_attente: '🎲',
  joue: '👀',
  souffle: '🌫️',
  camp: '⛺',
  clos: '🌙',
  attente: '⏳',
});

/**
 * La carte du moment de l'écran d'équipe (« Tenir à deux », écrans de séance) : **une seule**
 * chose à la fois, celle que `momentDeLEquipe` a choisie (`src/gl/utils/glTenirMoment.js`).
 * Au-dessus, les bandeaux d'une ligne qui sont vrais ; en dessous, la bulle d'Olu, toujours.
 *
 * Les blocs sont ceux de l'ancien écran, déplacés : question, jet en suspens, saisie des dés,
 * retour d'une fouille, demande d'appareil… Le composant n'appelle aucune route lui-même et ne
 * décide d'aucun droit : il affiche le moment reçu et remonte les gestes (`onGeste`).
 *
 * Contrats de test gardés : `gl-tenir-maintenant` sur la carte en état `geste`, `data-geste` sur
 * le gros bouton et sur chaque puce, et les `data-testid` des blocs déplacés.
 */
export function GLTenirMoment({
  /** Résultat de `momentDeLEquipe`. */
  moment,
  /** Résultat de `bandeauxDuMoment`. */
  lignes = [],
  gameId,
  teamName = '',
  /** Réglages de la partie (`tenir.settings`) : délai de débat, dés. */
  settings = null,
  /** Bloc `tenir.equipe` : les appareils qui demandent à rejoindre l'équipe. */
  equipe = null,
  /** Résultat de `useGlQuestionDeCase`. */
  caseQuestion = null,
  /** Résultat de `useGlChasse`. */
  chasse = null,
  jetEnSuspens = null,
  /** Dés du prochain jet (1 après une case Souffle). */
  des = 2,
  peripetie = null,
  /** Retour non acquitté (`useGlTenirRetour`). */
  retour = null,
  /** Présences de l'équipe pour ce tour (`{ absents }`), ou `null`. */
  presence = null,
  membres = [],
  /** `{ line, speakerName, frozen }` de `useGlTenirOlu`. */
  olu = null,
  /** Change à chaque évènement du tour : les panneaux qui lisent le serveur se relisent. */
  cleDeRelecture = '',
  occupe = false,
  erreurs = [],
  onGeste = null,
  onArreterFouille = null,
  onContinuer = null,
  /** Ouvre la fiche ou le mot du glossaire d'une piste (M22) ; `null` sur la tablette d'équipe. */
  onOuvrirPiste = null,
  onGarderJet = null,
  /** `onRelance(code)` : ouvre l'assistant de sort sur Relance ; `null` si les sorts sont fermés. */
  onRelance = null,
  onLancer = null,
  onQuitterSaisie = null,
  onPasserPeripetie = null,
  onPresences = null,
  onArrivee = null,
  /** `onJeterSort(code)` : un sort choisi dans la liste dépliée. */
  onJeterSort = null,
  onRecharger = null,
}) {
  if (!moment) return null;
  const { etat } = moment;
  const numeroJet = jetEnSuspens ? numeroCase(jetEnSuspens.index) : null;

  /** Une puce : un autre geste ouvert, ou l'entrée des défis de la Trame. */
  const puce = (p) =>
    p.geste === 'trame' ? (
      <li key={p.geste}>
        <GLDefisEntree gameId={gameId} label={p.libelle} boutonProps={{ 'data-geste': 'trame' }} />
      </li>
    ) : (
      <li key={p.geste}>
        <GLButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={occupe}
          title={p.role || undefined}
          data-geste={p.geste}
          onClick={() => onGeste?.(p.geste)}
        >
          {p.court}
        </GLButton>
      </li>
    );
  const puces = moment.puces.length ? (
    <ul className="gl-tenir-moment__puces" data-testid="gl-tenir-puces">
      {moment.puces.map(puce)}
    </ul>
  ) : null;

  /** États sans rien à toucher : un mot, et ce qui reste ouvert hors du tour. */
  const repos = (suite = null) => (
    <>
      <EmptyState
        compact
        icon={PICTOS[etat] || null}
        title={moment.spectateur ? null : moment.texte}
        role="status"
        testId={moment.spectateur ? 'gl-tenir-spectateur' : `gl-tenir-moment-${etat}`}
      >
        {moment.spectateur ? moment.texte : null}
      </EmptyState>
      {suite}
      {puces}
    </>
  );

  let corps = null;
  switch (etat) {
    case 'peripetie':
      break;
    case 'main_ailleurs':
      // Un autre appareil de l'équipe tient la main : l'écran dit qui joue, rien d'autre.
      corps = (
        <p className="gl-tenir-main" role="status" data-testid="gl-tenir-main">
          {moment.texte}
        </p>
      );
      break;
    case 'appareil':
      corps = (
        <GLEquipeAppareils
          gameId={gameId}
          equipe={equipe ? { ...equipe, main: null } : null}
          onChanged={onRecharger}
        />
      );
      break;
    case 'question':
      corps =
        moment.origine === 'case' ? (
          <GLTenirQuestionCard
            question={caseQuestion?.question}
            title="La question de la case"
            submitLabel="Valider"
            delaiSecondes={Number(settings?.delai_debat_secondes) || 0}
            disabled={!!caseQuestion?.busy}
            onAnswer={(choiceId) => caseQuestion?.repondre(choiceId)}
            onClose={caseQuestion?.fermer}
          />
        ) : (
          <GLTenirQuestionCard
            question={chasse?.question?.question}
            title="Une page dort ici"
            disabled={!!chasse?.busy}
            onAnswer={(choiceId) => chasse?.repondre(choiceId)}
            onClose={chasse?.clearQuestion}
          />
        );
      break;
    case 'jet_suspens':
      corps = jetEnSuspens ? (
        <section
          className="gl-tenir-equipe__jet-suspens"
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
              disabled={occupe}
              onClick={() => onGarderJet?.()}
              data-testid="gl-tenir-garder-jet"
            >
              Garder ce jet
            </GLButton>
            {onRelance ? (
              <GLButton
                type="button"
                variant="ghost"
                disabled={occupe}
                onClick={() => onRelance(jetEnSuspens.relanceSpellCode || null)}
                data-testid="gl-tenir-relance"
              >
                Relance…
              </GLButton>
            ) : null}
          </div>
        </section>
      ) : null;
      break;
    case 'saisie_des':
      corps = (
        <>
          <p className="gl-tenir-moment__role">{moment.role || 'Toute l’équipe'}</p>
          <p className="gl-hint gl-role-conseil">{ROLES_EN_CONSEIL.lancer}</p>
          <GLTourDesSaisie
            key={`des-${des}`}
            count={des}
            desMode={settings?.des_mode_effectif || 'serveur'}
            disabled={occupe}
            onLancer={(body) => onLancer?.(body)}
          />
          {onQuitterSaisie ? (
            <GLButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={occupe}
              onClick={onQuitterSaisie}
              data-testid="gl-tenir-quitter-saisie"
            >
              Pas maintenant
            </GLButton>
          ) : null}
        </>
      );
      break;
    case 'retour':
      corps = retour ? (
        <div className="gl-tenir-moment__retour" data-testid="gl-tenir-retour">
          <p
            className="gl-tenir-equipe__verdict"
            role="status"
            data-verdict={retour.verdict || undefined}
            data-testid={retour.origine === 'case' ? 'gl-tenir-case-retour' : undefined}
          >
            {retour.texte}
          </p>
          {/* M22 : la réponse d'une question de zone se lit sur le site — un lien, pas la réponse. */}
          {retour.piste?.texte ? (
            <p className="gl-tenir-equipe__piste" data-testid="gl-tenir-piste-reponse">
              {retour.piste.texte}{' '}
              {onOuvrirPiste ? (
                <GLButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOuvrirPiste(retour.piste)}
                >
                  {retour.piste.type === 'fiche' ? 'Ouvrir la fiche' : 'Ouvrir le glossaire'}
                </GLButton>
              ) : null}
            </p>
          ) : null}
          <GLButton type="button" onClick={() => onContinuer?.()} data-testid="gl-tenir-continuer">
            Continuer
          </GLButton>
        </div>
      ) : null;
      break;
    case 'geste':
      corps = (
        <>
          <p className="gl-tenir-moment__role">{moment.role || 'Toute l’équipe'}</p>
          {moment.fouille ? (
            <>
              <p className="gl-tenir-moment__fouille" role="status" data-testid="gl-tenir-fouilles">
                Touchez la carte{moment.detail ? ` · ${moment.detail}` : ''}
              </p>
              <GLButton
                type="button"
                variant="ghost"
                disabled={occupe}
                data-geste="fouiller"
                onClick={() => onArreterFouille?.()}
              >
                Arrêter de fouiller
              </GLButton>
            </>
          ) : (
            <GLButton
              type="button"
              className="gl-tenir-moment__gros"
              disabled={occupe}
              data-geste={moment.geste}
              onClick={() => onGeste?.(moment.geste)}
            >
              <span className="gl-tenir-moment__gros-libelle">{moment.libelle}</span>
              {moment.detail ? (
                <span className="gl-tenir-moment__gros-detail">{moment.detail}</span>
              ) : null}
            </GLButton>
          )}
          {puces}
          {moment.sorts && onJeterSort ? (
            <GLSortsParMoment
              gameId={gameId}
              refreshKey={cleDeRelecture}
              disabled={occupe}
              onJeter={(code) => onJeterSort(code)}
            />
          ) : null}
          {/* Tant que l'équipe n'a rien joué ce tour : « Il manque quelqu'un ? » est ici. */}
          {moment.presence ? (
            <GLPresencePanel
              presence={presence}
              mates={membres}
              busy={occupe}
              onConfirmer={(absents) => onPresences?.(absents)}
              onArrivee={(playerId) => onArrivee?.(playerId)}
            />
          ) : null}
        </>
      );
      break;
    case 'clos':
      // Tour terminé : le défi à préparer, et les défis de la Trame en puce.
      corps = repos(<GLDefisCasePanel gameId={gameId} refreshKey={cleDeRelecture} />);
      break;
    case 'camp':
      // Au camp : trois lignes pour le chapitre suivant (le peuple, les sorts, le plateau).
      corps = repos(<GLCeQuiChange gameId={gameId} />);
      break;
    default:
      corps = repos();
  }

  return (
    <section
      className={`gl-tenir-moment gl-tenir-moment--${etat}${moment.fouille ? ' is-fouille' : ''}`}
      aria-label="Maintenant"
      data-testid="gl-tenir-moment"
      data-etat={etat}
    >
      {lignes.length ? (
        <ul className="gl-tenir-moment__lignes" data-testid="gl-tenir-lignes">
          {lignes.map((l) => (
            <li key={l.cle} role="status" data-testid={l.testId}>
              {l.fort ? <strong>{l.fort}</strong> : null}
              {l.fort ? ' ' : ''}
              {l.texte}
            </li>
          ))}
        </ul>
      ) : null}
      {corps ? (
        <div
          className="gl-tenir-moment__carte"
          data-testid={etat === 'geste' ? 'gl-tenir-maintenant' : 'gl-tenir-moment-carte'}
        >
          {corps}
        </div>
      ) : null}
      {/* Une panne réseau touche tous les gestes à la fois : la phrase se dit une fois, et au
          « vous » même quand l'écran est ouvert depuis le compte d'un élève. */}
      {[...new Set(erreurs.filter(Boolean).map(messagePourEquipe))].map((e) => (
        <p key={e} className="gl-error-banner">
          {e}
        </p>
      ))}
      <GLOluBulle line={olu?.line} speakerName={olu?.speakerName} frozen={!!olu?.frozen} />
      {etat === 'peripetie' ? (
        <GLPeripetieOverlay
          peripetie={peripetie}
          teamName={teamName}
          onPasser={onPasserPeripetie}
          busy={occupe}
        />
      ) : null}
    </section>
  );
}
