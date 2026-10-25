/**
 * Barre de crédit, visible EN PERMANENCE pendant l'activité (licence CC BY-NC-ND de La Fresque
 * du Climat) : ligne de crédit du jeu, lien vers la licence, accès à la carte « crédits »
 * officielle (image fournie, affichée telle quelle dans la visionneuse).
 */
export function FresqueCreditBar({ attribution, onOpenNotice = null, extra = null }) {
  if (!attribution) return null;
  return (
    <div className="fm-fresque-credit" data-testid="fm-fresque-credit" role="contentinfo">
      <span>{attribution.creditLine}</span>
      {attribution.licence?.url ? (
        <a href={attribution.licence.url} target="_blank" rel="noreferrer noopener">
          Licence
        </a>
      ) : null}
      {attribution.website ? (
        <a href={attribution.website} target="_blank" rel="noreferrer noopener">
          {attribution.website.replace(/^https?:\/\//, '')}
        </a>
      ) : null}
      {onOpenNotice ? (
        <button
          type="button"
          className="fm-fresque-btn fm-fresque-btn--ghost"
          onClick={onOpenNotice}
          aria-label="Voir la carte des crédits et de la licence"
        >
          ⓘ Carte crédits
        </button>
      ) : null}
      {extra}
    </div>
  );
}
