'use strict';

/**
 * « Tenir à deux » v2 — exécution des effets automatiques du grimoire v2 (spec § 10).
 * `applySpellEffectTx(tx, { gameId, draft, spell, params, roundNumber, settings, actor })`
 * est appelé par `finalizeCastTx` après le débit. Les sorts `execution = 'prof'` sont mis en
 * file (`spell_file`) ; `appliquerNommerTx` sert la route `effect-applied { zoneKey }`.
 *
 * Invariant (§ 2) : aucun sort ne crée de ressource, sauf la réparation d'une page par
 * « Nommer » (+1 cœur aux Gnomes de l'équipe, documenté).
 */

const { insertGameEvent } = require('./glGameEvents');
const { applyTeamMoveTx } = require('./gl/gamesRuntime');
const { applyPlayerVitalityDelta, resolveVitalityCaps } = require('./glVitality');
const {
  targetMarkerAfterPathSteps,
  resolveBoardPathStartIndex,
} = require('./shared/glBoardPathCore');
const { markerTonalite } = require('./glMarkerVitalityEffects');
const {
  parseEffect,
  TENIR_SPELL_EFFECTS,
  effectType,
  AIDE_SPELL_CODES,
} = require('./glSpellEffects');
const tour = require('./glTour');
const chasse = require('./glChasse');
const { resolveTenirSettings } = require('./glTenir');

function fail(code, status = 400, extra = {}) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/** Effet d'un sort : objet de la table (`effet_auto_json`) ou repli par code. */
function resolveSpellEffect(spell) {
  const fromRow = parseEffect(spell?.effetAutoJson ?? spell?.effet_auto_json);
  if (fromRow) return fromRow;
  return TENIR_SPELL_EFFECTS[String(spell?.spellCode || spell?.spell_code || '')] || null;
}

async function insertEffet(
  tx,
  { gameId, roundNumber, kind, teamId = null, sourceTeamId = null, payload = null },
) {
  const r = await tx.execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, source_team_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      gameId,
      Number(roundNumber) || 0,
      kind,
      teamId,
      sourceTeamId,
      payload ? JSON.stringify(payload) : null,
    ],
  );
  return r.insertId;
}

async function loadTeamRow(tx, gameId, teamId) {
  const team = await tx.queryOne(
    'SELECT id, type, name, position_marker_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE',
    [teamId, gameId],
  );
  if (!team) throw fail('TEAM_NOT_FOUND', 404);
  return team;
}

function markerPoint(marker) {
  return { x: Number(marker.x_pct) / 100, y: Number(marker.y_pct) / 100 };
}

async function effectEvent(tx, { gameId, teamId, actor, draft, spell, type, extra = {} }) {
  return insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    eventType: 'spell_effect',
    payload: {
      type,
      spellCode: spell.spellCode,
      spellName: spell.nom,
      draftId: Number(draft.id),
      teamId: Number(draft.team_id),
      aide: AIDE_SPELL_CODES.includes(String(spell.spellCode)),
      ...extra,
    },
  });
}

/**
 * @returns {Promise<{ applied: boolean, auto: boolean, events: Array, result?: object }>}
 */
