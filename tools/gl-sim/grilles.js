'use strict';

/**
 * Grilles d'équilibrage (`data/gl/sim/grilles/*.json`, format `gl-sim-grille v1`) : des
 * variantes de réglages `gameplay.tenir_*` jouées côte à côte par le scénario `equilibrage`.
 *
 * `lireGrille(cheminOuObjet)` valide la structure et renvoie `{ format, variantes[] }` ; chaque
 * variante a un `id` unique, un `libelle` et un objet `reglages` dont toutes les clés commencent
 * par `gameplay.tenir_`.
 */

const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'gl-sim-grille v1';
const PREFIXE = 'gameplay.tenir_';
const GRILLE_PAR_DEFAUT = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'gl',
  'sim',
  'grilles',
  'grille-voile.json',
);

class GrilleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GrilleError';
  }
}

function validerGrille(json, source = 'grille') {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new GrilleError(`${source} : objet JSON attendu`);
  }
  if (json.format !== FORMAT) {
    throw new GrilleError(
      `${source} : format « ${json.format} » inattendu (attendu « ${FORMAT} »)`,
    );
  }
  if (!Array.isArray(json.variantes) || !json.variantes.length) {
    throw new GrilleError(`${source} : variantes[] vide`);
  }
  const ids = new Set();
  const variantes = json.variantes.map((v, i) => {
    const where = `${source} : variante #${i + 1}`;
    const id = String(v?.id || '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new GrilleError(`${where} : id invalide`);
    if (ids.has(id)) throw new GrilleError(`${where} : id « ${id} » en double`);
    ids.add(id);
    const reglages = v?.reglages;
    if (!reglages || typeof reglages !== 'object' || Array.isArray(reglages)) {
      throw new GrilleError(`${where} : reglages{} attendu`);
    }
    for (const key of Object.keys(reglages)) {
      if (!key.startsWith(PREFIXE)) {
        throw new GrilleError(`${where} : clé « ${key} » hors du groupe ${PREFIXE}*`);
      }
    }
    return { id, libelle: String(v.libelle || id), reglages: { ...reglages } };
  });
  return { format: FORMAT, variantes };
}

function lireGrille(cheminOuObjet = GRILLE_PAR_DEFAUT) {
  if (cheminOuObjet && typeof cheminOuObjet === 'object') return validerGrille(cheminOuObjet);
  const file = path.resolve(String(cheminOuObjet));
  if (!fs.existsSync(file)) throw new GrilleError(`grille introuvable : ${file}`);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new GrilleError(`${file} : JSON invalide (${err.message})`);
  }
  return validerGrille(json, path.basename(file));
}

module.exports = { FORMAT, PREFIXE, GRILLE_PAR_DEFAUT, GrilleError, validerGrille, lireGrille };
