import VisitMapMascotRenderer from '../../components/VisitMapMascotRenderer.jsx';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';

/** Avatar de repli dans le même shell que ForetMap (sans fond blanc). */
function GLMascotBoardFallback({ mascotId, size = 48, fallbackType }) {
  return (
    <div
      className="visit-map-mascot-rive-shell"
      data-renderer="gl-fallback"
      data-mascot-id={mascotId || ''}
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static">
        <GLMascotAvatar mascotId={mascotId} size={size} fallbackType={fallbackType} />
      </div>
    </div>
  );
}

/**
 * Mascotte animée G&L. Le catalogue G&L ne contient que les packs publiés du studio ForêtMap :
 * un identifiant qui n'y figure pas (pack dépublié depuis, ancienne mascotte `gl-*`, catalogue
 * pas encore chargé) est rendu par l'avatar SVG de repli, sans erreur.
 */
export function GLMascotRenderer({
  mascotId,
  mascotState,
  size = 48,
  boardMode = false,
  fallbackType,
  extraCatalogEntries: extraCatalogEntriesProp = null,
}) {
  const { mascots, extraCatalogEntries: extraCatalogEntriesCtx } = useGLMascotCatalog();
  const extraCatalogEntries = extraCatalogEntriesProp ?? extraCatalogEntriesCtx;
  const id = String(mascotId || '').trim();
  const known =
    Boolean(id) &&
    ((Array.isArray(mascots) && mascots.some((m) => m?.id === id)) ||
      (Array.isArray(extraCatalogEntries) && extraCatalogEntries.some((m) => m?.id === id)));
  if (!known) {
    if (boardMode) {
      return <GLMascotBoardFallback mascotId={mascotId} size={size} fallbackType={fallbackType} />;
    }
    return <GLMascotAvatar mascotId={mascotId} size={size} fallbackType={fallbackType} />;
  }
  return (
    <VisitMapMascotRenderer
      key={mascotId}
      mascotState={mascotState}
      mascotId={mascotId}
      extraCatalogEntries={extraCatalogEntries}
    />
  );
}
