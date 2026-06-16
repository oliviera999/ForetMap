import React from 'react';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../utils/overlayHistory';

/**
 * Champ photo (présentation) du formulaire « Nouvelle observation » — extrait de
 * `ObservationNotebook` (O6). Sans aperçu : propose deux boutons (galerie /
 * appareil photo) reliés à des inputs `type=file` cachés ; avec aperçu : affiche
 * l'image et un bouton de suppression. Le garde du sélecteur de fichier natif est
 * armé/désarmé ici ; le reste (compression, état) reste géré par le parent.
 * DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {string|null} props.preview data-URL de l'aperçu (null = pas d'aperçu)
 * @param {import('react').RefObject<HTMLInputElement>} props.galleryFileRef ref de l'input galerie
 * @param {import('react').RefObject<HTMLInputElement>} props.cameraFileRef ref de l'input appareil photo
 * @param {(e: import('react').ChangeEvent<HTMLInputElement>) => void} props.onFile appelé avec l'événement change d'un input fichier
 * @param {() => void} props.onRemove retire l'aperçu courant
 */
export function ObservationPhotoField({
  preview,
  galleryFileRef,
  cameraFileRef,
  onFile,
  onRemove,
}) {
  return !preview ? (
    <div
      className="img-upload-area img-upload-area--split"
      role="group"
      aria-label="Photo d'observation : galerie ou appareil photo"
    >
      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📷</div>
      <div style={{ fontSize: '.82rem', color: '#888', marginBottom: 10 }}>
        Galerie ou appareil photo
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (galleryFileRef.current) galleryFileRef.current.value = '';
            armNativeFilePickerGuard();
            galleryFileRef.current?.click();
          }}
        >
          📁 Choisir une photo
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (cameraFileRef.current) cameraFileRef.current.value = '';
            armNativeFilePickerGuard();
            cameraFileRef.current?.click();
          }}
        >
          📸 Prendre une photo
        </button>
      </div>
      <input
        ref={galleryFileRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          disarmNativeFilePickerGuard();
          onFile(e);
        }}
      />
      <input
        ref={cameraFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          disarmNativeFilePickerGuard();
          onFile(e);
        }}
      />
    </div>
  ) : (
    <div className="img-preview-wrap">
      <img src={preview} className="img-preview" alt="preview" />
      <button className="img-remove" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
