'use strict';

const JOURNAL_IMAGE_PREFIX = '/uploads/media-library/';
const MAX_JOURNAL_IMAGE_URL_LENGTH = 512;

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

function formatActorLabel(actorType, actorId) {
  const type = String(actorType || 'system');
  if (type === 'mj') return 'Maître du jeu';
  if (type === 'team') return `Joueur #${actorId || '?'}`;
  if (type === 'system') return 'Système';
  return `${type} #${actorId || '?'}`;
}

function resolveTeamLabel(teamId, teamsById) {
  if (teamId == null) return null;
  const id = Number(teamId);
  const team = teamsById?.[id] || teamsById?.[String(id)];
  if (!team) return `Équipe #${id}`;
  return String(team.name || `Équipe #${id}`);
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

function presentJournalEvent(event, context = {}) {
  const teamsById = context.teamsById || {};
  const eventType = String(event?.eventType || '');
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const teamId = event?.teamId != null ? Number(event.teamId) : null;
  const teamLabel = resolveTeamLabel(teamId, teamsById);
  const actorLabel = formatActorLabel(event?.actorType, event?.actorId);

  const base = {
    kind: eventType || 'unknown',
    title: 'Évènement de partie',
    body: '',
    imageUrl: null,
    actorLabel,
    teamLabel,
    technical: payload,
  };

  switch (eventType) {
    case 'narration': {
      const text = normalizeOptionalString(payload.text) || '';
      const imageUrl = normalizeOptionalString(payload.imageUrl);
      return { ...base, kind: 'narration', title: 'Narration du MJ', body: text, imageUrl };
    }
    case 'move': {
      const markerId = payload.markerId != null ? Number(payload.markerId) : null;
      const xp = payload.xp != null ? Number(payload.xp) : null;
      const yp = payload.yp != null ? Number(payload.yp) : null;
      const pos = markerId != null ? `repère #${markerId}` : xp != null && yp != null ? `position ${xp.toFixed(1)} % / ${yp.toFixed(1)} %` : 'nouvelle position';
      return { ...base, kind: 'move', title: 'Déplacement', body: teamLabel ? `${teamLabel} — ${pos}` : pos };
    }
    case 'turn_change': {
      const nextId = payload.teamId != null ? Number(payload.teamId) : teamId;
      const nextLabel = resolveTeamLabel(nextId, teamsById) || 'équipe inconnue';
      return { ...base, kind: 'turn_change', title: 'Changement de tour', body: `C’est au tour de ${nextLabel}.` };
    }
    case 'game_status': {
      const status = normalizeOptionalString(payload.status) || 'inconnu';
      return { ...base, kind: 'game_status', title: 'Statut de partie', body: `La partie passe en « ${status} ».` };
    }
    case 'score': {
      const delta = Number(payload.delta);
      const reason = normalizeOptionalString(payload.reason);
      const deltaStr = Number.isFinite(delta) ? formatDelta(delta) : '?';
      const reasonPart = reason ? ` (${reason})` : '';
      return { ...base, kind: 'score', title: 'Score', body: teamLabel ? `${teamLabel} : ${deltaStr} point${Math.abs(delta) === 1 ? '' : 's'}${reasonPart}` : `${deltaStr} point(s)${reasonPart}` };
    }
    case 'vitality_change': {
      const h = formatDelta(payload.healthDelta);
      const p = formatDelta(payload.powerDelta);
      const reason = normalizeOptionalString(payload.reason);
      const reasonPart = reason ? ` — ${reason}` : '';
      return { ...base, kind: 'vitality_change', title: 'Vitalité', body: teamLabel ? `${teamLabel} : cœurs ${h}, gemmes ${p}${reasonPart}` : `Cœurs ${h}, gemmes ${p}${reasonPart}` };
    }
    case 'action_request': {
      const actionType = normalizeOptionalString(payload.actionType) || 'action';
      return { ...base, kind: 'action_request', title: 'Demande d’action', body: teamLabel ? `${teamLabel} demande : ${actionType}` : `Demande : ${actionType}` };
    }
    case 'action_resolved': {
      const accepted = payload.accepted;
      const verdict = accepted === true ? 'acceptée' : accepted === false ? 'refusée' : 'traitée';
      return { ...base, kind: 'action_resolved', title: 'Action traitée', body: teamLabel ? `${teamLabel} — demande ${verdict}` : `Demande ${verdict}` };
    }
    case 'qcm_answer': {
      const correct = payload.correct === true;
      return { ...base, kind: 'qcm_answer', title: 'Réponse QCM', body: teamLabel ? `${teamLabel} : ${correct ? 'bonne réponse' : 'réponse incorrecte'}` : correct ? 'Bonne réponse' : 'Réponse incorrecte' };
    }
    case 'marker_question_presented': {
      const markerId = payload.markerId != null ? Number(payload.markerId) : null;
      const markerLabel = normalizeOptionalString(payload.markerLabel);
      const target = markerLabel || (markerId != null ? `repère #${markerId}` : 'un repère');
      return { ...base, kind: 'marker_question_presented', title: 'Question sur la carte', body: teamLabel ? `${teamLabel} — question au ${target}` : `Question présentée au ${target}` };
    }
    case 'spell_cast': {
      const name = normalizeOptionalString(payload.spellName) || normalizeOptionalString(payload.spellCode) || 'sort';
      const emoji = normalizeOptionalString(payload.spellEmoji);
      const label = emoji ? `${emoji} ${name}` : name;
      return { ...base, kind: 'spell_cast', title: 'Sortilège lancé', body: teamLabel ? `${teamLabel} lance ${label}` : `Lancement de ${label}` };
    }
    default:
      return { ...base, kind: eventType || 'unknown', title: eventType ? `Évènement « ${eventType} »` : base.title, body: teamLabel ? `${teamLabel}` : '' };
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
