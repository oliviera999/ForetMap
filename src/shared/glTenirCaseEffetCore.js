import { resolveMarkerEventConfig } from './glMarkerEventConfigCore.js';
import { usesPeopleSpecificEffects } from './glMarkerEventConfigCore.js';

/**
 * « Tenir à deux » — vérité des cases (noyau partagé serveur / client, miroir `lib/shared/`).
 *
 * Ce que l'élève lit à l'arrivée sur une case doit être **ce que le moteur applique**, jamais le
 * texte d'auteur `effet_mecanique` (réservé au studio de plateau). Ce noyau résout l'effet
 * réellement appliqué en mode tenir — effets par peuple, Trame = +1 ressource du peuple, cases
 * positives converties (C4), pertes neutres neutralisées, Souffle tel quel (sauf Sentier),
 * tour passé — et le met en mots. Le moteur (`lib/glMarkerVitalityEffects.js`) et l'affichage
 * (`lib/glMarkerEffects.js`, `src/gl/utils/glMarkerEffects.js`) partent de la même fonction :
 * un écart entre les deux est impossible par construction.
 *
 * Règles (docs/GL_TENIR_A_DEUX_REGLES.md § 4) : aucune ressource pour une bonne réponse, une
 * lecture, une arrivée ; rien ne retire une ressource sinon un sort, un échange, un don, une case
 * Souffle, le chapardeur. L'erreur ne punit jamais : aucune phrase ici ne promet une perte en
 * cas d'échec.
 */

const RESSOURCE_LABELS = Object.freeze({
  health: ['cœur', 'cœurs'],
  power: ['gemme', 'gemmes'],
});

/** Peuple d'une équipe : `gnome`, `unicorn` ou `null`. */
export function peopleKeyOf(teamType) {
  const t = String(teamType || '')
    .trim()
    .toLowerCase();
  if (t === 'gnome') return 'gnome';
  if (t === 'unicorn' || t === 'licorne') return 'unicorn';
  return null;
}

/** Ressource du peuple : `power` (gemmes) pour une licorne, `health` (cœurs) sinon. */
export function resourceOfPeopleCore(teamType) {
  return peopleKeyOf(teamType) === 'unicorn' ? 'power' : 'health';
}

/** Branche d'effet d'une case pour une équipe (peuple si la case en distingue, sinon neutre). */
export function resolveMarkerBranchCore(marker, teamType) {
  const cfg = resolveMarkerEventConfig(marker);
  const effects = cfg?.effects || null;
  if (!effects) return null;
  const peopleKey = peopleKeyOf(teamType);
  const usePeople = usesPeopleSpecificEffects(marker) && peopleKey;
  if (usePeople && effects[peopleKey]) return { branch: peopleKey, ...effects[peopleKey] };
  if (effects.neutral) return { branch: 'neutral', ...effects.neutral };
  if (peopleKey && effects[peopleKey]) return { branch: peopleKey, ...effects[peopleKey] };
  const firstKey = Object.keys(effects)[0];
  return firstKey ? { branch: firstKey, ...effects[firstKey] } : null;
}

