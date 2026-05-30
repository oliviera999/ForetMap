'use strict';

const {
  normalizeEventConfig,
  serializeEventConfig,
  eventConfigToLegacyMirror,
  resolveMarkerEventConfig,
  isQuestionMarker,
} = require('./glMarkerEventConfig');

const MARKER_SELECT = `
  id, chapter_id, x_pct, y_pct, event_type, label, description,
  qcm_categorie_slug, qcm_question_code, event_config_json, order_index
`;

function formatMarkerRow(row) {
  if (!row) return null;
  const eventConfig = resolveMarkerEventConfig(row);
  return {
    id: Number(row.id),
    chapter_id: Number(row.chapter_id),
    x_pct: Number(row.x_pct),
    y_pct: Number(row.y_pct),
    event_type: row.event_type,
    label: row.label,
    description: row.description,
    qcm_categorie_slug: row.qcm_categorie_slug,
    qcm_question_code: row.qcm_question_code,
    order_index: Number(row.order_index || 0),
    event_config: eventConfig,
  };
}

function parseEventConfigInput(body) {
  if (!body || typeof body !== 'object') return { eventConfig: null, error: null, skip: true };
  if (!Object.prototype.hasOwnProperty.call(body, 'eventConfig')) {
    return { eventConfig: null, error: null, skip: true };
  }
  const normalized = normalizeEventConfig(body.eventConfig);
  if (body.eventConfig != null && !normalized) {
    return { eventConfig: null, error: 'eventConfig invalide', skip: false };
  }
  return { eventConfig: normalized, error: null, skip: false };
}

function buildMarkerWriteFields({ eventType, description, orderIndex, eventConfig, legacy }) {
  const mirror = eventConfig ? eventConfigToLegacyMirror(eventConfig) : {
    qcmCategorieSlug: legacy?.qcmCategorieSlug ?? null,
    qcmQuestionCode: legacy?.qcmQuestionCode ?? null,
  };
  return {
    eventType: eventType ?? null,
    description: description ?? null,
    orderIndex: orderIndex ?? 0,
    eventConfigJson: eventConfig ? serializeEventConfig(eventConfig) : null,
    qcmCategorieSlug: mirror.qcmCategorieSlug,
    qcmQuestionCode: mirror.qcmQuestionCode,
  };
}

module.exports = {
  MARKER_SELECT,
  formatMarkerRow,
  parseEventConfigInput,
  buildMarkerWriteFields,
  isQuestionMarker,
};
