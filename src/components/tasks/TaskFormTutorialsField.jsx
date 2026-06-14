import React from 'react';
import { normalizeTutorialIds } from '../../utils/taskFormHelpers.js';

/**
 * Champ « Tutoriels associés » du formulaire de tâche (feuille prop-driven).
 *
 * Extrait de `TaskFormModal` (O6) : recherche + liste filtrée de tutoriels avec
 * cases à cocher, compteur et raccourcis « Tout sélectionner / Effacer ». Le
 * catalogue complet (`tutorials`), la liste filtrée (`filteredTutorials`), la
 * recherche et la sélection (`selectedIds`/`onToggle`/`onSelectAll`/`onClear`)
 * restent détenus par le parent.
 */
export function TaskFormTutorialsField({
  tutorials = [],
  filteredTutorials = [],
  search,
  onSearchChange,
  selectedIds = [],
  onToggle,
  onSelectAll,
  onClear,
}) {
  const normalizedSelectedIds = normalizeTutorialIds(selectedIds);
  return (
    <div className="field"><label>Tutoriels associés (optionnel)</label>
      {tutorials.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="🔍 Rechercher un tutoriel..."
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.8rem', color: '#666' }}>
              {normalizedSelectedIds.length} sélectionné{normalizedSelectedIds.length > 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onSelectAll}
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClear}
              >
                Effacer
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="task-form-pick-list">
        {tutorials.length === 0
          ? <p className="task-form-pick-empty">Aucun tutoriel disponible.</p>
          : filteredTutorials.length === 0
            ? <p className="task-form-pick-empty">Aucun tutoriel trouvé.</p>
            : filteredTutorials.map(t => (
            <label key={t.id} className="task-form-pick-item">
              <input
                type="checkbox"
                className="task-form-pick-checkbox"
                checked={normalizedSelectedIds.includes(Number.parseInt(t.id, 10))}
                onChange={() => onToggle(t.id)}
              />
              <span className="task-form-pick-text">📘 {t.title}</span>
            </label>
          ))}
      </div>
    </div>
  );
}
