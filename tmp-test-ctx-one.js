require('./tests/helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('./server');
const { initSchema, execute } = require('./database');
const contextCommentsTest = require('./tests/context-comments.test.js');

test.before(async () => {
  await initSchema();
});

// Duplicate minimal parts — run plant+tutorial only
test('debug plant tutorial comment', async () => {
  const { registerStudent, teacherToken } = contextCommentsTest;
});
