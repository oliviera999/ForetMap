'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_DESCRIPTION_LEN,
  MAX_AVATAR_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  ALLOWED_IMPORT_USER_TYPES,
  IMPORT_HEADER_ALIASES,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  affiliationFromImportCell,
  normalizeImportUserType,
  detectAvatarExtension,
  normalizeImportHeader,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  mapImportRowToStudentShape,
  buildImportStudentPayload,
  validateImportStudentPayload,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
} = require('../lib/studentRouteHelpers');

describe('studentRouteHelpers (logique pure de routes/students.js, sans DB)', () => {
  it('constantes : limites et colonnes du modèle inchangées', () => {
    assert.equal(MAX_DESCRIPTION_LEN, 300);
    assert.equal(MAX_AVATAR_BYTES, 2 * 1024 * 1024);
    assert.equal(MAX_IMPORT_FILE_BYTES, 8 * 1024 * 1024);
    assert.equal(MAX_IMPORT_ROWS, 1000);
    assert.equal(TEMPLATE_COLUMNS.length, 8);
    assert.equal(TEMPLATE_COLUMNS[0], 'Rôle');
    assert.deepEqual([...ALLOWED_IMPORT_USER_TYPES].sort(), ['student', 'teacher']);
    assert.ok(PSEUDO_RE.test('pseudo_ok-1'));
    assert.ok(!PSEUDO_RE.test('ab'));
    assert.ok(EMAIL_RE.test('a@b.fr'));
    assert.ok(!EMAIL_RE.test('a b@c.fr'));
  });

  it('normalizeVisitMascotPreference : trim, null si vide ou null', () => {
    assert.equal(normalizeVisitMascotPreference('  renard '), 'renard');
    assert.equal(normalizeVisitMascotPreference(''), null);
    assert.equal(normalizeVisitMascotPreference('   '), null);
    assert.equal(normalizeVisitMascotPreference(null), null);
    assert.equal(normalizeVisitMascotPreference(undefined), null);
    assert.equal(normalizeVisitMascotPreference(7), '7');
  });

  it('asTrimmedString : null/undefined → chaîne vide, sinon String + trim', () => {
    assert.equal(asTrimmedString(null), '');
    assert.equal(asTrimmedString(undefined), '');
    assert.equal(asTrimmedString('  x  '), 'x');
    assert.equal(asTrimmedString(12), '12');
  });

  it('hasOwn : propriété propre uniquement, tolère null', () => {
    assert.equal(hasOwn({ a: 1 }, 'a'), true);
    assert.equal(hasOwn({ a: undefined }, 'a'), true);
    assert.equal(hasOwn({}, 'toString'), false);
    assert.equal(hasOwn(null, 'a'), false);
  });

  it('affiliationFromImportCell : base n3/foret/both, vide → both, invalide → null', () => {
    assert.equal(affiliationFromImportCell('n3'), 'n3');
    assert.equal(affiliationFromImportCell(' FORET '), 'foret');
    assert.equal(affiliationFromImportCell(''), 'both');
    assert.equal(affiliationFromImportCell(null), 'both');
    assert.equal(affiliationFromImportCell('carte_1'), 'carte_1');
    assert.equal(affiliationFromImportCell('Slug Invalide !'), null);
  });

  it('normalizeImportUserType : alias élève/prof, défaut student, inconnu → null', () => {
    assert.equal(normalizeImportUserType('eleve'), 'student');
    assert.equal(normalizeImportUserType('Élève'), 'student');
    assert.equal(normalizeImportUserType('n3beur'), 'student');
    assert.equal(normalizeImportUserType('prof'), 'teacher');
    assert.equal(normalizeImportUserType('N3BOSS'), 'teacher');
    assert.equal(normalizeImportUserType(''), 'student');
    assert.equal(normalizeImportUserType(null), 'student');
    assert.equal(normalizeImportUserType('autre'), null);
  });

  it('detectAvatarExtension : png/jpg/webp, jpeg → jpg, refus hors data URL image', () => {
    assert.equal(detectAvatarExtension('data:image/png;base64,AAAA'), 'png');
    assert.equal(detectAvatarExtension('data:image/JPEG;base64,AAAA'), 'jpg');
    assert.equal(detectAvatarExtension('data:image/webp;base64,AAAA'), 'webp');
    assert.equal(detectAvatarExtension('data:image/gif;base64,AAAA'), null);
    assert.equal(detectAvatarExtension('https://x.fr/a.png'), null);
    assert.equal(detectAvatarExtension(''), null);
  });

  it('normalizeImportHeader : accents retirés, snake_case, bornes nettoyées', () => {
    assert.equal(normalizeImportHeader(' Prénom '), 'prenom');
    assert.equal(normalizeImportHeader('Rôle'), 'role');
    assert.equal(normalizeImportHeader('Mot de passe'), 'mot_de_passe');
    assert.equal(
      normalizeImportHeader('Affiliation (n3|foret|both|id_carte)'),
      'affiliation_n3_foret_both_id_carte',
    );
    assert.equal(normalizeImportHeader('__x__'), 'x');
  });

  it('IMPORT_HEADER_ALIASES : tous les en-têtes du modèle officiel sont reconnus', () => {
    for (const column of TEMPLATE_COLUMNS) {
      const normalized = normalizeImportHeader(column);
      assert.ok(
        IMPORT_HEADER_ALIASES.has(normalized),
        `en-tête non mappé : ${column} (${normalized})`,
      );
    }
  });

  it('parseCsvLine : guillemets, échappement "" et délimiteur protégé', () => {
    assert.deepEqual(parseCsvLine('a;b;c', ';'), ['a', 'b', 'c']);
    assert.deepEqual(parseCsvLine('"a;b";c', ';'), ['a;b', 'c']);
    assert.deepEqual(parseCsvLine('"il a dit ""ok""";x', ';'), ['il a dit "ok"', 'x']);
    assert.deepEqual(parseCsvLine('', ';'), ['']);
  });

  it('parseCsvRowsFromBuffer : BOM ignoré, CRLF, choix du délimiteur ;', () => {
    const csv = '﻿Prénom;Nom\r\nAda;Lovelace\r\nAlan;Turing\r\n';
    const rows = parseCsvRowsFromBuffer(Buffer.from(csv, 'utf8'));
    assert.deepEqual(rows, [
      { Prénom: 'Ada', Nom: 'Lovelace' },
      { Prénom: 'Alan', Nom: 'Turing' },
    ]);
  });

  it('parseCsvRowsFromBuffer : délimiteur virgule et cellules manquantes → vide', () => {
    const rows = parseCsvRowsFromBuffer(Buffer.from('a,b,c\n1,2\n', 'utf8'));
    assert.deepEqual(rows, [{ a: '1', b: '2', c: '' }]);
    assert.deepEqual(parseCsvRowsFromBuffer(Buffer.from('seule_ligne\n', 'utf8')), []);
  });

  it('mapImportRowToStudentShape : alias d’en-têtes, colonnes inconnues ignorées', () => {
    const mapped = mapImportRowToStudentShape({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
      'Colonne inconnue': 'x',
    });
    assert.deepEqual(mapped, {
      userType: 'eleve',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'azerty123',
    });
  });

  it('buildImportStudentPayload : payload normalisé complet', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: ' Ada ',
      Nom: ' Lovelace ',
      'Mot de passe': ' azerty123 ',
      Affiliation: 'N3',
      Pseudo: '  ',
      Email: ' ada@calcul.fr ',
      Description: '',
    });
    assert.deepEqual(payload, {
      userType: 'teacher',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'azerty123',
      affiliation: 'n3',
      pseudo: null,
      email: 'ada@calcul.fr',
      description: null,
    });
  });

  it('validateImportStudentPayload : payload valide → aucune erreur', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
      Affiliation: 'both',
    });
    assert.deepEqual(validateImportStudentPayload(payload, 2), []);
  });

  it('validateImportStudentPayload : cumul des erreurs avec numéro de ligne et champ', () => {
    const errors = validateImportStudentPayload(
      {
        userType: null,
        firstName: '',
        lastName: '',
        password: 'abc',
        affiliation: null,
        pseudo: 'a!',
        email: 'pas-un-email',
        description: 'x'.repeat(MAX_DESCRIPTION_LEN + 1),
      },
      5,
    );
    const fields = errors.map((e) => e.field).sort();
    assert.deepEqual(fields, [
      'affiliation',
      'description',
      'email',
      'firstName',
      'lastName',
      'password',
      'pseudo',
      'userType',
    ]);
    assert.ok(errors.every((e) => e.row === 5));
  });

  it('resolveImportRows : fichier .csv décodé depuis base64 (avec ou sans préfixe data:)', async () => {
    const csv = 'Prénom;Nom\nAda;Lovelace\n';
    const b64 = Buffer.from(csv, 'utf8').toString('base64');
    const direct = await resolveImportRows({ fileName: 'import.CSV', fileDataBase64: b64 });
    assert.deepEqual(direct, [{ Prénom: 'Ada', Nom: 'Lovelace' }]);
    const dataUrl = await resolveImportRows({
      fileName: 'import.csv',
      fileDataBase64: `data:text/csv;base64,${b64}`,
    });
    assert.deepEqual(dataUrl, direct);
  });

  it('resolveImportRows : fichier requis, vide ou trop volumineux → erreur', async () => {
    await assert.rejects(() => resolveImportRows({}), /Fichier requis/);
    await assert.rejects(
      () => resolveImportRows({ fileDataBase64: 'data:text/csv;base64,' }),
      /Fichier import vide/,
    );
    const big = Buffer.alloc(MAX_IMPORT_FILE_BYTES + 1, 97).toString('base64');
    await assert.rejects(
      () => resolveImportRows({ fileName: 'gros.csv', fileDataBase64: big }),
      /trop volumineux/,
    );
  });

  it('csvEscape : guillemets doublés et encapsulation si ; " ou saut de ligne', () => {
    assert.equal(csvEscape('simple'), 'simple');
    assert.equal(csvEscape('a;b'), '"a;b"');
    assert.equal(csvEscape('dit "ok"'), '"dit ""ok"""');
    assert.equal(csvEscape('l1\nl2'), '"l1\nl2"');
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(undefined), '');
  });

  it('buildTemplateWorkbookRows : une ligne d’exemple alignée sur TEMPLATE_COLUMNS', () => {
    const rows = buildTemplateWorkbookRows();
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]), TEMPLATE_COLUMNS);
    assert.equal(rows[0][TEMPLATE_COLUMNS[0]], 'eleve');
    assert.equal(rows[0][TEMPLATE_COLUMNS[4]], 'both');
  });
});
