import {
  POLLINATION_TYPE,
  evidenceLevelLabel,
  pollinationEfficacyLabel,
} from '../../shared/foodWebTypes.js';
import { edgeStyleForType } from '../../shared/foodWebEdgeStyle.js';
import { GlossaryInlineText } from '../GlossaryMarkdown.jsx';
import { IconEdit } from '../../shared/icons.jsx';
import { FoodWebEditForm } from './FoodWebEditForm.jsx';
import { describeRow } from './foodWebRows.js';

/**
 * Détail de la relation cliquée (sorti de `FoodWebView.jsx`, flux C3) : type, sens
 * écologique, description, qualité du lien, modification (professeur) puis termes de
 * glossaire. En mode graphe il est rendu sous le graphe (et non dans la colonne latérale
 * défilante, où le clic semblait sans effet).
 */
export function FoodWebEdgeDetail({
  selectedRow,
  typeLabel,
  showAdvanced,
  showPollinationEfficacy,
  glossaryIndex,
  onOpenGlossaryTerm,
  edgeGlossary,
  edgeLoading,
  canManage,
  admin,
  speciesOptions,
}) {
  const described = describeRow(selectedRow);
  return (
    <div className="card pedago-foodweb__glossary pedago-foodweb__glossary--panel">
      {described ? (
        <div className="pedago-foodweb__selected">
          <p className="pedago-foodweb__selected-title">
            <span
              className="pedago-foodweb__selected-dot pedago-foodweb__selected-dot--typed"
              aria-hidden="true"
              style={{ '--fw-edge-color': edgeStyleForType(selectedRow.interaction_type).color }}
            />
            {typeLabel(selectedRow.interaction_type)}
          </p>
          <p className="pedago-foodweb__selected-sentence">
            <strong>{described.tail.name}</strong>{' '}
            <span aria-hidden="true">{described.symmetric ? '↔' : '→'}</span> {described.relation}{' '}
            <strong>{described.head.name}</strong>
          </p>
          {selectedRow.description ? (
            <GlossaryInlineText
              tag="p"
              className="pedago-foodweb__desc"
              text={selectedRow.description}
              glossaryItems={glossaryIndex}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          ) : null}
          {/* Qualité du lien : l'élève doit pouvoir distinguer ce qui a été vu sur le site
              de ce qui est recopié d'une flore, ou simplement supposé. */}
          {showAdvanced ? (
            <p className="section-sub pedago-foodweb__quality">
              {evidenceLevelLabel(selectedRow.evidence_level)}
              {showPollinationEfficacy &&
              selectedRow.interaction_type === POLLINATION_TYPE &&
              selectedRow.pollination_efficacy ? (
                <> · {pollinationEfficacyLabel(selectedRow.pollination_efficacy)}</>
              ) : null}
              {selectedRow.source_ref ? <> · source : {selectedRow.source_ref}</> : null}
            </p>
          ) : null}
        </div>
      ) : null}
      {canManage && selectedRow ? (
        admin.editForm && admin.editForm.id === selectedRow.id ? (
          <FoodWebEditForm
            editForm={admin.editForm}
            setEditForm={admin.setEditForm}
            sourceName={selectedRow.from_name}
            speciesOptions={speciesOptions}
            editError={admin.editError}
            saving={admin.saving}
            onSubmit={admin.saveInteraction}
            onCancel={admin.cancelEdit}
          />
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm pedago-foodweb__edit-open"
            onClick={() => admin.startEdit(selectedRow)}
          >
            <IconEdit size={14} /> Modifier cette relation
          </button>
        )
      ) : null}
      {edgeLoading ? (
        <p className="section-sub">Glossaire…</p>
      ) : edgeGlossary.length === 0 ? (
        <p className="section-sub">Aucun terme glossaire lié.</p>
      ) : (
        <>
          <strong>Termes liés</strong>
          <div className="pedago-chip-row">
            {edgeGlossary.map((term) => (
              <button
                key={term.glossary_code}
                type="button"
                className="pedago-chip-btn"
                onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
              >
                {term.terme}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
