'use strict';

/**
 * Outils de domaine Gnomes & Licornes du connecteur (`gl_*`, domaine `gl`) sur une partie
 * « Tenir à deux » de fixture **anonyme** (`createTenirGame`, pseudos `joueur-a-<stamp>`).
 *
 * - droits : staff G&L exigé (un prof sans ligne gl_admins → MCP_GL_FORBIDDEN), domaine `gl`
 *   désactivable, nominatif sans bypass → MCP_PRIVACY, écriture sans portée write → refus ;
 * - lectures : parties, état (bourses agrégées par équipe seulement, aucune clé de classement),
 *   journal libellé comme l'app (payload privé expurgé hors bypass), diagnostic, réglages,
 *   catalogues, instantané du contenu (terme secret masqué, chaîne interdite signalée),
 *   rapports de simulation sur un dossier temporaire ;
 * - écritures par le pont G&L : `gl_tour ouvrir` écrit un tour en base (logique du moteur),
 *   phases, avance libre, absences, retrait, clôture ; `gl_settings set` ; `gl_tenir_catalogues
 *   sync` (simulation) ; `gl_rewards` : routes non livrées ici → MCP_NOT_AVAILABLE.
 * Aucun pseudo d'élève ne doit sortir d'une action non nominative.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const db = require('../database');
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');

fx.enableMcpEnv();

const { app } = require('../server');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const GL_TOOLS = [
  'gl_games',
  'gl_game_state',
  'gl_game_journal',
  'gl_game_diagnostic',
  'gl_settings',
  'gl_tenir_catalogues',
  'gl_content_snapshot',
  'gl_tour',
  'gl_sim_reports',
  'gl_rewards',
];
const RANKING_RE = /"(?:rank|rang|classement|position|score|podium)"\s*:/i;

let admin;
let token;
let readToken;
let profToken;
let ctx; // partie de fixture
let simDir;
const call = (name, args, t = token) => fx.callTool(app, t, name, args);

/** Aucun pseudo de la fixture, aucune clé de classement dans une réponse. */
function assertAnonymous(text, where) {
  assert.ok(!String(text).includes('joueur-'), `${where} : pseudo d’élève présent`);
  assert.doesNotMatch(String(text), RANKING_RE, `${where} : clé de classement`);
}

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  readToken = (await fx.obtainTokens(app, admin, { scope: 'foretmap.read' })).access_token;
  const prof = await fx.createAccount('prof');
  profToken = (await fx.obtainTokens(app, prof)).access_token;
  ctx = await createTenirGame({ stamp: STAMP, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  simDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-sim-'));
  fs.mkdirSync(path.join(simDir, '2026-11-07-complet'));
  fs.writeFileSync(
    path.join(simDir, '2026-11-07-complet', 'summary.json'),
    JSON.stringify({
      scenario: 'complet',
      tours: 6,
      violations: [],
      equipes: [{ id: 1 }, { id: 2 }],
      seuil: { atteint: true },
    }),
  );
  fs.writeFileSync(path.join(simDir, '2026-11-07-complet', 'index.html'), '<html>jamais lu</html>');
  fs.mkdirSync(path.join(simDir, 'brouillon'));
  process.env.GL_SIM_REPORTS_DIR = simDir;
});

test.after(async () => {
  delete process.env.GL_SIM_REPORTS_DIR;
  if (simDir) fs.rmSync(simDir, { recursive: true, force: true });
  await execute("DELETE FROM gl_lore_glossary_terms WHERE lore_code = 'MCPSECRET'");
  await execute(
    "UPDATE gl_chasse_zones SET indice = 'La forêt respire.' WHERE zone_key = 'cz-p1-01' AND indice LIKE '%Zorglubix%'",
  );
  await fx.cleanupAccounts();
});

test.beforeEach(() => {
  fx.enableMcpEnv();
  process.env.GL_SIM_REPORTS_DIR = simDir;
});

