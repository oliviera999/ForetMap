'use strict';

const JOURNAL_IMAGE_PREFIX = '/uploads/media-library/';
const MAX_JOURNAL_IMAGE_URL_LENGTH = 512;

const GAME_STATUS_LABELS = {
  draft: 'préparation',
  live: 'en cours',
  paused: 'en pause',
  ended: 'terminée',
};

const ACTION_TYPE_LABELS = {
  explore: 'explorer le plateau',
  quiz: 'répondre à un quiz',
  observe: 'observer la biocénose',
  story: 'avancer dans l’histoire',
  scan: 'explorer un repère',
};

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseNarrationImageUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;
  if (raw.length > MAX_JOURNAL_IMAGE_URL_LENGTH) {
    const err = new Error('JOURNAL_IMAGE_URL_INVALID');
    err.status = 400;
    err.message = 'URL image trop longue';
    throw err;
  }
  if (!raw.startsWith(JOURNAL_IMAGE_PREFIX)) {
    const err = new Error('JOURNAL_IMAGE_URL_INVALID');
    err.status = 400;
    err.message = 'URL image invalide (attendu /uploads/media-library/...)';
    throw err;
  }
  if (raw.includes('..')) {
    const err = new Error('JOURNAL_IMAGE_URL_INVALID');
    err.status = 400;
    err.message = 'URL image invalide';
    throw err;
  }
  const segments = raw.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'uploads' || segments[1] !== 'media-library') {
    const err = new Error('JOURNAL_IMAGE_URL_INVALID');
    err.status = 400;
    err.message = 'URL image invalide (attendu /uploads/media-library/...)';
    throw err;
  }
  return raw;
}

function formatActorLabel(actorType, actorId, teamLabel) {
  const type = String(actorType || 'system');
  if (type === 'mj') return 'Maître du jeu';
  if (type === 'team') return teamLabel ? `Joueur · ${teamLabel}` : 'Un joueur';
  if (type === 'system') return null;
  return null;
}

function resolveTeamLabel(teamId, teamsById) {
  if (teamId == null) return null;
  const id = Number(teamId);
  const team = teamsById?.[id] || teamsById?.[String(id)];
  if (!team) return null;
  return String(team.name || '').trim() || null;
}

function formatDelta(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function imageAltFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return 'Illustration';
  const base = raw.split('/').pop() || 'image';
  return base.replace(/\.[^.]+$/, '') || 'Illustration';
}

function teamPhrase(teamLabel, fallback) {
  return teamLabel ? `L’équipe « ${teamLabel} »` : (fallback || 'Une équipe');
}

