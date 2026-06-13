import React from 'react';
import { MAP_MARKER_EMOJI_MAX_CHARS } from '../../constants/emojis';
import { nextLivingBeingsFromMultiSelect } from '../../utils/livingBeings';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { VisitEditorialMapPhotoImportList, VisitEditorialMediaIdPicker } from '../VisitEditorialPhotoUi.jsx';
import { LivingBeingsCatalogPanel } from './LivingBeingsCatalogPanel.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';

/**
 * Champs communs du formulaire de repère (création « nouveau » et onglet « modifier ») :
 * nom, êtres vivants + catalogue, description, et les 4 textes de visite.
 * Feuille pilotée par props ; état détenu par le parent (`form`/`setForm`).
 * Extrait de `MarkerModal.jsx` (O6, 2e niveau).
 */
export function MarkerCommonFormFields({ form, setForm, plants, set }) {
  return (
    <>
      <div className="field"><label>Nom du repère *</label>
        <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
      </div>
      <div className="field"><label>Êtres vivants</label>
        <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
          Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
        </p>
        <select
          multiple
          size={Math.min(10, Math.max(4, plants.length + 1))}
          value={form.living_beings}
          onChange={(e) => {
            const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
            setForm((f) => ({
              ...f,
              living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
            }));
          }}>
          {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
        </select>
      </div>
      {form.living_beings.length > 0 && (
        <LivingBeingsCatalogPanel plants={plants} names={form.living_beings} showHeading={false} />
      )}
      <div className="field"><label>Description</label>
        <MarkdownTextarea value={form.note} onChange={set('note')} rows={3}
          placeholder="Observations, entretien..." />
      </div>
      <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
        Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
      </p>
      <div className="field"><label>Sous-titre (visite)</label>
        <input value={form.visit_subtitle} onChange={set('visit_subtitle')} placeholder="Optionnel" />
      </div>
      <div className="field"><label>Description courte (visite)</label>
        <MarkdownTextarea value={form.visit_short_description} onChange={set('visit_short_description')} rows={2} placeholder="Texte d’accroche sous le titre" />
      </div>
      <div className="field"><label>Titre du bloc dépliable (visite)</label>
        <input value={form.visit_details_title} onChange={set('visit_details_title')} placeholder="Détails" />
      </div>
      <div className="field"><label>Détails dépliables (visite)</label>
        <MarkdownTextarea value={form.visit_details_text} onChange={set('visit_details_text')} rows={4} placeholder="Contenu du panneau repliable" />
      </div>
    </>
  );
}

/**
 * Champ emoji du repère : saisie libre (`ZoneOrMarkerEmojiField`) + grille de suggestions.
 * `id` distinct entre création et édition pour l'accessibilité du label.
 */
export function MarkerEmojiField({ id, form, setForm, markerEmojis }) {
  return (
    <div className="field"><label htmlFor={id}>Emoji du repère (optionnel)</label>
      <ZoneOrMarkerEmojiField
        id={id}
        value={form.emoji}
        onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
        maxLen={MAP_MARKER_EMOJI_MAX_CHARS}
        allowNone
      />
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', paddingRight: 2,
        WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
      }}>
        {markerEmojis.map((emoji) => (
          <button
            type="button"
            key={emoji}
            className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
            onClick={() => setForm((f) => ({ ...f, emoji }))}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Constructeur des blocs image de visite (onglet « modifier ») : import de photos repère,
 * ajout/suppression de blocs, choix des médias, taille et légende.
 * État des blocs détenu par le parent ; callbacks d'ajout/màj/suppression injectés.
 */
export function MarkerVisitImageBuilder({
  imageBlocks,
  visitMediaOptions,
  markerPhotoOptions,
  onAddImageBlock,
  onUpdateImageBlock,
  onRemoveImageBlock,
  onAssociatePhoto,
  // Textes ajustables pour mutualiser le constructeur entre repère et zone (O6) ;
  // valeurs par défaut alignées sur le modal de repère pour ne rien changer côté MarkerModal.
  introText = 'Choisis des photos déjà associées au repère, ou associe d’abord une photo de l’onglet Photos.',
  photoImportHeading = 'Photos liées à ce repère',
  pickerEmptyHint = 'Aucune photo visite — onglet Photos ou associe une photo repère ci-dessus.',
}) {
  return (
    <div className="visit-editorial-builder">
      <h5>Bloc images (visite)</h5>
      <p className="section-sub">{introText}</p>
      <div className="visit-editorial-builder__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAddImageBlock}>+ Bloc image</button>
      </div>
      <VisitEditorialMapPhotoImportList
        photos={markerPhotoOptions}
        heading={photoImportHeading}
        onAssociate={onAssociatePhoto}
      />
      <div className="visit-editorial-builder__list">
        {imageBlocks.map((block) => (
          <div key={block.id} className="visit-editorial-builder__item">
            <div className="visit-editorial-builder__head">
              <strong>Image(s)</strong>
              <div className="visit-editorial-builder__head-actions">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveImageBlock(block.id)}>Suppr.</button>
              </div>
            </div>
            <div className="visit-editorial-builder__image">
              <label>Photos du bloc (1 ou 2)</label>
              <VisitEditorialMediaIdPicker
                mediaList={visitMediaOptions}
                selectedIds={block.media_ids || []}
                onChange={(ids) => onUpdateImageBlock(block.id, { media_ids: ids })}
                emptyHint={pickerEmptyHint}
              />
              <div className="visit-editorial-builder__image-meta">
                <select value={block.size || 'md'} onChange={(e) => onUpdateImageBlock(block.id, { size: e.target.value })}>
                  <option value="sm">Compact</option>
                  <option value="md">Normal</option>
                  <option value="lg">Large</option>
                </select>
              </div>
              <input
                value={block.caption || ''}
                onChange={(e) => onUpdateImageBlock(block.id, { caption: e.target.value })}
                placeholder="Légende (optionnel)"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
