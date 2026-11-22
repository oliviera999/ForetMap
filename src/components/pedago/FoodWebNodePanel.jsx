import { useEffect, useId, useRef } from 'react';
import { IconClose } from '../../shared/icons.jsx';
import { elsewhereText } from './foodWebGraphModel.js';
import './foodWebView.css';

/** Éléments focalisables du panneau, dans l'ordre du document. */
function focusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]')];
}

/**
 * Petit panneau d'une espèce du graphe (chantier collège du 22/11/2026, décision 3) : ouvert
 * par un clic (ou Entrée) sur un nœud quand `FoodWebGraph` reçoit `nodeClickMode="panel"`.
 *
 * Emoji, nom, étiquette simple (`usage_label`), mention « vit ailleurs : … » pour une espèce
 * hors carte, et deux boutons : « Ajouter à la sélection » / « Retirer de la sélection » et
 * « Voir la fiche ». Popover accessible : focus piégé dans le panneau, Échap ferme, le focus
 * revient au nœud (géré par l'appelant via `onClose`). Ancré au nœud sur grand écran, en
 * feuille basse sur téléphone (CSS).
 *
 * @param {{
 *   node: { id: number, name: string, emoji?: string, outOfScope?: boolean,
 *     elsewhere?: { id: string, label: string }[]|null },
 *   usageLabel?: string,
 *   selected: boolean,
 *   onToggleSelection?: ((id: number) => void)|null,
 *   onOpenPlant?: ((id: number) => void)|null,
 *   onClose: () => void,
 *   anchor?: { left: number, top: number }|null,
 * }} props
 */
export function FoodWebNodePanel({
  node,
  usageLabel = '',
  selected,
  onToggleSelection = null,
  onOpenPlant = null,
  onClose,
  anchor = null,
}) {
  const titleId = useId();
  const rootRef = useRef(null);

  useEffect(() => {
    focusables(rootRef.current)[0]?.focus?.();
  }, [node?.id]);

  if (!node) return null;
  const elsewhere = node.outOfScope ? (elsewhereText(node.elsewhere) ?? 'hors de cette carte') : '';

  const onKeyDown = (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      onClose();
      return;
    }
    if (evt.key !== 'Tab') return;
    const list = focusables(rootRef.current);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = rootRef.current.ownerDocument.activeElement;
    if (evt.shiftKey && active === first) {
      evt.preventDefault();
      last.focus();
    } else if (!evt.shiftKey && active === last) {
      evt.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`pedago-foodweb__node-panel${anchor ? ' pedago-foodweb__node-panel--anchored' : ''}`}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      style={anchor ? { left: `${anchor.left}px`, top: `${anchor.top}px` } : undefined}
    >
      <div className="pedago-foodweb__node-panel-head">
        <p id={titleId} className="pedago-foodweb__node-panel-title">
          {node.emoji ? <span aria-hidden="true">{node.emoji} </span> : null}
          <strong>{node.name}</strong>
        </p>
        <button
          type="button"
          className="pedago-foodweb__node-panel-close"
          onClick={onClose}
          aria-label="Fermer le panneau"
          title="Fermer"
        >
          <IconClose size={14} />
        </button>
      </div>
      {usageLabel ? <p className="pedago-foodweb__node-panel-label">{usageLabel}</p> : null}
      {elsewhere ? <p className="pedago-foodweb__elsewhere">{elsewhere}</p> : null}
      <div className="pedago-foodweb__node-panel-actions">
        {onToggleSelection ? (
          <button
            type="button"
            className={`btn btn-sm ${selected ? 'btn-secondary' : 'btn-primary'}`}
            aria-pressed={selected}
            onClick={() => onToggleSelection(node.id)}
          >
            {selected ? 'Retirer de la sélection' : 'Ajouter à la sélection'}
          </button>
        ) : null}
        {onOpenPlant ? (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onOpenPlant(node.id)}
          >
            Voir la fiche
          </button>
        ) : null}
      </div>
    </div>
  );
}
