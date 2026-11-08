'use strict';

/**
 * `gl_content_snapshot` — instantané du **contenu** « Tenir à deux » (domaine `gl`, lecture
 * seule), sans personne ni secret :
 *
 * - `chapitres` : chapitres des plateaux 1-4 ;
 * - `cases` : cases du chemin (libellé, type, tonalité, effets déclarés) et **texte calculé** de
 *   la « vérité des cases » pour chaque peuple (`lib/shared/glTenirCaseEffetCore.js`,
 *   migration 337) — jamais `effet_mecanique`, champ d'auteur ;
 * - `zones` : zones de chasse (sans polygone ni titre privé) ;
 * - `questions_lecture` : énoncé et choix, **sans réponse ni feedback** ;
 * - `sorts` : grimoire v2 ; `peripeties` ; `olu` : lignes d'Olu **sans correction** ; `parures`.
 *
 * Les termes du tiers `secret` du lore (`gl_lore_glossary_terms.niveau = 'secret'`) sont
 * masqués dans tout texte renvoyé et signalés dans `controles`, avec les chaînes interdites
 * (`lib/glTenirImport.js` : monstre, ennemi, corbeau, faux, raté, perdu, classement…).
 */

const { z } = require('zod');
const { defineDomainTool, pageOf, pageParams, paged } = require('./factory');
const { gameplaySettings, readGl } = require('./glCommon');

const TOOL = 'gl_content_snapshot';
const SECTIONS = [
  'chapitres',
  'cases',
  'zones',
  'questions_lecture',
  'sorts',
  'peripeties',
  'olu',
  'parures',
];
const ROW_MAX = 2000;

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

/** Masque les termes secrets d'un texte ; pousse un constat par champ fautif. */
function makeGuard(secretTerms, controles) {
  const { findSecretTerm, findForbiddenString } = require('../../../glTenirImport');
  return function guard(where, field, value) {
    if (value == null) return value;
    let text = String(value);
    const forbidden = findForbiddenString(text);
    if (forbidden) controles.push({ where, field, kind: 'chaine_interdite', terme: forbidden });
    let secret = findSecretTerm(text, secretTerms);
    while (secret) {
      controles.push({ where, field, kind: 'terme_secret' });
      text = text.replace(
        new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        '[terme secret masqué]',
      );
      secret = findSecretTerm(text, secretTerms);
    }
    return text;
  };
}

async function loadChapters(db, plateau) {
  const params = [];
  let where = 'plateau_number BETWEEN 1 AND 4';
  if (plateau) {
    where = 'plateau_number = ?';
    params.push(plateau);
  }
  return db.queryAll(
    `SELECT id, slug, title, biome, plateau_number, order_index FROM gl_chapters WHERE ${where} ORDER BY plateau_number ASC, order_index ASC, id ASC`,
    params,
  );
}

async function loadCases(db, chapters, casesPositives, guard) {
  if (!chapters.length) return [];
  const { MARKER_SELECT } = require('../../../glMarkerRow');
  const { sortMarkersByPath } = require('../../../shared/glBoardPathCore');
  const {
    markerTonaliteCore,
    tenirCaseEffetSummary,
    resolveMarkerBranchCore,
  } = require('../../../shared/glTenirCaseEffetCore');
  const { numeroCase } = require('../../../shared/glCaseNumeroCore');
  const out = [];
  for (const ch of chapters) {
    const rows = sortMarkersByPath(
      await db.queryAll(
        `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC`,
        [ch.id],
      ),
    );
    rows.forEach((m, index) => {
      const where = `case:${m.id}`;
      const cfg = parseJson(m.event_config_json, null);
      const branche = (type) => {
        const b = resolveMarkerBranchCore(m, type);
        return b
          ? {
              branch: b.branch,
              label: guard(where, `effects.${b.branch}.label`, b.label ?? null),
              deltaPv: b.deltaPv ?? 0,
              deltaGems: b.deltaGems ?? 0,
              deltaMove: b.deltaMove ?? 0,
              passTurn: !!b.passTurn,
            }
          : null;
      };
      out.push({
        id: Number(m.id),
        chapterId: Number(ch.id),
        plateau: Number(ch.plateau_number),
        index,
        numero: numeroCase(index),
        label: guard(where, 'label', m.label),
        description: guard(where, 'description', m.description),
        eventType: m.event_type,
        tonalite: markerTonaliteCore(m) || null,
        question: cfg?.question
          ? { mode: cfg.question.mode, set: cfg.question.set || 'biome' }
          : null,
        effets: { gnome: branche('gnome'), unicorn: branche('unicorn') },
        verite: {
          gnome: guard(
            where,
            'verite.gnome',
            tenirCaseEffetSummary(m, 'gnome', { casesPositives }),
          ),
          unicorn: guard(
            where,
            'verite.unicorn',
            tenirCaseEffetSummary(m, 'unicorn', { casesPositives }),
          ),
        },
      });
    });
  }
  return out;
}

