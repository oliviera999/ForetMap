#!/usr/bin/env node
'use strict';

/**
 * Profilage mémoire des parcours suspects (LVE / hard_kills).
 *
 * Démarre un serveur Node enfant (MariaDB Docker déjà up), joue des rafales HTTP
 * ciblées, et mesure RSS + heap via /api/admin/diagnostics entre chaque scénario.
 *
 * Usage :
 *   node scripts/profile-memory-scenarios.js
 *   node scripts/profile-memory-scenarios.js --concurrency=12 --iters=8
 *
 * Prérequis : docker MariaDB, .env (DB_*, TEACHER_ADMIN_*, DEPLOY_SECRET).
 */

require('dotenv').config();

const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const path = require('node:path');
const { deploySecretFromEnv } = require('./lib/deploy-secret-from-env');
const { queryAll, queryOne, execute } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  signTokens,
} = require('../tests/helpers/glFixtures');
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');

const ROOT = path.resolve(__dirname, '..');
const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
const CONCURRENCY = Math.max(1, parseInt(argValue('--concurrency', '10'), 10) || 10);
const ITERS = Math.max(1, parseInt(argValue('--iters', '6'), 10) || 6);
const SETTLE_MS = Math.max(200, parseInt(argValue('--settle-ms', '800'), 10) || 800);

function argValue(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : fallback;
}

function request({ method = 'GET', urlPath, headers = {}, body = null, product = null }) {
  const u = new URL(urlPath, BASE);
  const payload =
    body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const h = {
    Accept: 'application/json',
    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
    ...headers,
  };
  if (product) h['X-Foretmap-Product'] = product;

  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        headers: h,
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buf.toString('utf8'));
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode,
            bytes: buf.length,
            json,
            ok: res.statusCode >= 200 && res.statusCode < 300,
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitReady(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await request({ urlPath: '/api/ready' });
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('Serveur non prêt (/api/ready)');
}

async function sampleMemory(secret) {
  const r = await request({
    urlPath: '/api/admin/diagnostics',
    headers: {
      'X-Deploy-Secret': secret,
      'User-Agent': 'ForetMap-MemProfile/1.0',
    },
  });
  if (!r.ok || !r.json?.memory) {
    throw new Error(`diagnostics HTTP ${r.status}`);
  }
  return {
    rssMb: Number(r.json.memory.rssMb) || 0,
    heapUsedMb: Number(r.json.memory.heapUsedMb) || 0,
    heapTotalMb: Number(r.json.memory.heapTotalMb) || 0,
    uptimeSeconds: Number(r.json.uptimeSeconds) || 0,
  };
}

async function burst(label, fn, { concurrency = CONCURRENCY, iters = ITERS } = {}) {
  const results = [];
  for (let i = 0; i < iters; i += 1) {
    const batch = Array.from({ length: concurrency }, () => fn());
    const settled = await Promise.allSettled(batch);
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value);
      else
        results.push({
          status: 0,
          bytes: 0,
          ok: false,
          error: String(s.reason?.message || s.reason),
        });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  const bytes = results.reduce((a, r) => a + (r.bytes || 0), 0);
  const statuses = {};
  for (const r of results) {
    const k = String(r.status || 'err');
    statuses[k] = (statuses[k] || 0) + 1;
  }
  return {
    label,
    requests: results.length,
    ok,
    fail: results.length - ok,
    totalResponseMb: Math.round((bytes / 1024 / 1024) * 100) / 100,
    avgResponseKb: results.length ? Math.round(bytes / results.length / 1024) : 0,
    statuses,
  };
}

