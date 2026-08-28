import { DialogShell } from '../../components/DialogShell.jsx';
import { MascotSpeaker } from '../../shared/components/MascotSpeaker.jsx';
import { SpeechBubble } from '../../shared/components/SpeechBubble.jsx';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';
import { GLButton } from './ui/GLButton.jsx';
import { useGlNarrator } from '../hooks/useGlNarrator.js';

/**
 * Aperçu d'un feuillet du carnet de voyage, **présenté par le narrateur OLU**
 * (`docs/MASCOT_NARRATEUR_OLU.md` §4.5, registre « visual novel léger » : portrait
 * latéral, cadre, effet machine à écrire).
 *
 * ⚠️ **Sans étiquette de locuteur, et c'est délibéré.** Le texte affiché ici est celui du
 * feuillet — du contenu écrit par le MJ, la voix du carnet de Sélène. Le signer « OLU »
 * lui attribuerait des mots qui ne sont pas les siens et violerait la règle d'écriture du
 * §11.7 : **OLU parle du jeu, jamais dans le jeu.** Il montre le feuillet, il ne le récite
 * pas. L'étiquette reste donc réservée aux surfaces où il parle en son nom (l'aide).
 *
 * Le portrait est décoratif (`aria-hidden`) et son absence est un mode de fonctionnement
 * normal, pas une panne : sans portrait téléversé, la silhouette SVG prend le relais sans
 * un octet de réseau.
 */
/** Sous cette largeur, le portrait devient un médaillon : le texte garde la place (§9.3). */
const COMPACT_QUERY = '(max-width: 480px)';

export function GLFeuilletPopover({
  open = false,
  titre = '',
  popover = '',
  coutGemme = 0,
  gainCoeur = 0,
  loading = false,
  error = '',
  onClose,
  themeStyle = null,
}) {
  const { narrator } = useGlNarrator();
  const compact = useMediaQuery(COMPACT_QUERY);
  const gemCost = Number(coutGemme) || 0;
  const heartGain = Number(gainCoeur) || 0;
  const showMechanics = gemCost > 0 || heartGain > 0;
  // Le narrateur est un enrichissement : seul un `enabled: false` explicite l'éteint.
  // Réglage pas encore chargé ⇒ portrait rendu quand même (repli SVG, gratuit — §4.1).
  const showPortrait = !narrator || narrator.enabled !== false;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="gl-feui-discovery-overlay"
      dialogClassName="gl-feui-discovery gl-feui-boite gl-feuillet-popover fade-in"
      dialogStyle={themeStyle || undefined}
      ariaLabel={titre ? `Feuillet : ${titre}` : 'Feuillet'}
      showCloseButton
      closeButtonClassName="gl-feui-discovery__close"
      closeButtonLabel="Fermer"
    >
      <header className="gl-feui-discovery__head">
        <p className="gl-feui-discovery__eyebrow">Carnet de voyage</p>
        <h3>{titre || 'Feuillet'}</h3>
      </header>

      {error ? <p className="gl-error">{error}</p> : null}
      {loading ? <p className="gl-hint">Ouverture du feuillet…</p> : null}

      {!loading && popover ? (
        <div
          className={`gl-feui-discovery__body gl-feuillet-popover__body gl-narrator-scene ${
            compact ? 'is-compact' : ''
          }`}
        >
          {showPortrait ? (
            <MascotSpeaker
              className="gl-narrator-scene__portrait"
              narrator={narrator}
              expression="parle"
              size={compact ? 'face' : 'bust'}
            />
          ) : null}
          <SpeechBubble className="gl-narrator-scene__bubble" text={popover} />
        </div>
      ) : null}

      {showMechanics ? (
        <div className="gl-feuillet-popover__mechanics" aria-label="Effets de jeu">
          {gemCost > 0 ? (
            <span className="gl-feuillet-popover__mech-item">
              <span aria-hidden="true">💎</span>
              {` Coût : ${gemCost} gemme${gemCost > 1 ? 's' : ''}`}
            </span>
          ) : null}
          {heartGain > 0 ? (
            <span className="gl-feuillet-popover__mech-item">
              <span aria-hidden="true">❤️</span>
              {` Gain : ${heartGain} cœur${heartGain > 1 ? 's' : ''}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="gl-feui-discovery__foot">
        <GLButton type="button" onClick={() => onClose?.()}>
          Fermer
        </GLButton>
      </footer>
    </DialogShell>
  );
}