/** Tonalité d'une case : `eventMeta.tonalite`, sinon le type `trame` / `souffle`, sinon `''`. */
export function markerTonaliteCore(marker) {
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

function peopleDeltaCore(resource, n) {
  return resource === 'power'
    ? { healthDelta: 0, powerDelta: n }
    : { healthDelta: n, powerDelta: 0 };
}

/**
 * Effet **réellement appliqué** par le moteur en mode tenir à l'arrivée d'une équipe sur une case.
 *
 * @param {object} marker ligne de case (`event_type`, `event_config_json`…)
 * @param {string|null} teamType `gnome` | `unicorn`
 * @param {{ resolved?: object|null, casesPositives?: string, sentierActif?: boolean }} [options]
 *   `resolved` : branche déjà résolue (sinon calculée ici) ; `casesPositives` : réglage
 *   `tenir_cases_positives` (`ressource_peuple` | `neutre` | `brut`) ; `sentierActif` : un
 *   Sentier (sort gnome) neutralise la prochaine case Souffle.
 * @returns {{ branch: string|null, label: string|null, tonalite: string|null, resource: 'health'|'power',
 *   healthDelta: number, powerDelta: number, moveDelta: number, passTurn: boolean, sentier: boolean,
 *   neutralise: 'gain'|'perte'|null, applique: boolean }}
 */
export function resolveTenirCaseEffet(marker, teamType, options = {}) {
  const casesPositives = String(options.casesPositives || 'ressource_peuple');
  const sentierActif = options.sentierActif === true;
  const resolved =
    options.resolved !== undefined ? options.resolved : resolveMarkerBranchCore(marker, teamType);
  const tonalite = markerTonaliteCore(marker) || null;
  const resource = resourceOfPeopleCore(teamType);
  const out = {
    branch: resolved?.branch ?? null,
    label: resolved?.label ?? null,
    tonalite,
    resource,
    healthDelta: 0,
    powerDelta: 0,
    moveDelta: 0,
    passTurn: false,
    sentier: false,
    neutralise: null,
    applique: false,
  };
  const finish = (patch) => {
    const r = { ...out, ...patch };
    r.applique = Boolean(r.healthDelta || r.powerDelta || r.moveDelta || r.passTurn || r.sentier);
    return r;
  };
  // Une case Trame donne +1 ressource du peuple même sans bloc `effects`.
  if (!resolved && tonalite !== 'trame') return finish({});
  const base = {
    healthDelta: delta(resolved?.deltaPv),
    powerDelta: delta(resolved?.deltaGems),
    moveDelta: delta(resolved?.deltaMove),
  };
  const passTurn = resolved?.passTurn === true;
  if (tonalite === 'trame') {
    return finish({ ...peopleDeltaCore(resource, 1), moveDelta: base.moveDelta, passTurn });
  }
  if (tonalite === 'souffle') {
    if (sentierActif) return finish({ sentier: true });
    return finish({ ...base, passTurn });
  }
  // C4 : une branche neutre qui donne une ressource devient +1 ressource du peuple (comme la
  // Trame) ; une branche neutre qui en retire hors Souffle ne retire rien (garde-fou § 1.5).
  if (out.branch === 'neutral' && casesPositives !== 'brut') {
    const gain = base.healthDelta > 0 || base.powerDelta > 0;
    const perte = base.healthDelta < 0 || base.powerDelta < 0;
    if (gain) {
      if (casesPositives === 'neutre') {
        return finish({
          tonalite: 'positif',
          moveDelta: base.moveDelta,
          passTurn,
          neutralise: 'gain',
        });
      }
      return finish({
        tonalite: 'positif',
        ...peopleDeltaCore(resource, 1),
        moveDelta: base.moveDelta,
        passTurn,
      });
    }
    if (perte) return finish({ moveDelta: base.moveDelta, passTurn, neutralise: 'perte' });
  }
  return finish({ ...base, passTurn });
}

function pluriel(n, [singulier, plurielForme]) {
  return Math.abs(n) > 1 ? plurielForme : singulier;
}

function ressourceText(n, resource) {
  const signe = n > 0 ? '+' : '−';
  return `${signe}${Math.abs(n)} ${pluriel(n, RESSOURCE_LABELS[resource])} pour chaque membre de l’équipe`;
}

/**
 * Met en mots l'effet appliqué (texte lu par l'élève et la classe : popover d'arrivée, journal,
 * projection). Chaîne vide quand rien ne s'applique et que rien n'a été neutralisé.
 *
 * @param {ReturnType<typeof resolveTenirCaseEffet>} effet
 * @param {{ peripetie?: boolean }} [options] une péripétie a été tirée sur la case
 */
export function formatTenirCaseEffet(effet, options = {}) {
  const parts = [];
  let text = '';
  if (effet?.sentier) {
    text = 'Sentier : la case Souffle n’a aucun effet sur l’équipe.';
  } else if (effet) {
    if (effet.healthDelta) parts.push(ressourceText(effet.healthDelta, 'health'));
    if (effet.powerDelta) parts.push(ressourceText(effet.powerDelta, 'power'));
    if (effet.moveDelta) {
      const n = Math.abs(effet.moveDelta);
      parts.push(
        `l’équipe ${effet.moveDelta > 0 ? 'avance' : 'recule'} de ${n} ${n > 1 ? 'cases' : 'case'}`,
      );
    }
    if (effet.passTurn) parts.push('l’équipe passe son tour');
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
export function tenirCaseEffetSummary(marker, teamType, options = {}) {
  const effet = resolveTenirCaseEffet(marker, teamType, options);
  return formatTenirCaseEffet(effet, { peripetie: options.peripetie === true });
}
