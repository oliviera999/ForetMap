import React, { useEffect, useState } from 'react';

// Singleton de module chargé paresseusement — une seule promesse pour toute l'appli.
let renderModuleCache = null;
let renderFnCache = null;

function loadRenderModule() {
  if (!renderModuleCache) {
    renderModuleCache = import('../utils/markdownRender.js').then((mod) => {
      renderFnCache = mod.renderMarkdownToSafeHtml;
      return mod;
    });
  }
  return renderModuleCache;
}

/**
 * Affiche du Markdown léger en HTML sanitizé.
 * @param {{ children?: string, className?: string, emptyFallback?: React.ReactNode }} props
 */
function MarkdownContent({ children, className = '', emptyFallback = null, style = undefined }) {
  const source = String(children ?? '').trim();

  // renderReady passe à true dès que le module est disponible.
  const [renderReady, setRenderReady] = useState(() => renderFnCache !== null);

  useEffect(() => {
    if (renderFnCache !== null) return;
    let cancelled = false;
    loadRenderModule().then(() => {
      if (!cancelled) setRenderReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!source) {
    return emptyFallback != null ? <>{emptyFallback}</> : null;
  }

  // Avant que le module soit prêt : fallback texte brut.
  if (!renderReady) {
    return <p className={`markdown-content markdown-content--plain ${className}`.trim()} style={style}>{source}</p>;
  }

  const html = renderFnCache(source);

  if (!html) {
    return <p className={`markdown-content markdown-content--plain ${className}`.trim()} style={style}>{source}</p>;
  }

  return (
    <div
      className={`markdown-content ${className}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { MarkdownContent };
