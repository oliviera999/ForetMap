import { edgeStyleForType } from '../../shared/foodWebEdgeStyle.js';
import { GlossaryInlineText } from '../GlossaryMarkdown.jsx';
import { IconDelete } from '../../shared/icons.jsx';
import { describeRow } from './foodWebRows.js';
import { elsewhereText } from './foodWebGraphModel.js';

function FoodWebNodeButton({ node, highlightIds, onOpenPlant }) {
  if (node.id == null) {
    return (
      <span className="pedago-foodweb__node pedago-foodweb__node--env">
        {node.name || 'Environnement'}
      </span>
    );
  }
  const highlighted = highlightIds.includes(Number(node.id));
  // Hors de la carte : grisé, avec la mention « vit ailleurs : … » (lue aussi par le lecteur
  // d'écran) — décision 1 du 22/11/2026, l'espèce n'est plus retirée.
  const elsewhere = node.outOfScope
    ? (elsewhereText(node.elsewhere) ?? 'hors de cette carte')
    : null;
  return (
    <span className="pedago-foodweb__node-wrap">
      <button
        type="button"
        className={`pedago-foodweb__node${highlighted ? ' pedago-foodweb__node--highlight' : ''}${elsewhere ? ' pedago-foodweb__node--outside' : ''}`}
        onClick={() => onOpenPlant?.(node.id)}
        title={elsewhere ? `${node.name} — ${elsewhere}` : undefined}
      >
        {node.emoji ? `${node.emoji} ` : ''}
        {node.name}
        {elsewhere ? <span className="fm-visually-hidden">, {elsewhere}</span> : null}
      </button>
      {elsewhere ? (
        <span className="pedago-foodweb__elsewhere" aria-hidden="true">
          {elsewhere}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Vue « liste » du réseau trophique, regroupée par type (sortie de `FoodWebView.jsx`, flux
 * C3). `typeLabel` donne le libellé du profil (verbe au collège, mot savant ailleurs).
 */
export function FoodWebListGroups({
  grouped,
  typeLabel,
  selectedEdgeId,
  onSelectEdge,
  highlightIds = [],
  onOpenPlant,
  canManage,
  onDelete,
  glossaryIndex,
  onOpenGlossaryTerm,
}) {
  return (
    <div className="pedago-foodweb__groups">
      {grouped.map(([type, rows]) => (
        <section key={type} className="card pedago-foodweb__group">
          <h3 className="pedago-panel-title">{typeLabel(type)}</h3>
          <ul className="pedago-foodweb__edges">
            {rows.map((row) => {
              const { tail, head, relation, symmetric } = describeRow(row);
              return (
                <li key={row.id} className="pedago-foodweb__row">
                  <div className="pedago-foodweb__edge-line">
                    <FoodWebNodeButton
                      node={tail}
                      highlightIds={highlightIds}
                      onOpenPlant={onOpenPlant}
                    />
                    <button
                      type="button"
                      className={`pedago-foodweb__edge pedago-foodweb__edge--${String(type || 'default').toLowerCase()}${selectedEdgeId === row.id ? ' active' : ''}`}
                      onClick={() => onSelectEdge(row.id)}
                      title={`${typeLabel(type)}${row.description ? ` — ${row.description}` : ''}`}
                      style={{ '--fw-edge-color': edgeStyleForType(type).color }}
                    >
                      <span className="pedago-foodweb__edge-arrow" aria-hidden="true">
                        {symmetric ? '↔' : '→'}
                      </span>
                      <span className="pedago-foodweb__edge-label">{relation}</span>
                    </button>
                    <FoodWebNodeButton
                      node={head}
                      highlightIds={highlightIds}
                      onOpenPlant={onOpenPlant}
                    />
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm pedago-foodweb__delete"
                        onClick={() => onDelete(row.id)}
                        title="Supprimer cette interaction"
                        aria-label="Supprimer cette interaction"
                      >
                        <IconDelete size={16} />
                      </button>
                    ) : null}
                  </div>
                  {row.description ? (
                    <GlossaryInlineText
                      tag="p"
                      className="pedago-foodweb__desc"
                      text={row.description}
                      glossaryItems={glossaryIndex}
                      onOpenGlossaryTerm={onOpenGlossaryTerm}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