function presentJournalEvent(event, context = {}) {
  const teamsById = context.teamsById || {};
  const forPlayer = !!context.forPlayer;
  const eventType = String(event?.eventType || '');
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const teamId = event?.teamId != null ? Number(event.teamId) : null;
  const teamLabel = resolveTeamLabel(teamId, teamsById);
  const actorLabel = formatActorLabel(event?.actorType, event?.actorId, teamLabel);

  const base = {
    kind: eventType || 'unknown',
    title: 'Évènement de partie',
    body: '',
    imageUrl: null,
    actorLabel,
    teamLabel,
    technical: forPlayer ? null : payload,
  };

  switch (eventType) {
    case 'narration': {
      const text = normalizeOptionalString(payload.text) || '';
      const imageUrl = normalizeOptionalString(payload.imageUrl);
      return { ...base, kind: 'narration', title: forPlayer ? 'Annonce du maître du jeu' : 'Narration du MJ', body: text || (forPlayer ? 'Le maître du jeu a partagé une annonce.' : ''), imageUrl, actorLabel: forPlayer ? 'Maître du jeu' : actorLabel };
    }
    case 'move': {
      const markerId = payload.markerId != null ? Number(payload.markerId) : null;
      const xp = payload.xp != null ? Number(payload.xp) : null;
      const yp = payload.yp != null ? Number(payload.yp) : null;
      const markerLabel = normalizeOptionalString(payload.markerLabel);
      const place = markerLabel ? `le repère « ${markerLabel} »` : (forPlayer ? 'un lieu sur la carte' : (markerId != null ? `repère #${markerId}` : 'nouvelle position'));
      return { ...base, kind: 'move', title: forPlayer ? 'Déplacement sur la carte' : 'Déplacement', body: forPlayer ? `${teamPhrase(teamLabel)} se déplace vers ${place}.` : (teamLabel ? `${teamLabel} — ${place}` : place) };
    }
    case 'turn_change': {
      const nextId = payload.teamId != null ? Number(payload.teamId) : teamId;
      const nextLabel = resolveTeamLabel(nextId, teamsById);
      const who = nextLabel ? `« ${nextLabel} »` : 'la prochaine équipe';
      return { ...base, kind: 'turn_change', title: forPlayer ? 'Changement de tour' : 'Tour de jeu', body: forPlayer ? `C’est au tour de l’équipe ${who}.` : `C’est au tour de ${nextLabel || 'équipe inconnue'}.`, teamLabel: nextLabel || teamLabel };
    }
    case 'game_status': {
      const statusKey = String(payload.status || '').toLowerCase();
      const statusLabel = GAME_STATUS_LABELS[statusKey] || (forPlayer ? 'mise à jour' : statusKey || 'inconnu');
      return { ...base, kind: 'game_status', title: forPlayer ? 'État de la partie' : 'Statut de partie', body: forPlayer ? `La partie est maintenant ${statusLabel}.` : `La partie passe en « ${statusLabel} ».`, actorLabel: forPlayer ? 'Maître du jeu' : actorLabel };
    }
    case 'score': {
      const delta = Number(payload.delta);
      const reason = normalizeOptionalString(payload.reason);
      const deltaStr = Number.isFinite(delta) ? formatDelta(delta) : '?';
      const reasonPart = reason ? ` (${reason})` : '';
      const pts = Number.isFinite(delta) && delta !== 0 ? (delta > 0 ? `gagne ${Math.abs(delta)} point${Math.abs(delta) > 1 ? 's' : ''}` : `perd ${Math.abs(delta)} point${Math.abs(delta) > 1 ? 's' : ''}`) : 'aucun changement de points';
      const reasonTxt = reason ? (forPlayer ? ` Motif : ${reason}.` : ` (${reason})`) : '';
      return { ...base, kind: 'score', title: forPlayer ? 'Points' : 'Score', body: `${teamPhrase(teamLabel)} ${pts}.${reasonTxt}`.replace(/\.\./g, '.') };
    }
    case 'vitality_change': {
      const h = formatDelta(payload.healthDelta);
      const p = formatDelta(payload.powerDelta);
      const reason = normalizeOptionalString(payload.reason);
      const reasonPart = reason ? ` — ${reason}` : '';
      const vitParts = [];
      const hd = Number(payload.healthDelta);
      const pd = Number(payload.powerDelta);
      if (Number.isFinite(hd) && hd !== 0) vitParts.push(forPlayer ? `${hd > 0 ? 'gagne' : 'perd'} ${Math.abs(hd)} cœur${Math.abs(hd) > 1 ? 's' : ''}` : `cœurs ${h}`);
      if (Number.isFinite(pd) && pd !== 0) vitParts.push(forPlayer ? `${pd > 0 ? 'gagne' : 'perd'} ${Math.abs(pd)} gemme${Math.abs(pd) > 1 ? 's' : ''}` : `gemmes ${p}`);
      const vitText = vitParts.length ? vitParts.join(forPlayer ? ', ' : ', ') : (forPlayer ? 'aucun changement de vitalité' : 'aucun changement');
      return { ...base, kind: 'vitality_change', title: forPlayer ? 'Cœurs et gemmes' : 'Vitalité', body: `${teamPhrase(teamLabel)} ${vitText}${reasonPart}`.trim() };
    }
    case 'action_request': {
      const actionKey = String(payload.actionType || '').toLowerCase();
      const actionLabel = ACTION_TYPE_LABELS[actionKey] || (forPlayer ? 'faire une action sur la carte' : actionKey || 'action');
      return { ...base, kind: 'action_request', title: forPlayer ? 'Demande des joueurs' : 'Demande d’action', body: forPlayer ? `${teamPhrase(teamLabel)} souhaite ${actionLabel}.` : `${teamPhrase(teamLabel)} demande : ${actionLabel}` };
    }
    case 'action_resolved': {
      const accepted = payload.accepted;
      const verdict = accepted === true ? (forPlayer ? 'acceptée par le maître du jeu' : 'acceptée') : accepted === false ? (forPlayer ? 'refusée par le maître du jeu' : 'refusée') : (forPlayer ? 'traitée par le maître du jeu' : 'traitée');
      return { ...base, kind: 'action_resolved', title: forPlayer ? 'Réponse du maître du jeu' : 'Action traitée', body: `${teamPhrase(teamLabel)} : demande ${verdict}.`, actorLabel: forPlayer ? 'Maître du jeu' : actorLabel };
    }
    case 'qcm_answer': {
      const correct = payload.correct === true;
      return { ...base, kind: 'qcm_answer', title: forPlayer ? 'Question du plateau' : 'Réponse QCM', body: forPlayer ? `${teamPhrase(teamLabel)} a donné une ${correct ? 'bonne' : 'mauvaise'} réponse.` : `${teamPhrase(teamLabel)} : ${correct ? 'bonne réponse' : 'réponse incorrecte'}` };
    }
    case 'marker_question_presented': {
      const markerId = payload.markerId != null ? Number(payload.markerId) : null;
      const markerLabel = normalizeOptionalString(payload.markerLabel);
      const target = markerLabel ? `« ${markerLabel} »` : (forPlayer ? 'un repère de la carte' : (markerId != null ? `repère #${markerId}` : 'un repère'));
      return { ...base, kind: 'marker_question_presented', title: forPlayer ? 'Question sur la carte' : 'Question présentée', body: forPlayer ? `${teamPhrase(teamLabel)} découvre une question à ${target}.` : `${teamPhrase(teamLabel)} — question à ${target}` };
    }
    case 'spell_cast': {
      const name = normalizeOptionalString(payload.spellName);
      const emoji = normalizeOptionalString(payload.spellEmoji);
      const label = name ? (emoji ? `${emoji} ${name}` : name) : (forPlayer ? 'un sortilège' : 'sort');
      return { ...base, kind: 'spell_cast', title: forPlayer ? 'Sortilège' : 'Sortilège lancé', body: `${teamPhrase(teamLabel)} lance ${label}.` };
    }
    case 'marker_arrival': {
      const markerLabel = normalizeOptionalString(payload.markerLabel) || 'un repère';
      const summary = normalizeOptionalString(payload.effectSummary);
      return {
        ...base,
        kind: 'marker_arrival',
        title: forPlayer ? 'Arrivée sur un repère' : 'Repère — arrivée',
        body: forPlayer
          ? `${teamPhrase(teamLabel)} découvre ${markerLabel}${summary ? ` : ${summary}` : '.'}`
          : `${teamLabel || 'Équipe'} — ${markerLabel}${summary ? ` (${summary})` : ''}`,
      };
    }
    case 'marker_effect': {
      const markerLabel = normalizeOptionalString(payload.markerLabel) || 'repère';
      const reason = normalizeOptionalString(payload.reason);
      const moveDelta = Number(payload.moveDelta);
      const parts = [];
      if (Number.isFinite(payload.healthDelta) && payload.healthDelta !== 0) {
        parts.push(`cœurs ${formatDelta(payload.healthDelta)}`);
      }
      if (Number.isFinite(payload.powerDelta) && payload.powerDelta !== 0) {
        parts.push(`gemmes ${formatDelta(payload.powerDelta)}`);
      }
      if (Number.isFinite(moveDelta) && moveDelta !== 0) {
        parts.push(`cases ${formatDelta(moveDelta)} (manuel)`);
      }
      const deltaText = parts.length ? parts.join(', ') : 'effet narratif';
      return {
        ...base,
        kind: 'marker_effect',
        title: forPlayer ? 'Effet de repère' : 'Repère — effet appliqué',
        body: forPlayer
          ? `${teamPhrase(teamLabel)} subit un effet sur « ${markerLabel} » : ${deltaText}.`
          : `« ${markerLabel} » — ${deltaText}${reason ? ` (${reason})` : ''}`,
      };
    }
    case 'feuillet_discovered': {
      const titre = normalizeOptionalString(payload.titre) || normalizeOptionalString(payload.feuilletCode) || 'un feuillet';
      return {
        ...base,
        kind: 'feuillet_discovered',
        title: forPlayer ? 'Carnet de Sélène' : 'Feuillet découvert',
        body: forPlayer
          ? `${teamPhrase(teamLabel)} découvre « ${titre} » dans le carnet.`
          : `${teamPhrase(teamLabel)} — feuillet « ${titre} »`,
      };
    }
    case 'feuillet_read': {
      const code = normalizeOptionalString(payload.feuilletCode) || 'feuillet';
      return {
        ...base,
        kind: 'feuillet_read',
        title: forPlayer ? 'Lecture du carnet' : 'Feuillet lu',
        body: forPlayer ? `${teamPhrase(teamLabel)} lit ${code}.` : `${teamPhrase(teamLabel)} — lu : ${code}`,
      };
    }
    case 'feuillet_held': {
      const code = normalizeOptionalString(payload.feuilletCode) || 'feuillet';
      const tenir = normalizeOptionalString(payload.tenir);
      return {
        ...base,
        kind: 'feuillet_held',
        title: forPlayer ? 'Feuillet retenu' : 'Feuillet tenu',
        body: forPlayer
          ? `${teamPhrase(teamLabel)} retient ${code}${tenir ? ` (${tenir})` : '.'}`
          : `${teamPhrase(teamLabel)} — tenu : ${code}`,
      };
    }
    case 'feuillet_effaced': {
      const titre = normalizeOptionalString(payload.titre) || 'un feuillet';
      return {
        ...base,
        kind: 'feuillet_effaced',
        title: forPlayer ? 'Effacement' : 'Feuillet effacé',
        body: forPlayer
          ? `« ${titre} » s’efface du carnet de ${teamPhrase(teamLabel).toLowerCase()}.`
          : `${teamPhrase(teamLabel)} — effacement : ${titre}`,
      };
    }
    default:
      return { ...base, kind: forPlayer ? 'other' : (eventType || 'unknown'), title: forPlayer ? 'Évènement' : (eventType ? `Type : ${eventType}` : base.title), body: forPlayer ? (teamLabel ? `Un évènement concerne ${teamPhrase(teamLabel).toLowerCase()}.` : 'Un évènement s’est produit dans la partie.') : (teamLabel ? `${teamPhrase(teamLabel)}` : '') };
  }
}

function buildTeamsById(teams) {
  const map = {};
  for (const team of teams || []) {
    const id = Number(team.id);
    if (!Number.isFinite(id)) continue;
    map[id] = team;
  }
  return map;
}

module.exports = {
  JOURNAL_IMAGE_PREFIX,
  parseNarrationImageUrl,
  presentJournalEvent,
  buildTeamsById,
  formatActorLabel,
  imageAltFromUrl,
};
