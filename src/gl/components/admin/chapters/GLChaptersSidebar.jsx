import React from 'react';
import { GLButton } from '../../ui/GLButton.jsx';

/**
 * Barre latérale d'administration des chapitres : liste sélectionnable des
 * chapitres existants et bouton « Nouveau chapitre ».
 * Composant feuille prop-driven ; la sélection et la création vivent dans le
 * parent via onSelect(slug) / onNew().
 *
 * @param {Array} chapters chapitres { id, slug, title, biomes }
 * @param {number|null} selectedId identifiant du chapitre actif
 * @param {(slug:string)=>void} onSelect
 * @param {()=>void} onNew
 */
export function GLChaptersSidebar({ chapters, selectedId, onSelect, onNew }) {
  return (
    <aside>
      <ul className="gl-chapters-admin-list">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <button
              type="button"
              className={Number(selectedId) === Number(chapter.id) ? 'is-active' : ''}
              onClick={() => onSelect(chapter.slug)}
              data-chapter-id={chapter.id}
              data-chapter-slug={chapter.slug}
            >
              <strong>{chapter.title || chapter.slug}</strong>
              <span className="gl-hint">{chapter.slug}</span>
              {Array.isArray(chapter.biomes) && chapter.biomes.length > 0 ? (
                <span className="gl-hint">{chapter.biomes.length} biome(s)</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <GLButton type="button" variant="secondary" onClick={onNew}>
        + Nouveau chapitre
      </GLButton>
    </aside>
  );
}
