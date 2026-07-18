import React from 'react';
import { GLBrandColorEditor } from '../../GLBrandColorEditor.jsx';

/**
 * Éditeur de thème d'un chapitre (couleurs éparses héritant de la charte
 * plateforme) et aperçu visuel du rendu.
 * Composant feuille prop-driven ; le handler de mise à jour reste dans le parent
 * (setChapterForm) et arrive via onColorsChange.
 *
 * @param {object} colors couleurs du thème du chapitre
 * @param {object} [inheritedColors] couleurs héritées de la plateforme
 * @param {(updater)=>void} onColorsChange handler passé à GLBrandColorEditor
 * @param {object} themePreviewStyle variables CSS calculées pour l'aperçu
 */
export function GLChapterThemePanel({
  colors,
  inheritedColors,
  onColorsChange,
  themePreviewStyle,
}) {
  return (
    <>
      <h3>Thème du chapitre</h3>
      <p className="gl-hint">
        Laissez une couleur vide pour hériter de la charte plateforme. Seules les couleurs
        renseignées remplacent la charte par défaut pendant une partie.
      </p>
      <GLBrandColorEditor
        sparse
        value={colors}
        inheritedColors={inheritedColors}
        onChange={onColorsChange}
      />
      <div className="gl-theme-preview gl-app" style={themePreviewStyle} aria-hidden>
        <div className="gl-theme-preview-topbar">Barre haute</div>
        <div className="gl-theme-preview-body">
          <span className="gl-theme-preview-chip gl-theme-preview-chip--primary">Primaire</span>
          <span className="gl-theme-preview-chip gl-theme-preview-chip--secondary">Secondaire</span>
          <span className="gl-theme-preview-text">Texte et liens du chapitre</span>
        </div>
      </div>
    </>
  );
}
