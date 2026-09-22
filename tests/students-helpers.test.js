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
  normalizeImportUserType,
  normalizeImportRoleSlug,
  describeUnknownImportRole,
  buildRoleAliasesFromDbRows,
  canonicalizeImportRoleValue,
  userTypeForImportRoleSlug,
  userTypeForRole,
  isAdminRoleSlug,
  hasImportScalarValue,
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
const { checkRoleGrantAllowed } = require('../lib/rbacRoleAssignment');
const { N3BEUR_RANK_EXCLUSIVE_MAX } = require('../lib/shared/n3beurRolesCore');

describe('studentRouteHelpers (logique pure de routes/students.js, sans DB)', () => {
  it('constantes : limites, rôles importables, skip domaines e-mail', () => {
    assert.equal(MAX_DESCRIPTION_LEN, 300);
    assert.equal(MAX_AVATAR_BYTES, 2 * 1024 * 1024);
    assert.equal(MAX_IMPORT_FILE_BYTES, 8 * 1024 * 1024);
    assert.equal(MAX_IMPORT_ROWS, 1000);
    assert.equal(TEMPLATE_COLUMNS.length, 8);
    assert.equal(TEMPLATE_COLUMNS[0], 'Rôle');
    assert.match(TEMPLATE_COLUMNS[4], /Groupes/);
    assert.ok(!TEMPLATE_COLUMNS.some((c) => /affiliation/i.test(c)));
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
    // Régression : les **libellés affichés** par l'application (et annoncés par la
    // documentation) tombaient en « rôle invalide » faute de dépliage des accents,
    // des espaces et des emoji.
    assert.equal(normalizeImportRoleSlug('n3beur novice'), 'eleve_novice');
    assert.equal(normalizeImportRoleSlug('n3beur avancé'), 'eleve_avance');
    assert.equal(normalizeImportRoleSlug('n3beur chevronné'), 'eleve_chevronne');
    assert.equal(normalizeImportRoleSlug('Prof de classe'), 'prof_classe');
    assert.equal(normalizeImportRoleSlug('Élève avancé'), 'eleve_avance');
    assert.equal(normalizeImportRoleSlug('Élève chevronné 🏆'), 'eleve_chevronne');
    assert.equal(normalizeImportRoleSlug('ELEVE-AVANCE'), 'eleve_avance');
    assert.equal(normalizeImportRoleSlug('  Visiteur  '), 'visiteur');
    assert.equal(normalizeImportRoleSlug('tuteur'), 'prof_classe');
    assert.equal(normalizeImportRoleSlug('enseignant'), 'prof');
    assert.equal(normalizeImportUserType('prof'), 'teacher');
    assert.equal(normalizeImportUserType('eleve'), 'student');
    assert.equal(userTypeForImportRoleSlug('admin'), 'teacher');
    assert.equal(userTypeForImportRoleSlug('visiteur'), 'student');
    /*
     * « Personnel » importe un compte **enseignant** depuis le réalignement du 22/09/2026.
     * La clé d'appariement de l'import est `type|prénom|nom` : tant que ce profil était
     * déclaré `student`, un ré-import du fichier des personnels ne retrouvait plus les
     * comptes existants — devenus `teacher` en base — et repartait en création.
     */
    assert.equal(userTypeForImportRoleSlug('personnel'), 'teacher');
    assert.equal(userTypeForRole({ slug: 'personnel', rank: 320 }), 'teacher');
  });

  it('normalizeImportRoleSlug : libellés renommés en base (alias dynamiques)', () => {
    const aliases = buildRoleAliasesFromDbRows([
      { slug: 'eleve_avance', display_name: 'Jardinier confirmé' },
      { slug: 'prof', display_name: 'Maître composteur' },
      // Slug hors périmètre d'import : ignoré.
      { slug: 'gl_mj', display_name: 'Jardinier confirmé' },
      // Libellé qui écraserait un alias statique : les alias statiques gagnent.
      { slug: 'admin', display_name: 'Visiteur' },
    ]);
    assert.equal(normalizeImportRoleSlug('Jardinier confirmé', aliases), 'eleve_avance');
    assert.equal(normalizeImportRoleSlug('maitre composteur', aliases), 'prof');
    assert.equal(normalizeImportRoleSlug('Visiteur', aliases), 'visiteur');
    assert.equal(normalizeImportRoleSlug('Inconnu', aliases), null);
    // Sans la table d'alias, le libellé personnalisé reste inconnu.
    assert.equal(normalizeImportRoleSlug('Jardinier confirmé'), null);
  });

  it('buildRoleAliasesFromDbRows : libellé ambigu (deux profils) écarté', () => {
    const aliases = buildRoleAliasesFromDbRows([
      { slug: 'eleve_avance', display_name: 'Palier intermédiaire' },
      { slug: 'eleve_chevronne', display_name: 'Palier intermédiaire' },
    ]);
    assert.equal(aliases.has(canonicalizeImportRoleValue('Palier intermédiaire')), false);
  });

  it('describeUnknownImportRole : message explicite, cas G&L distingué', () => {
    assert.match(describeUnknownImportRole('Terminale'), /« Terminale » inconnu/);
    assert.match(describeUnknownImportRole('Terminale'), /eleve_novice/);
    assert.match(describeUnknownImportRole('gl_mj'), /G&L/);
    assert.match(describeUnknownImportRole('Maître du jeu'), /G&L/);
  });

  it('checkRoleGrantAllowed (rbacRoleAssignment) : anti-escalade à la création / import', () => {
    const admin = { roleSlug: 'admin', roleRank: 500 };
    const n3boss = { roleSlug: 'prof', roleRank: 400 };
    const tuteur = { roleSlug: 'prof_classe', roleRank: 350 };
    const role = (slug, rank) => ({ id: 1, slug, rank });
    assert.equal(checkRoleGrantAllowed(admin, role('admin', 500)).ok, true);
    const refusAdmin = checkRoleGrantAllowed(n3boss, role('admin', 500));
    assert.equal(refusAdmin.ok, false);
    assert.equal(refusAdmin.status, 403);
    assert.equal(checkRoleGrantAllowed(n3boss, role('prof_classe', 350)).ok, true);
    const refusRang = checkRoleGrantAllowed(tuteur, role('prof', 400));
    assert.equal(refusRang.ok, false);
    assert.equal(refusRang.status, 403);
    assert.equal(checkRoleGrantAllowed(tuteur, role('visiteur', 50)).ok, true);
    // Un profil G&L ne s'attribue jamais depuis ForetMap, même par un administrateur.
    assert.equal(checkRoleGrantAllowed(admin, role('gl_mj', 360)).status, 400);
    // Profil introuvable.
    assert.equal(checkRoleGrantAllowed(admin, null).status, 404);
    // Système (`actor = null`) : aucune garde d'acteur.
    assert.equal(checkRoleGrantAllowed(null, role('admin', 500)).ok, true);
  });

  it('isAdminRoleSlug / userTypeForRole / hasImportScalarValue', () => {
    assert.equal(isAdminRoleSlug('admin'), true);
    assert.equal(isAdminRoleSlug('prof'), false);
    assert.equal(userTypeForRole({ slug: 'admin' }), 'teacher');
    assert.equal(userTypeForRole({ slug: 'visiteur' }), 'student');
    // Profil sur mesure : le rang décide du type de compte.
    assert.equal(
      userTypeForRole({ slug: 'jardinier', rank: N3BEUR_RANK_EXCLUSIVE_MAX }),
      'teacher',
    );
    assert.equal(
      userTypeForRole({ slug: 'jardinier', rank: N3BEUR_RANK_EXCLUSIVE_MAX - 1 }),
      'student',
    );
    assert.equal(hasImportScalarValue(null), false);
    assert.equal(hasImportScalarValue(''), false);
    assert.equal(hasImportScalarValue('  '), false);
    assert.equal(hasImportScalarValue('ok'), true);
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
      normalizeImportHeader('Groupes (noms/slugs | chemin Parent>Enfant)'),
      'groupes_noms_slugs_chemin_parent_enfant',
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

  it('mapImportRowToStudentShape : en-tête explicite prioritaire sur l’en-tête de repli', () => {
    // Un export porte souvent « Type » (élève/enseignant) *et* « Rôle » (le profil) :
    // le dernier mappé gagnait, donc le profil dépendait de l'ordre des colonnes.
    const avecTypeAvant = mapImportRowToStudentShape({
      Type: 'eleve',
      Rôle: 'prof_classe',
      Prénom: 'Ada',
      Nom: 'Lovelace',
    });
    const avecTypeApres = mapImportRowToStudentShape({
      Rôle: 'prof_classe',
      Type: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
    });
    assert.equal(avecTypeAvant.role, 'prof_classe');
    assert.equal(avecTypeApres.role, 'prof_classe');
    // Idem pour « Classe » qui ne doit pas primer sur « Groupes ».
    const groupes = mapImportRowToStudentShape({
      Classe: '6ème A',
      Groupes: '6ème B > Atelier',
    });
    assert.equal(groupes.groups, '6ème B > Atelier');
    // En l'absence de l'en-tête explicite, le repli sert toujours.
    assert.equal(mapImportRowToStudentShape({ Type: 'prof' }).role, 'prof');
    assert.equal(mapImportRowToStudentShape({ Classe: '6ème A' }).groups, '6ème A');
  });

  it('mapImportRowToStudentShape : « E-mail » et variantes reconnues', () => {
    assert.equal(mapImportRowToStudentShape({ 'E-mail': 'a@b.fr' }).email, 'a@b.fr');
    assert.equal(mapImportRowToStudentShape({ Courriel: 'a@b.fr' }).email, 'a@b.fr');
    assert.equal(mapImportRowToStudentShape({ 'Adresse e-mail': 'a@b.fr' }).email, 'a@b.fr');
    assert.equal(mapImportRowToStudentShape({ 'Nom de famille': 'Lovelace' }).lastName, 'Lovelace');
  });

  it('buildImportStudentPayload : payload normalisé complet (prof)', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: ' Ada ',
      Nom: ' Lovelace ',
      'Mot de passe': ' MotDePasse12! ',
      Pseudo: '  ',
      Email: ' ada@gmail.com ',
      Description: '',
    });
    assert.deepEqual(payload, {
      roleSlug: 'prof',
      roleInput: 'prof',
      userType: 'teacher',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'MotDePasse12!',
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
      [TEMPLATE_COLUMNS[4]]: '6ème A | 6ème B > Atelier',
    });
    assert.deepEqual(payload.groupRefs, [{ path: ['6ème A'] }, { path: ['6ème B', 'Atelier'] }]);
  });

  it('buildImportStudentPayload : profil sur mesure (alias BDD, type de compte par le rang)', () => {
    const roleAliases = buildRoleAliasesFromDbRows([
      { slug: 'jardinier', display_name: 'Jardinier' },
    ]);
    const rolesBySlug = new Map([
      ['jardinier', { id: 42, slug: 'jardinier', rank: N3BEUR_RANK_EXCLUSIVE_MAX }],
    ]);
    const payload = buildImportStudentPayload(
      { Rôle: 'Jardinier', Prénom: 'Ada', Nom: 'Lovelace', 'Mot de passe': 'MotDePasse12!' },
      { roleAliases, rolesBySlug },
    );
    assert.equal(payload.roleSlug, 'jardinier');
    assert.equal(payload.userType, 'teacher');
    // Sans la liste des profils connus en base, un slug sur mesure est refusé ; avec, il passe.
    assert.ok(validateImportStudentPayload(payload, 2).some((e) => e.field === 'role'));
    assert.deepEqual(
      validateImportStudentPayload(payload, 2, { knownRoleSlugs: new Set(['jardinier']) }),
      [],
    );
  });

  it('validateImportStudentPayload : payload élève valide → aucune erreur', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
    });
    assert.deepEqual(validateImportStudentPayload(payload, 2), []);
  });

  it('validateImportStudentPayload : e-mail hors domaine établissement accepté', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'visiteur',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'azerty123',
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
    });
    const errors = validateImportStudentPayload(payload, 3, {
      minPasswordStudent: 4,
      minPasswordTeacher: 12,
    });
    assert.ok(errors.some((e) => e.field === 'password' && /12/.test(e.error)));
  });

  it('validateImportStudentPayload : allowWeakPasswords assouplit le plancher élève seulement', () => {
    const eleve = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'ab',
    });
    const opts = { minPasswordStudent: 4, minPasswordTeacher: 12, allowWeakPasswords: true };
    assert.deepEqual(validateImportStudentPayload(eleve, 3, opts), []);
    // Le plancher enseignant ne descend jamais sous 12 caractères, même avec le réglage (CDG-41).
    const prof = buildImportStudentPayload({
      Rôle: 'prof',
      Prénom: 'Ada',
      Nom: 'Lovelace',
      'Mot de passe': 'ab',
    });
    const errors = validateImportStudentPayload(prof, 3, opts);
    assert.ok(errors.some((e) => e.field === 'password' && /12/.test(e.error)));
    // Idem si le réglage enseignant est plus bas que le plancher local.
    const errorsBas = validateImportStudentPayload(prof, 3, {
      minPasswordStudent: 4,
      minPasswordTeacher: 6,
      allowWeakPasswords: true,
    });
    assert.ok(errorsBas.some((e) => e.field === 'password' && /12/.test(e.error)));
  });

  it('validateImportStudentPayload : passwordRequired false tolère un MDP vide', () => {
    const payload = buildImportStudentPayload({
      Rôle: 'eleve',
      Prénom: 'Ada',
      Nom: 'Lovelace',
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
        pseudo: 'a!',
        email: 'pas-un-email',
        description: 'x'.repeat(MAX_DESCRIPTION_LEN + 1),
      },
      5,
    );
    const fields = errors.map((e) => e.field).sort();
    assert.deepEqual(fields, [
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

  it('buildTemplateWorkbookRows : tous les profils + toutes les situations couvertes', () => {
    const rows = buildTemplateWorkbookRows();
    assert.ok(rows.length >= IMPORT_ROLE_SLUGS.size);
    assert.ok(rows.every((r) => Object.keys(r).length === TEMPLATE_COLUMNS.length));

    // Chaque profil importable a au moins une ligne d'exemple.
    const resolved = rows.map((r) => normalizeImportRoleSlug(r[TEMPLATE_COLUMNS[0]]));
    for (const slug of IMPORT_ROLE_SLUGS) {
      assert.ok(resolved.includes(slug), `profil sans exemple : ${slug}`);
    }

    // Écritures de la colonne Rôle : slug, nom affiché, libellé accentué, alias.
    const roleCells = rows.map((r) => String(r[TEMPLATE_COLUMNS[0]]));
    assert.ok(roleCells.includes('eleve_novice'), 'aucun exemple en slug');
    assert.ok(roleCells.includes('n3beur novice'), 'aucun exemple en nom affiché');
    assert.ok(roleCells.includes('Élève avancé'), 'aucun exemple accentué');
    assert.ok(roleCells.includes('tuteur'), 'aucun exemple par alias');

    // Situations : e-mail hors établissement, multi-groupes, chemin Parent>Enfant,
    // absence de groupe, ligne minimale, doublon fusionnable.
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[6]] || '').includes('@gmail.com')));
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[4]] || '').includes('|')));
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[4]] || '').includes('>')));
    assert.ok(rows.some((r) => String(r[TEMPLATE_COLUMNS[4]] || '') === ''));
    assert.ok(
      rows.some((r) => !r[TEMPLATE_COLUMNS[5]] && !r[TEMPLATE_COLUMNS[6]]),
      'aucune ligne minimale',
    );

    // Toutes les lignes sont importables telles quelles (aucune ligne fautive),
    // et le doublon volontaire fusionne en un seul compte.
    const items = rows.map((r, i) => ({
      payload: buildImportStudentPayload(r),
      rowNumber: i + 2,
    }));
    for (const item of items) {
      assert.deepEqual(
        validateImportStudentPayload(item.payload, item.rowNumber, {
          minPasswordStudent: 4,
          minPasswordTeacher: 12,
          passwordRequired: false,
        }),
        [],
        `ligne d'exemple invalide : ${item.payload.firstName} ${item.payload.lastName}`,
      );
    }
    const { items: merged, infos } = mergeDuplicateStudentImportItems(items);
    assert.equal(merged.length, rows.length - 1);
    assert.equal(infos.length, 1);
    const dora = merged.find((m) => m.payload.lastName === 'Doublon');
    assert.equal(dora.payload.groupRefs.length, 3, 'groupes non cumulés');
    assert.equal(dora.payload.password, 'azerty123', 'mot de passe vide : ligne 1 conservée');
    assert.equal(dora.payload.pseudo, 'dora_doublon', 'dernière ligne non prioritaire');
    // Chaque compte créé par le modèle a un mot de passe et un profil résolu.
    for (const m of merged) {
      assert.ok(m.payload.password, `mot de passe manquant : ${m.payload.firstName}`);
      assert.ok(IMPORT_ROLE_SLUGS.has(m.payload.roleSlug));
    }
  });
});
