'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('taskActionErrors (client)', () => {
  it('formatTaskActionError — permission insuffisante', async () => {
    const { formatTaskActionError } = await import('../src/utils/taskActionErrors.js');
    assert.match(formatTaskActionError('Permission insuffisante'), /droit demandé/i);
  });

  it('formatTaskActionError — indisponibilité passerelle', async () => {
    const { formatTaskActionError } = await import('../src/utils/taskActionErrors.js');
    assert.match(
      formatTaskActionError(
        'Service momentanément indisponible (redémarrage ou surcharge réseau).',
      ),
      /quelques secondes/i,
    );
  });

  it('filterTeacherStatusActions — validate seul', async () => {
    const { filterTeacherStatusActions } = await import('../src/utils/taskActionErrors.js');
    const actions = [
      { value: 'done', label: 'Terminée', icon: '✅' },
      { value: 'validated', label: 'Validée', icon: '✔️' },
    ];
    const onlyValidate = filterTeacherStatusActions(actions, {
      canManageTasks: false,
      canValidateTasks: true,
    });
    assert.strictEqual(onlyValidate.length, 1);
    assert.strictEqual(onlyValidate[0].value, 'validated');
  });

  it('teacherStatusActionDisabled — validation refusée sans la permission', async () => {
    const { teacherStatusActionDisabled } = await import('../src/utils/taskActionErrors.js');
    const gate = teacherStatusActionDisabled('validated', {
      canManageTasks: true,
      canValidateTasks: false,
    });
    assert.strictEqual(gate.disabled, true);
    assert.match(gate.title, /non autorisée/i);
    const ok = teacherStatusActionDisabled('validated', {
      canManageTasks: true,
      canValidateTasks: true,
    });
    assert.strictEqual(ok.disabled, false);
  });
});
