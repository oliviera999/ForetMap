'use strict';

/**
 * Horloge injectable du moteur Gnomes & Licornes (simulation du 7 novembre 2026).
 *
 * Toutes les fenêtres par semaine ISO ou par trimestre (veillée, pistes, Esquive, limites de
 * sort) lisent l'heure ici et non `new Date()`. En test ou en simulation, un décalage se règle :
 * - par appel direct (`setSimNow`, `setSimOffsetMs`, `resetSim`) ;
 * - par l'en-tête `X-GL-Sim-Clock` (date ISO ou millisecondes), accepté **seulement** si
 *   `GL_SIM_ALLOW=1` et hors production (`simClockMiddleware`) ; le décalage vaut pour tout le
 *   processus (le banc de simulation joue ses scénarios en série).
 */

let offsetMs = 0;

function nowMs() {
  return Date.now() + offsetMs;
}

function now() {
  return new Date(nowMs());
}

function getSimOffsetMs() {
  return offsetMs;
}

function setSimOffsetMs(ms) {
  const n = Number(ms);
  offsetMs = Number.isFinite(n) ? Math.trunc(n) : 0;
  return offsetMs;
}

/** Fixe « maintenant » sur une date (ISO, ms ou Date) ; renvoie le décalage posé. */
function setSimNow(dateLike) {
  const target = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const t = target.getTime();
  if (!Number.isFinite(t)) throw new RangeError('setSimNow : date invalide');
  return setSimOffsetMs(t - Date.now());
}

function resetSim() {
  offsetMs = 0;
}

/** L'en-tête de simulation est-il accepté ? (`GL_SIM_ALLOW=1`, jamais en production.) */
function simClockAllowed() {
  return (
    String(process.env.NODE_ENV || '').toLowerCase() !== 'production' &&
    String(process.env.GL_SIM_ALLOW || '').trim() === '1'
  );
}

/** Valeur d'en-tête → date (ISO 8601 ou millisecondes depuis l'epoch), `null` si invalide. */
function parseSimClockHeader(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const asNumber = /^\d{10,}$/.test(s) ? new Date(Number(s)) : new Date(s);
  return Number.isFinite(asNumber.getTime()) ? asNumber : null;
}

/** Express : `X-GL-Sim-Clock` pose le décalage (hors production, `GL_SIM_ALLOW=1`). */
function simClockMiddleware(req, _res, next) {
  if (!simClockAllowed()) return next();
  const raw = typeof req.get === 'function' ? req.get('x-gl-sim-clock') : null;
  if (raw == null || raw === '') return next();
  const date = parseSimClockHeader(raw);
  if (date) setSimNow(date);
  return next();
}

module.exports = {
  now,
  nowMs,
  getSimOffsetMs,
  setSimOffsetMs,
  setSimNow,
  resetSim,
  simClockAllowed,
  parseSimClockHeader,
  simClockMiddleware,
};