async function applySpellEffectTx(
  tx,
  { gameId, draft, spell, params = {}, roundNumber = 0, settings, actor },
) {
  const effect = resolveSpellEffect(spell);
  const execution = String(spell.execution || (effect ? 'auto' : 'prof'));
  const events = [];
  const teamId = Number(draft.team_id);
  if (execution === 'prof' || !effect) {
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        eventType: 'spell_file',
        payload: {
          spellCode: spell.spellCode,
          spellName: spell.nom,
          draftId: Number(draft.id),
          effetCourt: spell.effetCourt || null,
          ...(effect ? { type: effectType(effect) } : {}),
          ...(params?.zoneKey ? { zoneKey: String(params.zoneKey) } : {}),
        },
      }),
    );
    return { applied: false, auto: false, events };
  }
  const type = effectType(effect);
  const suspension = require('./glArriveeSuspendue');
  // Tout autre sort automatique fait avancer la partie : les arrivées laissées en suspens
  // (Relance non lancée) s'appliquent d'abord — Progression part ainsi de la case jouée.
  if (type !== 'reroll') {
    const confirmees = await suspension.confirmerArriveesTx(tx, { gameId, settings });
    events.push(...confirmees.events);
  }
  const game = await tour.loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  const markers = await tour.loadPathMarkers(tx, game.chapter_id);
  const startIndex = resolveBoardPathStartIndex(game);
  const base = { gameId, teamId, actor, draft, spell };
  let result = null;

  switch (type) {
    case 'move_delta': {
      const choix = (effect.choix || [-1, 1]).map(Number);
      const delta = Number(params?.delta);
      if (!choix.includes(delta)) throw fail('SPELL_PARAM_DELTA', 400, { choix });
      const team = await loadTeamRow(tx, gameId, teamId);
      const target = targetMarkerAfterPathSteps(markers, team, delta, startIndex);
      if (!target?.marker) throw fail('NO_PATH', 409);
      await applyTeamMoveTx(tx, { gameId, teamId, markerId: target.marker.id });
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: { delta, markerId: Number(target.marker.id), index: target.index },
        }),
      );
      // C1 : la case d'arrivée ne s'applique que si le réglage le demande (défaut : non). Une
      // case question atteinte n'est donc pas présentée, une Trame ne redonne rien.
      if (resolved.progression_applique_case === true) {
        const arrival = await tour.applyArrivalTx(tx, {
          gameId,
          teamId,
          marker: target.marker,
          game,
          settings,
          resolved,
          actorType: actor.actorType,
          actorId: actor.actorId,
          markers,
        });
        events.push(...arrival.events);
        result = { delta, target: target.index, arrival: arrival.summary };
      } else result = { delta, target: target.index };
      break;
    }
    case 'reroll': {
      // Annule le jet en suspens : la mascotte revient, la case d'arrivée ne s'applique jamais
      // (409 `RELANCE_SANS_JET` sans jet en suspens). Puis réarme le dé : `consumeRelanceTx`
      // saute la réclamation du tour au prochain jet.
      const annulation = await suspension.annulerArriveeTx(tx, {
        gameId,
        teamId,
        actor,
        draftId: draft.id,
        spellCode: spell.spellCode,
      });
      events.push(...annulation.events);
      await insertEffet(tx, {
        gameId,
        roundNumber,
        kind: 'relance',
        teamId,
        payload: { draftId: draft.id },
      });
      const reset = Math.max(0, (Number(roundNumber) || 1) - 1);
      await tx.execute(
        'UPDATE gl_teams SET last_dice_round_number = ?, last_move_round_number = ?, updated_at = NOW() WHERE id = ?',
        [reset, reset, teamId],
      );
      if (effect.annule_precedent !== false) {
        await tx.execute(
          "UPDATE gl_game_des_saisies SET statut = 'refusee' WHERE game_id = ? AND team_id = ? AND round_number = ? AND statut = 'en_attente'",
          [gameId, teamId, Number(roundNumber) || 0],
        );
      }
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: { annuleMarkerId: annulation.annule.markerId, total: annulation.annule.total },
        }),
      );
      result = { relance: true, jetAnnule: annulation.annule.total };
      break;
    }
    case 'mascotte_danse': {
      const targetTeamId = Number(params?.targetTeamId);
      if (!targetTeamId || targetTeamId === teamId) throw fail('SPELL_PARAM_CIBLE', 400);
      await loadTeamRow(tx, gameId, targetTeamId);
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: { targetTeamId, dureeS: Number(effect.duree_s) || 10 },
        }),
      );
      result = { targetTeamId };
      break;
    }
    case 'heritage': {
      const { enregistrerHeritageTx } = require('./glHeritage');
      const h = await enregistrerHeritageTx(tx, {
        gameId,
        classId: Number(game.class_id),
        draft,
        legatairePlayerId: Number(
          draft.player_id || draft.created_by_player_id || params?.legatairePlayerId,
        ),
        beneficiairePlayerId: Number(params?.beneficiairePlayerId),
        ressource: params?.ressource,
        montant: Number(effect.montant) || 2,
      });
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: {
            heritageId: h.id,
            private: true,
            publicKeys: ['type', 'spellCode', 'spellName', 'draftId', 'teamId', 'aide'],
          },
        }),
      );
      result = h;
      break;
    }
    case 'reveler_zone': {
      const team = await loadTeamRow(tx, gameId, teamId);
      const marker =
        markers.find((m) => Number(m.id) === Number(team.position_marker_id)) || markers[0];
      const zones = await chasse.loadZonesForGame(tx, game, resolved);
      const pages = await chasse.loadPages(tx, gameId);
      const near = chasse.nearestSleepingZone(
        zones,
        pages,
        marker ? markerPoint(marker) : { x: 0.5, y: 0.5 },
      );
      const candidate =
        near && (pages.get(near.zone.id)?.etat || 'endormie') === 'endormie'
          ? near.zone
          : zones.find((z) => (pages.get(z.id)?.etat || 'endormie') === 'endormie');
      if (!candidate) throw fail('SPELL_AUCUNE_ZONE', 409);
      await tx.execute(
        `INSERT INTO gl_game_chasse_pages (game_id, zone_id, etat, updated_at) VALUES (?, ?, 'revelee', NOW())
         ON DUPLICATE KEY UPDATE etat = IF(etat = 'endormie', 'revelee', etat), updated_at = NOW()`,
        [gameId, candidate.id],
      );
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          eventType: 'page_revelee',
          payload: { zoneKey: candidate.zoneKey, via: 'lanterne' },
        }),
      );
      events.push(await effectEvent(tx, { ...base, type, extra: { zoneKey: candidate.zoneKey } }));
      result = { zoneKey: candidate.zoneKey };
      break;
    }
    case 'apercu_cases': {
      const team = await loadTeamRow(tx, gameId, teamId);
      const n = Number(effect.n) || 6;
      const cases = [];
      for (let i = 1; i <= n; i += 1) {
        const t = targetMarkerAfterPathSteps(markers, team, i, startIndex);
        if (!t?.marker) break;
        cases.push({
          index: t.index,
          label: t.marker.label || null,
          eventType: t.marker.event_type,
          tonalite: markerTonalite(t.marker) || null,
        });
        if (t.index >= markers.length - 1) break;
      }
      await insertEffet(tx, { gameId, roundNumber, kind: 'boussole', teamId, payload: { cases } });
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: {
            cases,
            private: true,
            publicKeys: ['type', 'spellCode', 'spellName', 'draftId', 'teamId', 'aide'],
          },
        }),
      );
      result = { cases };
      break;
    }
    case 'move_delta_cible': {
      const targetTeamId = Number(params?.targetTeamId);
      if (!targetTeamId || targetTeamId === teamId) throw fail('SPELL_PARAM_CIBLE', 400);
      const target = await loadTeamRow(tx, gameId, targetTeamId);
      const dest = targetMarkerAfterPathSteps(
        markers,
        target,
        Number(effect.delta) || 3,
        startIndex,
      );
      if (!dest?.marker) throw fail('NO_PATH', 409);
      await applyTeamMoveTx(tx, { gameId, teamId: targetTeamId, markerId: dest.marker.id });
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId: targetTeamId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          eventType: 'move',
          payload: {
            markerId: Number(dest.marker.id),
            markerLabel: dest.marker.label || null,
            index: dest.index,
            xp: Number(dest.marker.x_pct),
            yp: Number(dest.marker.y_pct),
            spell: spell.spellCode,
          },
        }),
      );
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: {
            targetTeamId,
            delta: Number(effect.delta) || 3,
            markerId: Number(dest.marker.id),
          },
        }),
      );
      result = { targetTeamId, target: dest.index };
      break;
    }
    case 'fouilles_bonus': {
      await insertEffet(tx, {
        gameId,
        roundNumber,
        kind: 'fouilles_bonus',
        teamId: null,
        sourceTeamId: teamId,
        payload: { n: Number(effect.delta) || 1 },
      });
      events.push(
        await effectEvent(tx, { ...base, type, extra: { delta: Number(effect.delta) || 1 } }),
      );
      result = { delta: Number(effect.delta) || 1 };
      break;
    }
    case 'ignorer_prochaine_case_souffle': {
      await insertEffet(tx, { gameId, roundNumber, kind: 'sentier', teamId });
      events.push(await effectEvent(tx, { ...base, type }));
      result = { sentier: true };
      break;
    }
    case 'abri': {
      const targetTeamId = Number(params?.targetTeamId);
      if (!targetTeamId || targetTeamId === teamId) throw fail('SPELL_PARAM_CIBLE', 400);
      await loadTeamRow(tx, gameId, targetTeamId);
      await insertEffet(tx, {
        gameId,
        roundNumber,
        kind: 'abri',
        teamId: targetTeamId,
        sourceTeamId: teamId,
      });
      events.push(await effectEvent(tx, { ...base, type, extra: { targetTeamId } }));
      result = { targetTeamId };
      break;
    }
    case 'rejoindre_case_lanceur': {
      const team = await loadTeamRow(tx, gameId, teamId);
      const teams = await tour.loadTeams(tx, gameId);
      const late = tour.equipeLaPlusEnRetard(teams, markers, teamId);
      if (!late || !team.position_marker_id) throw fail('SPELL_AUCUNE_CIBLE', 409);
      await applyTeamMoveTx(tx, { gameId, teamId: late.id, markerId: team.position_marker_id });
      const marker = markers.find((m) => Number(m.id) === Number(team.position_marker_id));
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId: Number(late.id),
          actorType: actor.actorType,
          actorId: actor.actorId,
          eventType: 'move',
          payload: {
            markerId: Number(team.position_marker_id),
            markerLabel: marker?.label || null,
            index: markers.findIndex((m) => Number(m.id) === Number(team.position_marker_id)),
            xp: Number(marker?.x_pct),
            yp: Number(marker?.y_pct),
            spell: spell.spellCode,
          },
        }),
      );
      events.push(
        await effectEvent(tx, {
          ...base,
          type,
          extra: { targetTeamId: Number(late.id), markerId: Number(team.position_marker_id) },
        }),
      );
      result = { targetTeamId: Number(late.id) };
      break;
    }
    case 'cordee': {
      const partnerTeamId = Number(draft.partner_team_id || params?.partnerTeamId);
      if (!partnerTeamId || partnerTeamId === teamId) throw fail('SPELL_PARAM_PARTENAIRE', 400);
      await loadTeamRow(tx, gameId, partnerTeamId);
      await insertEffet(tx, {
        gameId,
        roundNumber,
        kind: 'cordee',
        teamId,
        sourceTeamId: partnerTeamId,
        payload: { jets: {} },
      });
      events.push(await effectEvent(tx, { ...base, type, extra: { partnerTeamId } }));
      result = { partnerTeamId };
      break;
    }
    case 'lumiere':
    case 'reparer_zone':
    default: {
      // Exécution du prof (Nommer, Lumière) : en file.
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          eventType: 'spell_file',
          payload: {
            spellCode: spell.spellCode,
            spellName: spell.nom,
            draftId: Number(draft.id),
            type,
            effetCourt: spell.effetCourt || null,
            ...(params?.zoneKey ? { zoneKey: String(params.zoneKey) } : {}),
          },
        }),
      );
      return { applied: false, auto: false, events };
    }
  }
  return { applied: true, auto: true, events, result, type };
}

