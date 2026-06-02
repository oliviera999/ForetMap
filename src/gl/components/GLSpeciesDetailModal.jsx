import React, { useEffect } from 'react';
import {
  GL_SPECIES_DETAIL_SECTIONS,
  GL_SPECIES_TYPE_LABELS,
  formatGlSpeciesFieldValue,
  getGlSpeciesFieldLabel,
  hasGlSpeciesFieldValue,
  isGlSpeciesUrlField,
} from '../utils/glSpeciesFieldLabels.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';

function SpeciesFieldValue({ fieldKey, value, biomeNom, species }) {
  const formatted = formatGlSpeciesFieldValue(fieldKey, value, { biomeNom });
  if (!formatted) return null;

  if (fieldKey === 'wikipedia_url') {
    const wikiTitle = formatGlSpeciesFieldValue(
      'wikipedia_title',
      species?.wikipedia_title
    );
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

  return <span>{formatted}</span>;
}

function buildSpeciesDetailRows(species, fields, biomeNom) {
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
            />
          </dd>
        </div>
      );
    })
    .filter(Boolean);
}

function SpeciesDetailFieldsSection({ title, species, fields, biomeNom }) {
  const rows = buildSpeciesDetailRows(species, fields, biomeNom);
  if (rows.length === 0) return null;
  return (
    <section className="gl-species-detail-modal__section">
      <h3>{title}</h3>
      <dl className="gl-species-detail-modal__dl">{rows}</dl>
    </section>
  );
}

function SpeciesGlossarySection({ species, glossaryTerms, onOpenGlossaryTerm }) {
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
            <dd>{String(species.mots_cles).trim()}</dd>
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
 *   onClose: () => void,
 *   onOpenGlossaryTerm?: (code: string) => void,
 * }} props
 */
export function GLSpeciesDetailModal({
  species,
  biomeNom = '',
  onClose,
  onOpenGlossaryTerm,
  learningProgress,
}) {
  useEffect(() => {
    if (!species) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [species, onClose]);

  if (!species) return null;

  const nomCommun = String(species.nom_commun || '').trim() || 'Espèce';
  const typeLabel = GL_SPECIES_TYPE_LABELS[species.type === 'flore' ? 'flore' : 'faune'] || '';
  const glossaryTerms = Array.isArray(species.glossaryTerms) ? species.glossaryTerms : [];
  const speciesCode = String(species.species_code || '').trim();
  const isLearned = learningProgress?.isSpeciesLearned?.(speciesCode) || !!species.learned;

  return (
    <div
      className="gl-action-modal gl-species-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gl-species-detail-title"
      onClick={onClose}
    >
      <div
        className={`gl-action-modal-body gl-species-detail-modal__body${
          hasGlSpeciesFieldValue(species.photo_url) ? ' gl-species-detail-modal__body--has-photo' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
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
              {typeLabel ? <span className="gl-species-detail-modal__badge">{typeLabel}</span> : null}
              {hasGlSpeciesFieldValue(species.groupe) ? (
                <span className="gl-species-detail-modal__badge">{String(species.groupe).trim()}</span>
              ) : null}
              {hasGlSpeciesFieldValue(species.famille) ? (
                <span className="gl-species-detail-modal__badge">{String(species.famille).trim()}</span>
              ) : null}
            </div>
          </div>
          <div className="gl-species-detail-modal__head-actions">
            {speciesCode && learningProgress ? (
              <GLLearningAcknowledgeButton
                acknowledgePath={`/api/gl/learning/species/${encodeURIComponent(speciesCode)}`}
                itemTitle={nomCommun}
                labelAction="Marquer comme étudiée"
                labelDone="✓ Étudiée"
                titleDone="Tu as confirmé avoir étudié cette espèce"
                confirmIntro={(
                  <>
                    En validant, tu confirmes avoir étudié la fiche de
                    {' '}
                    <strong>« {nomCommun} »</strong>.
                  </>
                )}
                confirmCheckboxLabel="Je confirme avoir lu et compris cette fiche espèce."
                isDone={isLearned}
                onAcknowledged={() => learningProgress.markLocal('species', speciesCode)}
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
            {hasGlSpeciesFieldValue(species.photo_credit) || hasGlSpeciesFieldValue(species.photo_licence) ? (
              <figcaption>
                {[species.photo_credit, species.photo_licence].filter((v) => hasGlSpeciesFieldValue(v)).join(' — ')}
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
            />
          ))}
          <SpeciesGlossarySection
            species={species}
            glossaryTerms={glossaryTerms}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        </div>
      </div>
    </div>
  );
}
