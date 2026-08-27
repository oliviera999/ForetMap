import React from 'react';

/** Hauteur du loader plein écran des vues prof / élève (ancien style inline d'App.jsx). */
export const FULL_PAGE_LOADER_STYLE = { height: '60vh' };

/**
 * Loader « feuille » de l'app. Factorise les trois copies d'App.jsx (branche prof,
 * branche élève, fallback Suspense du studio packs mascotte) — iso-rendu.
 *
 * @param {object} props
 * @param {React.ReactNode} props.text Message affiché sous la feuille.
 * @param {object} [props.style] Style inline du conteneur.
 * @param {string} [props.textClassName] Classe du paragraphe (ex. `section-sub`).
 */
export function AppLoader({ text, style, textClassName }) {
  return (
    <div className="loader" style={style}>
      <div className="loader-leaf">🌿</div>
      <p className={textClassName}>{text}</p>
    </div>
  );
}
