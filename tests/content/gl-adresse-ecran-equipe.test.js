'use strict';

/**
 * Gnomes & Licornes — à qui parle l'écran ? (décision du 20/11/2026, chantier « écrans de
 * séance »).
 *
 * - **vous** quand l'écran parle à **l'équipe** : tablette d'équipe, projection, choix d'équipe
 *   par le lien de classe, lignes d'Olu dites en séance ;
 * - **tu** quand l'écran parle à **un élève** : connexion, Seuil, Marché, carnet personnel,
 *   badges, Lettre, et toute ligne qui interpelle un rôle nommé (« Secrétaire, à toi »).
 *
 * Ce test porte sur des **textes** (sources des composants de séance, lignes d'Olu du
 * catalogue) : il vit avec le contenu, dans l'étape CI « Contenu pédagogique ». Contrôle
 * statique, sans base. Une exception se déclare dans la liste blanche, avec sa raison.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { findForbiddenString } = require('../../lib/shared/glGardeFousCore');

const ROOT = path.join(__dirname, '..', '..');

/** Pronoms et formes verbales de la deuxième personne du singulier (mot entier). */
const TUTOIEMENT_RE =
  /(^|[^\p{L}\p{N}_$.-])(?:(tu|ton|ta|tes|toi|attends|réponds|choisis)(?=[^\p{L}\p{N}_$-]|$)|(t['’])(?=\p{L}))/iu;

/** Première forme tutoyée d'un texte, ou `null`. */
function tutoiement(texte) {
  const m = TUTOIEMENT_RE.exec(String(texte ?? ''));
  return m ? m[2] || m[3] : null;
}

/**
 * Retire les commentaires d'une source JS / JSX (blocs, fins de ligne, commentaires JSX) : un
 * commentaire de développeur peut tutoyer, pas une chaîne servie.
 */
function sansCommentaires(source) {
  return String(source)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/** Sources dont **toute** chaîne s'adresse à l'équipe. */
const SOURCES_EQUIPE = [
  ...fs
    .readdirSync(path.join(ROOT, 'src', 'gl', 'components', 'tenir'))
    .filter((f) => /\.(jsx|js)$/.test(f))
    .map((f) => path.join('src', 'gl', 'components', 'tenir', f)),
  path.join('src', 'shared', 'glSortMomentsCore.js'),
  path.join('src', 'gl', 'constants', 'tenirPhases.js'),
  // Les mots de la carte du moment (bouton, puces, bandeaux d'une ligne, états sans geste).
  path.join('src', 'gl', 'utils', 'glTenirMoment.js'),
];

/**
 * Lignes d'Olu gardées au « tu », avec leur raison. Toute autre ligne se dit en séance, à
 * l'équipe ou à la classe.
 */
const OLU_AU_TU = Object.freeze({
  'olu-28': 'interpelle un rôle nommé (« Secrétaire, à toi »)',
  'olu-pf-marche': 'parle à une personne : ce que chacun achète au comptoir est à lui',
  'olu-pf-lettre': 'parle à une personne : une Lettre est une page à soi',
});

test('la détection reconnaît le tutoiement et laisse passer le vouvoiement', () => {
  assert.equal(tutoiement('Aucun tour ouvert : attends le prof.'), 'attends');
  assert.equal(tutoiement('Tu vois ce que fait ton camarade.'), 'Tu');
  assert.equal(tutoiement('Secrétaire, à toi.'), 'toi');
  assert.equal(tutoiement('Si t’es prêt'), 't’');
  assert.equal(tutoiement('Touchez la mascotte de votre équipe.'), null);
  assert.equal(tutoiement('Le bouton attend un clic ; une tablette attend.'), null);
  // Propriétés, attributs et identifiants composés : jamais pris pour un pronom.
  assert.equal(tutoiement('t.type; el.ton; data-ton="x"; ton_peuple; tes-pages'), null);
});

test('écrans de séance : aucune chaîne ne tutoie (elles parlent à l’équipe)', () => {
  const fautes = [];
  for (const rel of SOURCES_EQUIPE) {
    const lignes = sansCommentaires(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
    lignes.forEach((ligne, i) => {
      const mot = tutoiement(ligne);
      if (mot) fautes.push(`${rel}:${i + 1} « ${mot} » — ${ligne.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(fautes, [], `Tutoiement sur un écran d'équipe :\n${fautes.join('\n')}`);
});

/**
 * Garde-fous de lore sur les mêmes sources, plus les textes de la connexion et du pied de
 * l'assistant de sort retouchés par le chantier : aucun mot interdit (`glGardeFousCore`), dans
 * une chaîne comme dans un libellé. Les commentaires sont hors contrôle.
 */
const SOURCES_GARDE_FOUS = [
  ...SOURCES_EQUIPE,
  path.join('src', 'gl', 'constants', 'tenirTextes.js'),
  path.join('src', 'gl', 'constants', 'authCover.js'),
  path.join('src', 'gl', 'components', 'spell-cast', 'GLSpellCastFooter.jsx'),
];

test('écrans de séance et connexion : aucun mot interdit dans les sources', () => {
  const fautes = [];
  for (const rel of SOURCES_GARDE_FOUS) {
    const lignes = sansCommentaires(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
    lignes.forEach((ligne, i) => {
      const mot = findForbiddenString(ligne);
      if (mot) fautes.push(`${rel}:${i + 1} « ${mot} » — ${ligne.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(fautes, [], `Mot interdit sur un écran d'élève :\n${fautes.join('\n')}`);
});

for (const fichier of ['olu-lignes.json', path.join('exemple', 'olu-lignes.json')]) {
  test(`lignes d'Olu (${fichier}) : « vous » en séance, « tu » seulement en liste blanche`, () => {
    const { lignes } = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'gl', 'tenir', fichier), 'utf8'),
    );
    assert.ok(Array.isArray(lignes) && lignes.length > 0);
    const fautes = lignes
      .filter((l) => !OLU_AU_TU[l.id] && tutoiement(l.texte))
      .map((l) => `${l.id} : ${l.texte}`);
    assert.deepEqual(fautes, [], `Ligne d'Olu dite à l'équipe au « tu » :\n${fautes.join('\n')}`);
  });
}

test('liste blanche des lignes d’Olu : chaque exception existe et tutoie encore', () => {
  const { lignes } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'gl', 'tenir', 'olu-lignes.json'), 'utf8'),
  );
  for (const id of Object.keys(OLU_AU_TU)) {
    const ligne = lignes.find((l) => l.id === id);
    assert.ok(ligne, `${id} a quitté le catalogue : retirer l'exception`);
    assert.ok(tutoiement(ligne.texte), `${id} ne tutoie plus : retirer l'exception`);
  }
});

test('la ligne « un seul écran joue à la fois » parle à l’équipe', () => {
  const { lignes } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'gl', 'tenir', 'olu-lignes.json'), 'utf8'),
  );
  assert.equal(
    lignes.find((l) => l.id === 'olu-pf-main')?.texte,
    'Un seul écran joue à la fois. Vous voyez ce que fait votre camarade ; à la prochaine action, cet écran reprend la main.',
  );
});
