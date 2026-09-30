'use strict';

// Test pur (sans BDD) de la garde des familles de médias privées sous `uploads/`.
// Verrouille le correctif de l'audit B2 : `observations/` et `task-logs/` ne doivent
// jamais être servis par le montage statique `/uploads`, qui contournerait l'autorisation
// portée par les routes API correspondantes. Constat RG4 (audit du 30/09/2026) : les
// photos et productions d'élèves (avatars, forum, commentaires, tâches, carnet G&L) ne sont
// lisibles que par URL signée (tests/security-audit-2026-09-30-uploads.test.js).

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
    assert.strictEqual(isPrivateUploadPath('/user-journal/abc/1-0.png'), true);
    assert.strictEqual(isPrivateUploadPath('observations/12_345.jpg'), true);
    for (const signedFamilyPath of [
      '/students/s1/avatar-1.png',
      '/student/s1/avatar-1.png',
      '/gl_players/4/avatar-1.png',
      '/forum-posts/42/1.jpg',
      '/gl-forum-posts/uuid/0.png',
      '/context-comments/7/1.jpg',
      '/tasks/t1.jpg',
      '/gl-player-journal/3/12-1790000000000-0.png',
    ]) {
      assert.strictEqual(isPrivateUploadPath(signedFamilyPath), true, signedFamilyPath);
    }
  });

  it('laisse passer les familles de contenu documentées dans docs/API.md', () => {
    for (const publicPath of [
      '/zones/z1/5.jpg',
      '/zones/z1/5.thumb.jpg',
      '/markers/m1/5.jpg',
      '/plants/3/photo-1.jpg',
      '/media-library/image/2026/05/x.png',
      '/media-thumbs/media-library/image/2026/05/x.thumb.jpg',
      '/visit_media/4.jpg',
      '/tutorials/2/cover-1.png',
      '/gl_chapters_maps/1.png',
      '/teacher/t1/avatar-1.png',
      '/gl_admins/1/avatar-1.png',
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
    assert.deepStrictEqual([...PRIVATE_UPLOAD_PREFIXES].sort(), [
      'context-comments',
      'forum-posts',
      'gl-forum-posts',
      'gl-player-journal',
      'gl_players',
      'observations',
      'student',
      'students',
      'task-logs',
      'tasks',
      'user-journal',
    ]);
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

  it('renvoie 403 sur une illustration du carnet unifié', async () => {
    const res = await request(buildApp()).get('/uploads/user-journal/u1/12-0.png').expect(403);
    assert.strictEqual(res.body.code, 'PRIVATE_UPLOAD');
  });

  it('renvoie 404 sur un avatar d’élève sans signature', async () => {
    const res = await request(buildApp()).get('/uploads/students/s1/avatar-1.png').expect(404);
    assert.strictEqual(res.body.code, undefined);
  });

  it('renvoie 404 sur un chemin avec remontée, même vers une famille publique', async () => {
    await request(buildApp()).get('/uploads/zones/..%2fzones%2fz1%2f5.jpg').expect(404);
  });

  it('sert normalement une photo de zone', async () => {
    const res = await request(buildApp()).get('/uploads/zones/z1/5.jpg').expect(200);
    assert.strictEqual(res.text, 'SERVED');
  });
});
