import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { PlantRangeGauge } from '../pedago/PlantRangeGauge.jsx';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import { isVegetalCatalogEntry } from '../../utils/plantCatalogHelpers.js';

const TROPHIC_LABELS = {
  producteur: 'Producteur',
  consommateur: 'Consommateur',
  decomposeur: 'Décomposeur',
};

const HABITAT_LABELS = {
  terrestre: 'Terrestre',
  aquatique: 'Aquatique',
  les_deux: 'Terrestre & aquatique',
};

/**
 * Blocs d'affichage de synthèse d'une fiche plante — extraits de `foretmap-views.jsx` (O6).
 * Présentation pure (aucun état, aucun effet) à partir de l'objet `plant`.
 */

/** Taxonomie enrichie (`plant.taxonomy`). */
export function PlantTaxonomyLine({ plant }) {
  const tax = plant?.taxonomy;
  if (!tax || typeof tax !== 'object') return null;
  const parts = [tax.kingdom, tax.group, tax.family, tax.genus].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="plant-meta-item plant-taxonomy-line">
      <div className="plant-meta-label">Taxonomie</div>
      <p className="plant-meta-value">{parts.join(' › ')}</p>
    </div>
  );
}

/** Badges rôle trophique, comestibilité, habitat. */
export function PlantPedagoTraitBadges({ plant }) {
  const chips = [];
  const trophic = String(plant?.trophic_role || '').trim().toLowerCase();
  if (trophic && TROPHIC_LABELS[trophic]) {
    chips.push({ key: 'trophic', label: TROPHIC_LABELS[trophic], icon: '🔗' });
  }
  if (plant?.is_edible === 1 || plant?.is_edible === true) {
    chips.push({ key: 'edible', label: 'Comestible', icon: '🍽️' });
  } else if (plant?.is_edible === 0 || plant?.is_edible === false) {
    chips.push({ key: 'not-edible', label: 'Non comestible', icon: '⛔' });
  }
  const habitat = String(plant?.habitat_type || '').trim().toLowerCase();
  if (habitat && HABITAT_LABELS[habitat]) {
    chips.push({ key: 'habitat', label: HABITAT_LABELS[habitat], icon: '🏞️' });
  }
  if (chips.length === 0) return null;
  return (
    <div className="task-meta plant-pedago-traits">
      {chips.map((chip) => (
        <span key={chip.key} className="task-chip">
          {chip.icon} {chip.label}
        </span>
      ))}
    </div>
  );
}

/** Jauges pH et température (`plant.phRange`, `plant.tempRange`). */
export function PlantRangeGauges({ plant }) {
  const ph = plant?.phRange;
  const temp = plant?.tempRange;
  if (!ph && !temp) return null;
  return (
    <div className="plant-range-gauges">
      {ph ? (
        <PlantRangeGauge label="pH optimal" unit="" min={ph.min} max={ph.max} domainMin={0} domainMax={14} icon="🧪" />
      ) : null}
      {temp ? (
        <PlantRangeGauge
          label="Température idéale"
          unit="°C"
          min={temp.min}
          max={temp.max}
          domainMin={-5}
          domainMax={45}
          icon="🌡️"
        />
      ) : null}
    </div>
  );
}

