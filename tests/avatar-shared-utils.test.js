'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let avatarShared;

describe('avatar shared utils', () => {
  before(async () => {
    avatarShared = await import(
      pathToFileURL(join(__dirname, '../src/shared/profile/avatarUrl.js')).href
    );
  });

  it('normalise un chemin upload avatar', () => {
    assert.equal(avatarShared.normalizeAvatarPath('///students/1/a.png'), 'students/1/a.png');
    assert.equal(avatarShared.normalizeAvatarPath('   '), null);
  });

  it('le module partagé ne construit plus d’URL vers un service d’avatars tiers', () => {
    // Avatars par défaut ForetMap : dessinés par le serveur (`GET /api/users/:id/default-avatar`).
    assert.equal(avatarShared.buildDicebearAvatarUrl, undefined);
    assert.equal(
      avatarShared.buildUploadedAvatarUrl('students/1/a.png'),
      '/uploads/students/1/a.png',
    );
    assert.equal(avatarShared.buildUploadedAvatarUrl(null), null);
  });

  it('G&L (hors périmètre) garde son avatar par défaut à l’identique', async () => {
    const { getGlAvatarUrl } = await import(
      pathToFileURL(join(__dirname, '../src/gl/utils/glAvatar.js')).href
    );
    assert.equal(
      getGlAvatarUrl({ pseudo: 'eleve-42' }),
      'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=eleve-42&radius=50',
    );
    assert.equal(
      getGlAvatarUrl({ avatar_path: 'gl_players/1/a.png' }),
      '/uploads/gl_players/1/a.png',
    );
  });
});
