import { MascotSpeaker } from '../components/MascotSpeaker.jsx';
import { SpeechBubble } from '../components/SpeechBubble.jsx';

/**
 * OLU parle dans la fresque : portrait + bulle, comme la visite guidée
 * (`docs/MASCOT_NARRATEUR_OLU.md` §4.5). Il n'apparaît que lorsqu'on demande de l'aide ou qu'il
 * y a quelque chose à raconter (tutoriel, point d'étape, fin) — jamais en compagnon permanent,
 * jamais sur une carte (licence : la bulle vit dans un panneau ou un dialogue, hors de la table).
 *
 * `narrator` vient des réglages publics (`content.help.narrator`), passé par le produit : un
 * module de `src/shared/` ne lit pas les contextes. Narrateur coupé (`enabled: false`) : la bulle
 * reste, sans portrait ni nom.
 */
export function FresqueOlu({
  narrator = null,
  expression = 'parle',
  text,
  compact = false,
  typewriter = true,
  className = '',
  testId,
}) {
  if (!text) return null;
  const speakerName = narrator && narrator.enabled !== false ? narrator.speakerName || '' : '';
  return (
    <div
      className={`fm-fresque-olu${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      <MascotSpeaker
        className="fm-fresque-olu__portrait"
        narrator={narrator}
        expression={expression}
        size={compact ? 'face' : 'bust'}
      />
      <SpeechBubble
        className="fm-fresque-olu__bubble"
        speakerName={speakerName}
        text={text}
        typewriter={typewriter}
      />
    </div>
  );
}
