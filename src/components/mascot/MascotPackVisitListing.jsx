import { useId } from 'react';

/**
 * Réglages « Visite » d'un pack (audit UI/UX du 19/11/2026, U4 ; migration 374) :
 *
 *  - **Proposé dans la Visite** — distinct de la publication, qui sert aussi aux équipes du
 *    jeu : décocher retire le guide du sélecteur des visiteurs sans le retirer aux équipes ;
 *  - **Version féminine de…** — relie deux packs d'un même personnage : le sélecteur de la
 *    Visite affiche une seule ligne et une case « Version féminine ».
 *
 * Enregistré tout de suite (comme la publication), sans passer par « Enregistrer ».
 *
 * @param {{
 *   row: { catalog_id: string, is_published?: boolean, visit_listed?: boolean, variant_of?: string|null },
 *   packs: Array<{ catalog_id: string, label: string, variant_of?: string|null }>,
 *   busy: boolean,
 *   onChange: (patch: { visit_listed?: number, variant_of?: string }) => void,
 * }} props
 */
export default function MascotPackVisitListing({ row, packs, busy, onChange }) {
  const baseSelectId = useId();
  if (!row) return null;
  const listed = row.visit_listed !== false;
  // Bases possibles : un autre pack qui n'est pas lui-même une variante. Un pack qui a déjà
  // une variante ne peut pas en devenir une (un seul niveau).
  const hasOwnVariant = packs.some((p) => p.variant_of === row.catalog_id);
  const bases = packs.filter((p) => p.catalog_id !== row.catalog_id && !p.variant_of);
  return (
    <fieldset className="mascot-pack-visit-listing" disabled={busy}>
      <legend className="mascot-pack-visit-listing__legend">Visite</legend>
      <label className="mascot-pack-visit-listing__check">
        <input
          type="checkbox"
          checked={listed}
          onChange={(event) => onChange({ visit_listed: event.target.checked ? 1 : 0 })}
          data-testid="mascot-pack-visit-listed"
        />
        <span>Proposé dans la Visite</span>
      </label>
      <p className="section-sub mascot-pack-visit-listing__hint">
        {row.is_published
          ? listed
            ? 'Les visiteurs peuvent choisir ce guide. Le décocher ne le retire pas aux équipes du jeu.'
            : 'Retiré du sélecteur des visiteurs ; toujours disponible pour les équipes du jeu.'
          : 'Brouillon : jamais proposé, quelle que soit cette case, tant qu’il n’est pas publié.'}
      </p>
      {hasOwnVariant ? (
        <p className="section-sub mascot-pack-visit-listing__hint">
          Ce pack a une version féminine : il sert de base au sélecteur.
        </p>
      ) : (
        <label className="mascot-pack-visit-listing__base" htmlFor={baseSelectId}>
          <span>Version féminine de…</span>
          <select
            id={baseSelectId}
            value={row.variant_of || ''}
            onChange={(event) => onChange({ variant_of: event.target.value })}
            data-testid="mascot-pack-variant-of"
          >
            <option value="">— aucun (personnage à part) —</option>
            {bases.map((p) => (
              <option key={p.catalog_id} value={p.catalog_id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}
