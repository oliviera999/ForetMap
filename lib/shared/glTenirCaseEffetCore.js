/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/glTenirCaseEffetCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

const { resolveMarkerEventConfig } = require('./glMarkerEventConfigCore');
const { usesPeopleSpecificEffects } = require('./glMarkerEventConfigCore');

/**
 * « Tenir à deux » — vérité des cases (noyau partagé serveur / client, miroir `lib/shared/`).
 *
 * Ce que l'élève lit à l'arrivée sur une case doit être **ce que le moteur applique**, jamais le
 * texte d'auteur `effet_mecanique` (réservé au studio de plateau). Ce noyau résout l'effet
 * réellement appliqué en mode tenir — Trame = +1 gemme, cases positives sans ressource, pertes
 * et reculs neutralisés, Souffle = un seul dé au tour suivant (sauf Sentier) — et le met en mots. Le moteur (`lib/glMarkerVitalityEffects.js`) et l'affichage
 * (`lib/glMarkerEffects.js`, `src/gl/utils/glMarkerEffects.js`) partent de la même fonction :
 * un écart entre les deux est impossible par construction.
 *
 * Règles (docs/GL_TENIR_A_DEUX_REGLES.md § 4) : aucune ressource pour une bonne réponse, une
 * lecture, une arrivée ; rien ne retire une ressource sinon un sort, un échange, un don, le
 * chapardeur. L'erreur ne punit jamais : aucune phrase ici ne promet une perte en
 * cas d'échec.
 */

// Ensemble unifié (M1) : une seule monnaie, les gemmes.
const GEMME_LABELS = Object.freeze(['gemme', 'gemmes']);

/** Peuple d'une équipe : `gnome`, `unicorn` ou `null`. */
function peopleKeyOf(teamType) {
  const t = String(teamType || '')
    .trim()
    .toLowerCase();
  if (t === 'gnome') return 'gnome';
  if (t === 'unicorn' || t === 'licorne') return 'unicorn';
  return null;
}

/**
 * Ensemble unifié (M1) : la monnaie d'une équipe est la gemme (`power`), quel que soit son
 * peuple. L'ancienne « ressource du peuple » (cœurs pour un gnome) a disparu.
 */
function resourceOfPeopleCore() {
  return 'power';
}

/** Branche d'effet d'une case pour une équipe (peuple si la case en distingue, sinon neutre). */
function resolveMarkerBranchCore(marker, teamType) {
  const cfg = resolveMarkerEventConfig(marker);
  const effects = cfg?.effects || null;
  if (!effects) return null;
  const peopleKey = peopleKeyOf(teamType);
  const usePeople = usesPeopleSpecificEffects(marker) && peopleKey;
  if (usePeople && effects[peopleKey]) return { branch: peopleKey, ...effects[peopleKey] };
  if (effects.neutral) return { branch: 'neutral', ...effects.neutral };
  if (peopleKey && effects[peopleKey]) return { branch: peopleKey, ...effects[peopleKey] };
  // `effects` normalisé n'est jamais vide : sa première branche sert de repli.
  const firstKey = Object.keys(effects)[0];
  return { branch: firstKey, ...effects[firstKey] };
}

/** Tonalité d'une case : `eventMeta.tonalite`, sinon le type `trame` / `souffle`, sinon `''`. */
function markerTonaliteCore(marker) {
  const cfg = resolveMarkerEventConfig(marker);
  const meta = String(cfg?.eventMeta?.tonalite || '')
    .trim()
    .toLowerCase();
  if (meta === 'trame' || meta === 'souffle') return meta;
  const type = String(marker?.event_type || marker?.eventType || '')
    .trim()
    .toLowerCase();
  if (type === 'trame' || type === 'souffle') return type;
  return meta;
}

