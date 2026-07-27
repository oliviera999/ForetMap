'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveActionNames,
  assignmentMatchesActor,
  ASSIGNMENT_MATCHES_STUDENT_SQL,
} = require('../lib/tasks/studentActionContext');

describe('resolveActionNames (anti-usurpation B1)', () => {
  it('priorise les noms de la fiche users sur le corps client', () => {
    const names = resolveActionNames({ first_name: 'Alice', last_name: 'Martin' }, 'Bob', 'Durand');
    assert.deepEqual(names, { firstName: 'Alice', lastName: 'Martin' });
  });

  it('accepte le corps client uniquement en repli si la fiche est vide', () => {
    const names = resolveActionNames({ first_name: '', last_name: null }, 'Bob', 'Durand');
    assert.deepEqual(names, { firstName: 'Bob', lastName: 'Durand' });
  });

  it('trim les deux sources', () => {
    const names = resolveActionNames(
      { first_name: '  Alice  ', last_name: ' Martin ' },
      '  X  ',
      '  Y  ',
    );
    assert.deepEqual(names, { firstName: 'Alice', lastName: 'Martin' });
  });
});

describe('assignmentMatchesActor (lignes héritées seulement par nom)', () => {
  it('apparie par student_id quand présent des deux côtés', () => {
    assert.equal(
      assignmentMatchesActor(
        { student_id: '10', student_first_name: 'Bob', student_last_name: 'Durand' },
        { studentId: '10', firstName: 'Alice', lastName: 'Martin' },
      ),
      true,
    );
  });

  it('ne laisse pas un nom client toucher une inscription avec student_id', () => {
    assert.equal(
      assignmentMatchesActor(
        { student_id: '20', student_first_name: 'Bob', student_last_name: 'Durand' },
        { studentId: '10', firstName: 'Bob', lastName: 'Durand' },
      ),
      false,
    );
  });

  it('apparie encore les lignes héritées (student_id NULL) par nom', () => {
    assert.equal(
      assignmentMatchesActor(
        { student_id: null, student_first_name: 'Hérité', student_last_name: 'SansCompte' },
        { studentId: '10', firstName: 'Hérité', lastName: 'SansCompte' },
      ),
      true,
    );
  });

  it('expose un fragment SQL borné aux lignes héritées', () => {
    assert.match(ASSIGNMENT_MATCHES_STUDENT_SQL, /student_id IS NULL/);
    assert.match(ASSIGNMENT_MATCHES_STUDENT_SQL, /student_first_name = \?/);
    assert.doesNotMatch(
      ASSIGNMENT_MATCHES_STUDENT_SQL,
      /OR \(student_first_name = \? AND student_last_name = \?\)/,
    );
  });
});