test('accès : outils listés pour mcp.use ; prof sans rôle G&L refusé ; domaine gl désactivable', async () => {
  const tools = await fx.listTools(app, token);
  for (const name of GL_TOOLS) assert.ok(tools.includes(name), `${name} attendu`);
  const prof = await call('gl_games', { action: 'list' }, profToken);
  assert.equal(prof.isError, true);
  assert.match(prof.text, /maître du jeu|MCP_GL_FORBIDDEN/);
  const sans = await fx.createAccount(null);
  const sansToken = await fx.obtainTokens(app, sans).catch(() => null);
  if (sansToken?.access_token) {
    const listed = await fx.listTools(app, sansToken.access_token);
    assert.ok(!listed.some((n) => GL_TOOLS.includes(n)), 'sans mcp.use : aucun outil G&L');
  }
  fx.enableMcpEnv({ MCP_DOMAINS_DISABLED: 'gl' });
  const off = await fx.listTools(app, token);
  // `gl_get_board` / `gl_get_lore` (lecture du corpus, étage 3) ne sont pas du domaine `gl`.
  assert.ok(!off.some((n) => GL_TOOLS.includes(n)), 'domaine gl retiré');
  assert.ok(off.includes('gl_get_board'), 'les outils de corpus G&L restent');
  const denied = await call('gl_games', { action: 'list' });
  assert.equal(denied.isError, true);
});

test('gl_games : liste filtrée et détail, équipes nommées, aucun pseudo', async () => {
  const list = await call('gl_games', {
    action: 'list',
    class_id: Number(ctx.cls.id),
    tenir: true,
  });
  assert.equal(list.isError, false, list.text);
  assertAnonymous(list.text, 'gl_games list');
  const mine = list.data.items.find((g) => g.id === Number(ctx.game.id));
  assert.ok(mine, 'partie de fixture listée');
  assert.equal(mine.tenirProfil, 'complet');
  assert.equal(mine.plateau, 1);
  assert.equal(mine.teamsCount, 4);
  assert.equal(mine.playersCount, 10);
  const classic = await call('gl_games', {
    action: 'list',
    class_id: Number(ctx.cls.id),
    tenir: false,
  });
  assert.equal(classic.data.count, 0);
  const get = await call('gl_games', { action: 'get', game_id: Number(ctx.game.id) });
  assert.equal(get.isError, false, get.text);
  assertAnonymous(get.text, 'gl_games get');
  assert.equal(get.data.teams.length, 4);
  assert.deepEqual(get.data.teams.map((t) => t.type).sort(), [
    'gnome',
    'gnome',
    'unicorn',
    'unicorn',
  ]);
  assert.ok(get.data.teams.every((t) => t.pathIndex === 0 && t.membres > 0));
  const missing = await call('gl_games', { action: 'get', game_id: 99999999 });
  assert.equal(missing.isError, true);
});

