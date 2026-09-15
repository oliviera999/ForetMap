'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isModuleEnabled, FM_MODULE_KEYS } = require('../lib/shared/moduleGate');
const {
  setModulesCacheForTests,
  DEFAULT_MODULES,
  invalidateModulesCache,
} = require('../lib/glSettings');

describe('moduleGate', () => {
  it('expose la clé FM presence', () => {
    assert.equal(FM_MODULE_KEYS.presence, 'ui.modules.presence_enabled');
  });

  it('GL forum / presence lisent getGlModulesSettings (snapshot test)', async () => {
    setModulesCacheForTests({ ...DEFAULT_MODULES, forumEnabled: false, presenceEnabled: true });
    try {
      assert.equal(await isModuleEnabled('gl', 'forum'), false);
      assert.equal(await isModuleEnabled('gl', 'presence'), true);
    } finally {
      invalidateModulesCache();
    }
  });
});
