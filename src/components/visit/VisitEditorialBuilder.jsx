import React from 'react';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { VisitEditorialMediaIdPicker } from '../VisitEditorialPhotoUi.jsx';

/**
 * Constructeur de mise en page éditoriale de l'éditeur de visite (zone / repère),
 * extrait de `VisitEditorPanel` (O6). Présentation pure : l'état `blocks` reste dans le
 * parent, ce composant n'émet que des intentions.
 *
 * Props :
 * - `blocks` : blocs éditoriaux courants (paragraph / heading / image).
 * - `mediaList` : photos visite triées, proposées au sélecteur d'images.
 * - `onAdd(type)` : ajout d'un bloc du type donné ('paragraph' | 'heading' | 'image').
 * - `onMove(id, delta)` : déplacement du bloc (-1 / +1).
 * - `onUpdate(id, patch)` : patch partiel d'un bloc.
 * - `onRemove(id)` : suppression d'un bloc.
 */
export function VisitEditorialBuilder({
  blocks = [],
  mediaList = [],
  onAdd,
  onMove,
  onUpdate,
  onRemove,
}) {
  return (
    <div className="visit-editorial-builder">
      <h5>Mise en page éditoriale</h5>
      <p className="section-sub">
        Ajoute des blocs texte/image, puis réordonne-les pour placer les images où tu veux.
      </p>
      <div className="visit-editorial-builder__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdd('paragraph')}>
          + Paragraphe
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdd('heading')}>
          + Intertitre
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdd('image')}>
          + Bloc image
        </button>
      </div>
      <div className="visit-editorial-builder__list">
        {blocks.map((block, index) => (
          <div key={block.id} className="visit-editorial-builder__item">
            <div className="visit-editorial-builder__head">
              <strong>
                {block.type === 'paragraph'
                  ? 'Paragraphe'
                  : block.type === 'heading'
                    ? 'Intertitre'
                    : 'Image(s)'}
              </strong>
              <div className="visit-editorial-builder__head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onMove(block.id, -1)}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onMove(block.id, 1)}
                  disabled={index === blocks.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onRemove(block.id)}
                >
                  Suppr.
                </button>
              </div>
            </div>
            {block.type === 'paragraph' ? (
              <MarkdownTextarea
                rows={3}
                value={block.markdown || ''}
                onChange={(e) => onUpdate(block.id, { markdown: e.target.value })}
                placeholder="Texte (Markdown léger)"
              />
            ) : null}
            {block.type === 'heading' ? (
              <div className="visit-editorial-builder__heading">
                <input
                  value={block.text || ''}
                  onChange={(e) => onUpdate(block.id, { text: e.target.value })}
                  placeholder="Titre de section"
                />
              </div>
            ) : null}
            {block.type === 'image' ? (
              <div className="visit-editorial-builder__image">
                <label>Images du bloc (1 ou 2)</label>
                <VisitEditorialMediaIdPicker
                  mediaList={mediaList}
                  selectedIds={block.media_ids || []}
                  onChange={(ids) => onUpdate(block.id, { media_ids: ids })}
                />
                <div className="visit-editorial-builder__image-meta">
                  <select
                    value={block.size || 'md'}
                    onChange={(e) => onUpdate(block.id, { size: e.target.value })}
                  >
                    <option value="sm">Compact</option>
                    <option value="md">Normal</option>
                    <option value="lg">Large</option>
                  </select>
                </div>
                <input
                  value={block.caption || ''}
                  onChange={(e) => onUpdate(block.id, { caption: e.target.value })}
                  placeholder="Légende du bloc (optionnel)"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
