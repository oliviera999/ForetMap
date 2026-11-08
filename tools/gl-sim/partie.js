'use strict';

/**
 * Création d'une classe virtuelle et d'une partie « Tenir à deux » par l'**API prof réelle** :
 * `POST /api/gl/admin/classes`, `POST /api/gl/admin/players` (pseudos `sim-<scenario>-<n>`,
 * aucune donnée d'élève), `POST /api/gl/games`, `PUT /tenir/profil` (profil, surface),
 * `POST /teams/compose/preview` + `apply` (composition automatique : 4 équipes typées, peuples
 * inversés d'un plateau à l'autre comme le fait l'app) ou `apply` explicite, `POST /start`.
 *
 * Le MJ est semé par la fixture anonyme `tests/helpers/glFixtures.js › createGlAdmin` (aucune
 * route publique ne crée un administrateur) ; les jetons sont signés comme ceux de la connexion
 * (`signAuthToken`, claims `classId` et `teamId`).
 */

const { createGlAdmin } = require('../../tests/helpers/glFixtures');
const { signAuthToken } = require('../../middleware/requireTeacher');

const PERMISSIONS_MJ = Object.freeze([
  'gl.read',
  'gl.game.manage',
  'gl.team.manage',
  'gl.players.manage',
  'gl.event.emit',
  'gl.settings.manage',
  'gl.content.manage',
  'gl.mascot.position',
]);

const COULEURS = ['#65a30d', '#84cc16', '#a855f7', '#d946ef'];

async function jetonMj(adminId) {
  return signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(adminId),
    roleSlug: 'gl_admin',
    permissions: [...PERMISSIONS_MJ],
    displayName: 'MJ sim',
  });
}

async function jetonJoueur({ id, pseudo, teamId = null, classId = null }) {
  return signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: pseudo,
    teamId: teamId != null ? Number(teamId) : null,
    classId: classId != null ? Number(classId) : null,
  });
}