test('gl_game_state : bourses agrégées par équipe seulement ; bourses_eleves nominatif', async () => {
  const st = await call('gl_game_state', { action: 'get', game_id: Number(ctx.game.id) });
  assert.equal(st.isError, false, st.text);
  assertAnonymous(st.text, 'gl_game_state get');
  assert.equal(st.data.tenir, true);
  assert.equal(st.data.profil, 'complet');
  assert.equal(st.data.settings.surface, 'tablette');
  assert.ok(st.data.bourses.length === 4);
  for (const b of st.data.bourses) {
    assert.ok(b.membres >= 2);
    assert.ok(
      'somme' in b.coeurs && 'min' in b.coeurs && 'max' in b.coeurs && 'auPlafond' in b.coeurs,
    );
    assert.ok(!('items' in b) && !('players' in b), 'rien par élève');
  }
  assert.equal(st.data.reserves.length, 4);
  assert.ok(st.data.pages.counts.total > 0, 'pages du carnet initialisées');
  assert.equal(st.data.round, null, 'aucun tour ouvert');
  assert.ok(!/"(?:health_points|power_points|player_id)"/.test(st.text), 'aucune bourse par élève');

  const nominative = await call('gl_game_state', {
    action: 'bourses_eleves',
    game_id: Number(ctx.game.id),
  });
  assert.equal(nominative.isError, false, nominative.text);
  assert.equal(nominative.data.count, 10);
  assert.ok(nominative.data.items.every((i) => String(i.pseudo).startsWith('joueur-')));
  assert.doesNotMatch(nominative.text, RANKING_RE);
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'mcp.privacy_bypass.read' ORDER BY id DESC LIMIT 1",
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.tool, 'gl_game_state');
  assert.equal(payload.action, 'bourses_eleves');

  fx.enableMcpEnv({ MCP_PRIVACY_BYPASS: 'false' });
  const refused = await call('gl_game_state', {
    action: 'bourses_eleves',
    game_id: Number(ctx.game.id),
  });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /MCP_PRIVACY|nominative/);
});

test('gl_tour : écriture par le pont G&L (ouvrir, phase, avance libre, absences, retrait, voile) — effet en base', async () => {
  const gameId = Number(ctx.game.id);
  const noWrite = await call('gl_tour', { action: 'ouvrir', game_id: gameId }, readToken);
  assert.equal(noWrite.isError, true, 'sans portée write');
  assert.match(noWrite.text, /foretmap\.write/);

  const ouvert = await call('gl_tour', { action: 'ouvrir', game_id: gameId });
  assert.equal(ouvert.isError, false, ouvert.text);
  assertAnonymous(ouvert.text, 'gl_tour ouvrir');
  assert.equal(ouvert.data.avant.roundNumber, 0);
  assert.equal(ouvert.data.apres.roundNumber, 1);
  assert.equal(ouvert.data.apres.phase, 'ouverture');
  assert.equal(ouvert.data.resultat.roundNumber, 1);
  assert.equal(ouvert.data.resultat.ordre.length, 4);
  const round = await queryOne(
    'SELECT round_number, phase FROM gl_game_rounds WHERE game_id = ? AND round_number = 1',
    [gameId],
  );
  assert.ok(round, 'tour écrit par le moteur');
  assert.equal(round.phase, 'ouverture');
  const game = await queryOne('SELECT current_round_number FROM gl_games WHERE id = ?', [gameId]);
  assert.equal(Number(game.current_round_number), 1);
  const evt = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'tour_ouvert' LIMIT 1",
    [gameId],
  );
  assert.ok(evt, 'évènement du journal écrit par la route');
  const bridgeAudit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'mcp_api_call' ORDER BY id DESC LIMIT 1",
  );
  const bp =
    typeof bridgeAudit.payload_json === 'string'
      ? JSON.parse(bridgeAudit.payload_json)
      : bridgeAudit.payload_json;
  assert.equal(bp.tool, 'gl_tour');
  assert.match(bp.path, /\/api\/gl\/games\/\d+\/tenir\/tour\/ouvrir$/);

  const jeu = await call('gl_tour', { action: 'phase', game_id: gameId, phase: 'jeu' });
  assert.equal(jeu.isError, false, jeu.text);
  assert.equal(jeu.data.apres.phase, 'jeu');

  const team = ouvert.data.apres.teams[0];
  const avance = await call('gl_tour', {
    action: 'avance_libre',
    game_id: gameId,
    team_id: team.id,
    cases: 2,
    motif: 'test du connecteur',
  });
  assert.equal(avance.isError, false, avance.text);
  const moved = avance.data.apres.teams.find((t) => t.id === team.id);
  assert.ok(moved.pathIndex >= 2, `pion avancé (${moved.pathIndex})`);
  const badAvance = await call('gl_tour', {
    action: 'avance_libre',
    game_id: gameId,
    team_id: team.id,
    cases: 40,
    motif: 'trop',
  });
  assert.equal(badAvance.isError, true, 'bornes du schéma');

  const absents = await call('gl_tour', {
    action: 'absences',
    game_id: gameId,
    player_ids: [ctx.players[0].id, ctx.players[1].id],
  });
  assert.equal(absents.isError, false, absents.text);
  const abs = await queryAll(
    'SELECT player_id FROM gl_game_round_absences WHERE game_id = ? AND round_number = 1',
    [gameId],
  );
  assert.equal(abs.length, 2);

  const retrait = await call('gl_tour', {
    action: 'retrait',
    game_id: gameId,
    player_id: ctx.players[2].id,
    motif: 'conduite',
  });
  assert.equal(retrait.isError, false, retrait.text);
  assert.equal(retrait.data.apres.retraitsOuverts, 1);
  const row = await queryOne(
    'SELECT motif, sortie_at FROM gl_game_retraits WHERE game_id = ? AND player_id = ?',
    [gameId, ctx.players[2].id],
  );
  assert.equal(row.motif, 'conduite');
  assert.equal(row.sortie_at, null);
  const retour = await call('gl_tour', {
    action: 'retrait',
    game_id: gameId,
    player_id: ctx.players[2].id,
    entree: false,
  });
  assert.equal(retour.isError, false, retour.text);
  assert.equal(retour.data.apres.retraitsOuverts, 0);

  const dort = await call('gl_tour', { action: 'voile_dort', game_id: gameId });
  assert.equal(dort.isError, false, dort.text);
  assert.equal(dort.data.apres.phase, 'souffle');
  assert.equal(dort.data.resultat.souffle.dort, true);
  const voileDort = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'voile_dort' LIMIT 1",
    [gameId],
  );
  assert.ok(voileDort, 'le voile a dormi');

  const clos = await call('gl_tour', { action: 'phase', game_id: gameId, phase: 'clos' });
  assert.equal(clos.isError, false, clos.text);
  assert.equal(clos.data.apres.phase, 'clos');
});

