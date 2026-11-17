'use strict';

/**
 * Chargeurs des catalogues de la Trame (« Tenir à deux », lot 3, § 8.2) :
 * `trame-reseaux.json`, `trame-fils.json`, `trame-reparer.json`, et, depuis l'ensemble unifié
 * (M21), `trame-ranger.json` (« Le bon rôle », « Le bon pays ») et `trame-adaptations.json`
 * (« Les fils de l'adaptation »).
 *
 * Même contrat que `lib/glTenirImport.js` (qui les enregistre dans `IMPORTERS`) : import
 * tolérant ou strict, rapport `{ count, upserted, ecartees, errors, warnings }`, aucune table
 * `gl_game_*` touchée, relancer deux fois donne la même base. Les aides communes (`report`,
 * `ligne`, `checkVisible`…) sont injectées pour éviter une dépendance circulaire.
 *
 * Sens des flèches : **de la ressource vers celui qui la mange** (« est mangé par »). Toute
 * carte peut pointer vers une carte de rôle `decomposeur` ; les charognards sont des
 * consommateurs, seuls leurs liens écrits comptent.
 */

const NIVEAUX = Object.freeze([5, 7, 9, 12]);
const NIVEAU_ALTEREE = 9;
const ROLES = Object.freeze(['producteur', 'consommateur', 'decomposeur']);
const CATEGORIES = Object.freeze(['en_danger', 'fragile', 'pas_menace']);
const CARTES_PAR_RESEAU = 12;
const A_CLASSER_PAR_PLATEAU = 6;
/** Familles de `trame-ranger.json` : une unité par biome (`role`), une par plateau (`pays`). */
const FAMILLES_RANGER = Object.freeze(['role', 'pays']);
const CARTES_RANGER_MIN = 4;
const CARTES_RANGER_MAX = 12;
/** Une carte générique (pas de fiche d'espèce) porte un code `DEC-…` et `generique: true`. */
const CODE_GENERIQUE_RE = /^DEC-[A-Z0-9-]+$/;
const CODE_ESPECE_RE = /^SP\d{4}$/;

function texte(v) {
  return v == null ? '' : String(v).trim();
}

/** Espèces connues de la base : `Map(code → { id, biome })` ; vide sur une base sans corpus. */
async function loadSpecies(db, codes) {
  const list = [...new Set(codes.filter(Boolean))];
  const out = new Map();
  if (!list.length) return out;
  try {
    const rows = await db.queryAll(
      `SELECT id, species_code, biome_slug FROM gl_species WHERE species_code IN (${list.map(() => '?').join(', ')})`,
      list,
    );
    for (const r of rows) {
      out.set(String(r.species_code), { id: Number(r.id), biome: String(r.biome_slug || '') });
    }
  } catch (_) {
    /* table absente : base antérieure au corpus des espèces */
  }
  return out;
}

/**
 * Contrôles d'un réseau (purs). Renvoie `{ errors, cartes, liens, aDiscuter, scenarios }`.
 * Par niveau (5, 7, 9, 12 premières cartes) : au moins un producteur, au moins un décomposeur,
 * et chaque carte qui n'est pas un décomposeur est touchée par un lien accepté du niveau.
 */
