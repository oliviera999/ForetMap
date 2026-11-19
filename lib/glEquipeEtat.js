'use strict';

/**
 * « Tenir à deux », ensemble unifié (M13) — plusieurs appareils par équipe.
 *
 * Trois règles, posées d'un seul geste sur les routes d'équipe par `gardeDEquipe` :
 *
 * 1. **Version d'état** (`gl_team_etat.version`) : un geste envoie la version vue (en-tête
 *    `X-GL-Etat-Version`, ou `etatVersion` dans le corps). La prise est un échange atomique :
 *    de deux gestes partis avec la même version, un seul passe ; l'autre reçoit 409
 *    `ETAT_PERIME`, sans perte, et son écran se recharge. Un geste refusé par le moteur rend
 *    sa version : rien n'a changé, personne n'est périmé.
 * 2. **La main** (`main_holder`, `main_geste`, `main_expire_ms`) : un geste décisif la prend
 *    pour 60 s au plus ; les autres appareils de l'équipe reçoivent 409 `MAIN_AILLEURS`. Elle se
 *    rend à la fin du geste, à l'échéance, à la déconnexion de l'appareil, au changement de
 *    phase : aucun état d'attente sans sortie.
 * 3. **Absent spectateur** : un élève absent du tour ou en retrait, connecté avec son compte,
 *    voit tout et ne joue rien (403 `SPECTATEUR`).
 *
 * Le prof n'est jamais retenu : son geste pour une équipe avance la version, sans contrôle.
 * Hors d'un tour ouvert et hors mode « Tenir », la garde laisse passer sans rien toucher.
 * Noyau pur : `src/shared/glMainCore.js` (miroir `lib/shared/`).
 *
 * **Table à part** (`gl_team_etat`, migration 371), jamais `gl_teams` : les transactions du
 * moteur verrouillent la ligne de l'équipe (jets, cordée) et les lignes qui la référencent ; un
 * compteur posé dessus, écrit à chaque geste, s'y interbloquait (relevé par le banc
 * `multi-appareils`). Ici, chaque écriture est une instruction seule, sur une seule ligne, que
 * rien d'autre ne verrouille.
 */

const database = require('../database');
const logger = require('./logger');
const glClock = require('./glClock');
const asyncHandler = require('./asyncHandler');
const { parseId } = require('./shared/httpHelpers');
const { hashJti } = require('./glGuestToken');
const core = require('./shared/glMainCore');

const EN_TETE_VERSION = 'X-GL-Etat-Version';

function acteurDe(req) {
  // `require` paresseux : `lib/glActeur.js` lit `lib/glTenir.js`, chargé après ce module.
  return require('./glActeur').actorOf(req);
}

/** Clé d'une session d'équipe : empreinte courte de son `jti`, jamais le jeton. */
function cleDeSession(teamSession) {
  const jti = String(teamSession?.jti || '');
  return jti ? hashJti(jti).slice(0, 16) : null;
}

/** Porteur d'un `glAuth` hydraté (requête HTTP ou socket) : `p:<id>`, `s:<clé>` ou `null`. */
function porteurDeLAuth(glAuth) {
  if (!glAuth) return null;
  if (glAuth.userType === 'gl_player') {
    return core.porteurDe({ kind: 'player', playerId: Number(glAuth.userId) });
  }
  if (glAuth.teamSession) {
    return core.porteurDe({ kind: 'team' }, cleDeSession(glAuth.teamSession));
  }
  return null;
}

const ERRNOS_A_REJOUER = Object.freeze([1213, 1205]);

/** Rejoue une écriture victime d'un interblocage ou d'une attente de verrou (rare). */
async function avecReprise(ecrire) {
  for (let essai = 0; ; essai += 1) {
    try {
      return await ecrire();
    } catch (err) {
      if (!ERRNOS_A_REJOUER.includes(Number(err?.errno)) || essai >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 10 * (essai + 1)));
    }
  }
}

