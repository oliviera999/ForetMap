'use strict';

const { queryOne } = require('../database');

function normalizeClassId(value) {
  const classId = Number(value);
  return Number.isFinite(classId) && classId > 0 ? classId : null;
}

function normalizePlayerId(value) {
  const playerId = Number(value);
  return Number.isFinite(playerId) && playerId > 0 ? playerId : null;
}

async function isGlPlayerInClass(auth, classId) {
  const normalizedClassId = normalizeClassId(classId);
  const playerId = normalizePlayerId(auth?.userId);
  if (!normalizedClassId || !playerId) return false;

  const row = await queryOne(
    'SELECT 1 AS ok FROM gl_players WHERE id = ? AND class_id = ? AND is_active = 1 LIMIT 1',
    [playerId, normalizedClassId],
  );
  return !!row;
}

async function canAccessGlClass(auth, classId) {
  if (!auth || String(auth.product || '').toLowerCase() !== 'gl') return false;
  const userType = String(auth.userType || '');
  if (userType === 'gl_admin') return true;
  if (userType !== 'gl_player') return false;
  return isGlPlayerInClass(auth, classId);
}

module.exports = {
  canAccessGlClass,
  isGlPlayerInClass,
  normalizeClassId,
};
