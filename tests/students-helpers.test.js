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
  IMPORT_ROLE_SLUGS,
  IMPORT_SKIPS_EMAIL_DOMAIN_RESTRICTIONS,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  affiliationFromImportCell,
  normalizeImportUserType,
  normalizeImportRoleSlug,
  userTypeForImportRoleSlug,
  canActorImportRoleSlug,
  detectAvatarExtension,
  normalizeImportHeader,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  mapImportRowToStudentShape,
  buildImportStudentPayload,
  validateImportStudentPayload,
  mergeDuplicateStudentImportItems,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
} = require('../lib/studentRouteHelpers');

describe('studentRouteHelpers (logique pure de routes/students.js, sans DB)', () => {
  it('constantes : limites, rôles importables, skip domaines e-mail', () => {
    assert.equal(MAX_DESCRIPTION_LEN, 300);
    assert.equal(MAX_AVATAR_BYTES, 2 * 1024 * 1024);
    assert.equal(MAX_IMPORT_FILE_BYTES, 8 * 1024 * 1024);
    assert.equal(MAX_IMPORT_ROWS, 1000);
    assert.equal(TEMPLATE_COLUMNS.length, 9);
    assert.equal(TEMPLATE_COLUMNS[0], 'Rôle');
    assert.match(TEMPLATE_COLUMNS[5], /Groupes/);
    assert.deepEqual([...ALLOWED_IMPORT_USER_TYPES].sort(), ['student', 'teacher']);
    assert.equal(IMPORT_SKIPS_EMAIL_DOMAIN_RESTRICTIONS, true);
    assert.deepEqual(
      [...IMPORT_ROLE_SLUGS].sort(),
      [
        'admin',
        'eleve_avance',
        'eleve_chevronne',
        'eleve_novice',
        'personnel',
        'prof',
        'prof_classe',
        'visiteur',
      ].sort(),
    );
    assert.ok(PSEUDO_RE.test('pseudo_ok-1'));
    assert.ok(PSEUDO_RE.test('jean.dupont'));
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

  it('normalizeImportRoleSlug : tous les profils + alias', () => {
    assert.equal(normalizeImportRoleSlug(''), 'eleve_novice');
    assert.equal(normalizeImportRoleSlug(null), 'eleve_novice');
    assert.equal(normalizeImportRoleSlug('eleve'), 'eleve_novice');
    assert.equal(normalizeImportRoleSlug('visiteur'), 'visiteur');
    assert.equal(normalizeImportRoleSlug('personnel'), 'personnel');
    assert.equal(normalizeImportRoleSlug('staff'), 'personnel');
    assert.equal(normalizeImportRoleSlug('eleve_avance'), 'eleve_avance');
    assert.equal(normalizeImportRoleSlug('chevronné'), 'eleve_chevronne');
    assert.equal(normalizeImportRoleSlug('prof_classe'), 'prof_classe');
    assert.equal(normalizeImportRoleSlug('N3BOSS'), 'prof');
    assert.equal(normalizeImportRoleSlug('administrateur'), 'admin');
    assert.equal(normalizeImportRoleSlug('autre'), null);
    assert.equal(normalizeImportUserType('prof'), 'teacher');
    assert.equal(normalizeImportUserType('eleve'), 'student');
    assert.equal(userTypeForImportRoleSlug('admin'), 'teacher');
    assert.equal(userTypeForImportRoleSlug('visiteur'), 'student');
    assert.equal(userTypeForImportRoleSlug('personnel'), 'student');
  });

  it('canActorImportRoleSlug : anti-escalade', () => {
    assert.equal(canActorImportRoleSlug({ roleSlug: 'admin' }, 'admin'), true);
    assert.equal(canActorImportRoleSlug({ roleSlug: 'prof' }, 'admin'), false);
    assert.equal(canActorImportRoleSlug({ roleSlug: 'prof' }, 'prof_classe'), true);
    assert.equal(canActorImportRoleSlug({ roleSlug: 'prof_classe' }, 'prof'), false);
    assert.equal(canActorImportRoleSlug({ roleSlug: 'prof_classe' }, 'visiteur'), true);
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
      role: 'eleve',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'azerty123',
    });
  });

  it('buildImportStudentPayload : payload normalisé complet (prof)', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: ' Ada ',
      Nom: ' Lovelace ',
      'Mot de passe': ' MotDePasse12! ',
      Affiliation: 'N3',
      Pseudo: '  ',
      Email: ' ada@gmail.com ',
      Description: '',
    });
    assert.deepEqual(payload, {
      roleSlug: 'prof',
      userType: 'teacher',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'MotDePasse12!',
      affiliation: 'n3',
      groupRefs: [],
      pseudo: null,
      email: 'ada@gmail.com',
      description: null,
    });
  });

  it('buildImportStudentPayload : groupes multi et chemin', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
      Affiliation: 'both',
      [TEMPLATE_COLUMNS[5]]: '6ème A | 6ème B > Atelier',
    });
    assert.deepEqual(payload.groupRefs, [{ path: ['6ème A'] }, { path: ['6ème B', 'Atelier'] }]);
  });

  it('validateImportStudentPayload : payload élève valide → aucune erreur', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
      Affiliation: 'both',
    });
    assert.deepEqual(validateImportStudentPayload(payload, 2), []);
  });

  it('validateImportStudentPayload : e-mail hors domaine établissement accepté', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'visiteur',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
      Affiliation: 'both',
      Email: 'ada.externe@gmail.com',
    });
    assert.deepEqual(validateImportStudentPayload(payload, 2), []);
  });

  it('validateImportStudentPayload : prof exige mot de passe assez long', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'court',
      Affiliation: 'both',
    });
    const errors = validateImportStudentPayload(payload, 3, {
      minPasswordStudent: 4,
      minPasswordTeacher: 12,
    });
    assert.ok(errors.some((e) => e.field === 'password' && /12/.test(e.error)));
  });

  it('validateImportStudentPayload : allowWeakPasswords assouplit le plancher', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'ab',
      Affiliation: 'both',
    });
    assert.deepEqual(
      validateImportStudentPayload(payload, 3, {
        minPasswordStudent: 4,
        minPasswordTeacher: 12,
        allowWeakPasswords: true,
      }),
      [],
    );
  });

  it('validateImportStudentPayload : passwordRequired false tolère un MDP vide', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      Affiliation: 'n3',
    });
    assert.ok(!payload.password);
    assert.deepEqual(validateImportStudentPayload(payload, 2, { passwordRequired: false }), []);
  });

  it('validateImportStudentPayload : cumul des erreurs avec numéro de ligne et champ', () => {
    const errors = validateImportStudentPayload(
      {
        roleSlug: null,
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
      'role',
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

  it('mergeDuplicateStudentImportItems : groupes cumulés, dernière ligne pour le reste', () => {
    const a = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Léa',
      Nom: 'Martin',
      'Mot de passe': 'pass123',
      Groupes: '6A',
      Pseudo: 'lea1',
    });
    const b = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Léa',
      Nom: 'Martin',
      'Mot de passe': 'pass456',
      Groupes: '6B',
      Pseudo: 'lea2',
    });
    const { items, infos } = mergeDuplicateStudentImportItems([
      { payload: a, rowNumber: 2 },
      { payload: b, rowNumber: 4 },
    ]);
    assert.equal(items.length, 1);
    assert.deepEqual(
      items[0].payload.groupRefs.map((r) => r.path.join('>')),
      ['6A', '6B'],
    );
    assert.equal(items[0].payload.pseudo, 'lea2');
    assert.equal(items[0].payload.password, 'pass456');
    assert.equal(infos.length, 1);
    assert.match(infos[0].message, /Lignes 2, 4/);
  });

  it('buildTemplateWorkbookRows : une ligne d’exemple par profil ForetMap', () => {
    const rows = buildTemplateWorkbookRows();
    assert.equal(rows.length, IMPORT_ROLE_SLUGS.size);
    const slugs = rows.map((r) => r[TEMPLATE_COLUMNS[0]]);
    assert.deepEqual(slugs.sort(), [...IMPORT_ROLE_SLUGS].sort());
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[7]] || '').includes('@gmail.com')));
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[5]] || '').includes('|')));
    assert.ok(rows.every((r) => Object.keys(r).length === TEMPLATE_COLUMNS.length));
  });
});