function delta(value) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Réglage `tenir_cases_positives` normalisé : `neutre` (défaut) ou `brut`. L'ancienne valeur
 * `ressource_peuple` (retirée par l'ensemble unifié, M3) se lit `neutre`.
 */
function normalizeCasesPositives(value) {
  return String(value || '') === 'brut' ? 'brut' : 'neutre';
}

/**
 * Effet **réellement appliqué** par le moteur en mode tenir à l'arrivée d'une équipe sur une case.
 *
 * Ensemble unifié (M3, 17 novembre 2026) :
 * - case **Souffle** : au tour suivant, l'équipe ne lance qu'un dé (`unDe`) — même effet pour
 *   les deux peuples, ni recul, ni tour passé, ni ressource retirée ; Sentier l'empêche ;
 * - case **Trame** : +1 gemme à chaque membre de l'équipe (la seule case qui donne une gemme) ;
 * - cases **positives** : leur mouvement, sans ressource ;
 * - plus aucun recul ni tour passé (`passTurn`) en mode tenir, sauf réglage `brut` ;
 * - **une seule monnaie** (M1) : une case ne touche jamais aux cœurs — `healthDelta` vaut
 *   toujours 0, même en `brut` ; un ancien `deltaPv` du plateau ne sert plus qu'à dire si la
 *   case était favorable ou non.
 *
 * @param {object} marker ligne de case (`event_type`, `event_config_json`…)
 * @param {string|null} teamType `gnome` | `unicorn`
 * @param {{ resolved?: object|null, casesPositives?: string, sentierActif?: boolean }} [options]
 *   `resolved` : branche déjà résolue (sinon calculée ici) ; `casesPositives` : réglage
 *   `tenir_cases_positives` (`neutre` | `brut`) ; `sentierActif` : un Sentier (sort gnome)
 *   neutralise la prochaine case Souffle.
 * @returns {{ branch: string|null, label: string|null, tonalite: string|null, resource: 'power',
 *   healthDelta: number, powerDelta: number, moveDelta: number, passTurn: boolean, unDe: boolean,
 *   sentier: boolean, neutralise: 'gain'|'perte'|null, applique: boolean }}
 */
function resolveTenirCaseEffet(marker, teamType, options = {}) {
  const casesPositives = normalizeCasesPositives(options.casesPositives);
  const sentierActif = options.sentierActif === true;
  const resolved =
    options.resolved !== undefined ? options.resolved : resolveMarkerBranchCore(marker, teamType);
  const tonalite = markerTonaliteCore(marker) || null;
  const resource = resourceOfPeopleCore();
  const out = {
    branch: resolved?.branch ?? null,
    label: resolved?.label ?? null,
    tonalite,
    resource,
    healthDelta: 0,
    powerDelta: 0,
    moveDelta: 0,
    passTurn: false,
    unDe: false,
    sentier: false,
    neutralise: null,
    applique: false,
  };
  const finish = (patch) => {
    const r = { ...out, ...patch };
    r.applique = Boolean(
      r.healthDelta || r.powerDelta || r.moveDelta || r.passTurn || r.unDe || r.sentier,
    );
    return r;
  };
  // Une case Souffle ou Trame agit même sans bloc `effects`.
  if (!resolved && tonalite !== 'trame' && tonalite !== 'souffle') return finish({});
  const base = {
    healthDelta: delta(resolved?.deltaPv),
    powerDelta: delta(resolved?.deltaGems),
    moveDelta: delta(resolved?.deltaMove),
  };
  // M3 : plus de recul en mode tenir (le mouvement positif d'une case reste).
  const avance = Math.max(0, base.moveDelta);
  if (tonalite === 'souffle') {
    if (sentierActif) return finish({ sentier: true });
    return finish({ unDe: true });
  }
  if (tonalite === 'trame') {
    return finish({ powerDelta: 1, moveDelta: avance });
  }
  if (casesPositives === 'brut') {
    // Les cœurs du plateau ne s'appliquent plus (M1) : une case qui n'avait que cela à donner
    // ou à prendre le dit, comme en `neutre`.
    const brut = { ...base, healthDelta: 0, passTurn: resolved?.passTurn === true };
    const reste = brut.powerDelta || brut.moveDelta || brut.passTurn;
    if (!reste && base.healthDelta > 0) return finish({ ...brut, neutralise: 'gain' });
    if (!reste && base.healthDelta < 0) return finish({ ...brut, neutralise: 'perte' });
    return finish(brut);
  }
  const unDe = resolved?.unDeAuProchainTour === true;
  const gain = base.healthDelta > 0 || base.powerDelta > 0;
  const perte = base.healthDelta < 0 || base.powerDelta < 0 || base.moveDelta < 0;
  if (gain) return finish({ tonalite: 'positif', moveDelta: avance, unDe, neutralise: 'gain' });
  if (perte) return finish({ moveDelta: avance, unDe, neutralise: 'perte' });
  return finish({ moveDelta: avance, unDe });
}

function pluriel(n, [singulier, plurielForme]) {
  return Math.abs(n) > 1 ? plurielForme : singulier;
}

function gemmesText(n) {
  const signe = n > 0 ? '+' : '−';
  return `${signe}${Math.abs(n)} ${pluriel(n, GEMME_LABELS)} pour chaque membre de l’équipe`;
}

/**
 * Met en mots l'effet appliqué (texte lu par l'élève et la classe : popover d'arrivée, journal,
 * projection). Chaîne vide quand rien ne s'applique et que rien n'a été neutralisé.
 *
 * @param {ReturnType<typeof resolveTenirCaseEffet>} effet
 * @param {{ peripetie?: boolean }} [options] une péripétie a été tirée sur la case
 */
function formatTenirCaseEffet(effet, options = {}) {
  const parts = [];
  let text = '';
  if (effet?.sentier) {
    text = 'Sentier : la case Souffle n’a aucun effet sur l’équipe.';
  } else if (effet) {
    if (effet.powerDelta) parts.push(gemmesText(effet.powerDelta));
    if (effet.moveDelta) {
      const n = Math.abs(effet.moveDelta);
      parts.push(
        `l’équipe ${effet.moveDelta > 0 ? 'avance' : 'recule'} de ${n} ${n > 1 ? 'cases' : 'case'}`,
      );
    }
    if (effet.passTurn) parts.push('l’équipe passe son tour');
    if (effet.unDe) parts.push('au prochain tour, l’équipe ne lance qu’un dé');
    if (parts.length) {
      const prefix =
        effet.tonalite === 'trame'
          ? 'Case Trame : '
          : effet.tonalite === 'souffle'
            ? 'Case Souffle : '
            : '';
      const body = parts.join(', ');
      text = `${prefix}${prefix ? body : body.charAt(0).toUpperCase() + body.slice(1)}.`;
    } else if (effet.neutralise === 'perte') {
      text = 'Le biome éprouve la caravane : rien n’est retiré, on s’abrite puis on repart.';
    } else if (effet.neutralise === 'gain') {
      text = 'Une case favorable : on repart, sans gain.';
    }
  }
  if (options.peripetie) {
    const peripetie = 'Une péripétie à relever ensemble.';
    text = text ? `${text} ${peripetie}` : peripetie;
  }
  return text;
}

/** Résolution + mise en mots en un appel (pratique pour les charges utiles d'arrivée). */
function tenirCaseEffetSummary(marker, teamType, options = {}) {
  const effet = resolveTenirCaseEffet(marker, teamType, options);
  return formatTenirCaseEffet(effet, { peripetie: options.peripetie === true });
}

module.exports = {
  peopleKeyOf,
  resourceOfPeopleCore,
  resolveMarkerBranchCore,
  markerTonaliteCore,
  normalizeCasesPositives,
  resolveTenirCaseEffet,
  formatTenirCaseEffet,
  tenirCaseEffetSummary,
};
