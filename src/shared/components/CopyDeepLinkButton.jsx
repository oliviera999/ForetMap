import { useEffect, useState } from 'react';
import { IconCheck, IconLink } from '../icons.jsx';
import { copyTextToClipboard } from '../platform/clipboardText.js';

const COPIED_MS = 2000;

/**
 * Icône discrète : copie une URL (lien direct ForetMap) dans le presse-papiers.
 * Feedback « Lien copié » puis retour à l'icône. Le calcul d'URL reste hors de
 * `src/shared` (deep links produit) : passer `url` déjà résolue.
 */
export function CopyDeepLinkButton({
  url = '',
  label = 'Copier le lien',
  className = '',
  size = 15,
}) {
  const [copied, setCopied] = useState(false);
  const href = String(url || '').trim();

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!href) return null;

  async function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const ok = await copyTextToClipboard(href);
    if (ok) setCopied(true);
  }

  const title = copied ? 'Lien copié' : label;

  return (
    <button
      type="button"
      className={`copy-deep-link${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      aria-label={title}
      title={title}
      data-testid="copy-deep-link"
    >
      {copied ? <IconCheck size={size} /> : <IconLink size={size} />}
      <span className="fm-visually-hidden" aria-live="polite">
        {copied ? 'Lien copié dans le presse-papiers' : ''}
      </span>
    </button>
  );
}

/** Pied de fiche / panneau : aligne l'icône à droite, discret. */
export function DeepLinkShareFooter({ url, label, className = '' }) {
  if (!String(url || '').trim()) return null;
  return (
    <footer
      className={`copy-deep-link-footer${className ? ` ${className}` : ''}`}
      data-testid="copy-deep-link-footer"
    >
      <CopyDeepLinkButton url={url} label={label} />
    </footer>
  );
}