/** État d'une équipe : `{ etat_version, main_holder, main_geste, main_expire_ms }`, ou rien. */
async function chargerEtat(db, gameId, teamId) {
  return db.queryOne(
    `SELECT team_id AS id, version AS etat_version, main_holder, main_geste, main_expire_ms
       FROM gl_team_etat WHERE team_id = ? AND game_id = ? LIMIT 1`,
    [teamId, gameId],
  );
}

/** Crée la ligne d'état d'une équipe de la partie à son premier geste. */
async function assurerEtat(db, gameId, teamId) {
  const existant = await chargerEtat(db, gameId, teamId);
  if (existant) return existant;
  const team = await db.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
  if (!team) return null;
  await avecReprise(() =>
    db.execute(
      'INSERT IGNORE INTO gl_team_etat (team_id, game_id, version, updated_at) VALUES (?, ?, 0, NOW())',
      [teamId, gameId],
    ),
  );
  return chargerEtat(db, gameId, teamId);
}

async function prenomDuPorteur(db, porteur) {
  const playerId = core.joueurDuPorteur(porteur);
  if (!playerId) return null;
  const row = await db.queryOne('SELECT first_name, pseudo FROM gl_players WHERE id = ? LIMIT 1', [
    playerId,
  ]);
  return String(row?.first_name || row?.pseudo || '').trim() || null;
}

/**
 * Prise d'un geste : la version avance, et la main est prise si le geste est décisif. Un seul
 * `UPDATE` conditionnel : entre deux appareils partis au même instant, un seul passe.
 *
 * @param {object} db `{ queryOne, execute }`
 * @param {object} input
 * @param {string|null} input.porteur `null` : le prof (ni version exigée, ni main)
 * @param {number|null} input.versionVue `null` : pas de contrôle de version
 * @param {string|null} input.prendre geste décisif qui prend la main, ou `null`
 * @param {boolean} [input.sansMain] geste sans enjeu (fermer une péripétie) : la version seule
 *   compte, la main d'un autre appareil ne le retient pas
 * @returns {Promise<{ ok: true, version: number, avaitLaMain: boolean, mainPrise: boolean } |
 *   { ok: false, code: string, version: number, main: object|null }>}
 */
async function prendreGeste(
  db,
  { gameId, teamId, porteur = null, versionVue = null, prendre = null, sansMain = false },
) {
  const now = glClock.nowMs();
  const avant = await assurerEtat(db, gameId, teamId);
  if (!avant) return { ok: false, code: 'TEAM_NOT_FOUND', version: 0, main: null };
  const mainAvant = core.mainTenue(avant, now);
  const sets = ['version = version + 1', 'updated_at = NOW()'];
  const params = [];
  const mainPrise = !!prendre && porteur != null;
  if (mainPrise) {
    sets.push('main_holder = ?', 'main_geste = ?', 'main_expire_ms = ?');
    params.push(porteur, String(prendre), now + core.MAIN_DUREE_MS);
  }
  const where = ['team_id = ?', 'game_id = ?'];
  params.push(teamId, gameId);
  if (versionVue != null) {
    where.push('version = ?');
    params.push(versionVue);
  }
  const retenuParLaMain = porteur != null && !sansMain;
  if (retenuParLaMain) {
    where.push(
      '(main_holder IS NULL OR main_holder = ? OR main_expire_ms IS NULL OR main_expire_ms <= ?)',
    );
    params.push(porteur, now);
  }
  const result = await avecReprise(() =>
    db.execute(`UPDATE gl_team_etat SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`, params),
  );
  if (Number(result?.affectedRows) > 0) {
    const apres = await chargerEtat(db, gameId, teamId);
    return {
      ok: true,
      version: Number(apres?.etat_version) || 0,
      avaitLaMain: !!mainAvant && mainAvant.holder === porteur,
      mainPrise,
    };
  }
  // Refus : on relit pour dire pourquoi (la main d'abord — elle explique mieux l'attente).
  const etat = (await chargerEtat(db, gameId, teamId)) || avant;
  const main = core.mainTenue(etat, glClock.nowMs());
  const version = Number(etat.etat_version) || 0;
  if (retenuParLaMain && !core.peutAgir(main, porteur)) {
    return { ok: false, code: core.CODE_MAIN_AILLEURS, version, main };
  }
  return { ok: false, code: core.CODE_ETAT_PERIME, version, main };
}