/** Interactions, termes glossaire et lien réseau trophique (fetch API). */
export function PlantPedagoFetchedSections({
  plantId,
  onOpenPlant,
  onOpenGlossaryTerm,
  onNavigateToFoodWeb,
  onOpenQuizQuestion,
}) {
  const [interactions, setInteractions] = useState(null);
  const [glossaryTerms, setGlossaryTerms] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = Number(plantId);
    if (!Number.isFinite(id) || id <= 0) {
      setInteractions(null);
      setGlossaryTerms(null);
      setQuizQuestions(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [ix, gloss, quiz] = await Promise.all([
          api(`/api/plants/${id}/interactions`),
          api(`/api/plants/${id}/glossary-terms`),
          api(`/api/plants/${id}/quiz-questions`),
        ]);
        if (cancelled) return;
        setInteractions(ix);
        setGlossaryTerms(Array.isArray(gloss?.terms) ? gloss.terms : []);
        setQuizQuestions(Array.isArray(quiz?.questions) ? quiz.questions : []);
      } catch (_) {
        if (!cancelled) {
          setInteractions(null);
          setGlossaryTerms([]);
          setQuizQuestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  const hasInteractions =
    (interactions?.asSource?.length || 0) + (interactions?.asTarget?.length || 0) > 0;
  const hasGlossary = (glossaryTerms?.length || 0) > 0;
  const hasQuiz = (quizQuestions?.length || 0) > 0;
  if (!loading && !hasInteractions && !hasGlossary && !hasQuiz && !onNavigateToFoodWeb) return null;

  return (
    <div className="plant-pedago-sections">
      {onNavigateToFoodWeb ? (
        <div className="plant-pedago-sections__link-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigateToFoodWeb?.(plantId)}>
            🕸️ Voir le réseau trophique
          </button>
        </div>
      ) : null}

      {loading ? <p className="section-sub">Chargement des données pédagogiques…</p> : null}

      {!loading && hasGlossary ? (
        <div className="plant-pedago-sections__block">
          <div className="plant-meta-label">Termes glossaire</div>
          <div className="pedago-chip-row">
            {glossaryTerms.map((term) => (
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
        </div>
      ) : null}

      {!loading && hasQuiz ? (
        <div className="plant-pedago-sections__block">
          <div className="plant-meta-label">Questions quiz liées</div>
          <div className="pedago-chip-row">
            {quizQuestions.map((q) => (
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

      {!loading && hasInteractions ? (
        <div className="plant-pedago-sections__block">
          <div className="plant-meta-label">Interactions écologiques</div>
          <ul className="plant-pedago-interactions">
            {(interactions.asSource || []).map((row) => (
              <li key={`src-${row.id}`}>
                <span className="task-chip">{row.interaction_type}</span>
                {row.to_id ? (
                  <button type="button" className="pedago-inline-link" onClick={() => onOpenPlant?.(row.to_id)}>
                    → {row.to_emoji ? `${row.to_emoji} ` : ''}
                    {row.to_name}
                  </button>
                ) : (
                  <span>{row.description || '—'}</span>
                )}
              </li>
            ))}
            {(interactions.asTarget || []).map((row) => (
              <li key={`tgt-${row.id}`}>
                <button type="button" className="pedago-inline-link" onClick={() => onOpenPlant?.(row.from_id)}>
                  {row.from_emoji ? `${row.from_emoji} ` : ''}
                  {row.from_name}
                </button>
                <span className="task-chip">{row.interaction_type}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatPlantNumericRange(min, max, unit = '') {
  if (min == null && max == null) return '';
  const a = min != null ? Number(min) : null;
  const b = max != null ? Number(max) : null;
  if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo === hi) return unit ? `${lo}${unit}` : String(lo);
    return unit ? `${lo}-${hi}${unit}` : `${lo}-${hi}`;
  }
  const single = a != null && Number.isFinite(a) ? a : b;
  return single != null && Number.isFinite(single) ? (unit ? `${single}${unit}` : String(single)) : '';
}

/** Pastilles de synthèse (nutrition/nutriments, température, pH) — max 3 ; `null` si aucune. */
export function PlantSummaryBadges({ plant }) {
  const chips = [];
  const nutrition = normalizedPlantValue(plant.nutrition);
  const preferredNutrients = normalizedPlantValue(plant.preferred_nutrients);
  const temp = formatPlantNumericRange(plant.temp_min_c, plant.temp_max_c);
  const ph = formatPlantNumericRange(plant.ph_min, plant.ph_max);
  if (isVegetalCatalogEntry(plant)) {
    if (preferredNutrients) chips.push(`🍽️ ${preferredNutrients}`);
  } else if (nutrition) {
    chips.push(`🍽️ ${nutrition}`);
  }
  if (temp) chips.push(`🌡️ ${temp}°C`);
  if (ph) chips.push(`🧪 pH ${ph}`);
  if (chips.length === 0) return null;
  return (
    <div className="plant-badges">
      {chips.slice(0, 3).map((chip, idx) => (
        <span key={`plant-badge-${idx}-${chip}`} className="plant-badge">
          {chip}
        </span>
      ))}
    </div>
  );
}

/** Rôle écologique et utilité humaine, affichés à la suite de la description (hors blocs repliables). */
export function PlantEcosystemHumanLead({ plant }) {
  const role = normalizedPlantValue(plant.ecosystem_role);
  const utility = normalizedPlantValue(plant.human_utility);
  if (!role && !utility) return null;
  return (
    <div className="plant-ecology-lead">
      {role && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Rôle dans l'écosystème</div>
          <MarkdownContent className="plant-meta-value">{role}</MarkdownContent>
        </div>
      )}
      {utility && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Utilité pour l'être humain</div>
          <MarkdownContent className="plant-meta-value">{utility}</MarkdownContent>
        </div>
      )}
    </div>
  );
}
