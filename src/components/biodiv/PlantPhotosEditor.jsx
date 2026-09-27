import { useId } from 'react';
import { disarmNativeFilePickerGuard } from '../../shared/platform/overlayHistory';
import { PLANT_PHOTO_FIELD_OPTIONS } from '../../constants/plantMetaSections.js';
import { COMMON_PHOTO_LICENCES, photosOfKind } from '../../utils/plantPhotos.js';
import { IconCamera, IconGallery } from '../../shared/icons.jsx';

const TOUCH = { minHeight: 44 };

/**
 * Photos du formulaire de fiche — une ligne par photo : lien, auteur, licence (migration 302,
 * piste C de l'audit du 25/09/2026, § 1.3.6).
 *
 * L'attribution se saisit photo par photo : ≈ 90 % des licences du catalogue (CC BY,
 * CC BY-SA) obligent à nommer l'auteur, pour chaque image affichée — la fiche ne portait
 * jusqu'ici qu'un crédit, celui de la photo principale.
 *
 * @param {object} props
 * @param {Array<object>} props.photos liste `{ kind, url, credit, licence, source, source_url }`
 * @param {(next: Array<object>) => void} props.onChange nouvelle liste
 * @param {string} props.uploadingField emplacement en cours de téléversement
 * @param {boolean} props.saving enregistrement en cours
 * @param {(kind: string, file: File) => void} props.onCapture photo prise à l'appareil
 * @param {(kind: string, files: FileList) => void} props.onGallery fichiers de la galerie
 */
export function PlantPhotosEditor({
  photos = [],
  onChange,
  uploadingField = '',
  saving = false,
  onCapture,
  onGallery,
}) {
  const uid = useId();
  const licencesListId = `${uid}-licences`;
  const list = Array.isArray(photos) ? photos : [];

  const updateAt = (index, key, value) => {
    onChange(list.map((photo, i) => (i === index ? { ...photo, [key]: value } : photo)));
  };
  const removeAt = (index) => onChange(list.filter((_, i) => i !== index));
  const addLink = (kind) =>
    onChange([...list, { kind, url: '', credit: '', licence: '', source: '', source_url: '' }]);

  return (
    <div className="plant-photos-editor">
      <datalist id={licencesListId}>
        {COMMON_PHOTO_LICENCES.map((licence) => (
          <option key={licence} value={licence} />
        ))}
      </datalist>
      {PLANT_PHOTO_FIELD_OPTIONS.map((field) => {
        const entries = photosOfKind(list, field.key);
        const busy = saving || uploadingField === field.key;
        return (
          <fieldset
            key={field.key}
            className="plant-photos-editor__kind"
            data-photo-kind={field.key}
          >
            <legend>{field.label}</legend>
            {entries.length === 0 ? (
              <p className="section-sub" style={{ margin: '0 0 6px' }}>
                Aucune photo.
              </p>
            ) : null}
            {entries.map(({ photo, index }, n) => {
              const base = `${uid}-${field.key}-${n}`;
              const position = `${field.label}, photo ${n + 1}`;
              return (
                <div key={`${field.key}-${index}`} className="plant-photos-editor__entry">
                  {photo.url ? (
                    <img
                      className="plant-photos-editor__thumb"
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <div className="plant-photos-editor__fields">
                    <label htmlFor={`${base}-url`}>Lien de l’image</label>
                    <input
                      id={`${base}-url`}
                      aria-label={`Lien de l’image — ${position}`}
                      value={photo.url}
                      onChange={(e) => updateAt(index, 'url', e.target.value)}
                      placeholder="https://.../image.jpg ou /uploads/..."
                    />
                    <label htmlFor={`${base}-credit`}>Auteur (crédit)</label>
                    <input
                      id={`${base}-credit`}
                      aria-label={`Auteur (crédit) — ${position}`}
                      value={photo.credit || ''}
                      onChange={(e) => updateAt(index, 'credit', e.target.value)}
                      placeholder="Nom de l’auteur ou de l’établissement"
                    />
                    <label htmlFor={`${base}-licence`}>Licence</label>
                    <input
                      id={`${base}-licence`}
                      aria-label={`Licence — ${position}`}
                      value={photo.licence || ''}
                      onChange={(e) => updateAt(index, 'licence', e.target.value)}
                      list={licencesListId}
                      placeholder="Ex. CC BY-SA 4.0"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={TOUCH}
                    onClick={() => removeAt(index)}
                    aria-label={`Retirer — ${position}`}
                  >
                    Retirer
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={TOUCH}
                onClick={() => addLink(field.key)}
                aria-label={`Ajouter un lien — ${field.label}`}
              >
                + Lien
              </button>
              <label className="btn btn-ghost btn-sm" style={{ ...TOUCH, cursor: 'pointer' }}>
                {uploadingField === field.key ? (
                  'Envoi…'
                ) : (
                  <>
                    <IconGallery size={15} /> Galerie
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    const files = e.target.files;
                    e.target.value = '';
                    onGallery?.(field.key, files);
                  }}
                />
              </label>
              <label className="btn btn-ghost btn-sm" style={{ ...TOUCH, cursor: 'pointer' }}>
                {uploadingField === field.key ? (
                  'Envoi…'
                ) : (
                  <>
                    <IconCamera size={15} /> Appareil photo
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    onCapture?.(field.key, file);
                  }}
                />
              </label>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
