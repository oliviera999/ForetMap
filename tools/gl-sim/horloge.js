'use strict';

/**
 * Horloge simulée du banc : une date de départ (un lundi de séance), avancée de 7 jours entre
 * deux séances et d'un jour entre deux soirs de veillée. Envoyée au serveur par l'en-tête
 * `X-GL-Sim-Clock` (`lib/glClock.js`, `GL_SIM_ALLOW=1` hors production) sur chaque appel, pour
 * que les fenêtres par semaine ISO (veillée, pistes) suivent la semaine simulée.
 */

const JOUR_MS = 24 * 3600 * 1000;

function creerHorloge(depart = '2026-11-09T09:00:00.000Z') {
  let t = new Date(depart).getTime();
  if (!Number.isFinite(t)) throw new RangeError(`horloge : date de départ invalide (${depart})`);
  const h = {
    now: () => new Date(t),
    iso: () => new Date(t).toISOString(),
    avancerJours(n) {
      t += Number(n) * JOUR_MS;
      return h.iso();
    },
    avancerHeures(n) {
      t += Number(n) * 3600 * 1000;
      return h.iso();
    },
    /** Le serveur relit l'heure injectée : on l'aligne aussi côté processus (même module). */
    appliquerAuServeur() {
      try {
        require('../../lib/glClock').setSimNow(new Date(t));
      } catch (_) {
        /* module absent : l'en-tête suffit */
      }
    },
  };
  return h;
}

module.exports = { JOUR_MS, creerHorloge };
