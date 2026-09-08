'use strict';

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let mod;

before(async () => {
  mod = await import(pathToFileURL(join(__dirname, '../src/utils/moodleAdminReport.js')).href);
});

describe('moodleAdminReport (logique pure de l’onglet Moodle)', () => {
  it('canApplyAfterDryRun : exige une simulation réussie, non bloquée, sur le même périmètre', () => {
    const base = {
      mode: 'dry_run',
      status: 'succeeded',
      report: {
        scope: { cohortIds: [603, 604], teams: false },
        thresholds: { blocked: false },
        upstreamErrors: [],
      },
    };
    assert.equal(mod.canApplyAfterDryRun({ lastDryRun: null, selectedCohortIds: [603] }).ok, false);
    assert.equal(
      mod.canApplyAfterDryRun({ lastDryRun: base, selectedCohortIds: [604, 603] }).ok,
      true,
    );
    assert.equal(mod.canApplyAfterDryRun({ lastDryRun: base, selectedCohortIds: [603] }).ok, false);
    assert.equal(
      mod.canApplyAfterDryRun({ lastDryRun: base, selectedCohortIds: [603, 604], teams: true }).ok,
      false,
    );
    assert.equal(
      mod.canApplyAfterDryRun({
        lastDryRun: { ...base, status: 'aborted' },
        selectedCohortIds: [603, 604],
      }).ok,
      false,
    );
    const blocked = { ...base, report: { ...base.report, thresholds: { blocked: true } } };
    assert.match(
      mod.canApplyAfterDryRun({ lastDryRun: blocked, selectedCohortIds: [603, 604] }).reason,
      /seuil/,
    );
    const upstream = { ...base, report: { ...base.report, upstreamErrors: [{ code: 'x' }] } };
    assert.match(
      mod.canApplyAfterDryRun({ lastDryRun: upstream, selectedCohortIds: [603, 604] }).reason,
      /amont/,
    );
    assert.equal(
      mod.canApplyAfterDryRun({
        lastDryRun: { ...base, mode: 'apply' },
        selectedCohortIds: [603, 604],
      }).ok,
      false,
    );
  });

  it('summarizeTotals : lignes dans l’ordre, zéro par défaut, attention sur les compteurs sensibles', () => {
    const rows = mod.summarizeTotals({ creations: 2, conflicts: 1 });
    assert.equal(rows[0].key, 'membersProcessed');
    assert.equal(rows[0].value, 0);
    assert.equal(rows.find((r) => r.key === 'creations').attention, false);
    assert.equal(rows.find((r) => r.key === 'conflicts').attention, true);
    assert.equal(rows.find((r) => r.key === 'deactivations').attention, false);
  });

  it('validatePoliciesDraft : clé, doublon, motif vide, regex invalide', () => {
    const ok = [
      { key: 'a', pattern: '^{year}#\\d$' },
      { key: 'b', pattern: '^{year}#n3$' },
    ];
    assert.equal(mod.validatePoliciesDraft(ok), null);
    assert.match(mod.validatePoliciesDraft([{ key: '', pattern: 'x' }]), /clé invalide/);
    assert.match(
      mod.validatePoliciesDraft([
        { key: 'a', pattern: 'x' },
        { key: 'a', pattern: 'y' },
      ]),
      /double/,
    );
    assert.match(mod.validatePoliciesDraft([{ key: 'a', pattern: '  ' }]), /motif vide/);
    assert.match(
      mod.validatePoliciesDraft([{ key: 'a', pattern: '^{year}#(' }]),
      /régulière invalide/,
    );
    assert.match(mod.validatePoliciesDraft('nope'), /liste/);
  });

  it('chapterCoursesToRows / rowsToChapterCourses : aller-retour trié, lignes incomplètes ignorées', () => {
    const rows = mod.chapterCoursesToRows({ 3: 30, 1: 10, x: 5 });
    assert.deepEqual(rows, [
      { chapterId: 1, courseId: 10 },
      { chapterId: 3, courseId: 30 },
    ]);
    assert.deepEqual(
      mod.rowsToChapterCourses([
        ...rows,
        { chapterId: 4, courseId: '' },
        { chapterId: 5, courseId: '7' },
      ]),
      {
        1: 10,
        3: 30,
        5: 7,
      },
    );
  });

  it('libellés et affichages : membre, utilisateur, périmètre', () => {
    assert.equal(
      mod.memberDisplay({ firstName: 'Zoé', lastName: 'Martin', email: 'z@x.test' }),
      'Zoé Martin <z@x.test>',
    );
    assert.equal(mod.memberDisplay({ firstname: 'A', lastname: 'B' }), 'A B');
    assert.equal(mod.memberDisplay(null), '—');
    assert.equal(mod.userDisplay({ userId: 'u1', displayName: 'Zoé' }), 'Zoé');
    assert.equal(mod.userDisplay({ userId: 'u1' }), 'u1');
    assert.equal(
      mod.scopeSummary({ cohortIdnumbers: ['26#603'], teams: true, force: true }),
      '26#603 · équipes · forcé',
    );
    assert.equal(mod.scopeSummary({ cohortIdnumbers: [] }), 'aucune cohorte');
    assert.equal(mod.runStatusLabel('aborted'), 'Interrompue (seuil)');
    assert.equal(mod.conflictKindLabel('inconnu'), 'inconnu');
  });
});
