'use strict';

/**
 * Audit de cohérence des cases de plateau : ce que la case **annonce** à l'élève
 * (`effet_mecanique`, texte libre saisi par l'auteur du plateau) contre ce que le moteur
 * **applique réellement** (`event_config_json.effects`, seule source exécutée).
 *
 * Pourquoi ce contrôle existe : les deux champs sont saisis séparément et rien ne les relie.
 * Une case peut afficher « Bonne réponse : +2 gemmes » sans qu'aucune gemme ne soit créditée —
 * l'élève lit une promesse, son compteur ne bouge pas, et personne ne s'en aperçoit côté
 * moteur puisqu'aucune erreur n'est levée. Pour des élèves de 6ème, une règle affichée qui ne
 * s'applique pas est pire qu'une règle absente : elle apprend que le jeu ment.
 *
 * Ce module ne corrige rien et ne décide rien — il rend l'écart visible et chiffré.
 */

const { resolveMarkerEventConfig } = require('./glMarkerEventConfig');

/** Un « conditionnel » que le moteur ne sait pas exprimer : la promesse dépend d'une issue. */
const CONDITIONAL_PATTERNS = [
  { re: /bonne\s+r[ée]ponse/i, condition: 'bonne_reponse' },
  { re: /mauvaise\s+r[ée]ponse/i, condition: 'mauvaise_reponse' },
  { re: /\bsi\s+r[ée]ussi/i, condition: 'defi_reussi' },
  { re: /\bsi\s+[ée]chec|\bsinon\b/i, condition: 'defi_echoue' },
  { re: /en\s+premier/i, condition: 'premier_arrive' },
  { re: /\bau\s+choix\b/i, condition: 'au_choix' },
];

/**
 * Les nombres écrits en toutes lettres sont fréquents dans les textes de plateau
 * (« soigne un cœur »). Sans eux le détecteur raterait des promesses bien réelles.
 */
const WORD_NUMBERS = new Map([
  ['un', 1],
  ['une', 1],
  ['deux', 2],
  ['trois', 3],
  ['quatre', 4],
  ['cinq', 5],
]);