async function loadZones(db, plateau, guard) {
  const rows = await db.queryAll(
    `SELECT id, chapter_id, zone_key, plateau, feuillet_code, indice, rang_case, geometrie_prete,
            question_code, theme_secours, ordre, actif
       FROM gl_chasse_zones ${plateau ? 'WHERE plateau = ?' : ''} ORDER BY plateau ASC, ordre ASC, zone_key ASC LIMIT ${ROW_MAX}`,
    plateau ? [plateau] : [],
  );
  return rows.map((z) => ({
    id: Number(z.id),
    zoneKey: z.zone_key,
    plateau: Number(z.plateau),
    chapterId: z.chapter_id != null ? Number(z.chapter_id) : null,
    feuilletCode: z.feuillet_code,
    indice: guard(`zone:${z.zone_key}`, 'indice', z.indice),
    rangCase: z.rang_case != null ? Number(z.rang_case) : null,
    geometriePrete: !!Number(z.geometrie_prete),
    questionCode: z.question_code || null,
    themeSecours: z.theme_secours || null,
    ordre: Number(z.ordre),
    actif: !!Number(z.actif),
  }));
}

async function loadQuestionsLecture(db, plateau, guard) {
  const rows = await db.queryAll(
    `SELECT q.zone_key, q.feuillet_code, q.question, q.choix_json, q.actif, z.plateau
       FROM gl_tenir_questions_lecture q INNER JOIN gl_chasse_zones z ON z.zone_key = q.zone_key
       ${plateau ? 'WHERE z.plateau = ?' : ''} ORDER BY z.plateau ASC, q.zone_key ASC LIMIT ${ROW_MAX}`,
    plateau ? [plateau] : [],
  );
  return rows.map((q) => {
    const where = `question_lecture:${q.zone_key}`;
    const choix = parseJson(q.choix_json, []);
    return {
      zoneKey: q.zone_key,
      plateau: Number(q.plateau),
      feuilletCode: q.feuillet_code,
      question: guard(where, 'question', q.question),
      choix: Array.isArray(choix)
        ? choix.map((c, i) =>
            guard(
              where,
              `choix.${i}`,
              typeof c === 'object' ? (c?.texte ?? c?.text ?? JSON.stringify(c)) : c,
            ),
          )
        : [],
      actif: !!Number(q.actif),
      note: 'réponse et feedbacks volontairement absents',
    };
  });
}

async function loadSorts(db, guard) {
  const rows = await db.queryAll(
    `SELECT spell_code, nom, emoji, famille, peuple, cout, ressource, fenetre, limite_json, execution,
            effet_court, statut, tenir_v2
       FROM gl_spells WHERE tenir_v2 = 1 ORDER BY famille ASC, spell_code ASC LIMIT ${ROW_MAX}`,
  );
  return rows.map((s) => ({
    spellCode: s.spell_code,
    nom: guard(`sort:${s.spell_code}`, 'nom', s.nom),
    emoji: s.emoji || null,
    famille: s.famille || null,
    peuple: s.peuple || null,
    cout: s.cout != null ? Number(s.cout) : null,
    ressource: s.ressource || null,
    fenetre: s.fenetre || null,
    limite: parseJson(s.limite_json, null),
    execution: s.execution || null,
    effetCourt: guard(`sort:${s.spell_code}`, 'effet_court', s.effet_court),
    statut: s.statut || null,
  }));
}

async function loadPeripeties(db, plateau, guard) {
  const rows = await db.queryAll(
    `SELECT id, plateau, biome_slug, texte, passable, actif FROM gl_tenir_peripeties
      ${plateau ? 'WHERE plateau = ?' : ''} ORDER BY plateau ASC, id ASC LIMIT ${ROW_MAX}`,
    plateau ? [plateau] : [],
  );
  return rows.map((p) => ({
    id: p.id,
    plateau: Number(p.plateau),
    biomeSlug: p.biome_slug,
    texte: guard(`peripetie:${p.id}`, 'texte', p.texte),
    passable: !!Number(p.passable),
    actif: !!Number(p.actif),
  }));
}