async function runScenario(secret, name, fn, opts) {
  process.stdout.write(`  → ${name}… `);
  await sleep(SETTLE_MS);
  const before = await sampleMemory(secret);
  const t0 = Date.now();
  const stats = await burst(name, fn, opts);
  const elapsedMs = Date.now() - t0;
  await sleep(SETTLE_MS);
  const after = await sampleMemory(secret);
  const row = {
    name,
    elapsedMs,
    deltaRssMb: Math.round((after.rssMb - before.rssMb) * 100) / 100,
    deltaHeapMb: Math.round((after.heapUsedMb - before.heapUsedMb) * 100) / 100,
    before,
    after,
    ...stats,
  };
  console.log(
    `ΔRSS ${fmtDelta(row.deltaRssMb)} Mo · Δheap ${fmtDelta(row.deltaHeapMb)} Mo · ${row.ok}/${row.requests} ok · ${elapsedMs} ms`,
  );
  return row;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function ensureTeacherToken() {
  const email = String(process.env.TEACHER_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = String(process.env.TEACHER_ADMIN_PASSWORD || '');
  if (!email || !password) {
    throw new Error('TEACHER_ADMIN_EMAIL / TEACHER_ADMIN_PASSWORD requis dans .env');
  }

  let login = await request({
    method: 'POST',
    urlPath: '/api/auth/login',
    body: { identifier: email, password },
  });
  if (!login.ok || !login.json?.authToken) {
    // Seed inline (évite execFileSync bloqué par le pool MySQL du script seed).
    const bcrypt = require('bcryptjs');
    const crypto = require('node:crypto');
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const existing = await queryOne(
      "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email],
    );
    const displayName = (process.env.TEACHER_ADMIN_DISPLAY_NAME || 'n3boss').trim() || 'n3boss';
    if (existing) {
      await execute(
        "UPDATE users SET password_hash = ?, display_name = ?, is_active = 1, updated_at = NOW(), last_seen = ? WHERE id = ? AND user_type = 'teacher'",
        [hash, displayName, now, existing.id],
      );
    } else {
      await execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
        [crypto.randomUUID(), email, email.split('@')[0] || null, displayName, hash, now],
      );
    }
    login = await request({
      method: 'POST',
      urlPath: '/api/auth/login',
      body: { identifier: email, password },
    });
  }
  if (!login.ok || !login.json?.authToken) {
    throw new Error(`Login prof échoué HTTP ${login.status}: ${JSON.stringify(login.json)}`);
  }
  return login.json.authToken;
}

async function pickMapId() {
  const preferred = await queryOne(
    "SELECT id FROM maps WHERE id IN ('foret','n3') AND is_active = 1 ORDER BY FIELD(id,'foret','n3') LIMIT 1",
  );
  if (preferred?.id) return preferred.id;
  const any = await queryOne(
    'SELECT id FROM maps WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1',
  );
  return any?.id || 'foret';
}

async function prepareGlContext() {
  const stamp = Date.now();
  const admin = await createGlAdmin({ email: `mem.profile.${stamp}@ecole.local` });
  const klass = await createGlClass({ adminId: admin.id, name: `MemProfile ${stamp}` });
  const { chapter, marker } = await createGlChapterWithMarker({
    slug: `mem-profile-${stamp}`,
    title: `Mem profile ${stamp}`,
    markerLabel: 'Repere mem',
  });

  const fixedCode =
    (
      await queryOne(
        "SELECT question_code FROM gl_qcm_questions WHERE statut = 'actif' ORDER BY question_code ASC LIMIT 1",
      ).catch(() => null)
    )?.question_code || 'QCM0001';

  const eventConfig = serializeEventConfig({
    version: 1,
    question: {
      mode: 'fixed',
      fixedQuestionCode: fixedCode,
      pool: { biomeMode: 'chapter' },
    },
  });
  await execute(
    `UPDATE gl_chapter_markers
        SET event_type = 'question', event_config_json = ?
      WHERE id = ?`,
    [eventConfig, marker.id],
  );

  // Second repère (point) pour les déplacements
  await execute(
    `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index)
     VALUES (?, 70, 70, 'point', 'Point mem', 'p', 2)`,
    [chapter.id],
  );
  const pointMarker = await queryOne(
    "SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND event_type = 'point' ORDER BY id DESC LIMIT 1",
    [chapter.id],
  );

  const { game, teams } = await createGlGameWithTeams({
    classId: klass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Equipe Mem', type: 'gnome' }],
  });
  const team = teams[0];
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [marker.id, team.id]);

  await createGlPlayer({
    classId: klass.id,
    teamId: team.id,
    pseudo: `mem-player-${stamp}`,
    password: '1234',
  });
  const tokens = await signTokens({ adminId: admin.id });
  return {
    gameId: game.id,
    teamId: team.id,
    pointMarkerId: pointMarker?.id || marker.id,
    questionMarkerId: marker.id,
    mjToken: tokens.adminToken,
  };
}

