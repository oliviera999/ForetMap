'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ORIGIN_STATUS_VALUES,
  normalizeOriginStatus,
  originStatusLabel,
} = require('../lib/plantOriginStatus');
const { syncNormalizedAndLegacyPlantFields } = require('../lib/plantPayloadSync');
const {
  PLANT_EXTRA_FIELDS,
  PLANT_COLUMNS,
  buildPlantPayload,
  mapImportRowToPlantShape,
} = require('../lib/plantsRouteHelpers');

describe('origin_status — statut biogéographique pédagogique', () => {
  it('est une colonne de fiche écrite par INSERT/UPDATE', () => {
    assert.ok(PLANT_EXTRA_FIELDS.includes('origin_status'));
    assert.ok(PLANT_COLUMNS.includes('origin_status'));
  });

  it('normalizeOriginStatus accepte clés, libellés FR et alias EN', () => {
    assert.equal(normalizeOriginStatus('indigene'), 'indigene');
    assert.equal(normalizeOriginStatus('Indigène'), 'indigene');
    assert.equal(normalizeOriginStatus('native'), 'indigene');
    assert.equal(normalizeOriginStatus('introduit'), 'introduit');
    assert.equal(normalizeOriginStatus('Introduite'), 'introduit');
    assert.equal(normalizeOriginStatus('introduced'), 'introduit');
    assert.equal(normalizeOriginStatus('envahissant'), 'envahissant');
    assert.equal(normalizeOriginStatus('invasive'), 'envahissant');
    assert.equal(normalizeOriginStatus('invasif'), 'envahissant');
    assert.equal(normalizeOriginStatus(''), null);
    assert.equal(normalizeOriginStatus('inconnu'), null);
  });

  it('originStatusLabel renvoie les libellés pédagogiques', () => {
    assert.equal(originStatusLabel('envahissant'), 'Envahissant');
    assert.equal(originStatusLabel('Indigène'), 'Indigène');
    assert.equal(originStatusLabel(''), '');
  });

  it('buildPlantPayload conserve et normalise origin_status', () => {
    const payload = buildPlantPayload({ name: 'Gambusie', origin_status: ' Invasive ' });
    assert.equal(payload.origin_status, 'envahissant');
    const empty = buildPlantPayload({ name: 'Ortie' });
    assert.equal(empty.origin_status, null);
  });

  it('syncNormalizedAndLegacyPlantFields refuse les valeurs hors ENUM', () => {
    const payload = syncNormalizedAndLegacyPlantFields({ origin_status: 'protégée' });
    assert.equal(payload.origin_status, null);
  });

  it('mapImportRowToPlantShape reconnaît les en-têtes FR', () => {
    const mapped = mapImportRowToPlantShape({
      Nom: 'Tilapia du Nil',
      'Statut biogéographique': 'introduit',
    });
    assert.equal(mapped.origin_status, 'introduit');
  });

  it('les trois valeurs canoniques sont stables', () => {
    assert.deepEqual([...ORIGIN_STATUS_VALUES], ['indigene', 'introduit', 'envahissant']);
  });
});

describe('iucn_status — statut Liste rouge UICN', () => {
  const {
    IUCN_STATUS_VALUES,
    normalizeIucnStatus,
    iucnStatusLabel,
    iucnStatusBadgeLabel,
  } = require('../lib/plantIucnStatus');

  it('est une colonne de fiche écrite par INSERT/UPDATE', () => {
    assert.ok(PLANT_EXTRA_FIELDS.includes('iucn_status'));
    assert.ok(PLANT_COLUMNS.includes('iucn_status'));
  });

  it('normalizeIucnStatus accepte codes, alias et préfixes', () => {
    assert.equal(normalizeIucnStatus('LC'), 'LC');
    assert.equal(normalizeIucnStatus('vu'), 'VU');
    assert.equal(normalizeIucnStatus('vulnerable'), 'VU');
    assert.equal(normalizeIucnStatus('Vulnérable'), 'VU');
    assert.equal(normalizeIucnStatus('en danger'), 'EN');
    assert.equal(normalizeIucnStatus('LC — Préoccupation mineure'), 'LC');
    assert.equal(normalizeIucnStatus(''), null);
    assert.equal(normalizeIucnStatus('XYZ'), null);
  });

  it('libellés pastille et filtre', () => {
    assert.equal(iucnStatusBadgeLabel('LC'), 'UICN LC');
    assert.match(iucnStatusLabel('VU'), /Vulnérable/);
  });

  it('buildPlantPayload normalise iucn_status', () => {
    const payload = buildPlantPayload({ name: 'Gambusie', iucn_status: ' least concern ' });
    assert.equal(payload.iucn_status, 'LC');
    assert.equal(buildPlantPayload({ name: 'Ortie' }).iucn_status, null);
  });

  it('mapImportRowToPlantShape reconnaît statut_iucn', () => {
    const mapped = mapImportRowToPlantShape({
      Nom: 'Arganier',
      statut_iucn: 'LC',
    });
    assert.equal(mapped.iucn_status, 'LC');
  });

  it('les neuf codes UICN sont stables', () => {
    assert.deepEqual(
      [...IUCN_STATUS_VALUES],
      ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'],
    );
  });
});
