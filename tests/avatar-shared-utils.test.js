'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let avatarShared;

describe('avatar shared utils', () => {
  before(async () => {
    avatarShared = await import(pathToFileURL(join(__dirname, '../src/shared/profile/avatarUrl.js')).href);
  });

  it('normalise un chemin upload avatar', () => {
    assert.equal(avatarShared.normalizeAvatarPath('///students/1/a.png'), 'students/1/a.png');
    assert.equal(avatarShared.normalizeAvatarPath('   '), null);
  });

  it('construit une URL Dicebear stable', () => {
    const url = avatarShared.buildDicebearAvatarUrl('eleve-42');
    assert.ok(url.includes('dicebear.com/9.x/adventurer-neutral/svg'));
    assert.ok(url.includes('seed=eleve-42'));
  });
});