/** Un geste refusé par le moteur rend sa version, si personne n'a joué entre-temps. */
async function rendreVersion(db, { gameId, teamId, version }) {
  if (!(Number(version) > 0)) return false;
  const result = await avecReprise(() =>
    db.execute(
      'UPDATE gl_team_etat SET version = version - 1 WHERE team_id = ? AND game_id = ? AND version = ?',
      [teamId, gameId, version],
    ),
  );
  return Number(result?.affectedRows) > 0;
}

const MAIN_RENDUE = 'main_holder = NULL, main_geste = NULL, main_expire_ms = NULL';

/** Rend la main d'une équipe si ce porteur la tient. */
async function rendreLaMain(db, { gameId, teamId, porteur }) {
  if (!porteur) return false;
  const result = await avecReprise(() =>
    db.execute(
      `UPDATE gl_team_etat SET ${MAIN_RENDUE} WHERE team_id = ? AND game_id = ? AND main_holder = ?`,
      [teamId, gameId, porteur],
    ),
  );
  return Number(result?.affectedRows) > 0;
}

/**
 * Le prof vient de finir un geste à la place de l'équipe (il a répondu, lancé ou annulé le
 * sort) : la main prise par un appareil pour CE geste n'a plus d'objet et se rend, sans
 * attendre son échéance. Une main prise pour un autre geste n'est pas touchée.
 */
async function rendreLaMainDuGeste(db, { gameId, teamId, geste }) {
  if (!geste) return false;
  const result = await avecReprise(() =>
    db.execute(
      `UPDATE gl_team_etat SET ${MAIN_RENDUE}
        WHERE team_id = ? AND game_id = ? AND main_holder IS NOT NULL AND main_geste = ?`,
      [teamId, gameId, String(geste)],
    ),
  );
  return Number(result?.affectedRows) > 0;
}

/** Changement de phase, clôture : plus aucune main sur la partie. */
async function rendreToutesLesMains(db, gameId) {
  const result = await avecReprise(() =>
    db.execute(
      `UPDATE gl_team_etat SET ${MAIN_RENDUE} WHERE game_id = ? AND main_holder IS NOT NULL`,
      [gameId],
    ),
  );
  return Number(result?.affectedRows) || 0;
}

/**
 * L'appareil s'est déconnecté (ou sa session est révoquée) : ses mains se rendent.
 * @returns {Promise<Array<{ gameId: number, teamId: number }>>} équipes libérées
 */
async function rendreLesMainsDuPorteur(db, porteur) {
  if (!porteur) return [];
  const rows = await db.queryAll(
    'SELECT team_id, game_id FROM gl_team_etat WHERE main_holder = ?',
    [porteur],
  );
  if (!rows.length) return [];
  await avecReprise(() =>
    db.execute(`UPDATE gl_team_etat SET ${MAIN_RENDUE} WHERE main_holder = ?`, [porteur]),
  );
  return rows.map((r) => ({ gameId: Number(r.game_id), teamId: Number(r.team_id) }));
}

/** Prévient les écrans de l'équipe que la main ou les appareils ont changé (aucun nom). */
function signalerEquipe(gameId, teamId, type = 'main') {
  try {
    require('./realtime').emitGlEquipeSignal(gameId, { teamId: Number(teamId), type });
  } catch (err) {
    logger.warn({ err, gameId }, 'Signal d’équipe G&L non émis');
  }
}

/**
 * Un élève connecté avec son compte regarde-t-il ce tour sans jouer ? Oui s'il est noté absent
 * du tour ouvert, ou en retrait.
 */
async function estSpectateur(db, { gameId, playerId, roundNumber }) {
  if (!(Number(playerId) > 0)) return false;
  const retrait = await db.queryOne(
    'SELECT id FROM gl_game_retraits WHERE game_id = ? AND player_id = ? AND sortie_at IS NULL LIMIT 1',
    [gameId, playerId],
  );
  if (retrait) return true;
  if (!(Number(roundNumber) > 0)) return false;
  const absent = await db.queryOne(
    'SELECT player_id FROM gl_game_round_absences WHERE game_id = ? AND round_number = ? AND player_id = ? LIMIT 1',
    [gameId, roundNumber, playerId],
  );
  return !!absent;
}