function controlerReseau(reseau, { plateauBiomes }) {
  const errors = [];
  const biome = texte(reseau?.biome);
  const plateau = Number(reseau?.plateau);
  const where = `réseau ${biome || '?'}`;
  if (!biome) errors.push(`${where} : biome manquant`);
  if (![1, 2, 3, 4].includes(plateau)) errors.push(`${where} : plateau hors 1-4`);
  else if (!(plateauBiomes[plateau] || []).includes(biome)) {
    errors.push(`${where} : biome étranger au plateau ${plateau}`);
  }
  if (!texte(reseau?.nom)) errors.push(`${where} : nom manquant`);
  const especes = Array.isArray(reseau?.especes) ? reseau.especes : [];
  const cartes = especes.map((e, ordre) => ({
    code: texte(e?.code),
    nom: texte(e?.nom),
    role: texte(e?.role),
    precision: texte(e?.precision) || null,
    generique: e?.generique === true,
    regime: texte(e?.regime) || null,
    ordre,
  }));
  const codes = cartes.map((c) => c.code);
  if (cartes.length !== CARTES_PAR_RESEAU || new Set(codes).size !== CARTES_PAR_RESEAU) {
    errors.push(`${where} : ${CARTES_PAR_RESEAU} cartes distinctes attendues`);
  }
  for (const c of cartes) {
    if (!c.code || c.code.length > 16) errors.push(`${where} : code de carte manquant ou > 16`);
    if (!c.nom) errors.push(`${where} : carte ${c.code || '?'} sans nom`);
    if (!ROLES.includes(c.role)) errors.push(`${where} : carte ${c.code || '?'} de rôle inconnu`);
  }
  const connus = new Set(codes);
  const lire = (liste, nom) => {
    const out = [];
    const vus = new Set();
    for (const l of Array.isArray(liste) ? liste : []) {
      const de = texte(l?.de);
      const vers = texte(l?.vers);
      const cle = `${de}>${vers}`;
      if (!connus.has(de) || !connus.has(vers)) {
        errors.push(`${where} : ${nom} ${cle} hors des cartes du réseau`);
      } else if (de === vers) errors.push(`${where} : ${nom} ${cle} d'une carte vers elle-même`);
      else if (vus.has(cle)) errors.push(`${where} : ${nom} ${cle} en double`);
      else out.push({ de, vers, pourquoi: texte(l?.pourquoi) || null });
      vus.add(cle);
    }
    return out;
  };
  const liens = lire(reseau?.liens_acceptes, 'lien');
  const aDiscuter = lire(reseau?.a_discuter, 'lien à discuter');
  const roleDe = new Map(cartes.map((c) => [c.code, c.role]));
  for (const niveau of NIVEAUX) {
    const dedans = new Set(codes.slice(0, niveau));
    const roles = [...dedans].map((c) => roleDe.get(c));
    if (!roles.includes('producteur')) errors.push(`${where} : niveau ${niveau} sans producteur`);
    if (!roles.includes('decomposeur')) {
      errors.push(`${where} : niveau ${niveau} sans décomposeur`);
    }
    const touchees = new Set();
    for (const l of liens) {
      if (dedans.has(l.de) && dedans.has(l.vers)) {
        touchees.add(l.de);
        touchees.add(l.vers);
      }
    }
    for (const code of dedans) {
      if (roleDe.get(code) !== 'decomposeur' && !touchees.has(code)) {
        errors.push(`${where} : niveau ${niveau}, carte ${code} sans lien accepté`);
      }
    }
  }
  const scenarios = (
    Array.isArray(reseau?.scenarios_trame_alteree) ? reseau.scenarios_trame_alteree : []
  ).map(texte);
  const premieres = new Set(codes.slice(0, NIVEAU_ALTEREE));
  if (!scenarios.length) errors.push(`${where} : aucun scénario de trame altérée`);
  for (const s of scenarios) {
    if (!premieres.has(s)) {
      errors.push(`${where} : scénario ${s} hors des ${NIVEAU_ALTEREE} premières cartes`);
    }
  }
  return { errors, biome, plateau, cartes, liens, aDiscuter, scenarios };
}

/** Type d'interaction d'un lien accepté versé dans `gl_species_interactions` (jamais `DEC`). */
function typeInteraction(roleRessource, roleMangeur) {
  if (roleMangeur === 'decomposeur') return 'decomposition';
  return roleRessource === 'producteur' ? 'herbivorie' : 'predation';
}

