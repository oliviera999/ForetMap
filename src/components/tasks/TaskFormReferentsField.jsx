import React from 'react';
import { referentCandidateLabel, referentRoleHint } from '../../utils/taskFormHelpers.js';

function ReferentCheckboxItem({ candidate, selectedIds, terms, onToggle }) {
  const cid = String(candidate.id || '').trim();
  return (
    <label key={cid} className="task-form-pick-item">
      <input
        type="checkbox"
        className="task-form-pick-checkbox"
        checked={(selectedIds || []).includes(cid)}
        onChange={() => onToggle(cid)}
      />
      <span className="task-form-pick-text">
        👤 {referentCandidateLabel(candidate)}
        <span style={{ opacity: 0.75, fontSize: '.78rem' }}> — {referentRoleHint(candidate, terms)}</span>
      </span>
    </label>
  );
}

/**
 * Champ « Référents » du formulaire de tâche (feuille prop-driven).
 *
 * Extrait de `TaskFormModal` (O6) : recherche + listes filtrées équipe/élèves
 * avec cases à cocher. Les listes filtrées, le compteur, la recherche et la
 * sélection (`selectedIds`/`onToggle`/`onClear`) restent détenus par le parent.
 */
export function TaskFormReferentsField({
  terms,
  candidates = [],
  search,
  onSearchChange,
  selectedCount,
  filteredTeacher = [],
  filteredStudent = [],
  selectedIds = [],
  onToggle,
  onClear,
}) {
  return (
    <div className="field">
      <label>Référents (optionnel)</label>
      <p style={{ fontSize: '.8rem', color: '#555', margin: '0 0 8px', lineHeight: 1.45 }}>
        Elles figurent sur la fiche : les {terms.studentPlural} savent vers qui se tourner en cas de question.
      </p>
      {candidates.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="🔍 Filtrer par nom…"
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.8rem', color: '#666' }}>
              {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClear}
            >
              Effacer les référents
            </button>
          </div>
        </div>
      )}
      <div className="task-form-pick-list">
        {candidates.length === 0 ? (
          <p className="task-form-pick-empty">Chargement de la liste des utilisateurs ou aucun compte actif.</p>
        ) : (
          <>
            {filteredTeacher.length > 0 && (
              <>
                <div className="task-form-pick-subheading" aria-hidden="true">Équipe pédagogique</div>
                {filteredTeacher.map((c) => (
                  <ReferentCheckboxItem
                    key={String(c.id || '').trim()}
                    candidate={c}
                    selectedIds={selectedIds}
                    terms={terms}
                    onToggle={onToggle}
                  />
                ))}
              </>
            )}
            {filteredStudent.length > 0 && (
              <>
                <div className="task-form-pick-subheading" aria-hidden="true">
                  {terms.studentPlural.charAt(0).toUpperCase() + terms.studentPlural.slice(1)}
                </div>
                {filteredStudent.map((c) => (
                  <ReferentCheckboxItem
                    key={String(c.id || '').trim()}
                    candidate={c}
                    selectedIds={selectedIds}
                    terms={terms}
                    onToggle={onToggle}
                  />
                ))}
              </>
            )}
            {filteredTeacher.length === 0 && filteredStudent.length === 0 && (
              <p className="task-form-pick-empty">Aucun résultat pour ce filtre.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
