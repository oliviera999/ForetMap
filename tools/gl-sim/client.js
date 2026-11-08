'use strict';

/**
 * Client HTTP du banc : supertest **en mémoire** sur `require('../../server').app` (comme les
 * suites `tests/gl-tenir-*`). Chaque appel :
 * - porte `Authorization: Bearer <jeton>` et `X-GL-Sim-Clock` (heure simulée) ;
 * - est compté (appels, durée, codes) ;
 * - **échoue l'exécution** sur un 5xx (`SimEchec` `HTTP_5XX`) ;
 * - pour un **élève**, est passé au crible : mots interdits (`findForbiddenString` de
 *   `lib/glTenirImport.js`) sur toute chaîne du corps — une chaîne du **moteur** fait échouer,
 *   une chaîne de **corpus** (texte de feuillet, question, choix, retour de QCM, description de
 *   case…) est comptée en avertissement, car le corpus réel en porte (« corbeau », « attaque »)
 *   et relève du contenu, pas du moteur (`--mots-interdits strict` pour tout faire échouer) ;
 * - pour un élève, vérifie qu'aucune **bourse d'une autre équipe** ne sort (objets portant un
 *   identifiant de joueur hors de l'équipe avec `healthPoints` / `powerPoints` / `health` /
 *   `power`, `vitality.byPlayerId`).
 */

const request = require('supertest');
const { findForbiddenString } = require('../../lib/glTenirImport');

class SimEchec extends Error {
  constructor(code, message, contexte = {}) {
    super(message);
    this.name = 'SimEchec';
    this.code = code;
    this.contexte = contexte;
  }
}

/** Champs de corpus : un mot interdit y est un avertissement (contenu), pas un échec du moteur. */
const CLES_CORPUS = new Set([
  'texte',
  'texteAccessible',
  'incipit',
  'titre',
  'title',
  'question',
  'text',
  'feedback',
  'description',
  'markerDescription',
  'markerLabel',
  'label',
  'anecdote',
  'nomCommun',
  'nom_commun',
  'descriptionCourte',
  'description_courte',
  'observationTerrain',
  'observation_terrain',
  'motsCles',
  'mots_cles',
  'reponseTexte',
  'reponse_texte',
  'notesPedagogiques',
  'notes_pedagogiques',
  'storyMarkdown',
  'story_markdown',
  'biotopeMarkdown',
  'biocenoseMarkdown',
  'sortilegesMarkdown',
  'themes',
  'ideeCle',
  'idee_cle',
  'contexte',
  'ancrageScientifique',
  'ancrage_scientifique',
  'visageLabel',
  'visage_label',
  'zoneLabel',
  'zone_label',
  'effetDetaille',
  'effet_detaille',
  'effetCourt',
  'effet_court',
  'critere',
  'photoLegende',
  'photo_legende',
  'biome',
  'nom',
  'name',
  'feuilletCode',
  'feuillet_code',
  'resourceRef',
  'resource_ref',
  'note',
  'message',
  'body',
  'slug',
  'correction',
  'texteOlu',
  'cherche',
  'offre',
  'displayText',
  'content',
  'contenu',
  'summary',
  'resume',
  'excerpt',
  'extrait',
  'legende',
  'caption',
  'histoire',
  'consigne',
  'indice',
  'titrePrive',
  'reponseTexte',
  'reason',
  'motif',
  'raison',
  'lastReason',
  'spellEffectShort',
  'spellName',
  'nomCommun',
]);

/** Clés de corpus par suffixe (toute casse) : `…Text`, `…_texte`, `…Markdown`, `…Html`, `…Label`… */
const CLES_CORPUS_RE = /(text|texte|markdown|html|label|description|titre|title|incipit|legende)$/i;

function estCleCorpus(cle) {
  const k = String(cle ?? '');
  return CLES_CORPUS.has(k) || CLES_CORPUS_RE.test(k);
}

const CLES_BOURSES = new Set([
  'healthPoints',
  'powerPoints',
  'health_points',
  'power_points',
  'health',
  'power',
  'soldeHealthApres',
  'soldePowerApres',
]);