/**
 * « Nommer » (prof, `effect-applied { zoneKey }`) : une page `palie` → `reparee`, découvreuse =
 * l'équipe, +1 cœur à chaque Gnome de l'équipe (spec § 10, documenté § 2).
 */
async function appliquerNommerTx(tx, { gameId, draft, zoneKey, settings, actor, roundNumber = 0 }) {
  const teamId = Number(draft.team_id);
  const zone = await tx.queryOne(
    'SELECT id, zone_key, feuillet_code FROM gl_chasse_zones WHERE zone_key = ? LIMIT 1',
    [zoneKey],
  );
  if (!zone) throw fail('ZONE_INTROUVABLE', 404);
  const page = await tx.queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ? LIMIT 1 FOR UPDATE',
    [gameId, zone.id],
  );
  if (!page || String(page.etat) !== 'palie') throw fail('PAGE_PAS_PALIE', 409);
  await tx.execute(
    `UPDATE gl_game_chasse_pages SET etat = 'reparee', trouvee_par_team_id = ?, trouvee_at = NOW(), reparee_at = NOW(), palissement_json = NULL, updated_at = NOW()
      WHERE game_id = ? AND zone_id = ?`,
    [teamId, gameId, zone.id],
  );
  const { upsertFeuilletState } = require('./glLoreFeuillets');
  await upsertFeuilletState(tx, {
    gameId,
    teamId,
    feuilletCode: zone.feuillet_code,
    status: 'discovered',
    effacementPct: 0,
    unlockedVia: 'zone',
    discoveredSource: 'nommer',
  });
  const members = await tx.queryAll(
    'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId],
  );
  const caps = resolveVitalityCaps(settings);
  const vitality = [];
  for (const m of members)
    vitality.push(
      await applyPlayerVitalityDelta(tx, {
        playerId: m.player_id,
        healthDelta: 1,
        caps,
        cause: 'reparation',
        gameId,
      }),
    );
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    eventType: 'page_reparee',
    payload: {
      zoneKey: zone.zone_key,
      feuilletCode: zone.feuillet_code,
      via: 'nommer',
      roundNumber: Number(roundNumber) || 0,
      vitality,
      private: true,
      publicKeys: ['zoneKey', 'feuilletCode', 'via', 'roundNumber'],
    },
  });
  return { zoneKey: zone.zone_key, events: [event] };
}

module.exports = { resolveSpellEffect, applySpellEffectTx, appliquerNommerTx, insertEffet };
