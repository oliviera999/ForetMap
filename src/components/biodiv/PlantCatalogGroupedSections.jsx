import { useId } from 'react';
import { TO_SEARCH_HINT } from '../../utils/plantCatalogHelpers.js';
import './plantCatalogCollege.css';

function GroupSection({ group, open, onToggle, renderTile }) {
  const panelId = useId();
  const countLabel = `${group.count} ${group.count > 1 ? 'êtres vivants' : 'être vivant'}`;
  return (
    <section className="biodiv-group" data-usage-group-id={group.id}>
      <h3 className="biodiv-group__title">
        <button
          type="button"
          className="biodiv-group__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(group.id)}
        >
          <span className="biodiv-group__chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="biodiv-group__label">{group.label}</span>
          <span className="biodiv-group__count">{countLabel}</span>
        </button>
      </h3>
      {open ? (
        <div id={panelId} className="biodiv-grid biodiv-grid--tiles">
          {group.plants.map(({ plant, toSearch }) =>
            renderTile(plant, { presenceHint: toSearch ? TO_SEARCH_HINT : '' }),
          )}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Catalogue de biodiversité rangé par groupe d'usage (collège, chantier collège flux C4) :
 * une section repliable par groupe, avec son effectif ; dans chaque groupe, espèces phares
 * d'abord, puis présences confirmées ou attendues, puis présences « à chercher »
 * (`groupCatalogByUsage`).
 *
 * @param {object} props
 * @param {Array<{ id: string, label: string, count: number,
 *   plants: Array<{ plant: object, toSearch: boolean }> }>} props.groups
 * @param {(id: string) => boolean} props.isGroupOpen
 * @param {(id: string) => void} props.onToggleGroup
 * @param {(plant: object, extra: { presenceHint: string }) => import('react').ReactNode} props.renderTile
 */
export function PlantCatalogGroupedSections({ groups, isGroupOpen, onToggleGroup, renderTile }) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  return (
    <div className="biodiv-groups">
      {groups.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          open={isGroupOpen(group.id)}
          onToggle={onToggleGroup}
          renderTile={renderTile}
        />
      ))}
    </div>
  );
}
