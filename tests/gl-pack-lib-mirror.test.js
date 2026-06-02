'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getGlMascotPackLibProbe } = require('../lib/glPackValidatorResolve');

test('gl-pack : miroir lib présent et aligné sur src/utils/glMascotPack.js', () => {
  const probe = getGlMascotPackLibProbe();
  assert.ok(probe.libMirrorOk, 'lib/gl-pack/mascotPack.js attendu');
  const root = path.resolve(__dirname, '..');
  const srcPath = path.join(root, 'src', 'utils', 'glMascotPack.js');
  const libPath = path.join(root, 'lib', 'gl-pack', 'mascotPack.js');
  assert.ok(fs.existsSync(srcPath));
  assert.ok(fs.existsSync(libPath));
  const src = fs.readFileSync(srcPath, 'utf8');
  const lib = fs.readFileSync(libPath, 'utf8');
  assert.match(src, /export const glMascotPackSchema/);
  assert.match(lib, /glMascotPackSchema/);
  assert.match(lib, /validateGlMascotPack/);
});