test('gl_game_journal : libellés de l’app, filtres, payload privé expurgé sans bypass', async () => {
  const gameId = Number(ctx.game.id);
  const all = await call('gl_game_journal', { action: 'list', game_id: gameId, limit: 100 });
  assert.equal(all.isError, false, all.text);
  assertAnonymous(all.text, 'gl_game_journal');
  assert.equal(all.data.tenir, true);
  assert.equal(all.data.view, 'mj');
  assert.ok(all.data.items.length >= 5);
  assert.ok(all.data.items.every((e) => e.title && typeof e.body === 'string'));
  assert.ok(!all.data.items.some((e) => e.title === 'Évènement de partie'), 'tout est libellé');
  const retraits = all.data.items.filter((e) => e.eventType === 'retrait');
  assert.equal(retraits.length, 2);
  assert.equal(
    retraits[0].payload.playerId,
    ctx.players[2].id,
    'bypass : identité visible au prof',
  );
  assert.equal(retraits[0].redacted, false);

  const parType = await call('gl_game_journal', {
    action: 'list',
    game_id: gameId,
    type: 'tour_*',
  });
  assert.equal(parType.isError, false, parType.text);
  assert.ok(parType.data.items.length >= 2);
  assert.ok(parType.data.items.every((e) => e.eventType.startsWith('tour_')));
  const parTour = await call('gl_game_journal', { action: 'list', game_id: gameId, round: 1 });
  assert.ok(parTour.data.items.length >= 1);
  assert.ok(parTour.data.items.every((e) => e.roundNumber === 1));

  fx.enableMcpEnv({ MCP_PRIVACY_BYPASS: 'false' });
  const expurge = await call('gl_game_journal', {
    action: 'list',
    game_id: gameId,
    type: 'retrait',
  });
  assert.equal(expurge.isError, false, expurge.text);
  assert.equal(expurge.data.view, 'player');
  assert.equal(expurge.data.items.length, 2);
  for (const e of expurge.data.items) {
    assert.equal(e.redacted, true);
    assert.ok(!('playerId' in e.payload), 'identité retirée');
    assert.ok('entree' in e.payload, 'clé publique conservée');
  }
});

