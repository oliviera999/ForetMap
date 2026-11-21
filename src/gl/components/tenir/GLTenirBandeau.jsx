import { GLButton } from '../ui/GLButton.jsx';
import { GLMascotAvatar } from '../GLMascotAvatar.jsx';
import { GLSablier } from './GLSablier.jsx';
import { PHASE_AUCUN_TOUR, titreDuTour } from '../../constants/tenirPhases.js';
import { boursesDeLEquipe } from '../../utils/glTenirMoment.js';

/**
 * Bandeau de l'écran d'équipe (« Tenir à deux », écrans de séance) : une seule ligne, toujours
 * visible — la mascotte et le nom de l'équipe, la phase en mots d'élève, le sablier s'il
 * tourne, les bourses de chacun, et le bouton du tiroir « L'équipe ».
 *
 * Il remplace l'en-tête de session et l'en-tête d'équipe : plus de mot de surface, plus de
 * bouton « Actualiser ». L'icône de reconnexion n'apparaît que si `reconnexion` est vrai
 * (temps réel coupé, ou état périmé) ; son clic relit l'écran.
 *
 * Les bourses restent visibles sur la tablette d'équipe (décision du 20/11/2026) : une pastille
 * par membre. Le serveur tait les soldes qu'il ne veut pas montrer (`powerPoints` absent) : la
 * pastille ne porte alors que le pseudo.
 */
export function GLTenirBandeau({
  team,
  round = null,
  sablier = null,
  /** Membres de l'équipe : le roster de la partie, déjà filtré sur elle. */
  membres = [],
  tiroirOuvert = false,
  tiroirId = undefined,
  nouveaute = false,
  onTiroir = null,
  reconnexion = false,
  onReconnecter = null,
  occupe = false,
}) {
  if (!team) return null;
  const bourses = boursesDeLEquipe(membres);
  return (
    <header className="gl-tenir-bandeau" data-testid="gl-tenir-bandeau">
      <div className="gl-tenir-bandeau__equipe">
        <GLMascotAvatar
          mascotId={team.mascot_id}
          size={40}
          fallbackType={team.type}
          fallbackPrimaryColor={team.color || undefined}
          fallbackLabel={team.name}
        />
        <h2 className="gl-tenir-bandeau__nom">{team.name}</h2>
      </div>
      {/* Phase, sablier et bourses : sur une ligne si la place y est, sinon les bourses passent
          dessous (la feuille de style décide, sans rien cacher). */}
      <div className="gl-tenir-bandeau__milieu">
        <p className="gl-tenir-bandeau__phase" data-testid="gl-tenir-phase">
          {titreDuTour(round) || PHASE_AUCUN_TOUR}
        </p>
        {/* Sablier du tour : même état que la console du prof ; l'équipe le voit sans le régler. */}
        {sablier?.phase && round?.phase === 'jeu' ? (
          <GLSablier
            mode="phase"
            secondes={sablier.phase.secondes}
            restantSecondes={sablier.phase.restantSecondes}
            enPause={sablier.phase.enPause}
            doneHint="le sablier a sonné : finissez votre geste"
            className="gl-tenir-bandeau__sablier"
            testId="gl-sablier-phase"
          />
        ) : null}
        {bourses.length ? (
          <ul
            className="gl-tenir-bandeau__bourses"
            aria-label="Bourses de l’équipe"
            data-testid="gl-tenir-bourses"
          >
            {bourses.map((b) => (
              <li key={b.id} className="gl-tenir-bourse" title={b.complet}>
                <span className="gl-tenir-bourse__nom">{b.nom}</span>
                {b.gemmes != null ? (
                  <span className="gl-tenir-bourse__gemmes">💎 {b.gemmes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="gl-tenir-bandeau__actions">
        {reconnexion && onReconnecter ? (
          <GLButton
            type="button"
            variant="ghost"
            className="gl-tenir-bandeau__reconnexion"
            aria-label="Relire l’écran"
            title="Relire l’écran"
            disabled={occupe}
            onClick={onReconnecter}
            data-testid="gl-tenir-reconnexion"
          >
            <span aria-hidden="true">⟳</span>
          </GLButton>
        ) : null}
        {onTiroir ? (
          <GLButton
            type="button"
            variant="secondary"
            className="gl-tenir-bandeau__tiroir"
            aria-expanded={tiroirOuvert}
            aria-controls={tiroirId}
            onClick={onTiroir}
            data-testid="gl-tenir-tiroir-bouton"
          >
            <span aria-hidden="true">☰</span> L’équipe
            {nouveaute ? (
              <span className="gl-tenir-bandeau__nouveau" data-testid="gl-tenir-tiroir-nouveau">
                <span className="gl-visually-hidden"> (du nouveau)</span>
              </span>
            ) : null}
          </GLButton>
        ) : null}
      </div>
    </header>
  );
}
