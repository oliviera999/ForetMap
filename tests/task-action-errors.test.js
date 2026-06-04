'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('taskActionErrors (client)', () => {
  it('formatTaskActionError — élévation PIN', async () => {
    const { formatTaskActionError } = await import('../src/utils/taskActionErrors.js');
    assert.match(
      formatTaskActionError('Élévation PIN requise'),
      /cadenas/i
    );
  });

  it('formatTaskActionError — indisponibilité passerelle', async () => {
    const { formatTaskActionError } = await import('../src/utils/taskActionErrors.js');
    assert.match(
      formatTaskActionError('Service momentanément indisponible (redémarrage ou surcharge réseau).'),
      /quelques secondes/i
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

  it('teacherStatusActionDisabled — élévation requise pour validée', async () => {
    const { teacherStatusActionDisabled } = await import('../src/utils/taskActionErrors.js');
    const gate = teacherStatusActionDisabled('validated', {
      canManageTasks: true,
      canValidateTasks: true,
      hasActiveManage: true,
      hasActiveValidate: false,
    });
    assert.strictEqual(gate.disabled, true);
    assert.match(gate.title, /cadenas/i);
  });
});