test('gl_game_diagnostic : invariants, grand livre, réserves, durées, compteurs — aucun nom', async () => {
  const gameId = Number(ctx.game.id);
  const d = await call('gl_game_diagnostic', { action: 'get', game_id: gameId });
  assert.equal(d.isError, false, d.text);
  assertAnonymous(d.text, 'gl_game_diagnostic');
  assert.ok(['vert', 'orange', 'rouge'].includes(d.data.verdict));
  assert.equal(d.data.invariants.ok, true, JSON.stringify(d.data.invariants.violations));
  assert.ok(Array.isArray(d.data.ledger.parCause));
  assert.equal(d.data.reserves.length, 4);
  assert.equal(d.data.durees.tours, 1);
  assert.equal(d.data.durees.toursClos, 1);
  assert.ok(d.data.compteurs.pages.total > 0);
  assert.equal(d.data.compteurs.fouilles, 0);
  assert.ok(d.data.compteurs.evenements.tour_ouvert >= 1);
  assert.ok(!('snapshot' in d.data), 'l’instantané par joueur ne sort pas');
});

test('gl_settings : lecture par la route (source, métadonnées), écriture validée, gl_settings reste refusée en SQL', async () => {
  const list = await call('gl_settings', { action: 'list', prefix: 'gameplay.tenir_', limit: 500 });
  assert.equal(list.isError, false, list.text);
  assert.ok(list.data.total >= 20);
  const enabled = list.data.items.find((r) => r.key === 'gameplay.tenir_enabled');
  assert.equal(enabled.value, true);
  assert.equal(enabled.source, 'base');
  assert.equal(enabled.group, 'gameplay');
  assert.equal(enabled.type, 'boolean');

  const key = 'gameplay.tenir_relances_max_par_tour';
  const before = await call('gl_settings', { action: 'get', key });
  assert.equal(before.isError, false, before.text);
  assert.equal(typeof before.data.min, 'number');
  const set = await call('gl_settings', { action: 'set', key, value: 2 });
  assert.equal(set.isError, false, set.text);
  assert.equal(set.data.after.value, 2);
  assert.equal(set.data.after.source, 'base');
  const row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ?', [key]);
  assert.equal(JSON.parse(row.value_json), 2);
  const bad = await call('gl_settings', { action: 'set', key, value: 'beaucoup' });
  assert.equal(bad.isError, true, 'validation du registre par la route');
  const unknownGameplay = await call('gl_settings', {
    action: 'set',
    key: 'gameplay.cle_inconnue',
    value: 1,
  });
  assert.equal(unknownGameplay.isError, true);
  await call('gl_settings', { action: 'set', key, value: before.data.value });
  const ro = await call('gl_settings', { action: 'set', key, value: 1 }, readToken);
  assert.equal(ro.isError, true);
  const sql = await call('foretmap_sql_select', {
    sql: 'SELECT `key` FROM gl_settings',
  });
  assert.equal(sql.isError, true, 'gl_settings reste secrète pour le SQL libre');
});

