import React from 'react';

import { DialogShell } from '../DialogShell';
import { MediaLibraryMenu } from '../MediaLibraryMenu.jsx';

/**
 * Sélecteur d'image du studio narrateur : la médiathèque ForetMap en galerie,
 * ouverte sur un emplacement précis (expression + cadrage).
 *
 * Le choix d'une modale plutôt que d'une médiathèque dépliée sous chaque carte est
 * délibéré : huit expressions × trois cadrages feraient vingt-quatre médiathèques
 * potentielles dans la page. Ici, une seule est montée à la fois, et son titre
 * rappelle en permanence l'emplacement que l'on est en train de remplir.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.slotLabel      libellé de l'emplacement visé (ex. « Parle · Buste »)
 * @param {(url: string) => void} props.onPick
 * @param {() => void} props.onClose
 * @param {() => Promise<Array>} props.fetchItems
 * @param {(dataUrl: string) => Promise<*>} props.uploadDataUrl
 * @param {boolean} [props.canUpload]
 */
export function NarratorMediaPickerDialog({
  open,
  slotLabel = '',
  onPick,
  onClose,
  fetchItems,
  uploadDataUrl,
  canUpload = true,
}) {
  if (!open) return null;

  return (
    <DialogShell
      open
      onClose={onClose}
      dialogClassName="log-modal fm-narrator-picker fade-in"
      ariaLabel={`Choisir une image pour ${slotLabel}`}
      showCloseButton
      closeButtonLabel="Fermer le sélecteur d’image"
    >
      <h3 className="fm-narrator-picker__title">🖼️ Choisir une image</h3>
      <p className="section-sub fm-narrator-picker__slot">
        Emplacement : <strong>{slotLabel}</strong>
      </p>
      <MediaLibraryMenu
        title="Médiathèque ForetMap"
        fetchItems={fetchItems}
        uploadDataUrl={uploadDataUrl}
        removeItem={async () => {}}
        onPickUrl={(url) => {
          onPick?.(url);
          onClose?.();
        }}
        canUpload={canUpload}
        canRemove={false}
        layout="gallery"
        defaultOpen
        showToggle={false}
        manageHint="Clique une image pour l’affecter à cet emplacement. Importer ajoute d’abord le fichier à la médiathèque."
      />
    </DialogShell>
  );
}
