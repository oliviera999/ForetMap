'use strict';

// Helpers partagés FM/GL — upsert resource_gating_policy / gl_resource_gating_policy.

const layers = require('./shared/gatingPolicyLayersCore');

const POLICY_COLUMNS = [
  'mode',
  'required_correct',
  'enabled',
  'allowed_wrong_attempts',
  'max_questions_per_session',
  'retry_cooldown_days',
  'cooldown_scope',
  'granularity',
];

async function upsertGatingPolicy(db, { table, resourceType, resourceRef, body, existing, actor }) {
  const merged = layers.sanitizePolicyPatch(body, existing || {});
  const who = actor || { userType: null, userId: null };
  await db.execute(
    `INSERT INTO ${table}
      (resource_type, resource_ref, mode, required_correct, enabled,
       allowed_wrong_attempts, max_questions_per_session, retry_cooldown_days,
       cooldown_scope, granularity,
       updated_by_user_type, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       mode = VALUES(mode),
       required_correct = VALUES(required_correct),
       enabled = VALUES(enabled),
       allowed_wrong_attempts = VALUES(allowed_wrong_attempts),
       max_questions_per_session = VALUES(max_questions_per_session),
       retry_cooldown_days = VALUES(retry_cooldown_days),
       cooldown_scope = VALUES(cooldown_scope),
       granularity = VALUES(granularity),
       updated_by_user_type = VALUES(updated_by_user_type),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = NOW()`,
    [
      resourceType,
      resourceRef,
      merged.mode,
      merged.required_correct,
      merged.enabled,
      merged.allowed_wrong_attempts,
      merged.max_questions_per_session,
      merged.retry_cooldown_days,
      merged.cooldown_scope,
      merged.granularity,
      who.userType,
      who.userId,
    ],
  );
  return db.queryOne(
    `SELECT * FROM ${table} WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
    [resourceType, resourceRef],
  );
}

async function loadPolicyBundle(
  db,
  { table, resourceType, resourceRef, site, product, chapterGranularity },
) {
  const perResource = await db.queryOne(
    `SELECT * FROM ${table} WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
    [resourceType, resourceRef],
  );
  const typePolicy = await db.queryOne(
    `SELECT * FROM ${table} WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
    [resourceType, '*'],
  );
  return layers.formatPolicyResponse({
    policy: perResource,
    typePolicy,
    site,
    product,
    resourceType,
    effective: layers.resolveEffectiveGatingPolicy({
      perResource,
      typePolicy,
      site,
      product,
      resourceType,
      chapterGranularity: chapterGranularity || null,
    }),
  });
}

module.exports = {
  POLICY_COLUMNS,
  upsertGatingPolicy,
  loadPolicyBundle,
};