function parseAmount(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (WORD_NUMBERS.has(s)) return WORD_NUMBERS.get(s);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const AMOUNT = '(-?\\d+|un|une|deux|trois|quatre|cinq)';

/**
 * Promesses détectées dans le texte, par ressource. Chaque entrée produit un delta signé.
 * L'ordre compte : les formes explicitement négatives (« perd », « recule ») sont testées
 * avant les formes neutres, sinon « recule de 3 cases » serait lu comme +3.
 */
const PROMISE_PATTERNS = [
  // Cœurs
  {
    key: 'deltaPv',
    sign: -1,
    re: new RegExp(`(?:perds?|retire|co[uû]te|-)\\s*${AMOUNT}\\s*c(?:œ|oe)ur`, 'i'),
  },
  {
    key: 'deltaPv',
    sign: -1,
    re: new RegExp(`${AMOUNT}\\s*c(?:œ|oe)ur[a-z]*\\s+en\\s+moins`, 'i'),
  },
  {
    key: 'deltaPv',
    sign: 1,
    re: new RegExp(`(?:soigne|gagne|r[ée]cup[èe]re|regagne|\\+)\\s*${AMOUNT}\\s*c(?:œ|oe)ur`, 'i'),
  },
  {
    key: 'deltaPv',
    sign: 1,
    re: new RegExp(`${AMOUNT}\\s*c(?:œ|oe)ur[a-z]*\\s+(?:de\\s+plus|en\\s+plus)`, 'i'),
  },
  // Gemmes
  {
    key: 'deltaGems',
    sign: -1,
    re: new RegExp(`(?:perds?|retire|co[uû]te|d[ée]pense|-)\\s*${AMOUNT}\\s*gemme`, 'i'),
  },
  {
    key: 'deltaGems',
    sign: 1,
    re: new RegExp(`(?:gagne|re[çc]ois|obtiens?|\\+)\\s*${AMOUNT}\\s*gemme`, 'i'),
  },
  // Déplacement
  {
    key: 'deltaMove',
    sign: -1,
    re: new RegExp(`recule[a-z]*\\s+(?:de\\s+)?${AMOUNT}\\s*case`, 'i'),
  },
  {
    key: 'deltaMove',
    sign: 1,
    re: new RegExp(`avance[a-z]*\\s+(?:de\\s+)?${AMOUNT}\\s*case`, 'i'),
  },
];

const PASS_TURN_RE = /passe[a-z]*\s+(?:ton|son|le)\s+tour/i;

/**
 * Extrait les promesses d'un texte d'effet mécanique.
 *
 * @returns {{deltaPv:number|null, deltaGems:number|null, deltaMove:number|null,
 *            passTurn:boolean, conditions:string[], empty:boolean}}
 */
function parsePromisedEffects(effetMecanique) {
  const text = String(effetMecanique ?? '').trim();
  const out = {
    deltaPv: null,
    deltaGems: null,
    deltaMove: null,
    passTurn: false,
    conditions: [],
    empty: text.length === 0,
  };
  if (out.empty) return out;

  for (const { re, condition } of CONDITIONAL_PATTERNS) {
    if (re.test(text) && !out.conditions.includes(condition)) out.conditions.push(condition);
  }
  for (const { key, sign, re } of PROMISE_PATTERNS) {
    if (out[key] != null) continue;
    const m = re.exec(text);
    if (!m) continue;
    const amount = parseAmount(m[1]);
    if (amount == null) continue;
    out[key] = sign * Math.abs(amount);
  }
  out.passTurn = PASS_TURN_RE.test(text);
  return out;
}

/** Amplitude maximale réellement applicable, toutes branches confondues (neutre/gnome/licorne). */
function summarizeMachineEffects(marker) {
  const cfg = resolveMarkerEventConfig(marker);
  const effects = cfg?.effects || null;
  const summary = {
    hasEffects: Boolean(effects),
    branches: effects ? Object.keys(effects) : [],
    deltaPv: 0,
    deltaGems: 0,
    deltaMove: 0,
    passTurn: false,
    hasQuestion: Boolean(cfg?.question),
    // Les cases Trame/Souffle n'ont pas de texte `effet_mecanique` : leur effet est annoncé
    // par le `label` de chaque branche (« Gnome : tes mains le renouent → +1 cœur »). Une
    // branche qui agit sans label est en revanche muette pour l'élève.
    allActiveBranchesLabelled: true,
  };
  if (!effects) return summary;
  for (const branch of Object.values(effects)) {
    let acts = Boolean(branch?.passTurn);
    for (const key of ['deltaPv', 'deltaGems', 'deltaMove']) {
      const v = Number(branch?.[key]) || 0;
      if (v !== 0) acts = true;
      if (Math.abs(v) > Math.abs(summary[key])) summary[key] = v;
    }
    if (branch?.passTurn) summary.passTurn = true;
    if (acts && !String(branch?.label || '').trim()) summary.allActiveBranchesLabelled = false;
  }
  return summary;
}

const RESOURCE_LABELS = {
  deltaPv: 'cœurs',
  deltaGems: 'gemmes',
  deltaMove: 'déplacement',
};

/**
 * Confronte une case à sa propre promesse.
 *
 * @returns {{markerId:number, chapterId:number|null, label:string|null, eventType:string|null,
 *            severity:'ok'|'info'|'warn'|'error', issues:Array, promised:object, machine:object}}
 */
function auditMarkerPromise(marker) {
  const promised = parsePromisedEffects(marker?.effet_mecanique);
  const machine = summarizeMachineEffects(marker);
  const issues = [];

  // Un conditionnel ne peut pas être tenu : les branches du moteur sont neutre/gnome/licorne,
  // jamais « bonne réponse / mauvaise réponse ». La promesse reste donc lettre morte, même
  // si un delta figure par ailleurs dans la config.
  const conditionalResources = [];
  for (const key of ['deltaPv', 'deltaGems', 'deltaMove']) {
    if (promised[key] != null) conditionalResources.push(key);
  }
  if (promised.conditions.length > 0 && conditionalResources.length > 0) {
    issues.push({
      code: 'CONDITIONNEL_NON_CABLE',
      severity: 'error',
      conditions: [...promised.conditions],
      resources: conditionalResources.map((k) => RESOURCE_LABELS[k]),
      message:
        `La case annonce un gain conditionnel (${promised.conditions.join(', ')}) sur ` +
        `${conditionalResources.map((k) => RESOURCE_LABELS[k]).join(', ')}. Le moteur n'a pas de ` +
        `branche conditionnelle : rien ne sera appliqué.`,
    });
  } else {
    for (const key of ['deltaPv', 'deltaGems', 'deltaMove']) {
      const want = promised[key];
      if (want == null || want === 0) continue;
      const got = machine[key];
      if (got === want) continue;
      issues.push({
        code: got === 0 ? 'PROMESSE_NON_TENUE' : 'PROMESSE_DIVERGENTE',
        severity: got === 0 ? 'error' : 'warn',
        resource: RESOURCE_LABELS[key],
        promised: want,
        machine: got,
        message:
          got === 0
            ? `La case annonce ${want > 0 ? '+' : ''}${want} ${RESOURCE_LABELS[key]} ; le moteur n'applique rien.`
            : `La case annonce ${want > 0 ? '+' : ''}${want} ${RESOURCE_LABELS[key]} ; le moteur applique ${got}.`,
      });
    }
    if (promised.passTurn && !machine.passTurn) {
      issues.push({
        code: 'PROMESSE_NON_TENUE',
        severity: 'error',
        resource: 'passe le tour',
        promised: true,
        machine: false,
        message: 'La case annonce « passe ton tour » ; le moteur ne le fait pas.',
      });
    }
  }

  // Sens inverse : le moteur agit sans que rien ne l'annonce. Moins grave (l'élève est
  // surpris en bien ou en mal), mais c'est une case dont personne ne peut expliquer l'effet.
  for (const key of ['deltaPv', 'deltaGems']) {
    if (machine.allActiveBranchesLabelled) break;
    if (machine[key] !== 0 && promised[key] == null && promised.conditions.length === 0) {
      issues.push({
        code: 'EFFET_NON_ANNONCE',
        severity: 'info',
        resource: RESOURCE_LABELS[key],
        promised: null,
        machine: machine[key],
        message: `Le moteur applique ${machine[key]} ${RESOURCE_LABELS[key]} sans que la case l'annonce.`,
      });
    }
  }

  const severity = issues.some((i) => i.severity === 'error')
    ? 'error'
    : issues.some((i) => i.severity === 'warn')
      ? 'warn'
      : issues.length > 0
        ? 'info'
        : 'ok';

  return {
    markerId: marker?.id != null ? Number(marker.id) : null,
    chapterId: marker?.chapter_id != null ? Number(marker.chapter_id) : null,
    label: marker?.label ?? null,
    eventType: marker?.event_type ?? null,
    effetMecanique: marker?.effet_mecanique ?? null,
    severity,
    issues,
    promised,
    machine,
  };
}

/** Audite un lot de cases et agrège les compteurs utiles à un tableau de bord MJ. */
function auditMarkerPromises(markers = []) {
  const rows = markers.map((m) => auditMarkerPromise(m));
  const byCode = {};
  const byChapter = {};
  for (const row of rows) {
    const chapterKey = String(row.chapterId ?? 'null');
    byChapter[chapterKey] = byChapter[chapterKey] || {
      total: 0,
      error: 0,
      warn: 0,
      info: 0,
      ok: 0,
    };
    byChapter[chapterKey].total += 1;
    byChapter[chapterKey][row.severity] += 1;
    for (const issue of row.issues) {
      byCode[issue.code] = (byCode[issue.code] || 0) + 1;
    }
  }
  return {
    total: rows.length,
    counts: {
      error: rows.filter((r) => r.severity === 'error').length,
      warn: rows.filter((r) => r.severity === 'warn').length,
      info: rows.filter((r) => r.severity === 'info').length,
      ok: rows.filter((r) => r.severity === 'ok').length,
    },
    byCode,
    byChapter,
    rows,
  };
}

module.exports = {
  parsePromisedEffects,
  summarizeMachineEffects,
  auditMarkerPromise,
  auditMarkerPromises,
};
