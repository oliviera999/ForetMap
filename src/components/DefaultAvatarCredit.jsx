/**
 * Attribution des avatars par défaut (exigée par la licence CC BY 4.0 de l'œuvre).
 *
 * Les avatars des comptes sans photo sont dessinés par le serveur de l'application
 * (`lib/defaultAvatar.js`) avec la bibliothèque DiceBear (MIT), d'après le style
 * « Adventurer Neutral » de Lisa Wischofsky, adapté par DiceBear, sous licence CC BY 4.0.
 * Les liens ne s'ouvrent que sur un clic : rien n'est chargé chez ces sites pour afficher
 * la mention.
 */
export const DEFAULT_AVATAR_CREDIT = Object.freeze({
  styleName: 'Adventurer Neutral',
  styleUrl: 'https://www.figma.com/community/file/1184595184137881796',
  author: 'Lisa Wischofsky',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.fr',
  libraryName: 'DiceBear',
  libraryUrl: 'https://www.dicebear.com',
  libraryLicense: 'MIT',
});

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * @param {{ compact?: boolean, className?: string }} props `compact` : une ligne, pour
 *   « Mon profil » ; sinon la mention complète, pour « À propos ».
 */
export function DefaultAvatarCredit({ compact = false, className = '' }) {
  const c = DEFAULT_AVATAR_CREDIT;
  const style = <ExternalLink href={c.styleUrl}>« {c.styleName} »</ExternalLink>;
  const license = <ExternalLink href={c.licenseUrl}>{c.licenseName}</ExternalLink>;
  const library = <ExternalLink href={c.libraryUrl}>{c.libraryName}</ExternalLink>;
  if (compact) {
    return (
      <span className={className} data-testid="default-avatar-credit">
        Dessin : {style} de {c.author} ({license}), via {library}.
      </span>
    );
  }
  return (
    <p className={className} data-testid="default-avatar-credit">
      Avatars par défaut : dessinés par l&apos;application avec la bibliothèque {library} (licence{' '}
      {c.libraryLicense}), d&apos;après {style} de {c.author}, adapté par {c.libraryName}, sous
      licence {license}. Aucun service extérieur n&apos;est contacté pour les afficher.
    </p>
  );
}