function attendu(res, statuts, libelle) {
  const ok = Array.isArray(statuts) ? statuts.includes(res.status) : res.status === statuts;
  if (!ok) {
    throw new Error(`${libelle} : ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  return res.body;
}

/**
 * Classe + élèves virtuels. `personas[i]` reçoit `id`, `pseudo`, `token`.
 * @returns {Promise<{ admin, mjToken, classe, joueurs: Array }>}
 */
async function creerClasse({ client, scenarioId, personas, stamp }) {
  const admin = await createGlAdmin({
    email: `mj.sim.${stamp}@sim.local`,
    displayName: 'MJ sim',
  });
  const mjToken = await jetonMj(admin.id);
  const classe = attendu(
    await client.appel({
      token: mjToken,
      method: 'post',
      path: '/api/gl/admin/classes',
      body: { name: `Classe sim ${scenarioId} ${stamp}`, school: 'Banc de simulation' },
      geste: 'creer-classe',
    }),
    201,
    'création de classe',
  );
  const joueurs = [];
  for (let i = 0; i < personas.length; i += 1) {
    const pseudo = `sim-${scenarioId}-${i + 1}`.slice(0, 40);
    const body = attendu(
      await client.appel({
        token: mjToken,
        method: 'post',
        path: '/api/gl/admin/players',
        body: {
          classId: classe.id,
          firstName: 'Sim',
          lastName: `E${String(i + 1).padStart(2, '0')}`,
          pseudo: `${pseudo}-${stamp % 100000}`,
          password: `sim-mot-de-passe-${stamp}`,
        },
        geste: 'creer-joueur',
      }),
      201,
      `création du joueur ${pseudo}`,
    );
    const id = Number(body.id ?? body.player?.id);
    if (!id) throw new Error(`création du joueur ${pseudo} : identifiant absent`);
    joueurs.push({
      id,
      pseudo,
      persona: personas[i],
      classId: Number(classe.id),
      teamId: null,
      token: null,
    });
  }
  return { admin, mjToken, classe, joueurs };
}

/**
 * Partie `live` sur le chapitre du plateau demandé, 4 équipes (2 gnomes, 2 licornes).
 * @param {object} p
 * @param {'auto'|'explicite'} [p.composition] `auto` = composition automatique de l'app
 *   (rebrassage, peuples inversés d'après l'historique de la classe) ; `explicite` = répartition
 *   ronde du banc (chapitre isolé).
 */
async function creerPartie({
  client,
  db,
  mjToken,
  classe,
  joueurs,
  plateau,
  surface = 'hybride',
  profil = 'complet',
  composition = 'explicite',
  rng,
  nom = 'Partie sim',
}) {
  const chapitre = await db.queryOne(
    'SELECT id, slug, title, plateau_number FROM gl_chapters WHERE plateau_number = ? ORDER BY id ASC LIMIT 1',
    [plateau],
  );
  if (!chapitre) throw new Error(`aucun chapitre de plateau ${plateau}`);
  const game = attendu(
    await client.appel({
      token: mjToken,
      method: 'post',
      path: '/api/gl/games',
      body: { classId: classe.id, chapterId: chapitre.id, name: `${nom} P${plateau}` },
      geste: 'creer-partie',
    }),
    201,
    'création de partie',
  );
  const gameId = Number(game?.game?.id ?? game?.id);
  if (!gameId)
    throw new Error(
      `création de partie : identifiant absent (${JSON.stringify(game).slice(0, 200)})`,
    );
  attendu(
    await client.appel({
      token: mjToken,
      method: 'put',
      path: `/api/gl/games/${gameId}/tenir/profil`,
      body: { profil, overrides: { surface } },
      geste: 'profil-surface',
    }),
    200,
    'profil / surface',
  );

  let teamsInput;
  if (composition === 'auto') {
    const proposal = attendu(
      await client.appel({
        token: mjToken,
        method: 'post',
        path: `/api/gl/games/${gameId}/teams/compose/preview`,
        body: { seed: String(rng.int(1, 1e9)), teamSize: 5 },
        geste: 'compose-preview',
      }),
      200,
      'composition automatique (aperçu)',
    );
    teamsInput = proposal.teams.map((t) => ({
      name: t.name,
      type: t.type,
      color: t.color || undefined,
      mascotId: t.mascotId || null,
      memberIds: t.members.map((m) => Number(m.playerId)),
    }));
  } else {
    const ordre = rng.shuffle(joueurs.map((j) => j.id));
    const types = ['gnome', 'gnome', 'unicorn', 'unicorn'];
    teamsInput = types.map((type, idx) => ({
      name: `${type === 'gnome' ? 'Gnomes' : 'Licornes'} ${idx % 2 === 0 ? 'A' : 'B'}`,
      type,
      color: COULEURS[idx],
      memberIds: ordre.filter((_, k) => k % 4 === idx),
    }));
  }
  const applied = attendu(
    await client.appel({
      token: mjToken,
      method: 'post',
      path: `/api/gl/games/${gameId}/teams/compose/apply`,
      body: {
        teams: teamsInput,
        replaceExisting: true,
        recipe: composition === 'auto' ? 'random' : null,
      },
      geste: 'compose-apply',
    }),
    201,
    'composition des équipes',
  );
  const equipes = applied.teams.map((t) => ({
    id: Number(t.teamId),
    name: t.name,
    type: String(t.type).toLowerCase() === 'unicorn' ? 'unicorn' : 'gnome',
    membres: t.memberIds.map(Number),
  }));
  for (const j of joueurs) {
    const eq = equipes.find((e) => e.membres.includes(j.id));
    j.teamId = eq ? eq.id : null;
    j.token = await jetonJoueur({
      id: j.id,
      pseudo: j.pseudo,
      teamId: j.teamId,
      classId: j.classId,
    });
  }
  attendu(
    await client.appel({
      token: mjToken,
      method: 'post',
      path: `/api/gl/games/${gameId}/start`,
      geste: 'demarrer-partie',
    }),
    200,
    'démarrage de la partie',
  );
  const markers = await db.queryAll(
    'SELECT id, event_type, label, order_index, x_pct, y_pct FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
    [chapitre.id],
  );
  const sorts = (
    await db.queryAll('SELECT spell_code FROM gl_chapter_spells WHERE chapter_id = ?', [
      chapitre.id,
    ])
  ).map((r) => String(r.spell_code));
  const zones = await db.queryAll(
    `SELECT z.zone_key FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? ORDER BY z.ordre ASC`,
    [gameId],
  );
  return {
    gameId,
    classId: Number(classe.id),
    chapitre: {
      id: Number(chapitre.id),
      slug: chapitre.slug,
      plateau: Number(chapitre.plateau_number),
    },
    plateau: Number(plateau),
    surface,
    profil,
    equipes,
    markers,
    campIndex: Math.max(0, markers.length - 1),
    sorts: new Set(sorts),
    zonesActives: zones.map((z) => String(z.zone_key)),
  };
}

module.exports = { PERMISSIONS_MJ, jetonMj, jetonJoueur, attendu, creerClasse, creerPartie };