async function loadOlu(db, plateau, guard) {
  const rows = await db.queryAll(
    `SELECT id, moment, expression, texte, variables_json, plateaux_json, actif FROM gl_tenir_olu_lignes
      ORDER BY moment ASC, id ASC LIMIT ${ROW_MAX}`,
  );
  return rows
    .map((o) => ({
      id: o.id,
      moment: o.moment,
      expression: o.expression,
      texte: guard(`olu:${o.id}`, 'texte', o.texte),
      variables: parseJson(o.variables_json, null),
      plateaux: parseJson(o.plateaux_json, null),
      actif: !!Number(o.actif),
      note: 'correction volontairement absente',
    }))
    .filter(
      (o) => !plateau || !Array.isArray(o.plateaux) || o.plateaux.map(Number).includes(plateau),
    );
}

async function loadParures(db, guard) {
  const rows = await db.queryAll(
    `SELECT code, nom, description, prix, ressource, chapitre_min, type, pelage, actif FROM gl_tenir_parures
      ORDER BY chapitre_min ASC, code ASC LIMIT ${ROW_MAX}`,
  );
  return rows.map((p) => ({
    code: p.code,
    nom: guard(`parure:${p.code}`, 'nom', p.nom),
    description: guard(`parure:${p.code}`, 'description', p.description),
    prix: Number(p.prix),
    ressource: p.ressource,
    chapitreMin: Number(p.chapitre_min),
    type: p.type,
    pelage: p.pelage || null,
    actif: !!Number(p.actif),
  }));
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : instantané du contenu « Tenir à deux » (sans personne ni secret)',
  intro:
    'Contenu « Tenir à deux » tel que le joue le moteur : chapitres des plateaux 1-4, cases (libellé, type, tonalité, effets par peuple et texte calculé de la vérité des cases), zones de chasse (sans polygone), questions de lecture (sans réponse), sorts v2, péripéties, lignes d’Olu (sans correction), parures. Termes secrets du lore masqués et signalés, chaînes interdites signalées (controles). Filtres : plateau, sections. Réservé au staff G&L.',
  actions: {
    get: {
      summary: 'instantané du contenu (filtres : plateau 1-4, sections)',
      params: {
        plateau: z.number().int().min(1).max(4).describe('Un seul plateau'),
        sections: z
          .array(z.enum(SECTIONS))
          .min(1)
          .max(SECTIONS.length)
          .describe(`Sections voulues (défaut : toutes) : ${SECTIONS.join(', ')}`),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const settings = await gameplaySettings();
        return readGl(
          ctx,
          async (db) => {
            const { loadSecretTerms } = require('../../../glTenirImport');
            const { resolveTenirSettings } = require('../../../glTenir');
            const casesPositives = resolveTenirSettings(settings).cases_positives;
            const wanted = new Set(args.sections || SECTIONS);
            const plateau = args.plateau || null;
            const controles = [];
            const guard = makeGuard(await loadSecretTerms(db), controles);
            const chapters = await loadChapters(db, plateau);
            const out = { plateau, sections: [...wanted], casesPositives };
            if (wanted.has('chapitres')) {
              out.chapitres = chapters.map((c) => ({
                id: Number(c.id),
                slug: c.slug,
                title: guard(`chapitre:${c.id}`, 'title', c.title),
                biome: c.biome,
                plateau: Number(c.plateau_number),
              }));
            }
            if (wanted.has('cases')) {
              const cases = await loadCases(db, chapters, casesPositives, guard);
              const p = pageOf(args, ctx, 500);
              out.cases = paged(cases.slice(p.offset, p.offset + p.limit), p, {
                total: cases.length,
              });
            }
            if (wanted.has('zones')) out.zones = await loadZones(db, plateau, guard);
            if (wanted.has('questions_lecture')) {
              out.questions_lecture = await loadQuestionsLecture(db, plateau, guard);
            }
            if (wanted.has('sorts')) out.sorts = await loadSorts(db, guard);
            if (wanted.has('peripeties')) out.peripeties = await loadPeripeties(db, plateau, guard);
            if (wanted.has('olu')) out.olu = await loadOlu(db, plateau, guard);
            if (wanted.has('parures')) out.parures = await loadParures(db, guard);
            out.controles = { count: controles.length, items: controles.slice(0, 200) };
            return out;
          },
          { timeoutMs: 20000 },
        );
      },
    },
  },
});

module.exports = { buildGlContentSnapshotTool: () => tool, SECTIONS };
