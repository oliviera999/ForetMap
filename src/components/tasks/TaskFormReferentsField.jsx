import { useState } from 'react';
import { referentCandidateLabel, referentRoleHint } from '../../utils/taskFormHelpers.js';
import { IconUser } from '../../shared/icons.jsx';
import './task-referents.css';

/** Message de confirmation du retrait d'un référent automatique (prompt R1, lot 6). */
export const AUTO_REFERENT_REMOVAL_MESSAGE =
  'Il ne sera plus proposé automatiquement pour cette série.';

function ReferentCheckboxItem({ candidate, selectedIds, terms, onToggle, isAuto }) {
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
        <IconUser size={14} /> {referentCandidateLabel(candidate)}
        <span style={{ opacity: 0.75, fontSize: 'var(--text-sm)' }}>
          {' '}
          — {referentRoleHint(candidate, terms)}
        </span>
        {isAuto && (
          <span
            className="task-referent-auto-pill"
            title="Référent automatique : a réalisé plusieurs fois cette tâche récurrente"
          >
            auto
          </span>
        )}
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
 *
 * `autoIds` : référents posés automatiquement (élèves référents des séries récurrentes) —
 * pastille « auto », et décocher l'un d'eux demande confirmation : le retrait enregistre un
 * refus côté serveur (il ne sera plus reproposé pour la série).
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
  autoIds = [],
  onToggle,
  onClear,
}) {
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const autoSet = new Set((autoIds || []).map((id) => String(id)));
  const handleToggle = (cid) => {
    if (autoSet.has(cid) && (selectedIds || []).includes(cid)) {
      setPendingRemoval(cid);
      return;
    }
    onToggle(cid);
  };
  const ALL = '__all__';
  const handleClear = () => {
    if ((selectedIds || []).some((id) => autoSet.has(String(id)))) {
      setPendingRemoval(ALL);
      return;
    }
    onClear();
  };
  const pendingCandidate =
    pendingRemoval && pendingRemoval !== ALL
      ? candidates.find((c) => String(c.id || '').trim() === pendingRemoval)
      : null;
  const pendingLabel =
    pendingRemoval === ALL
      ? 'tous les référents, dont des référents automatiques'
      : pendingCandidate
        ? referentCandidateLabel(pendingCandidate)
        : 'ce référent';
  const renderItem = (c) => {
    const cid = String(c.id || '').trim();
    return (
      <ReferentCheckboxItem
        key={cid}
        candidate={c}
        selectedIds={selectedIds}
        terms={terms}
        onToggle={handleToggle}
        isAuto={autoSet.has(cid)}
      />
    );
  };
  return (
    <div className="field">
      <label>Référents (optionnel)</label>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          margin: '0 0 8px',
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Elles figurent sur la fiche : les {terms.studentPlural} savent vers qui se tourner en cas de
        question.
      </p>
      {candidates.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filtrer par nom…"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
              {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>
              Effacer les référents
            </button>
          </div>
        </div>
      )}
      {pendingRemoval && (
        <div className="task-referent-confirm" role="alert">
          <span>{`Retirer ${pendingLabel}\u00a0? ${AUTO_REFERENT_REMOVAL_MESSAGE}`}</span>
          <div className="task-referent-confirm-actions">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                const id = pendingRemoval;
                setPendingRemoval(null);
                if (id === ALL) onClear();
                else onToggle(id);
              }}
            >
              Retirer
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPendingRemoval(null)}
            >
              Garder
            </button>
          </div>
        </div>
      )}
      <div className="task-form-pick-list">
        {candidates.length === 0 ? (
          <p className="task-form-pick-empty">
            Chargement de la liste des utilisateurs ou aucun compte actif.
          </p>
        ) : (
          <>
            {filteredTeacher.length > 0 && (
              <>
                <div className="task-form-pick-subheading" aria-hidden="true">
                  Équipe pédagogique
                </div>
                {filteredTeacher.map(renderItem)}
              </>
            )}
            {filteredStudent.length > 0 && (
              <>
                <div className="task-form-pick-subheading" aria-hidden="true">
                  {terms.studentPlural.charAt(0).toUpperCase() + terms.studentPlural.slice(1)}
                </div>
                {filteredStudent.map(renderItem)}
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
