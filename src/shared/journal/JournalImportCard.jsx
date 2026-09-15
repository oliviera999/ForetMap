import { useState } from 'react';
import { useAppDialogs } from '../components/AppDialogsProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { formatDateTime } from '../utils/formatDateTime.js';

/**
 * Carte d'un élément du site importé dans le carnet : type, titre réel, « Voir » vers
 * l'onglet d'origine, épinglage, retrait. Composant unique pour ForetMap et G&L ; le produit
 * fournit ses métadonnées de types (`meta`) et son habillage (`ui`).
 *
 * @param {object} props
 * @param {object} props.item `{ id, resourceType, resourceRef, title, createdAt, pinned }`
 * @param {(nav: object) => void} [props.onNavigateTab]
 * @param {(importId) => Promise<unknown>} [props.onDelete]
 * @param {(importId, pinned: boolean) => Promise<unknown>} [props.onTogglePin]
 * @param {boolean} [props.readOnly=false] lecture par un professeur / MJ : ni épingler ni retirer
 * @param {{ importTypeMeta: Function, importTargetNav: Function }} props.meta
 * @param {object} props.ui
 * @param {string} props.ui.classPrefix `fm-journal` | `gl-player-journal`
 * @param {string} [props.ui.cardClassName] classe de surface du produit (`card`, `gl-panel`)
 * @param {string} [props.ui.hintClassName] classe de texte secondaire (`hint`, `gl-hint`)
 * @param {string} [props.ui.actionsClassName] classe additionnelle du bloc d'actions
 * @param {import('react').ElementType} [props.ui.Button] composant bouton (défaut : `Button` partagé)
 * @param {object} [props.ui.buttonProps] props communes aux boutons (variante, classes du thème)
 */
export function JournalImportCard({
  item,
  onNavigateTab,
  onDelete,
  onTogglePin,
  readOnly = false,
  meta,
  ui,
}) {
  const { confirm } = useAppDialogs();
  const [removing, setRemoving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const typeMeta = meta.importTypeMeta(item.resourceType);
  const nav = meta.importTargetNav(item.resourceType, item.resourceRef);
  const label = item.title || `${item.resourceType} · ${item.resourceRef}`;
  const pinned = !!item.pinned;
  const p = ui.classPrefix;
  const Btn = ui.Button || Button;
  const btnProps = { type: 'button', variant: 'secondary', ...(ui.buttonProps || {}) };

  async function handleRemove() {
    if (removing) return;
    if (!(await confirm({ message: `Retirer « ${label} » du carnet ?`, danger: true }))) {
      return;
    }
    setRemoving(true);
    try {
      await onDelete?.(item.id);
    } finally {
      setRemoving(false);
    }
  }

  async function handleTogglePin() {
    if (pinning) return;
    setPinning(true);
    try {
      await onTogglePin?.(item.id, !pinned);
    } finally {
      setPinning(false);
    }
  }

  return (
    <article
      className={`${ui.cardClassName || ''} ${p}__import fade-in${pinned ? ' is-pinned' : ''}`.trim()}
    >
      <div className={`${p}__import-main`}>
        <span className={`${p}__import-icon`} aria-hidden="true">
          {typeMeta.icon}
        </span>
        <div>
          <p className={`${p}__import-kind`}>
            {pinned ? <span aria-hidden="true">📌 </span> : null}
            {typeMeta.label}
          </p>
          <h3 className={`${p}__import-title`}>{label}</h3>
          {item.createdAt ? (
            <p className={ui.hintClassName || ''}>Ajouté le {formatDateTime(item.createdAt)}</p>
          ) : null}
        </div>
      </div>
      <div className={`${ui.actionsClassName || ''} ${p}__import-actions`.trim()}>
        {nav && onNavigateTab ? (
          <Btn {...btnProps} onClick={() => onNavigateTab(nav)} aria-label={`Voir « ${label} »`}>
            Voir
          </Btn>
        ) : null}
        {!readOnly && onTogglePin ? (
          <Btn
            {...btnProps}
            onClick={handleTogglePin}
            disabled={pinning}
            aria-pressed={pinned}
            aria-label={pinned ? `Désépingler « ${label} »` : `Épingler « ${label} »`}
          >
            {pinned ? '📌 Épinglé' : 'Épingler'}
          </Btn>
        ) : null}
        {!readOnly ? (
          <Btn
            {...btnProps}
            onClick={handleRemove}
            disabled={removing}
            aria-label={`Retirer « ${label} »`}
          >
            {removing ? 'Retrait…' : 'Retirer'}
          </Btn>
        ) : null}
      </div>
    </article>
  );
}