module.exports = function createTrameImporters(aides) {
  const {
    report,
    ligne,
    refuse,
    stopBeforeWrite,
    pushCrossRow,
    checkVisible,
    loadSecretTerms,
    deactivateMissing,
    PLATEAU_BIOMES,
    BIOMES_JOUES,
  } = aides;

  // -------------------------------------------------------------------
  // trame-reseaux.json
  // -------------------------------------------------------------------
  async function importTrameReseaux(db, json, { dryRun = false, strict = false } = {}) {
    const out = report('trame-reseaux', { strict, dryRun });
    const items = Array.isArray(json?.reseaux) ? json.reseaux : null;
    if (!items) return refuse(out, 'trame-reseaux : clé `reseaux[]` absente');
    out.count = items.length;
    const secretTerms = await loadSecretTerms(db);
    const species = await loadSpecies(
      db,
      items.flatMap((r) => (Array.isArray(r?.especes) ? r.especes : []).map((e) => texte(e?.code))),
    );
    const retenus = [];
    const vus = new Set();
    items.forEach((reseau, ordre) => {
      const row = ligne(out);
      const c = controlerReseau(reseau, { plateauBiomes: PLATEAU_BIOMES });
      row.errors.push(...c.errors);
      const where = `réseau ${c.biome || '?'}`;
      if (vus.has(c.biome)) row.errors.push(`${where} : biome en double`);
      vus.add(c.biome);
      checkVisible(row.errors, where, 'nom', reseau?.nom, secretTerms);
      checkVisible(row.errors, where, 'note', reseau?.note, secretTerms);
      for (const carte of c.cartes) {
        checkVisible(row.errors, where, `carte ${carte.code}`, carte.nom, secretTerms);
        checkVisible(row.errors, where, `carte ${carte.code}`, carte.precision, secretTerms);
        if (carte.generique) continue;
        const sp = species.get(carte.code);
        // Corpus réel exigé en strict ; une base sans espèces garde le nom et le rôle du fichier.
        if (!sp) pushCrossRow(out, `${where} : espèce ${carte.code} absente de gl_species`);
        else if (sp.biome !== c.biome) {
          row.errors.push(`${where} : espèce ${carte.code} du biome ${sp.biome}`);
        }
      }
      for (const l of c.aDiscuter) {
        checkVisible(row.errors, where, `à discuter ${l.de}>${l.vers}`, l.pourquoi, secretTerms);
      }
      if (!row.keep()) return;
      retenus.push({ ...c, nom: texte(reseau.nom), note: texte(reseau.note) || null, ordre });
    });
    if (stopBeforeWrite(out)) return out;
    for (const r of retenus) {
      await db.execute(
        `INSERT INTO gl_trame_reseaux (biome, plateau, nom, note, scenarios_json, ordre, actif, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE plateau = VALUES(plateau), nom = VALUES(nom), note = VALUES(note),
           scenarios_json = VALUES(scenarios_json), ordre = VALUES(ordre), actif = 1, updated_at = NOW()`,
        [r.biome, r.plateau, r.nom, r.note, JSON.stringify(r.scenarios), r.ordre],
      );
      // Cartes et liens d'un réseau : contenu du fichier, remplacé en bloc (jamais de données de partie).
      await db.execute('DELETE FROM gl_trame_cartes WHERE biome = ?', [r.biome]);
      await db.execute('DELETE FROM gl_trame_liens WHERE biome = ?', [r.biome]);
      for (const c of r.cartes) {
        await db.execute(
          `INSERT INTO gl_trame_cartes (biome, code, nom, role, precision_texte, generique, regime, ordre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.biome, c.code, c.nom, c.role, c.precision, c.generique ? 1 : 0, c.regime, c.ordre],
        );
      }
      for (const [nature, liste] of [
        ['accepte', r.liens],
        ['a_discuter', r.aDiscuter],
      ]) {
        for (const l of liste) {
          await db.execute(
            `INSERT INTO gl_trame_liens (biome, de_code, vers_code, nature, pourquoi) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nature = VALUES(nature), pourquoi = VALUES(pourquoi)`,
            [r.biome, l.de, l.vers, nature, l.pourquoi],
          );
        }
      }
      // Les liens acceptés entre deux espèces réelles nourrissent le réseau des fiches, sans
      // jamais rien supprimer ni réécrire. Par convention de saisie, `from` est celui qui mange.
      const roleDe = new Map(r.cartes.map((c) => [c.code, c.role]));
      for (const l of r.liens) {
        const ressource = species.get(l.de);
        const mangeur = species.get(l.vers);
        if (!ressource || !mangeur) continue;
        try {
          await db.execute(
            `INSERT IGNORE INTO gl_species_interactions (from_species_id, to_species_id, interaction_type, created_at, updated_at)
             VALUES (?, ?, ?, NOW(), NOW())`,
            [mangeur.id, ressource.id, typeInteraction(roleDe.get(l.de), roleDe.get(l.vers))],
          );
        } catch (err) {
          if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
        }
      }
      out.upserted += 1;
    }
    out.desactives = await deactivateMissing(
      db,
      'gl_trame_reseaux',
      'biome',
      retenus.map((r) => r.biome),
    );
    return out;
  }

  // -------------------------------------------------------------------
  // trame-fils.json
  // -------------------------------------------------------------------
  async function importTrameFils(db, json, { dryRun = false, strict = false } = {}) {
    const out = report('trame-fils', { strict, dryRun });
    const chapitres = Array.isArray(json?.chapitres) ? json.chapitres : null;
    if (!chapitres) return refuse(out, 'trame-fils : clé `chapitres[]` absente');
    out.count = chapitres.length;
    const secretTerms = await loadSecretTerms(db);
    const retenus = [];
    const vus = new Set();
    for (const ch of chapitres) {
      const plateau = Number(ch?.plateau);
      const where = `fils du plateau ${plateau || '?'}`;
      const row = ligne(out);
      if (![1, 2, 3, 4].includes(plateau)) row.errors.push(`${where} : plateau hors 1-4`);
      if (vus.has(plateau)) row.errors.push(`${where} : plateau en double`);
      vus.add(plateau);
      const titre = texte(ch?.titre);
      if (!titre || titre.length > 160) row.errors.push(`${where} : titre vide ou > 160`);
      checkVisible(row.errors, where, 'titre', titre, secretTerms);
      checkVisible(row.errors, where, 'note', ch?.note, secretTerms);
      const cartes = (Array.isArray(ch?.cartes) ? ch.cartes : []).map((c, ordre) => ({
        code: texte(Array.isArray(c) ? c[0] : c?.code),
        texte: texte(Array.isArray(c) ? c[1] : c?.texte),
        ordre,
      }));
      const codes = new Set(cartes.map((c) => c.code));
      if (cartes.length < 2 || codes.size !== cartes.length) {
        row.errors.push(`${where} : cartes distinctes attendues`);
      }
      for (const c of cartes) {
        if (!c.code || c.code.length > 8) row.errors.push(`${where} : code de carte manquant`);
        if (!c.texte || c.texte.length > 255) {
          row.errors.push(`${where} : carte ${c.code} vide ou > 255`);
        }
        checkVisible(row.errors, where, `carte ${c.code}`, c.texte, secretTerms);
      }
      const liens = [];
      const dejaVus = new Set();
      for (const l of Array.isArray(ch?.liens) ? ch.liens : []) {
        const de = texte(Array.isArray(l) ? l[0] : l?.de);
        const vers = texte(Array.isArray(l) ? l[1] : l?.vers);
        const cle = `${de}>${vers}`;
        if (!codes.has(de) || !codes.has(vers)) {
          row.errors.push(`${where} : lien ${cle} hors des cartes du plateau`);
        } else if (de === vers)
          row.errors.push(`${where} : lien ${cle} d'une carte vers elle-même`);
        else if (dejaVus.has(cle)) row.errors.push(`${where} : lien ${cle} en double`);
        else liens.push({ de, vers });
        dejaVus.add(cle);
      }
      // Les cycles sont permis (la rétroaction du plateau 4 est voulue).
      if (!liens.length) row.errors.push(`${where} : aucun lien`);
      if (!row.keep()) continue;
      retenus.push({ plateau, titre, note: texte(ch?.note) || null, cartes, liens });
    }
    if (stopBeforeWrite(out)) return out;
    for (const r of retenus) {
      await db.execute('DELETE FROM gl_trame_fils_cartes WHERE plateau = ?', [r.plateau]);
      await db.execute('DELETE FROM gl_trame_fils_liens WHERE plateau = ?', [r.plateau]);
      for (const c of r.cartes) {
        await db.execute(
          `INSERT INTO gl_trame_fils_cartes (plateau, code, texte, chapitre_titre, chapitre_note, ordre)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [r.plateau, c.code, c.texte, r.titre, r.note, c.ordre],
        );
      }
      for (const l of r.liens) {
        await db.execute(
          'INSERT INTO gl_trame_fils_liens (plateau, de_code, vers_code) VALUES (?, ?, ?)',
          [r.plateau, l.de, l.vers],
        );
      }
      out.upserted += 1;
    }
    return out;
  }

  // -------------------------------------------------------------------
  // trame-reparer.json
  // -------------------------------------------------------------------
  async function importTrameReparer(db, json, { dryRun = false, strict = false } = {}) {
    const out = report('trame-reparer', { strict, dryRun });
    const mesuresBrutes = Array.isArray(json?.mesures) ? json.mesures : null;
    const chapitres = Array.isArray(json?.chapitres) ? json.chapitres : null;
    if (!mesuresBrutes || !chapitres) {
      return refuse(out, 'trame-reparer : clés `mesures[]` et `chapitres[]` attendues');
    }
    out.count = mesuresBrutes.length + chapitres.length;
    const secretTerms = await loadSecretTerms(db);
    const mesures = [];
    const codesMesures = new Set();
    mesuresBrutes.forEach((m, ordre) => {
      const code = texte(m?.code);
      const where = `mesure ${code || '?'}`;
      const row = ligne(out);
      if (!code || code.length > 8) row.errors.push(`${where} : code manquant ou > 8`);
      if (codesMesures.has(code)) row.errors.push(`${where} : code en double`);
      const libelle = texte(m?.texte);
      if (!libelle || libelle.length > 255) row.errors.push(`${where} : texte vide ou > 255`);
      checkVisible(row.errors, where, 'texte', libelle, secretTerms);
      if (!row.keep()) return;
      codesMesures.add(code);
      mesures.push({ code, texte: libelle, ordre });
    });
    const species = await loadSpecies(
      db,
      chapitres.flatMap((ch) =>
        [...(ch?.especes || []), ...(ch?.a_classer || [])].map((e) => texte(e?.code)),
      ),
    );
    const retenus = [];
    const vus = new Set();
    for (const ch of chapitres) {
      const plateau = Number(ch?.plateau);
      const where = `réparer, plateau ${plateau || '?'}`;
      const row = ligne(out);
      if (![1, 2, 3, 4].includes(plateau)) row.errors.push(`${where} : plateau hors 1-4`);
      if (vus.has(plateau)) row.errors.push(`${where} : plateau en double`);
      vus.add(plateau);
      const lecon = texte(ch?.lecon) || null;
      checkVisible(row.errors, where, 'lecon', lecon, secretTerms);
      const connue = (code) => {
        if (!species.has(code)) {
          pushCrossRow(out, `${where} : espèce ${code} absente de gl_species`);
        }
      };
      const especes = [];
      const codesEspeces = new Set();
      (Array.isArray(ch?.especes) ? ch.especes : []).forEach((e, ordre) => {
        const code = texte(e?.code);
        const menace = texte(e?.menace);
        const liste = (Array.isArray(e?.mesures) ? e.mesures : []).map(texte);
        if (!code || codesEspeces.has(code)) {
          row.errors.push(`${where} : espèce ${code || '?'} manquante ou en double`);
        }
        codesEspeces.add(code);
        if (!menace || menace.length > 500) row.errors.push(`${where} : menace de ${code} vide`);
        checkVisible(row.errors, where, `menace de ${code}`, menace, secretTerms);
        if (!liste.length) row.errors.push(`${where} : ${code} sans mesure acceptée`);
        for (const m of liste) {
          if (!codesMesures.has(m)) row.errors.push(`${where} : ${code}, mesure ${m} inconnue`);
        }
        if (code) connue(code);
        especes.push({ code, menace, mesures: liste, ordre });
      });
      if (!especes.length) row.errors.push(`${where} : aucune espèce menacée`);
      const aClasser = [];
      const codesClasses = new Set();
      (Array.isArray(ch?.a_classer) ? ch.a_classer : []).forEach((e, ordre) => {
        const code = texte(e?.code);
        const categorie = texte(e?.categorie);
        if (!code || codesClasses.has(code)) {
          row.errors.push(`${where} : espèce à ranger ${code || '?'} manquante ou en double`);
        }
        codesClasses.add(code);
        if (!CATEGORIES.includes(categorie)) {
          row.errors.push(`${where} : catégorie de ${code} inconnue`);
        }
        if (code) connue(code);
        aClasser.push({ code, categorie, ordre });
      });
      if (aClasser.length !== A_CLASSER_PAR_PLATEAU) {
        row.errors.push(`${where} : ${A_CLASSER_PAR_PLATEAU} espèces à ranger attendues`);
      }
      if (!row.keep()) continue;
      retenus.push({ plateau, lecon, especes, aClasser });
    }
    if (stopBeforeWrite(out)) return out;
    for (const m of mesures) {
      await db.execute(
        `INSERT INTO gl_trame_mesures (code, texte, ordre, actif, updated_at) VALUES (?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE texte = VALUES(texte), ordre = VALUES(ordre), actif = 1, updated_at = NOW()`,
        [m.code, m.texte, m.ordre],
      );
      out.upserted += 1;
    }
    out.desactives = await deactivateMissing(
      db,
      'gl_trame_mesures',
      'code',
      mesures.map((m) => m.code),
    );
    for (const r of retenus) {
      await db.execute('DELETE FROM gl_trame_reparer_especes WHERE plateau = ?', [r.plateau]);
      await db.execute('DELETE FROM gl_trame_reparer_a_classer WHERE plateau = ?', [r.plateau]);
      for (const e of r.especes) {
        await db.execute(
          `INSERT INTO gl_trame_reparer_especes (plateau, species_code, menace, mesures_json, ordre)
           VALUES (?, ?, ?, ?, ?)`,
          [r.plateau, e.code, e.menace, JSON.stringify(e.mesures), e.ordre],
        );
      }
      for (const e of r.aClasser) {
        await db.execute(
          `INSERT INTO gl_trame_reparer_a_classer (plateau, species_code, categorie, lecon, ordre)
           VALUES (?, ?, ?, ?, ?)`,
          [r.plateau, e.code, e.categorie, r.lecon, e.ordre],
        );
      }
      out.upserted += 1;
    }
    return out;
  }

  // -------------------------------------------------------------------
  // trame-ranger.json — « Le bon rôle », « Le bon pays » (ensemble unifié, M21)
  // -------------------------------------------------------------------
  async function importTrameRanger(db, json, { dryRun = false, strict = false } = {}) {
    const out = report('trame-ranger', { strict, dryRun });
    const famillesBrutes =
      json?.familles && typeof json.familles === 'object' && !Array.isArray(json.familles)
        ? json.familles
        : null;
    const jeux = Array.isArray(json?.jeux) ? json.jeux : null;
    if (!famillesBrutes || !jeux) {
      return refuse(out, 'trame-ranger : clés `familles{}` et `jeux[]` attendues');
    }
    out.count = jeux.length;
    const secretTerms = await loadSecretTerms(db);
    // Les huit biomes joués (un biome de plateau hors trajet, comme le désert froid, n'est pas
    // un « pays » du défi).
    const biomesJoues = new Set(BIOMES_JOUES || Object.values(PLATEAU_BIOMES).flat());
    // Familles : nom, consigne, catégories fixes (`role`) ou tirées du registre des biomes (`pays`).
    const familles = new Map();
    FAMILLES_RANGER.forEach((famille, ordre) => {
      const f = famillesBrutes[famille];
      const where = `famille ${famille}`;
      const errors = [];
      const nom = texte(f?.nom);
      const consigne = texte(f?.consigne);
      if (!nom || nom.length > 160) errors.push(`${where} : nom vide ou > 160`);
      if (!consigne || consigne.length > 500) errors.push(`${where} : consigne vide ou > 500`);
      checkVisible(errors, where, 'nom', nom, secretTerms);
      checkVisible(errors, where, 'consigne', consigne, secretTerms);
      const depuisBiomes = texte(f?.categories_depuis) === 'biomes';
      const categories = [];
      if (!depuisBiomes) {
        const vues = new Set();
        for (const c of Array.isArray(f?.categories) ? f.categories : []) {
          const code = texte(c?.code);
          if (!code || code.length > 64 || vues.has(code)) {
            errors.push(`${where} : catégorie ${code || '?'} manquante ou en double`);
          }
          vues.add(code);
          if (!texte(c?.nom)) errors.push(`${where} : catégorie ${code || '?'} sans nom`);
          checkVisible(errors, where, `catégorie ${code}`, c?.nom, secretTerms);
          checkVisible(errors, where, `catégorie ${code}`, c?.aide, secretTerms);
          categories.push({ code, nom: texte(c?.nom), aide: texte(c?.aide) || null });
        }
        if (categories.length < 2) errors.push(`${where} : au moins deux catégories attendues`);
      }
      if (errors.length) {
        out.errors.push(...errors);
        return;
      }
      familles.set(famille, { famille, nom, consigne, depuisBiomes, categories, ordre });
    });
    for (const famille of Object.keys(famillesBrutes)) {
      if (!FAMILLES_RANGER.includes(famille)) {
        pushCrossRow(out, `trame-ranger : famille ${famille} inconnue (role, pays)`);
      }
    }
    const species = await loadSpecies(
      db,
      jeux.flatMap((j) => (Array.isArray(j?.cartes) ? j.cartes : []).map((c) => texte(c?.code))),
    );
    const retenus = [];
    const codesVus = new Set();
    const unitesVues = new Set();
    jeux.forEach((jeu, ordre) => {
      const row = ligne(out);
      const code = texte(jeu?.code);
      const where = `jeu ${code || '?'}`;
      const famille = familles.get(texte(jeu?.famille));
      const plateau = Number(jeu?.plateau);
      const unite = texte(jeu?.unite);
      const biome = texte(jeu?.biome) || null;
      if (!code || code.length > 64) row.errors.push(`${where} : code manquant ou > 64`);
      if (codesVus.has(code)) row.errors.push(`${where} : code en double`);
      codesVus.add(code);
      if (!famille) row.errors.push(`${where} : famille inconnue ou refusée`);
      if (![1, 2, 3, 4].includes(plateau)) row.errors.push(`${where} : plateau hors 1-4`);
      const cleUnite = `${texte(jeu?.famille)}:${unite}`;
      if (unitesVues.has(cleUnite)) row.errors.push(`${where} : unité ${cleUnite} en double`);
      unitesVues.add(cleUnite);
      const titre = texte(jeu?.titre);
      const bilan = texte(jeu?.bilan) || null;
      if (!titre || titre.length > 160) row.errors.push(`${where} : titre vide ou > 160`);
      if (!bilan || bilan.length > 500) row.errors.push(`${where} : bilan vide ou > 500`);
      checkVisible(row.errors, where, 'titre', titre, secretTerms);
      checkVisible(row.errors, where, 'bilan', bilan, secretTerms);
      // Catégories du jeu : celles de la famille, ou des biomes joués (« Le bon pays »).
      let categories = [];
      if (famille?.famille === 'role') {
        categories = famille.categories.map((c) => c.code);
        if (!(PLATEAU_BIOMES[plateau] || []).includes(biome)) {
          row.errors.push(`${where} : biome étranger au plateau ${plateau}`);
        }
        if (unite !== biome) row.errors.push(`${where} : l'unité d'un jeu de rôle est son biome`);
      } else if (famille?.famille === 'pays') {
        categories = [
          ...new Set((Array.isArray(jeu?.categories) ? jeu.categories : []).map(texte)),
        ];
        if (categories.length < 2) row.errors.push(`${where} : au moins deux pays attendus`);
        for (const c of categories) {
          if (!biomesJoues.has(c)) row.errors.push(`${where} : pays ${c} hors des biomes joués`);
        }
        for (const b of (PLATEAU_BIOMES[plateau] || []).filter((x) => biomesJoues.has(x))) {
          if (!categories.includes(b)) row.errors.push(`${where} : pays ${b} du plateau absent`);
        }
        if (unite !== `p${plateau}`) {
          row.errors.push(`${where} : l'unité d'un jeu de pays est p<plateau>`);
        }
      }
      const admises = new Set(categories);
      const cartes = [];
      const cartesVues = new Set();
      (Array.isArray(jeu?.cartes) ? jeu.cartes : []).forEach((c, rang) => {
        const codeCarte = texte(c?.code);
        const ou = `${where}, carte ${codeCarte || '?'}`;
        const generique = c?.generique === true;
        const nom = texte(c?.nom);
        const categorie = texte(c?.categorie);
        const pourquoi = texte(c?.pourquoi);
        const indice = texte(c?.indice) || null;
        if (!codeCarte || codeCarte.length > 32 || cartesVues.has(codeCarte)) {
          row.errors.push(`${ou} : code manquant, > 32 ou en double`);
        }
        cartesVues.add(codeCarte);
        if (!nom || nom.length > 160) row.errors.push(`${ou} : nom vide ou > 160`);
        if (!admises.has(categorie))
          row.errors.push(`${ou} : catégorie ${categorie || '?'} inconnue`);
        if (!pourquoi || pourquoi.length > 500) row.errors.push(`${ou} : pourquoi vide ou > 500`);
        if (indice && indice.length > 255) row.errors.push(`${ou} : indice > 255`);
        if (famille?.famille === 'pays' && !indice) row.errors.push(`${ou} : indice attendu`);
        checkVisible(row.errors, ou, 'nom', nom, secretTerms);
        checkVisible(row.errors, ou, 'pourquoi', pourquoi, secretTerms);
        checkVisible(row.errors, ou, 'indice', indice, secretTerms);
        // Une carte générique est marquée ; toute autre carte est une fiche d'espèce.
        if (generique !== CODE_GENERIQUE_RE.test(codeCarte)) {
          row.errors.push(`${ou} : une carte DEC-… est générique, et elle seule`);
        } else if (!generique) {
          if (!CODE_ESPECE_RE.test(codeCarte)) row.errors.push(`${ou} : code d'espèce attendu`);
          const sp = species.get(codeCarte);
          const biomeAttendu = famille?.famille === 'pays' ? categorie : biome;
          // Corpus réel exigé en strict ; une base sans espèces garde le contenu du fichier.
          if (!sp) pushCrossRow(out, `${ou} : espèce absente de gl_species`);
          else if (sp.biome !== biomeAttendu) {
            row.errors.push(`${ou} : espèce du biome ${sp.biome}, pas ${biomeAttendu}`);
          }
        }
        cartes.push({ code: codeCarte, nom, indice, categorie, pourquoi, generique, ordre: rang });
      });
      if (cartes.length < CARTES_RANGER_MIN || cartes.length > CARTES_RANGER_MAX) {
        row.errors.push(`${where} : ${CARTES_RANGER_MIN} à ${CARTES_RANGER_MAX} cartes attendues`);
      }
      // Chaque catégorie du jeu sert au moins une fois : pas de colonne vide à la fin.
      if (famille?.famille === 'role') {
        for (const cat of categories) {
          if (!cartes.some((c) => c.categorie === cat)) {
            row.errors.push(`${where} : aucune carte pour la catégorie ${cat}`);
          }
        }
      }
      if (!row.keep()) return;
      retenus.push({
        code,
        famille: famille.famille,
        unite,
        plateau,
        biome: famille.famille === 'role' ? biome : null,
        titre,
        bilan,
        categories,
        cartes,
        ordre,
      });
    });
    if (stopBeforeWrite(out)) return out;
    for (const f of familles.values()) {
      await db.execute(
        `INSERT INTO gl_trame_ranger_familles (famille, nom, consigne, categories_json, ordre, actif, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE nom = VALUES(nom), consigne = VALUES(consigne),
           categories_json = VALUES(categories_json), ordre = VALUES(ordre), actif = 1, updated_at = NOW()`,
        [
          f.famille,
          f.nom,
          f.consigne,
          f.depuisBiomes ? null : JSON.stringify(f.categories),
          f.ordre,
        ],
      );
    }
    await deactivateMissing(db, 'gl_trame_ranger_familles', 'famille', [...familles.keys()]);
    for (const r of retenus) {
      await db.execute(
        `INSERT INTO gl_trame_ranger_jeux (code, famille, unite, plateau, biome, titre, bilan, categories_json, ordre, actif, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE famille = VALUES(famille), unite = VALUES(unite), plateau = VALUES(plateau),
           biome = VALUES(biome), titre = VALUES(titre), bilan = VALUES(bilan),
           categories_json = VALUES(categories_json), ordre = VALUES(ordre), actif = 1, updated_at = NOW()`,
        [
          r.code,
          r.famille,
          r.unite,
          r.plateau,
          r.biome,
          r.titre,
          r.bilan,
          JSON.stringify(r.categories),
          r.ordre,
        ],
      );
      // Cartes d'un jeu : contenu du fichier, remplacé en bloc (jamais de données de partie).
      await db.execute('DELETE FROM gl_trame_ranger_cartes WHERE jeu_code = ?', [r.code]);
      for (const c of r.cartes) {
        await db.execute(
          `INSERT INTO gl_trame_ranger_cartes (jeu_code, code, nom, indice, categorie, pourquoi, generique, ordre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.code, c.code, c.nom, c.indice, c.categorie, c.pourquoi, c.generique ? 1 : 0, c.ordre],
        );
      }
      out.upserted += 1;
    }
    out.desactives = await deactivateMissing(
      db,
      'gl_trame_ranger_jeux',
      'code',
      retenus.map((r) => r.code),
    );
    return out;
  }

  // -------------------------------------------------------------------
  // trame-adaptations.json — « Les fils de l'adaptation » (ensemble unifié, M21)
  // -------------------------------------------------------------------
  async function importTrameAdaptations(db, json, { dryRun = false, strict = false } = {}) {
    const out = report('trame-adaptations', { strict, dryRun });
    const biomes = Array.isArray(json?.biomes) ? json.biomes : null;
    if (!biomes) return refuse(out, 'trame-adaptations : clé `biomes[]` absente');
    out.count = biomes.length;
    const secretTerms = await loadSecretTerms(db);
    const retenus = [];
    const vus = new Set();
    biomes.forEach((jeu, ordre) => {
      const biome = texte(jeu?.biome);
      const plateau = Number(jeu?.plateau);
      const where = `adaptations ${biome || '?'}`;
      const row = ligne(out);
      if (!biome) row.errors.push(`${where} : biome manquant`);
      if (vus.has(biome)) row.errors.push(`${where} : biome en double`);
      vus.add(biome);
      if (![1, 2, 3, 4].includes(plateau)) row.errors.push(`${where} : plateau hors 1-4`);
      else if (!(PLATEAU_BIOMES[plateau] || []).includes(biome)) {
        row.errors.push(`${where} : biome étranger au plateau ${plateau}`);
      }
      const titre = texte(jeu?.titre);
      if (!titre || titre.length > 160) row.errors.push(`${where} : titre vide ou > 160`);
      checkVisible(row.errors, where, 'titre', titre, secretTerms);
      checkVisible(row.errors, where, 'note', jeu?.note, secretTerms);
      const cartes = (Array.isArray(jeu?.cartes) ? jeu.cartes : []).map((c, rang) => ({
        code: texte(Array.isArray(c) ? c[0] : c?.code),
        texte: texte(Array.isArray(c) ? c[1] : c?.texte),
        ordre: rang,
      }));
      const codes = new Set(cartes.map((c) => c.code));
      if (cartes.length < 3 || codes.size !== cartes.length) {
        row.errors.push(`${where} : au moins trois cartes distinctes attendues`);
      }
      for (const c of cartes) {
        if (!c.code || c.code.length > 8) row.errors.push(`${where} : code de carte manquant`);
        if (!c.texte || c.texte.length > 255) {
          row.errors.push(`${where} : carte ${c.code} vide ou > 255`);
        }
        checkVisible(row.errors, where, `carte ${c.code}`, c.texte, secretTerms);
      }
      const liens = [];
      const dejaVus = new Set();
      for (const l of Array.isArray(jeu?.liens) ? jeu.liens : []) {
        const de = texte(Array.isArray(l) ? l[0] : l?.de);
        const vers = texte(Array.isArray(l) ? l[1] : l?.vers);
        const cle = `${de}>${vers}`;
        if (!codes.has(de) || !codes.has(vers)) {
          row.errors.push(`${where} : lien ${cle} hors des cartes du biome`);
        } else if (de === vers) {
          row.errors.push(`${where} : lien ${cle} d'une carte vers elle-même`);
        } else if (dejaVus.has(cle)) row.errors.push(`${where} : lien ${cle} en double`);
        else if (dejaVus.has(`${vers}>${de}`)) {
          row.errors.push(`${where} : lien ${cle} posé dans les deux sens`);
        } else liens.push({ de, vers });
        dejaVus.add(cle);
      }
      if (!liens.length) row.errors.push(`${where} : aucun lien`);
      // Du milieu vers l'espèce : toute carte tient à un fil, aucune ne reste seule.
      const reliees = new Set(liens.flatMap((l) => [l.de, l.vers]));
      for (const c of cartes) {
        if (c.code && !reliees.has(c.code)) row.errors.push(`${where} : carte ${c.code} sans fil`);
      }
      if (!row.keep()) return;
      retenus.push({ biome, plateau, titre, note: texte(jeu?.note) || null, cartes, liens, ordre });
    });
    if (stopBeforeWrite(out)) return out;
    for (const r of retenus) {
      await db.execute(
        `INSERT INTO gl_trame_adaptation_jeux (biome, plateau, titre, note, ordre, actif, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE plateau = VALUES(plateau), titre = VALUES(titre), note = VALUES(note),
           ordre = VALUES(ordre), actif = 1, updated_at = NOW()`,
        [r.biome, r.plateau, r.titre, r.note, r.ordre],
      );
      await db.execute('DELETE FROM gl_trame_adaptation_cartes WHERE biome = ?', [r.biome]);
      await db.execute('DELETE FROM gl_trame_adaptation_liens WHERE biome = ?', [r.biome]);
      for (const c of r.cartes) {
        await db.execute(
          'INSERT INTO gl_trame_adaptation_cartes (biome, code, texte, ordre) VALUES (?, ?, ?, ?)',
          [r.biome, c.code, c.texte, c.ordre],
        );
      }
      for (const l of r.liens) {
        await db.execute(
          'INSERT INTO gl_trame_adaptation_liens (biome, de_code, vers_code) VALUES (?, ?, ?)',
          [r.biome, l.de, l.vers],
        );
      }
      out.upserted += 1;
    }
    out.desactives = await deactivateMissing(
      db,
      'gl_trame_adaptation_jeux',
      'biome',
      retenus.map((r) => r.biome),
    );
    return out;
  }

  // Clés = noms de fichiers (`IMPORTERS` de lib/glTenirImport.js), dans l'ordre de chargement.
  return {
    'trame-reseaux': importTrameReseaux,
    'trame-fils': importTrameFils,
    'trame-reparer': importTrameReparer,
    'trame-ranger': importTrameRanger,
    'trame-adaptations': importTrameAdaptations,
  };
};

module.exports.controlerReseau = controlerReseau;
module.exports.typeInteraction = typeInteraction;
module.exports.NIVEAUX = NIVEAUX;
module.exports.NIVEAU_ALTEREE = NIVEAU_ALTEREE;
module.exports.FAMILLES_RANGER = FAMILLES_RANGER;
