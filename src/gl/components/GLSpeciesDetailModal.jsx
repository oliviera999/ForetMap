import React, { useCallback, useMemo, useState } from 'react';
import { GLGlossaryInlineText } from './GLGlossaryMarkdown.jsx';
import { DialogShell } from '../../components/DialogShell.jsx';
import {
  GL_SPECIES_DETAIL_SECTIONS,
  GL_SPECIES_TYPE_LABELS,
  formatGlSpeciesFieldValue,
  getGlSpeciesFieldLabel,
  hasGlSpeciesFieldValue,
  isGlSpeciesUrlField,
} from '../utils/glSpeciesFieldLabels.js';
import { mergeGlossaryLinkItems } from '../../utils/glGlossaryAutolink.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';
import { GLJournalImportButton } from './GLJournalImportButton.jsx';
import { GLFeuilletDiscoveryPopover } from './GLFeuilletDiscoveryPopover.jsx';
import { apiGL } from '../services/apiGL.js';

function SpeciesFieldValue({
  fieldKey,
  value,
  biomeNom,
  species,
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const formatted = formatGlSpeciesFieldValue(fieldKey, value, { biomeNom });
  if (!formatted) return null;

  if (fieldKey === 'wikipedia_url') {
    const wikiTitle = formatGlSpeciesFieldValue('wikipedia_title', species?.wikipedia_title);
    const linkLabel = wikiTitle || 'Article Wikipedia';
    return (
      <a href={formatted} target="_blank" rel="noopener noreferrer">
        {linkLabel}
      </a>
    );
  }

  if (isGlSpeciesUrlField(fieldKey)) {
    return (
      <a href={formatted} target="_blank" rel="noopener noreferrer">
        {formatted}
      </a>
    );
  }

  return (
    <GLGlossaryInlineText
      text={formatted}
      glossaryItems={glossaryLinkItems}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
    />
  );
}

function buildSpeciesDetailRows(species, fields, biomeNom, glossaryLinkItems, onOpenGlossaryTerm) {
  return fields
    .map((key) => {
      if (key === 'wikipedia_title' && hasGlSpeciesFieldValue(species.wikipedia_url)) {
        return null;
      }
      const value = species[key];
      if (!hasGlSpeciesFieldValue(value)) return null;
      return (
        <div key={key} className="gl-species-detail-modal__row">
          <dt>{getGlSpeciesFieldLabel(key)}</dt>
          <dd>
            <SpeciesFieldValue
              fieldKey={key}
              value={value}
              biomeNom={biomeNom}
              species={species}
              glossaryLinkItems={glossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          </dd>
        </div>
      );
    })
    .filter(Boolean);
}

function SpeciesDetailFieldsSection({
  title,
  species,
  fields,
  biomeNom,
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const rows = buildSpeciesDetailRows(
    species,
    fields,
    biomeNom,
    glossaryLinkItems,
    onOpenGlossaryTerm,
  );
  if (rows.length === 0) return null;
  return (
    <section className="gl-species-detail-modal__section">
      <h3>{title}</h3>
      <dl className="gl-species-detail-modal__dl">{rows}</dl>
    </section>
  );
}

function SpeciesGlossarySection({ species, glossaryTerms, onOpenGlossaryTerm, glossaryLinkItems }) {
  const hasMotsCles = hasGlSpeciesFieldValue(species.mots_cles);
  if (glossaryTerms.length === 0 && !hasMotsCles) return null;
  return (
    <section className="gl-species-detail-modal__section">
      <h3>Glossaire</h3>
      {glossaryTerms.length > 0 ? (
        <div className="gl-species-detail-modal__glossary">
          <p className="gl-species-detail-modal__glossary-label">Termes liés</p>
          <div className="gl-glossary-chips">
            {glossaryTerms.map((term) => (
              <button
                key={term.glossary_code}
                type="button"
                className="gl-glossary-chip"
                onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
              >
                {term.terme}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {hasMotsCles ? (
        <dl className="gl-species-detail-modal__dl">
          <div className="gl-species-detail-modal__row">
            <dt>{getGlSpeciesFieldLabel('mots_cles')}</dt>
            <dd>
              <GLGlossaryInlineText
                text={String(species.mots_cles).trim()}
                glossaryItems={glossaryLinkItems}
                onOpenGlossaryTerm={onOpenGlossaryTerm}
              />
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

/**
 * @param {{
 *   species: Record<string, unknown> | null,
 *   biomeNom?: string,
 *   gameId?: number | null,
 *   loreCarnetEnabled?: boolean,
 *   onClose: () => void,
 *   onOpenGlossaryTerm?: (code: string) => void,
 *   glossaryLinkItems?: Array<{ glossary_code?: string, terme?: string, variantes?: string }>,
 * }} props
 */
export function GLSpeciesDetailModal({
  species,
  biomeNom = '',
  gameId = null,
  loreCarnetEnabled = false,
  onClose,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  learningProgress,
}) {
  const [feuilletDiscovery, setFeuilletDiscovery] = useState(null);

  const acknowledgeBody = useMemo(() => {
    if (!loreCarnetEnabled || !gameId) return undefined;
    return { gameId: Number(gameId) };
  }, [gameId, loreCarnetEnabled]);

  const handleAcknowledged = useCallback(
    (data) => {
      const code = String(species?.species_code || '').trim();
      if (code) learningProgress?.markLocal?.('species', code);
      if (data?.feuilletRevealed) {
        setFeuilletDiscovery(data.feuilletRevealed);
      }
    },
    [learningProgress, species?.species_code],
  );

  const closeFeuilletDiscovery = useCallback(() => {
    setFeuilletDiscovery(null);
  }, []);

  const markFeuilletRead = useCallback(async () => {
    const code = feuilletDiscovery?.feuilletCode;
    if (!gameId || !code) return;
    try {
      await apiGL(
        `/api/gl/lore/games/${Number(gameId)}/feuillets/${encodeURIComponent(code)}/read`,
        'POST',
        {},
      );
    } catch (_) {
      /* lecture best-effort */
    }
  }, [feuilletDiscovery?.feuilletCode, gameId]);

  const glossaryTerms = Array.isArray(species?.glossaryTerms) ? species.glossaryTerms : [];
  const mergedGlossaryLinkItems = useMemo(
    () => mergeGlossaryLinkItems(glossaryLinkItems, glossaryTerms),
    [glossaryLinkItems, glossaryTerms],
  );

  if (!species) return null;

  const nomCommun = String(species.nom_commun || '').trim() || 'Espèce';
  const typeLabel = GL_SPECIES_TYPE_LABELS[species.type === 'flore' ? 'flore' : 'faune'] || '';
  const speciesCode = String(species.species_code || '').trim();
  const isLearned = learningProgress?.isSpeciesLearned?.(speciesCode) || !!species.learned;

  return (
    <>
      <DialogShell
        open={!!species}
        onClose={onClose}
        overlayClassName="fm-modal-overlay gl-species-detail-modal"
        dialogClassName={`fm-modal-panel animate-pop gl-species-detail-modal__body${
          hasGlSpeciesFieldValue(species.photo_url)
            ? ' gl-species-detail-modal__body--has-photo'
            : ''
        }`}
        ariaLabelledBy="gl-species-detail-title"
      >
        <div className="gl-species-detail-modal__head">
          <div className="gl-species-detail-modal__head-text">
            <h2 id="gl-species-detail-title">{nomCommun}</h2>
            {hasGlSpeciesFieldValue(species.nom_scientifique) ? (
              <p className="gl-species-detail-modal__scientific">
                <em>{String(species.nom_scientifique).trim()}</em>
              </p>
            ) : null}
            <div className="gl-species-detail-modal__badges">
              {typeLabel ? (
                <span className="gl-species-detail-modal__badge">{typeLabel}</span>
              ) : null}
              {hasGlSpeciesFieldValue(species.groupe) ? (
                <span className="gl-species-detail-modal__badge">
                  {String(species.groupe).trim()}
                </span>
              ) : null}
              {hasGlSpeciesFieldValue(species.famille) ? (
                <span className="gl-species-detail-modal__badge">
                  {String(species.famille).trim()}
                </span>
              ) : null}
            </div>
          </div>
          <div className="gl-species-detail-modal__head-actions">
            {speciesCode && learningProgress ? (
              <GLLearningAcknowledgeButton
                acknowledgePath={`/api/gl/learning/species/${encodeURIComponent(speciesCode)}`}
                requestBody={acknowledgeBody}
                resourceType="species"
                resourceRef={speciesCode}
                itemTitle={nomCommun}
                labelAction="Marquer comme appris"
                labelDone="✓ Appris"
                titleDone="Tu as confirmé avoir étudié cette espèce"
                confirmIntro={
                  <>
                    En validant, tu confirmes avoir étudié la fiche de{' '}
                    <strong>« {nomCommun} »</strong>.
                  </>
                }
                confirmCheckboxLabel="Je confirme avoir lu et compris cette fiche espèce."
                isDone={isLearned}
                onAcknowledged={handleAcknowledged}
              />
            ) : null}
            {speciesCode ? (
              <GLJournalImportButton
                resourceType="species"
                resourceRef={speciesCode}
                title={nomCommun}
                learned={isLearned}
              />
            ) : null}
            <GLButton type="button" variant="secondary" onClick={onClose}>
              Fermer
            </GLButton>
          </div>
        </div>

        {hasGlSpeciesFieldValue(species.photo_url) ? (
          <figure className="gl-species-detail-modal__hero">
            <img src={String(species.photo_url).trim()} alt={nomCommun} />
            {hasGlSpeciesFieldValue(species.photo_credit) ||
            hasGlSpeciesFieldValue(species.photo_licence) ? (
              <figcaption>
                {[species.photo_credit, species.photo_licence]
                  .filter((v) => hasGlSpeciesFieldValue(v))
                  .join(' — ')}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        <div className="gl-species-detail-modal__scroll">
          {GL_SPECIES_DETAIL_SECTIONS.map((section) => (
            <SpeciesDetailFieldsSection
              key={section.id}
              title={section.title}
              species={species}
              fields={section.fields}
              biomeNom={biomeNom}
              glossaryLinkItems={mergedGlossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          ))}
          <SpeciesGlossarySection
            species={species}
            glossaryTerms={glossaryTerms}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            glossaryLinkItems={mergedGlossaryLinkItems}
          />
        </div>
      </DialogShell>
      <GLFeuilletDiscoveryPopover
        open={!!feuilletDiscovery}
        feuillet={feuilletDiscovery}
        onClose={closeFeuilletDiscovery}
        onMarkRead={markFeuilletRead}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        glossaryLinkItems={mergedGlossaryLinkItems}
      />
    </>
  );
}