function startServer() {
  const child = spawn(
    process.execPath,
    ['--expose-gc', 'server.js', '--foretmap-e2e-no-rate-limit'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FORETMAP_HTTP_LOG: 'off',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let bootLog = '';
  child.stdout.on('data', (d) => {
    bootLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    bootLog += d.toString();
  });
  child._bootLog = () => bootLog;
  return child;
}

function printReport(rows, baseline) {
  console.log('\n=== Profil mémoire — scénarios suspects (Docker/local) ===\n');
  console.log(
    `Baseline après boot : RSS ${baseline.rssMb} Mo · heap ${baseline.heapUsedMb}/${baseline.heapTotalMb} Mo`,
  );
  console.log(`Concurrence ${CONCURRENCY} · itérations ${ITERS} · settle ${SETTLE_MS} ms\n`);

  const sorted = [...rows].sort(
    (a, b) => b.deltaRssMb - a.deltaRssMb || b.deltaHeapMb - a.deltaHeapMb,
  );
  console.log(
    pad('Scénario', 36),
    pad('ΔRSS', 8),
    pad('Δheap', 8),
    pad('RSS fin', 8),
    pad('ok/req', 10),
    pad('Mo resp', 8),
    pad('ms', 7),
  );
  console.log('-'.repeat(90));
  for (const r of sorted) {
    console.log(
      pad(r.name, 36),
      pad(fmtDelta(r.deltaRssMb), 8),
      pad(fmtDelta(r.deltaHeapMb), 8),
      pad(String(r.after.rssMb), 8),
      pad(`${r.ok}/${r.requests}`, 10),
      pad(String(r.totalResponseMb), 8),
      pad(String(r.elapsedMs), 7),
    );
    if (r.fail > 0) {
      console.log(`   ↳ statuses=${JSON.stringify(r.statuses)}`);
    }
  }
  console.log(
    '\nInterprétation : ΔRSS élevé sous rafale = candidat LVE ; Mo resp élevé = réponses lourdes.',
  );
}

function pad(s, n) {
  const t = String(s);
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

function fmtDelta(n) {
  const v = Number(n) || 0;
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}

async function main() {
  const secret = deploySecretFromEnv();
  if (!secret) {
    console.error('DEPLOY_SECRET (ou alias) manquant dans .env');
    process.exit(1);
  }

  console.log('Démarrage serveur enfant…');
  const child = startServer();
  let exitCode = 0;
  try {
    await waitReady();
    console.log('Serveur prêt.');

    const teacherToken = await ensureTeacherToken();
    console.log('Auth prof OK.');
    const mapId = await pickMapId();
    console.log(`Carte retenue : ${mapId}`);

    const tutorialIds = (
      await queryAll('SELECT id FROM tutorials WHERE is_active = 1 ORDER BY id ASC LIMIT 40')
    ).map((r) => r.id);
    const quizCodes = (
      await queryAll("SELECT question_code FROM quiz_questions WHERE statut = 'actif' LIMIT 20")
    ).map((r) => r.question_code);
    console.log(`Tutoriels=${tutorialIds.length} · quiz FM=${quizCodes.length}`);

    let gl = null;
    try {
      gl = await prepareGlContext();
      console.log(`Contexte GL prêt : game=${gl.gameId} team=${gl.teamId}`);
    } catch (e) {
      console.warn(`Contexte GL non préparé : ${e.message}`);
    }

    console.log('Mesures en cours…');

    await sleep(SETTLE_MS);
    const baseline = await sampleMemory(secret);
    const rows = [];

    rows.push(
      await runScenario(secret, 'baseline_health', () => request({ urlPath: '/api/health' })),
    );

    rows.push(
      await runScenario(secret, 'visit_content', () =>
        request({ urlPath: `/api/visit/content?map_id=${encodeURIComponent(mapId)}` }),
      ),
    );

    rows.push(
      await runScenario(secret, 'visit_mascot_packs_list', () =>
        request({
          urlPath: '/api/visit/mascot-packs',
          headers: authHeaders(teacherToken),
        }),
      ),
    );

    // Export ZIP d’un pack existant (charge adm-zip + sérialisation)
    const onePack = await queryOne(
      'SELECT id FROM visit_mascot_packs ORDER BY CHAR_LENGTH(pack_json) DESC LIMIT 1',
    );
    if (onePack?.id) {
      rows.push(
        await runScenario(
          secret,
          'visit_mascot_pack_export_zip',
          () =>
            request({
              urlPath: `/api/visit/mascot-packs/${onePack.id}/export.zip`,
              headers: authHeaders(teacherToken),
            }),
          { concurrency: Math.min(4, CONCURRENCY), iters: Math.min(3, ITERS) },
        ),
      );
    }

    if (tutorialIds.length) {
      const refs = tutorialIds.slice(0, 20).join(',');
      rows.push(
        await runScenario(secret, 'learning_gating_summary_tutos', () =>
          request({
            urlPath: `/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${refs}`,
            headers: authHeaders(teacherToken),
          }),
        ),
      );
      rows.push(
        await runScenario(secret, 'learning_gating_challenge_tuto', () => {
          const id = tutorialIds[Math.floor(Math.random() * tutorialIds.length)];
          return request({
            urlPath: `/api/learning/gating/challenge?resourceType=tutorial&resourceRef=${id}`,
            headers: authHeaders(teacherToken),
          });
        }),
      );
    }

    if (quizCodes.length) {
      rows.push(
        await runScenario(secret, 'quiz_present', () => {
          const code = quizCodes[Math.floor(Math.random() * quizCodes.length)];
          return request({
            urlPath: `/api/quiz/questions/${encodeURIComponent(code)}/present`,
            headers: authHeaders(teacherToken),
          });
        }),
      );
      rows.push(
        await runScenario(secret, 'quiz_admin_list', () =>
          request({
            urlPath: '/api/quiz/admin/questions',
            headers: authHeaders(teacherToken),
          }),
        ),
      );
    }

    rows.push(
      await runScenario(secret, 'tutorials_list', () =>
        request({
          urlPath: '/api/tutorials',
          headers: authHeaders(teacherToken),
        }),
      ),
    );

    // Sync / polling type App
    rows.push(
      await runScenario(secret, 'app_poll_bundle', async () => {
        const paths = [
          `/api/maps`,
          `/api/zones?map_id=${encodeURIComponent(mapId)}`,
          `/api/tasks?map_id=${encodeURIComponent(mapId)}`,
          `/api/plants?map_id=${encodeURIComponent(mapId)}`,
          `/api/map/markers?map_id=${encodeURIComponent(mapId)}`,
        ];
        const outs = await Promise.all(
          paths.map((p) => request({ urlPath: p, headers: authHeaders(teacherToken) })),
        );
        return {
          ok: outs.every((o) => o.ok || o.status === 404),
          status: outs.find((o) => !o.ok && o.status !== 404)?.status || 200,
          bytes: outs.reduce((a, o) => a + o.bytes, 0),
        };
      }),
    );

    if (gl) {
      rows.push(
        await runScenario(secret, 'gl_team_move', () =>
          request({
            method: 'POST',
            urlPath: `/api/gl/games/${gl.gameId}/teams/${gl.teamId}/move`,
            product: 'gl',
            headers: authHeaders(gl.mjToken),
            body: { markerId: gl.pointMarkerId },
          }),
        ),
      );
      rows.push(
        await runScenario(secret, 'gl_present_question', () =>
          request({
            method: 'POST',
            urlPath: `/api/gl/games/${gl.gameId}/markers/${gl.questionMarkerId}/present-question`,
            product: 'gl',
            headers: authHeaders(gl.mjToken),
            body: { teamId: gl.teamId },
          }),
        ),
      );
      rows.push(
        await runScenario(secret, 'gl_game_state', () =>
          request({
            urlPath: `/api/gl/games/${gl.gameId}`,
            product: 'gl',
            headers: authHeaders(gl.mjToken),
          }),
        ),
      );
    }

    // Pic corps JSON (hypothèse audit 25 Mo) — la mémoire monte avant le 4xx métier
    const sizesMb = [1, 4, 8];
    for (const mb of sizesMb) {
      const blob = 'x'.repeat(mb * 1024 * 1024);
      rows.push(
        await runScenario(
          secret,
          `json_body_${mb}mb`,
          () =>
            request({
              method: 'POST',
              urlPath: '/api/auth/login',
              body: { identifier: 'mem-spike@test.local', password: 'x', pad: blob },
            }),
          { concurrency: Math.min(4, CONCURRENCY), iters: 2 },
        ),
      );
    }

    printReport(rows, baseline);

    const hot = [...rows]
      .filter((r) => r.name.startsWith('json_body_') || r.deltaRssMb >= 5 || r.deltaHeapMb >= 5)
      .sort((a, b) => b.deltaRssMb - a.deltaRssMb);
    if (hot.length) {
      console.log('\nCandidats forts (Δ ≥ 5 Mo ou corps JSON) :');
      for (const r of hot) {
        console.log(
          `  · ${r.name}: ΔRSS ${fmtDelta(r.deltaRssMb)} Mo, Δheap ${fmtDelta(r.deltaHeapMb)} Mo, réponses ${r.totalResponseMb} Mo`,
        );
      }
    }
  } catch (e) {
    exitCode = 1;
    console.error('\nÉchec profilage:', e.message || e);
    if (child._bootLog) {
      const log = child._bootLog().slice(-4000);
      if (log.trim()) console.error('\n--- boot log (fin) ---\n', log);
    }
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await sleep(500);
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    process.exit(exitCode);
  }
}

main();