test('gl_tenir_catalogues : état et synchronisation en simulation', async () => {
  const st = await call('gl_tenir_catalogues', { action: 'status' });
  assert.equal(st.isError, false, st.text);
  assert.ok(Array.isArray(st.data.fichiers) && st.data.fichiers.length >= 10);
  const zones = st.data.fichiers.find((f) => f.fichier === 'chasse-zones');
  assert.equal(zones.table, 'gl_chasse_zones');
  assert.ok(typeof zones.count === 'number');
  const dry = await call('gl_tenir_catalogues', {
    action: 'sync',
    fichier: 'peripeties',
    dry_run: true,
  });
  assert.equal(dry.isError, false, dry.text);
  assert.equal(dry.data.dryRun, true);
  const bad = await call('gl_tenir_catalogues', { action: 'sync', fichier: 'inconnu' });
  assert.equal(bad.isError, true);
  const ro = await call('gl_tenir_catalogues', { action: 'sync', dry_run: true }, readToken);
  assert.equal(ro.isError, true);
});

test('gl_content_snapshot : vérité des cases, zones sans polygone, questions sans réponse, secret masqué', async () => {
  await execute(
    `INSERT INTO gl_lore_glossary_terms (lore_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at)
     VALUES ('MCPSECRET', 'Zorglubix', 'Zorglubixes', 'test', 'secret', 'secret de test', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE niveau = 'secret', statut = 'actif'`,
  );
  await execute(
    "UPDATE gl_chasse_zones SET indice = 'Le Zorglubix dort près du corbeau.' WHERE zone_key = 'cz-p1-01'",
  );
  const snap = await call('gl_content_snapshot', { action: 'get', plateau: 1 });
  assert.equal(snap.isError, false, snap.text);
  assertAnonymous(snap.text, 'gl_content_snapshot');
  assert.ok(!snap.text.includes('Zorglubix'), 'terme secret masqué');
  assert.ok(snap.data.chapitres.some((c) => c.slug === 'tenir-ex-plateau-1'));
  assert.ok(snap.data.cases.count >= 12);
  const trame = snap.data.cases.items.find((c) => c.label === 'Trame 1');
  assert.equal(trame.tonalite, 'trame');
  assert.match(trame.verite.gnome, /\+1 cœur/);
  assert.match(trame.verite.unicorn, /\+1 gemme/);
  assert.ok(!('effet_mecanique' in trame), 'champ d’auteur jamais servi');
  assert.ok(snap.data.zones.length >= 1);
  assert.ok(snap.data.zones.every((z) => !('polygone' in z) && !('titrePrive' in z)));
  const z1 = snap.data.zones.find((z) => z.zoneKey === 'cz-p1-01');
  assert.match(z1.indice, /\[terme secret masqué\]/);
  assert.ok(snap.data.questions_lecture.length >= 1);
  assert.ok(
    snap.data.questions_lecture.every((q) => !('reponse' in q) && !('feedback_correct' in q)),
  );
  assert.ok(snap.data.sorts.every((s) => !('effet_mecanique' in s)));
  assert.ok(snap.data.olu.every((o) => !('correction' in o)));
  const kinds = snap.data.controles.items
    .filter((c) => c.where === 'zone:cz-p1-01')
    .map((c) => c.kind);
  assert.ok(kinds.includes('terme_secret'));
  assert.ok(kinds.includes('chaine_interdite'));
  const partiel = await call('gl_content_snapshot', {
    action: 'get',
    plateau: 2,
    sections: ['zones', 'parures'],
  });
  assert.equal(partiel.isError, false, partiel.text);
  assert.ok(!('cases' in partiel.data) && 'parures' in partiel.data);
  assert.ok(partiel.data.zones.every((z) => z.plateau === 2));
});

