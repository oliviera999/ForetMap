'use strict';

/**
 * Tutoiement partout, Visite publique comprise (décision d'Oliv du 20/11/2026,
 * `docs/AUDIT_UI_UX_2026-11-19.md`, U8).
 *
 * Les contenus de la Visite (fiches de zones et de repères) sont édités dans l'application et
 * déjà passés au tutoiement en prod. Ce garde-fou porte sur les **chaînes d'interface** :
 * habillage de la Visite (barre, fiche, aide, studio de visite) et écran d'accueil. Il
 * interdit `vous`, `votre`, `vos` et les impératifs en `-ez`, commentaires exclus.
 *
 * Modèle : `tests/visitor-text-guard.test.js`. Une exception légitime (mot en `-ez` qui n'est
 * pas un verbe) s'ajoute à `NON_VERBES` avec sa raison.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** Fichiers et dossiers scannés (chemins relatifs au dépôt). */
const CIBLES = [
  'src/components/visit',
  'src/components/visit-views.jsx',
  'src/components/auth-views.jsx',
  'src/components/app/UnauthenticatedShell.jsx',
  'src/components/mascot/MascotPackVisitListing.jsx',
  'src/hooks/useVisitSeenSync.js',
  'src/utils/visitViewStatus.js',
  'src/constants/help.js',
];

/** Mots en `-ez` qui ne sont pas des impératifs de vouvoiement. */
const NON_VERBES = new Set([
  'chez',
  'assez',
  'nez',
  'rez', // rez-de-chaussée
  'rendez', // rendez-vous (nom commun)
]);

function listerFichiers(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? listerFichiers(path.join(rel, d.name))
        : /\.(jsx?|mjs)$/.test(d.name)
          ? [path.join(abs, d.name)]
          : [],
    );
}

/** Retire les commentaires (bloc, JSX, ligne) en gardant les numéros de ligne. */
function sansCommentaires(source) {
  const blancs = (m) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blancs)
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, avant) => avant + blancs(m.slice(avant.length)));
}

/**
 * Vouvoiement repéré dans un texte : `vous`, `votre`, `vos`, impératifs en `-ez`.
 * « rendez-vous » est un nom commun, jamais signalé.
 * @param {string} texte
 * @returns {string[]}
 */
function trouverVouvoiement(texte) {
  const propre = String(texte || '').replace(/rendez-vous/gi, ' ');
  const hits = [];
  for (const m of propre.matchAll(/(?<![\p{L}_$])(vous|votre|vos)(?![\p{L}_$])/giu))
    hits.push(m[1]);
  for (const m of propre.matchAll(/(?<![\p{L}_$.])(\p{L}{2,}ez)(?![\p{L}_$])/gu)) {
    if (!NON_VERBES.has(m[1].toLowerCase())) hits.push(m[1]);
  }
  return hits;
}

test('détecteur : vouvoiement repéré, tutoiement et faux amis laissés', () => {
  assert.deepEqual(trouverVouvoiement('Utilisez « Me situer » depuis votre position'), [
    'votre',
    'Utilisez',
  ]);
  assert.deepEqual(trouverVouvoiement('Vos données'), ['Vos']);
  assert.deepEqual(trouverVouvoiement('Utilise « Me situer » depuis ta position'), []);
  assert.deepEqual(trouverVouvoiement('Un rendez-vous chez le jardinier, assez tôt'), []);
});

test('chaînes d’interface de la Visite et de l’accueil : tutoiement seulement', () => {
  const fautes = [];
  for (const rel of CIBLES) {
    for (const fichier of listerFichiers(rel)) {
      const lignes = sansCommentaires(fs.readFileSync(fichier, 'utf8')).split('\n');
      lignes.forEach((ligne, i) => {
        // Le lien vers la notice RGPD garde son titre officiel (« vos données ») : c'est le
        // nom d'une page, pas une adresse au visiteur.
        if (/PrivacyNoticeLink/.test(ligne)) return;
        for (const hit of trouverVouvoiement(ligne)) {
          fautes.push(`${path.relative(ROOT, fichier)}:${i + 1} « ${hit} »`);
        }
      });
    }
  }
  assert.deepEqual(fautes, [], `Vouvoiement dans l'interface de la Visite :\n${fautes.join('\n')}`);
});

module.exports = { trouverVouvoiement };
