'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { tasksListItems } = require('./helpers/tasksListResponse');

describe('tasksListItems', () => {
  it('accepte un tableau legacy', () => {
    assert.deepStrictEqual(tasksListItems([{ id: 1 }]), [{ id: 1 }]);
  });

  it('extrait items d’une enveloppe paginée', () => {
    assert.deepStrictEqual(tasksListItems({ items: [{ id: 2 }], total: 1 }), [{ id: 2 }]);
  });

  it('renvoie [] pour un corps invalide', () => {
    assert.deepStrictEqual(tasksListItems(null), []);
    assert.deepStrictEqual(tasksListItems({}), []);
  });
});
