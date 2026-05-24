import React from 'react';

export function GLImageFrameHelp({ context = 'generic' }) {
  const labelByContext = {
    'brand-hero': 'Banniere hero',
    'brand-card': 'Carte d accueil',
    'brand-banner': 'Banniere de page',
    markdown: 'Image markdown',
    'chapter-map': 'Carte chapitre',
    avatar: 'Avatar',
    generic: 'Image',
  };
  const label = labelByContext[context] || labelByContext.generic;
  return (
    <details className="gl-image-frame-help">
      <summary>Aide recadrage - {label}</summary>
      <div className="gl-hint">
        <p>Object fit "cover" remplit le cadre et peut couper les bords. "contain" garde toute l image, avec bandes possibles.</p>
        <p>Point focal X/Y indique la zone prioritaire visible quand l image est recadree automatiquement.</p>
        <p>Utilisez ratio "auto" pour garder les dimensions naturelles ; sinon imposez un ratio (1/1, 4/3, 16/9, 21/9).</p>
      </div>
    </details>
  );
}
