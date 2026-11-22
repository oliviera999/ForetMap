import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { GlossaryTermLearnedAcknowledgeButton } from './GlossaryTermLearnedAcknowledge.jsx';
import { curriculumNiveauLabel } from '../../utils/curriculumNotions.js';
import { GLOSSARY_NIVEAU_LABELS } from '../../shared/glossary/glossaryCardCore.js';

/**
 * Rangée de boutons vers d'autres termes (« Voir aussi », « Termes liés »).
 * @param {{ title: string, terms: Array<{ glossary_code: string, terme: string }>,
 *   keyPrefix?: string, onSelectTerm: (code: string) => void }} props
 */
function GlossaryTermChips({ title, terms, keyPrefix = '', onSelectTerm }) {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  return (
    <div className="pedago-remediation fm-glossary-detail__section">
      <strong>{title}</strong>
      <div className="pedago-chip-row">
        {terms.map((term) => (
          <button
            key={`${keyPrefix}${term.glossary_code}`}
            type="button"
            className="pedago-chip-btn"
            onClick={() => onSelectTerm(term.glossary_code)}
          >
            {term.terme}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Bloc Markdown auto-lié d'une fiche (exemple, étymologie) sous son intitulé.
 * @param {{ label: string, children: string, glossaryItems: any[],
 *   onSelectTerm: (code: string) => void, tight?: boolean }} props
 */
function GlossaryDetailExtra({ label, children, glossaryItems, onSelectTerm, tight = false }) {
  if (!children) return null;
  return (
    <div
      className={`plant-meta-item fm-glossary-detail__extra${tight ? ' fm-glossary-detail__extra--tight' : ''}`}
    >
      <div className="plant-meta-label">{label}</div>
      <GlossaryMarkdown
        className="plant-meta-value"
        glossaryItems={glossaryItems}
        onOpenGlossaryTerm={onSelectTerm}
      >
        {children}
      </GlossaryMarkdown>
    </div>
  );
}

/**
 * Fiche d'un terme dans l'onglet Glossaire (extraite de `GlossaryView`, flux C2).
 *
 * La fiche reste **toujours consultable**, même pour un terme plus avancé que le palier de
 * l'élève (barrière de vocabulaire douce) : il porte alors la mention « Pour aller plus loin ».
 *
 * @param {object} props
 * @param {object} props.detail réponse de `GET /api/glossary/terms/:code`
 * @param {string} props.activeCode code demandé (repli si `detail.glossary_code` manque)
 * @param {any[]} props.autolinkItems index d'auto-lien (déjà filtré par palier)
 * @param {(code: string) => void} props.onSelectTerm navigation vers un autre terme
 * @param {Set<string>} props.learnedCodes termes déjà appris
 * @param {Map<string, object>} props.gatingSummaries résumés de conditionnement
 * @param {(code: string) => void} props.onAcknowledged terme validé
 * @param {boolean} [props.beyondPalier] terme hors du palier de l'élève
 */
export function GlossaryTermDetail({
  detail,
  activeCode,
  autolinkItems,
  onSelectTerm,
  learnedCodes,
  gatingSummaries,
  onAcknowledged,
  onForceLogout = null,
  onOpenPlant = null,
  onOpenQuizQuestion = null,
  beyondPalier = false,
}) {
  const code = String(detail.glossary_code || activeCode);
  return (
    <>
      <h3 className="pedago-panel-title">{detail.terme}</h3>
      <div className="task-meta fm-glossary-detail__meta">
        {detail.categorie ? <span className="task-chip">{detail.categorie}</span> : null}
        {detail.niveau ? (
          <span className="task-chip">
            {GLOSSARY_NIVEAU_LABELS[detail.niveau] || detail.niveau}
          </span>
        ) : null}
        {beyondPalier ? <span className="task-chip">Pour aller plus loin</span> : null}
        <GlossaryTermLearnedAcknowledgeButton
          glossaryCode={code}
          termLabel={detail.terme}
          isLearned={learnedCodes.has(code)}
          gatingSummary={gatingSummaries.get(code) || null}
          onAcknowledged={onAcknowledged}
          onForceLogout={onForceLogout}
        />
      </div>
      {detail.definition_courte ? (
        <p className="plant-row-desc">{detail.definition_courte}</p>
      ) : null}
      {detail.definition_complete ? (
        <GlossaryMarkdown
          className="plant-row-desc"
          glossaryItems={autolinkItems}
          onOpenGlossaryTerm={onSelectTerm}
        >
          {detail.definition_complete}
        </GlossaryMarkdown>
      ) : null}
      <GlossaryDetailExtra
        label="Exemple"
        glossaryItems={autolinkItems}
        onSelectTerm={onSelectTerm}
      >
        {detail.exemple}
      </GlossaryDetailExtra>
      <GlossaryDetailExtra
        label="Étymologie"
        glossaryItems={autolinkItems}
        onSelectTerm={onSelectTerm}
        tight
      >
        {detail.etymologie}
      </GlossaryDetailExtra>

      {detail.notions?.length > 0 ? (
        <div className="pedago-remediation fm-glossary-detail__section">
          <strong>Au programme</strong>
          <ul className="pedago-link-list">
            {detail.notions.map((n) => (
              <li key={n.id}>
                <strong>{curriculumNiveauLabel(n.niveau)}</strong> — {n.notion}
                {n.theme ? <span className="section-sub"> ({n.theme})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <GlossaryTermChips
        title="Voir aussi"
        terms={detail.incomingRelations}
        keyPrefix="in-"
        onSelectTerm={onSelectTerm}
      />
      <GlossaryTermChips
        title="Termes liés"
        terms={detail.relatedTerms}
        onSelectTerm={onSelectTerm}
      />

      {detail.linkedPlants?.length > 0 ? (
        <div className="pedago-remediation fm-glossary-detail__section">
          <strong>Espèces liées</strong>
          <div className="pedago-chip-row">
            {detail.linkedPlants.map((plant) => (
              <button
                key={plant.id}
                type="button"
                className="pedago-chip-btn"
                onClick={() => onOpenPlant?.(plant.id)}
              >
                {plant.emoji ? `${plant.emoji} ` : ''}
                {plant.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {detail.linkedTutorials?.length > 0 ? (
        <div className="pedago-remediation fm-glossary-detail__section">
          <strong>Tutoriels liés</strong>
          <ul className="pedago-link-list">
            {detail.linkedTutorials.map((tu) => (
              <li key={tu.id}>{tu.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.linkedQuizQuestions?.length > 0 ? (
        <div className="pedago-remediation fm-glossary-detail__section">
          <strong>Questions quiz</strong>
          <div className="pedago-chip-row">
            {detail.linkedQuizQuestions.map((q) => (
              <button
                key={q.question_code}
                type="button"
                className="pedago-chip-btn"
                onClick={() => onOpenQuizQuestion?.(q.question_code)}
              >
                {q.question_code}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
