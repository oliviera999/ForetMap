'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  MAX_ARCHIVE_BYTES,
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  readAnalyzeUploadPayload,
  readApplyUploadPayload,
  getContentLibraryLimits,
  handleContentLibraryUploadError,
} = require('../lib/contentLibraryUpload');

function mockReq(overrides = {}) {
  return {
    headers: {},
    body: {},
    files: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('getContentLibraryLimits expose les tailles attendues', () => {
  const limits = getContentLibraryLimits();
  assert.ok(limits.maxArchiveBytes >= 50 * 1024 * 1024);
  assert.ok(limits.maxFileBytes >= 32 * 1024 * 1024);
  assert.strictEqual(limits.maxFileCount, MAX_FILE_COUNT);
});

test('readAnalyzeUploadPayload multipart — archive', () => {
  const buffer = Buffer.from('zip-content');
  const payload = readAnalyzeUploadPayload(mockReq({
    headers: { 'content-type': 'multipart/form-data; boundary=abc' },
    files: {
      archive: [{ originalname: 'lot.zip', buffer }],
    },
  }));
  assert.strictEqual(payload.transport, 'multipart');
  assert.strictEqual(payload.archive.fileName, 'lot.zip');
  assert.deepStrictEqual(payload.archive.buffer, buffer);
});

test('readAnalyzeUploadPayload multipart — fichiers', () => {
  const buffer = Buffer.from('png');
  const payload = readAnalyzeUploadPayload(mockReq({
    headers: { 'content-type': 'multipart/form-data; boundary=abc' },
    files: {
      files: [{ originalname: 'photo.png', buffer }],
    },
  }));
  assert.strictEqual(payload.transport, 'multipart');
  assert.strictEqual(payload.uploadedFiles.length, 1);
  assert.strictEqual(payload.uploadedFiles[0].fileName, 'photo.png');
});

test('readAnalyzeUploadPayload JSON legacy', () => {
  const payload = readAnalyzeUploadPayload(mockReq({
    headers: { 'content-type': 'application/json' },
    body: { files: [{ fileName: 'x.png' }] },
  }));
  assert.strictEqual(payload.transport, 'json');
  assert.deepStrictEqual(payload.body.files, [{ fileName: 'x.png' }]);
});

test('readApplyUploadPayload multipart — entries JSON', () => {
  const entries = [{ fileName: 'a.png', kind: 'media' }];
  const buffer = Buffer.from('png');
  const payload = readApplyUploadPayload(mockReq({
    headers: { 'content-type': 'multipart/form-data; boundary=abc' },
    body: { entries: JSON.stringify(entries) },
    files: {
      files: [{ originalname: 'a.png', buffer }],
    },
  }));
  assert.strictEqual(payload.transport, 'multipart');
  assert.deepStrictEqual(payload.entries, entries);
  assert.strictEqual(payload.uploadedFiles.length, 1);
});

test('handleContentLibraryUploadError renvoie 413 sur LIMIT_FILE_SIZE', () => {
  const res = mockRes();
  let forwarded = false;
  handleContentLibraryUploadError({ code: 'LIMIT_FILE_SIZE' }, mockReq(), res, () => {
    forwarded = true;
  });
  assert.strictEqual(res.statusCode, 413);
  assert.strictEqual(res.body.code, 'PAYLOAD_TOO_LARGE');
  assert.ok(!forwarded);
});

test('handleContentLibraryUploadError propage les erreurs inconnues', () => {
  const err = new Error('autre');
  let forwardedErr = null;
  handleContentLibraryUploadError(err, mockReq(), mockRes(), (nextErr) => {
    forwardedErr = nextErr;
  });
  assert.strictEqual(forwardedErr, err);
});

test('constantes par défaut — archive 50 Mo et fichier 32 Mo', () => {
  assert.strictEqual(MAX_ARCHIVE_BYTES, 50 * 1024 * 1024);
  assert.strictEqual(MAX_FILE_BYTES, 32 * 1024 * 1024);
});