test('gl_sim_reports : dossier temporaire, résumé sans HTML, bornes', async () => {
  const list = await call('gl_sim_reports', { action: 'list' });
  assert.equal(list.isError, false, list.text);
  assert.equal(list.data.dossier_absent, false);
  assert.equal(list.data.count, 1, 'le dossier « brouillon » sans date est ignoré');
  const item = list.data.items[0];
  assert.equal(item.name, '2026-11-07-complet');
  assert.equal(item.date, '2026-11-07');
  assert.equal(item.scenario, 'complet');
  assert.deepEqual(item.resume.equipes, { items: 2 });
  assert.equal(item.resume.tours, 6);
  const get = await call('gl_sim_reports', { action: 'get', name: '2026-11-07-complet' });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.summary.scenario, 'complet');
  assert.ok(!get.text.includes('jamais lu'), 'le HTML n’est jamais lu');
  const missing = await call('gl_sim_reports', { action: 'get', name: '2026-11-08-absent' });
  assert.equal(missing.isError, true);
  const traversal = await call('gl_sim_reports', { action: 'get', name: '2026-11-07-../../x' });
  assert.equal(traversal.isError, true);
  process.env.GL_SIM_REPORTS_DIR = path.join(simDir, 'nexiste-pas');
  const absent = await call('gl_sim_reports', { action: 'list' });
  assert.equal(absent.isError, false, absent.text);
  assert.equal(absent.data.dossier_absent, true);
  assert.equal(absent.data.count, 0);
});

test('gl_rewards : vitrine sans classement ; routes absentes → MCP_NOT_AVAILABLE', async () => {
  const { normalizeShowcase } = require('../lib/mcp/tools/domains/glRewards');
  const shaped = normalizeShowcase(
    {
      game: { id: 1, name: 'P' },
      players: [
        { id: '2', name: 'joueur-b', families: { chasse: 1 }, total: 1, rank: 1, score: 9 },
        { id: '1', name: 'joueur-a', families: {}, total: 0 },
      ],
      near: [{ studentId: '2', name: 'joueur-b', key: 'chasse.fouilles', tier: 2, remaining: 1 }],
      families: [{ key: 'chasse' }],
      tiers: [],
      manualTypes: [],
    },
    { nominative: false },
  );
  assert.deepEqual(
    shaped.players.map((p) => p.player_id),
    ['1', '2'],
  );
  assert.ok(shaped.players.every((p) => !('name' in p) && !('rank' in p) && !('score' in p)));
  assert.ok(!('name' in shaped.near[0]) && shaped.near[0].player_id === '2');
  const withNames = normalizeShowcase(
    { students: [{ id: '1', name: 'joueur-a' }] },
    { nominative: true },
  );
  assert.equal(withNames.players[0].name, 'joueur-a');

  const delivered = fs.existsSync(path.join(__dirname, '..', 'routes', 'gl', 'rewards.js'));
  const vitrine = await call('gl_rewards', { action: 'vitrine', game_id: Number(ctx.game.id) });
  if (!delivered) {
    assert.equal(vitrine.isError, true);
    assert.match(vitrine.text, /non livrés|MCP_NOT_AVAILABLE/);
    const award = await call('gl_rewards', {
      action: 'award',
      game_id: Number(ctx.game.id),
      player_id: ctx.players[0].id,
      type: 'coup_de_coeur',
      note: 'bravo',
    });
    assert.equal(award.isError, true);
    assert.match(award.text, /non livrés|MCP_NOT_AVAILABLE|Badges désactivés/);
  } else {
    assert.equal(vitrine.isError, false, vitrine.text);
    assert.doesNotMatch(vitrine.text, RANKING_RE);
    assert.ok(Array.isArray(vitrine.data.players));
  }
  const neither = await call('gl_rewards', { action: 'vitrine' });
  assert.equal(neither.isError, true);
  const ro = await call(
    'gl_rewards',
    { action: 'award', game_id: 1, player_id: 1, type: 'x', note: 'y' },
    readToken,
  );
  assert.equal(ro.isError, true);
});

test('gl_tour clore_partie : statut ended par la route du moteur', async () => {
  const gameId = Number(ctx.game.id);
  const end = await call('gl_tour', { action: 'clore_partie', game_id: gameId });
  assert.equal(end.isError, false, end.text);
  assert.equal(end.data.apres.status, 'ended');
  const row = await queryOne('SELECT status FROM gl_games WHERE id = ?', [gameId]);
  assert.equal(row.status, 'ended');
});
