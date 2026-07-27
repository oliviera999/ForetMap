'use strict';

// Test pur (sans BDD) de la garde des familles de médias privées sous `uploads/`.
// Verrouille le correctif de l'audit B2 : `observations/` et `task-logs/` ne doivent
// jamais être servis par le montage statique `/uploads`, qui contournerait l'autorisation
// portée par les routes API correspondantes.

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');

const {
  PRIVATE_UPLOAD_PREFIXES,
  isPrivateUploadPath,
  createPrivateUploadsGuard,
} = require('../lib/uploadsPrivatePaths');

describe('uploadsPrivatePaths — classification des chemins', () => {
  it('marque les familles privées comme privées', () => {
    assert.strictEqual(isPrivateUploadPath('/observations/12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('/task-logs/7_99.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('observations/12_345.jpg'), true);
  });

  it('laisse passer les familles publiques documentées dans docs/API.md', () => {
    for (const publicPath of [
      '/zones/z1/5.jpg',
      '/zones/z1/5.thumb.jpg',
      '/markers/m1/5.jpg',
      '/tasks/t1.jpg',
      '/forum-posts/42/1.jpg',
      '/context-comments/7/1.jpg',
      '/students/avatar-1.png',
      '/media-library/image/2026/05/x.png',
      '/gl_chapters_maps/1.png',
    ]) {
      assert.strictEqual(isPrivateUploadPath(publicPath), false, publicPath);
    }
  });

  it('résiste aux variantes d’écriture du même chemin', () => {
    // Encodage pourcent (express.static décode avant de résoudre le fichier).
    assert.strictEqual(isPrivateUploadPath('/%6Fbservations/12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('/observations%2F12_345.jpg'), true);
    // Casse (systèmes de fichiers insensibles à la casse).
    assert.strictEqual(isPrivateUploadPath('/Observations/12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('/TASK-LOGS/7_99.jpg'), true);
    // Séparateurs et segments redondants.
    assert.strictEqual(isPrivateUploadPath('//observations//12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('/./observations/12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('\\observations\\12_345.jpg'), true);
  });

  it('refuse par défaut tout chemin contenant une remontée', () => {
    assert.strictEqual(isPrivateUploadPath('/zones/../observations/12_345.jpg'), true);
    assert.strictEqual(isPrivateUploadPath('/../uploads/observations/1.jpg'), true);
  });

  it('laisse passer la racine (listing déjà désactivé par `index: false`)', () => {
    assert.strictEqual(isPrivateUploadPath('/'), false);
    assert.strictEqual(isPrivateUploadPath(''), false);
  });

  it('expose la liste des préfixes privés', () => {
    assert.deepStrictEqual([...PRIVATE_UPLOAD_PREFIXES].sort(), ['observations', 'task-logs']);
  });
});

describe('createPrivateUploadsGuard — middleware express', () => {
  function buildApp() {
    const app = express();
    app.use('/uploads', createPrivateUploadsGuard());
    // Remplace `express.static` : si la garde laisse passer, on renvoie 200.
    app.use('/uploads', (req, res) => res.status(200).send('SERVED'));
    return app;
  }

  it('renvoie 403 sur une photo d’observation', async () => {
    const res = await request(buildApp()).get('/uploads/observations/12_345.jpg').expect(403);
    assert.strictEqual(res.body.code, 'PRIVATE_UPLOAD');
  });

  it('renvoie 403 sur une photo de journal de tâche', async () => {
    await request(buildApp()).get('/uploads/task-logs/7_99.jpg').expect(403);
  });

  it('sert normalement une photo de zone', async () => {
    const res = await request(buildApp()).get('/uploads/zones/z1/5.jpg').expect(200);
    assert.strictEqual(res.text, 'SERVED');
  });
});
