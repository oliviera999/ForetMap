import React from 'react';
import { MediaLibraryMenu } from '../../../../components/MediaLibraryMenu.jsx';

/**
 * Section « Consulter » de la bibliothèque de contenus G&L : encapsule le
 * `MediaLibraryMenu` cloisonné G&L. Composant feuille prop-driven : aucun état
 * interne, toutes les opérations réseau sont fournies par le parent.
 *
 * @param {number} reloadKey clé de remontage (force le rechargement après import)
 * @param {()=>Promise<Array>} fetchItems liste les médias
 * @param {()=>Promise<object>} fetchUsage récupère l'usage des médias
 * @param {(dataUrl:string, options?:object)=>Promise<void>} uploadDataUrl ajoute un média
 * @param {(relativePath:string)=>Promise<void>} removeItem supprime un média
 * @param {(url:string)=>void} onPickUrl copie l'URL d'un média
 */
export function GLContentLibraryConsultSection({
  reloadKey,
  fetchItems,
  fetchUsage,
  uploadDataUrl,
  removeItem,
  onPickUrl,
}) {
  return (
    <section className="gl-content-library__section">
      <h3>Consulter</h3>
      <MediaLibraryMenu
        key={reloadKey}
        title="Médiathèque Gnomes & Licornes (images, audio, vidéo)"
        fetchItems={fetchItems}
        fetchUsage={fetchUsage}
        uploadDataUrl={uploadDataUrl}
        removeItem={removeItem}
        onPickUrl={onPickUrl}
        canUpload
        canRemove
        defaultOpen
        showToggle={false}
        layout="gallery"
        enableGalleryBulkActions
        manageHint="Clique sur une miniature pour copier l’URL. Chaque média indique s’il est utilisé et où. Cochez plusieurs médias pour les supprimer en lot, ou videz la bibliothèque si besoin."
      />
    </section>
  );
}