/** Parcourt un JSON : `visite(valeur, cle, chemin)` pour chaque chaîne ; `objet(obj, chemin)`. */
function parcourir(value, { chaine, objet }, cle = null, chemin = '') {
  if (value == null) return;
  if (typeof value === 'string') {
    chaine(value, cle, chemin);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => parcourir(v, { chaine, objet }, cle, `${chemin}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    if (objet) objet(value, chemin);
    for (const [k, v] of Object.entries(value)) {
      parcourir(v, { chaine, objet }, k, chemin ? `${chemin}.${k}` : k);
    }
  }
}

/**
 * Contrôle d'un corps servi à un élève (pur).
 * @param {object} body
 * @param {{ membres: Set<number>|number[] }} equipe identifiants des membres de l'équipe du lecteur
 * @returns {{ moteur: Array, corpus: Array, bourses: Array }}
 */
function controlerCorpsEleve(body, { membres = [] } = {}) {
  const ids = new Set([...membres].map(Number));
  const moteur = [];
  const corpus = [];
  const bourses = [];
  parcourir(body, {
    chaine(s, cle, chemin) {
      const mot = findForbiddenString(s);
      if (!mot) return;
      const hit = { chemin, mot, extrait: s.slice(0, 80) };
      if (estCleCorpus(cle)) corpus.push(hit);
      else moteur.push(hit);
    },
    objet(obj, chemin) {
      const pid = obj.playerId ?? obj.player_id ?? obj.id_joueur ?? null;
      if (pid != null && !ids.has(Number(pid))) {
        for (const k of Object.keys(obj)) {
          if (CLES_BOURSES.has(k) && obj[k] != null)
            bourses.push({ chemin: `${chemin}.${k}`, playerId: Number(pid) });
        }
      }
      if (obj.byPlayerId && typeof obj.byPlayerId === 'object') {
        for (const k of Object.keys(obj.byPlayerId)) {
          if (!ids.has(Number(k)))
            bourses.push({ chemin: `${chemin}.byPlayerId.${k}`, playerId: Number(k) });
        }
      }
    },
  });
  return { moteur, corpus, bourses };
}

/**
 * @param {object} opts
 * @param {object} opts.app application Express
 * @param {object} opts.horloge `creerHorloge()`
 * @param {'souple'|'strict'} [opts.motsInterdits] `strict` : un mot de corpus fait aussi échouer
 */
function creerClient({ app, horloge, motsInterdits = 'souple', fuitesBourses = 'echouer' } = {}) {
  const stats = {
    appels: 0,
    dureeMs: 0,
    codes: {},
    erreurs5xx: 0,
    motsCorpus: [],
    fuitesBourses: [],
    refus: {},
    refusExemples: {},
  };
  let contexte = {};
  const client = {
    stats,
    setContexte(c) {
      contexte = { ...contexte, ...c };
    },
    getContexte: () => ({ ...contexte }),
    /**
     * @param {object} p
     * @param {string} p.token
     * @param {'get'|'post'|'put'|'delete'} p.method
     * @param {string} p.path
     * @param {object} [p.body]
     * @param {'eleve'|'prof'} [p.acteur]
     * @param {Iterable<number>} [p.membres] équipe du lecteur (contrôle des bourses)
     * @param {string} [p.geste] libellé du geste (contexte d'échec)
     */
    async appel({
      token,
      method = 'get',
      path,
      body = undefined,
      acteur = 'prof',
      membres = [],
      geste = null,
    }) {
      const t0 = Date.now();
      let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
      if (horloge) req = req.set('X-GL-Sim-Clock', horloge.iso());
      if (body !== undefined) req = req.send(body);
      const res = await req;
      stats.appels += 1;
      stats.dureeMs += Date.now() - t0;
      stats.codes[res.status] = (stats.codes[res.status] || 0) + 1;
      const ctx = {
        ...contexte,
        geste: geste || `${method.toUpperCase()} ${path}`,
        status: res.status,
      };
      if (res.status >= 500) {
        stats.erreurs5xx += 1;
        throw new SimEchec(
          'HTTP_5XX',
          `Réponse ${res.status} sur ${method.toUpperCase()} ${path} : ${JSON.stringify(res.body).slice(0, 300)}`,
          ctx,
        );
      }
      if (res.status >= 400) {
        const code = res.body?.code || `HTTP_${res.status}`;
        stats.refus[code] = (stats.refus[code] || 0) + 1;
        if (!stats.refusExemples[code]) {
          stats.refusExemples[code] = {
            path: `${method.toUpperCase()} ${path.replace(/\d+/g, '#')}`,
            geste: ctx.geste,
            error: String(res.body?.error || '').slice(0, 160),
          };
        }
      }
      if (acteur === 'eleve' && res.body && typeof res.body === 'object') {
        const c = controlerCorpsEleve(res.body, { membres });
        if (c.moteur.length) {
          throw new SimEchec(
            'MOT_INTERDIT',
            `Mot interdit « ${c.moteur[0].mot} » servi à un élève (${c.moteur[0].chemin}) sur ${method.toUpperCase()} ${path}`,
            { ...ctx, hits: c.moteur.slice(0, 5) },
          );
        }
        if (c.corpus.length) {
          if (motsInterdits === 'strict') {
            throw new SimEchec(
              'MOT_INTERDIT_CORPUS',
              `Mot interdit « ${c.corpus[0].mot} » dans le corpus servi à un élève (${c.corpus[0].chemin})`,
              { ...ctx, hits: c.corpus.slice(0, 5) },
            );
          }
          for (const h of c.corpus) {
            if (stats.motsCorpus.length < 200)
              stats.motsCorpus.push({ ...h, path, geste: ctx.geste });
          }
        }
        if (c.bourses.length) {
          if (fuitesBourses === 'echouer') {
            throw new SimEchec(
              'BOURSES_AUTRE_EQUIPE',
              `Bourses d'une autre équipe servies à un élève (${c.bourses[0].chemin}) sur ${method.toUpperCase()} ${path}`,
              { ...ctx, hits: c.bourses.slice(0, 5) },
            );
          }
          // `avertir` : le constat est compté et rapporté comme bogue du moteur, l'exécution continue.
          const chemins = [...new Set(c.bourses.map((h) => h.chemin.replace(/\[\d+\]/g, '[]')))];
          if (stats.fuitesBourses.length < 50) {
            stats.fuitesBourses.push({
              path,
              geste: ctx.geste,
              seance: ctx.seance ?? null,
              chemins: chemins.slice(0, 4),
              occurrences: c.bourses.length,
            });
          }
        }
      }
      return res;
    },
  };
  return client;
}

module.exports = {
  SimEchec,
  CLES_CORPUS,
  CLES_CORPUS_RE,
  CLES_BOURSES,
  estCleCorpus,
  parcourir,
  controlerCorpsEleve,
  creerClient,
};