/** Tour courant d'une partie « Tenir » : `{ tenir, roundNumber, phase, ouvert }`. */
async function lireTour(db, gameId) {
  const row = await db.queryOne(
    `SELECT g.id, g.status, g.tenir_profil, g.tenir_overrides_json, g.current_round_number, r.phase
       FROM gl_games g
       LEFT JOIN gl_game_rounds r ON r.game_id = g.id AND r.round_number = g.current_round_number
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  if (!row) return null;
  const { getGameplaySettings } = require('./glSettings');
  const { isTenirGame } = require('./glTenir');
  const phase = row.phase || null;
  return {
    tenir: isTenirGame(await getGameplaySettings(), row),
    roundNumber: Number(row.current_round_number) || 0,
    phase,
    ouvert: !!phase && phase !== 'clos',
  };
}

/**
 * Bloc `equipe` servi à un appareil dans l'état de sa partie : la version à renvoyer avec le
 * prochain geste, et la main (« Lina répond… », prénom seul).
 */
async function vueEquipe(db, { gameId, teamId, porteur = null }) {
  // Une équipe qui n'a encore fait aucun geste n'a pas de ligne : version 0, personne à la main.
  const etat = (await chargerEtat(db, gameId, teamId)) || { etat_version: 0 };
  const now = glClock.nowMs();
  const main = core.mainTenue(etat, now);
  return {
    gameId: Number(gameId),
    teamId: Number(teamId),
    version: Number(etat.etat_version) || 0,
    main: core.decrireMain({
      main,
      porteur,
      prenom: main && main.holder !== porteur ? await prenomDuPorteur(db, main.holder) : null,
      nowMs: now,
    }),
  };
}

function refuser(res, status, code, error, extra = {}) {
  return res.status(status).json({ error, code, ...extra });
}

/**
 * Garde d'un geste d'équipe. À poser après le middleware d'authentification.
 *
 * @param {object} [options]
 * @param {string|null} [options.prend] geste décisif : la main est prise pour 60 s
 * @param {boolean} [options.rend] la main se rend à la fin du geste (réponse donnée, sort lancé)
 * @param {string|null} [options.finit] geste décisif que cette route termine (`repondre`,
 *   `fouiller`, `tenir`, `sort`) : quand c'est le prof qui la joue pour l'équipe, la main qu'un
 *   appareil tenait pour ce geste se rend aussi
 * @param {boolean} [options.sansMain] geste sans enjeu : la version seule le protège
 * @param {(req) => any} [options.equipeDuProf] équipe visée quand c'est le prof qui agit
 *   (identifiant, ou promesse d'identifiant)
 */
function gardeDEquipe({
  prend = null,
  rend = false,
  finit = null,
  sansMain = false,
  equipeDuProf = (req) => req.body?.teamId,
} = {}) {
  return asyncHandler(async (req, res, next) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return next();
    const actor = acteurDe(req);
    const db = database;
    let teamId = null;
    if (actor.kind === 'mj') teamId = parseId(await equipeDuProf(req));
    else if (actor.kind === 'team') {
      teamId = Number(actor.gameId) === gameId ? Number(actor.teamId) : null;
    } else if (actor.kind === 'player') {
      const row = await db.queryOne(
        'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
        [gameId, actor.playerId],
      );
      teamId = row?.team_id != null ? Number(row.team_id) : null;
    }
    // Sans équipe, la route répond elle-même (400, 403) : la garde n'a rien à protéger.
    if (!teamId) return next();
    const tour = await lireTour(db, gameId);
    if (!tour || !tour.tenir || !tour.ouvert) return next();

    if (
      actor.kind === 'player' &&
      (await estSpectateur(db, { gameId, playerId: actor.playerId, roundNumber: tour.roundNumber }))
    ) {
      return refuser(res, 403, core.CODE_SPECTATEUR, core.MESSAGE_SPECTATEUR);
    }

    const porteur = porteurDeLAuth(req.glAuth);
    const versionVue =
      actor.kind === 'mj'
        ? null
        : core.lireVersionVue(req.get(EN_TETE_VERSION) ?? req.body?.etatVersion);
    const prise = await prendreGeste(db, {
      gameId,
      teamId,
      porteur,
      versionVue,
      prendre: prend,
      sansMain,
    });
    if (!prise.ok) {
      if (prise.code === 'TEAM_NOT_FOUND') return next();
      const etatVersion = { gameId, teamId, version: prise.version };
      if (prise.code === core.CODE_MAIN_AILLEURS) {
        const prenom = await prenomDuPorteur(db, prise.main.holder);
        return refuser(
          res,
          409,
          core.CODE_MAIN_AILLEURS,
          core.messageMainAilleurs({
            prenom,
            geste: prise.main.geste,
            tablette: core.joueurDuPorteur(prise.main.holder) == null,
          }),
          {
            etatVersion,
            main: core.decrireMain({ main: prise.main, porteur, prenom, nowMs: glClock.nowMs() }),
          },
        );
      }
      return refuser(res, 409, core.CODE_ETAT_PERIME, core.MESSAGE_ETAT_PERIME, { etatVersion });
    }

    const garde = {
      gameId,
      teamId,
      porteur,
      version: prise.version,
      // La route peut en décider autrement (`req.glGarde.rend = false` : une fouille qui ouvre
      // une question garde la main jusqu'à la réponse).
      rend,
    };
    req.glGarde = garde;
    let fini = false;
    const finir = async (statut) => {
      if (fini) return;
      fini = true;
      try {
        // Les autres écrans ne sont prévenus que si la main a changé de mains pour de bon :
        // prise puis rendue dans le même geste (une fouille sans question), ils n'ont rien vu.
        const vientDeLaPrendre = prise.mainPrise && !prise.avaitLaMain;
        let mainChangee = vientDeLaPrendre;
        if (statut >= 400) {
          await rendreVersion(db, garde);
          // Un geste décisif refusé ne garde pas une main qu'il vient de prendre.
          if (vientDeLaPrendre) await rendreLaMain(db, garde);
          mainChangee = false;
        } else if (garde.rend && (await rendreLaMain(db, garde))) {
          mainChangee = !vientDeLaPrendre;
        } else if (
          garde.rend &&
          !porteur &&
          finit &&
          (await rendreLaMainDuGeste(db, { gameId, teamId, geste: finit }))
        ) {
          // Le prof a fini le geste pour l'équipe : ses écrans ne restent pas sur « … répond… ».
          mainChangee = true;
        }
        if (mainChangee) signalerEquipe(gameId, teamId, 'main');
      } catch (err) {
        logger.warn({ err, gameId, teamId }, 'Garde d’équipe G&L : fin de geste en échec');
      }
    };
    // La fin du geste précède la réponse : l'écran qui recharge aussitôt lit un état à jour.
    const envoyer = res.json.bind(res);
    res.json = (body) => {
      const statut = res.statusCode;
      finir(statut).then(() => {
        const avecVersion =
          statut < 400 && body && typeof body === 'object' && !Array.isArray(body)
            ? { ...body, etatVersion: { gameId, teamId, version: garde.version } }
            : body;
        envoyer(avecVersion);
      });
      return res;
    };
    // Connexion coupée avant la réponse : la route continue et finira le geste elle-même. La
    // version n'est surtout pas rendue ici — l'app rejoue une écriture après une coupure, avec
    // la même version : elle doit alors la trouver périmée.
    return next();
  });
}

module.exports = {
  EN_TETE_VERSION,
  cleDeSession,
  porteurDeLAuth,
  chargerEtat,
  assurerEtat,
  prendreGeste,
  rendreVersion,
  rendreLaMain,
  rendreLaMainDuGeste,
  rendreToutesLesMains,
  rendreLesMainsDuPorteur,
  signalerEquipe,
  estSpectateur,
  lireTour,
  vueEquipe,
  gardeDEquipe,
};
