import { describe, expect, it } from 'vitest';
import {
  buildConstraintHelp,
  buildSettingSections,
  countSettingRows,
  filterSettingSections,
  humanizeKey,
  inferSectionFromKey,
  KEY_META,
  resolveSettingLabel,
  scopeLabel,
  SECTION_DEFS,
  typeLabel,
} from '../../src/utils/settingsAdmin.js';

// ---------------------------------------------------------------------------
// humanizeKey
// ---------------------------------------------------------------------------
describe('humanizeKey', () => {
  it('capitalise chaque mot du dernier segment', () => {
    expect(humanizeKey('ui.auth.allow_register')).toBe('Allow Register');
  });

  it('gere un segment unique sans point', () => {
    expect(humanizeKey('password_min_length')).toBe('Password Min Length');
  });

  it('retourne une chaine vide pour entree vide', () => {
    expect(humanizeKey('')).toBe('');
    expect(humanizeKey(null)).toBe('');
    expect(humanizeKey(undefined)).toBe('');
  });

  it('ne plante pas sur des caracteres speciaux', () => {
    expect(humanizeKey('a.b.c')).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// inferSectionFromKey
// ---------------------------------------------------------------------------
describe('inferSectionFromKey', () => {
  it('retourne auth pour ui.auth.*', () => {
    expect(inferSectionFromKey('ui.auth.allow_register')).toBe('auth');
    expect(inferSectionFromKey('UI.AUTH.FOO')).toBe('auth');
  });

  it('retourne content pour content.*', () => {
    expect(inferSectionFromKey('content.auth.title')).toBe('content');
    expect(inferSectionFromKey('content.visit.subtitle')).toBe('content');
  });

  it('retourne modules pour ui.modules.* et ui.map.*', () => {
    expect(inferSectionFromKey('ui.modules.tutorials_enabled')).toBe('modules');
    expect(inferSectionFromKey('ui.map.default_map_visit')).toBe('modules');
  });

  it('retourne tasks pour tasks.*', () => {
    expect(inferSectionFromKey('tasks.student_max_active_assignments')).toBe('tasks');
  });

  it('retourne progression pour rbac.* et progression.*', () => {
    expect(inferSectionFromKey('rbac.progression_by_validated_tasks')).toBe('progression');
    expect(inferSectionFromKey('progression.some_key')).toBe('progression');
  });

  it('retourne security pour security.* et integration.*', () => {
    expect(inferSectionFromKey('security.password_min_length')).toBe('security');
    expect(inferSectionFromKey('integration.google.enabled')).toBe('security');
  });

  it('retourne operations pour system.* et ops.*', () => {
    expect(inferSectionFromKey('system.maintenance_mode')).toBe('operations');
    expect(inferSectionFromKey('ops.allow_remote_logs')).toBe('operations');
  });

  it('retourne other pour cle inconnue', () => {
    expect(inferSectionFromKey('unknown.key')).toBe('other');
    expect(inferSectionFromKey('')).toBe('other');
    expect(inferSectionFromKey(null)).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// scopeLabel
// ---------------------------------------------------------------------------
describe('scopeLabel', () => {
  it('retourne Admin pour admin (insensible a la casse)', () => {
    expect(scopeLabel('admin')).toBe('Admin');
    expect(scopeLabel('ADMIN')).toBe('Admin');
  });

  it('retourne n3boss pour teacher', () => {
    expect(scopeLabel('teacher')).toBe('n3boss');
    expect(scopeLabel('TEACHER')).toBe('n3boss');
  });

  it('retourne Public pour toute autre valeur', () => {
    expect(scopeLabel('public')).toBe('Public');
    expect(scopeLabel('')).toBe('Public');
    expect(scopeLabel(null)).toBe('Public');
    expect(scopeLabel(undefined)).toBe('Public');
    expect(scopeLabel('guest')).toBe('Public');
  });
});

// ---------------------------------------------------------------------------
// typeLabel
// ---------------------------------------------------------------------------
describe('typeLabel', () => {
  it('retourne booleen pour boolean', () => {
    expect(typeLabel('boolean')).toBe('booleen');
    expect(typeLabel('BOOLEAN')).toBe('booleen');
  });

  it('retourne numerique pour number', () => {
    expect(typeLabel('number')).toBe('numerique');
  });

  it('retourne liste pour enum', () => {
    expect(typeLabel('enum')).toBe('liste');
  });

  it('retourne texte pour string', () => {
    expect(typeLabel('string')).toBe('texte');
  });

  it('retourne inconnu pour type vide ou null', () => {
    expect(typeLabel('')).toBe('inconnu');
    expect(typeLabel(null)).toBe('inconnu');
    expect(typeLabel(undefined)).toBe('inconnu');
  });

  it('retourne le type brut pour type inconnu non vide', () => {
    expect(typeLabel('json')).toBe('json');
  });
});

// ---------------------------------------------------------------------------
// buildConstraintHelp
// ---------------------------------------------------------------------------
describe('buildConstraintHelp', () => {
  it('produit au minimum "Type: ..."', () => {
    expect(buildConstraintHelp({ type: 'string' })).toBe('Type: texte');
  });

  it('inclut min et max quand presents', () => {
    const result = buildConstraintHelp({ type: 'number', constraints: { min: 0, max: 100 } });
    expect(result).toContain('min 0');
    expect(result).toContain('max 100');
  });

  it('inclut maxLength en caracteres', () => {
    const result = buildConstraintHelp({ type: 'string', constraints: { maxLength: 255 } });
    expect(result).toContain('max 255 caracteres');
  });

  it('inclut la liste des valeurs enum', () => {
    const result = buildConstraintHelp({ type: 'enum', constraints: { values: ['a', 'b', 'c'] } });
    expect(result).toContain('valeurs: a, b, c');
  });

  it('inclut la valeur par defaut si non vide', () => {
    const result = buildConstraintHelp({ type: 'string', default_value: 'hello' });
    expect(result).toContain('defaut: hello');
  });

  it('ignore min/max null (provenant de l\'API)', () => {
    const result = buildConstraintHelp({ type: 'number', constraints: { min: null, max: null } });
    expect(result).not.toContain('min');
    expect(result).not.toContain('max');
  });

  it('ignore default_value vide ou null', () => {
    expect(buildConstraintHelp({ type: 'string', default_value: '' })).not.toContain('defaut');
    expect(buildConstraintHelp({ type: 'string', default_value: null })).not.toContain('defaut');
  });

  it('ignore values tableau vide', () => {
    const result = buildConstraintHelp({ type: 'enum', constraints: { values: [] } });
    expect(result).not.toContain('valeurs');
  });

  it('ne plante pas sur une entree null/undefined', () => {
    expect(() => buildConstraintHelp(null)).not.toThrow();
    expect(() => buildConstraintHelp(undefined)).not.toThrow();
    expect(() => buildConstraintHelp({})).not.toThrow();
  });

  it('separe les parties par " - "', () => {
    const result = buildConstraintHelp({ type: 'number', constraints: { min: 1, max: 10 }, default_value: 5 });
    expect(result).toBe('Type: numerique - min 1 - max 10 - defaut: 5');
  });
});

// ---------------------------------------------------------------------------
// resolveSettingLabel
// ---------------------------------------------------------------------------
describe('resolveSettingLabel', () => {
  const roleTerms = {
    studentSingular: 'n3beur',
    teacherShort: 'n3boss',
    teacherSingular: 'n3boss',
  };

  it('retourne le label statique depuis KEY_META', () => {
    // ui.auth.allow_register has a static label
    const label = resolveSettingLabel('ui.auth.allow_register', roleTerms);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('resout le label dynamique googleStudent avec le terme de role', () => {
    const label = resolveSettingLabel('ui.auth.allow_google_student', roleTerms);
    expect(label).toContain('n3beur');
    expect(label).toContain('Google');
  });

  it('resout le label dynamique googleTeacher', () => {
    const label = resolveSettingLabel('ui.auth.allow_google_teacher', roleTerms);
    expect(label).toContain('n3boss');
    expect(label).toContain('Google');
  });

  it('resout le label dynamique defaultStudentMap', () => {
    const label = resolveSettingLabel('ui.map.default_map_student', roleTerms);
    expect(label).toContain('n3beur');
    expect(label).toContain('Carte');
  });

  it('resout le label dynamique defaultTeacherMap', () => {
    const label = resolveSettingLabel('ui.map.default_map_teacher', roleTerms);
    expect(label).toContain('n3boss');
    expect(label).toContain('Carte');
  });

  it('utilise humanizeKey pour les cles hors KEY_META', () => {
    const label = resolveSettingLabel('custom.unknown_setting', roleTerms);
    expect(label).toBe('Unknown Setting');
  });
});

// ---------------------------------------------------------------------------
// buildSettingSections
// ---------------------------------------------------------------------------
describe('buildSettingSections', () => {
  const sampleSettings = [
    { key: 'ui.auth.allow_register', value: true, type: 'boolean', scope: 'admin' },
    { key: 'security.password_min_length', value: 8, type: 'number', scope: 'admin' },
    { key: 'content.auth.title', value: 'Bienvenue', type: 'string', scope: 'admin' },
    { key: 'system.maintenance_mode', value: false, type: 'boolean', scope: 'admin' },
  ];

  it('retourne un tableau de sections', () => {
    const sections = buildSettingSections(sampleSettings);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
  });

  it('enrichit chaque row avec _sectionId, _sectionTitle, _sectionOrder, _fieldOrder, _multiline', () => {
    const sections = buildSettingSections(sampleSettings);
    for (const section of sections) {
      for (const row of section.rows) {
        expect(row).toHaveProperty('_sectionId');
        expect(row).toHaveProperty('_sectionTitle');
        expect(row).toHaveProperty('_sectionOrder');
        expect(row).toHaveProperty('_fieldOrder');
        expect(row).toHaveProperty('_multiline');
      }
    }
  });

  it('place ui.auth.allow_register dans la section auth', () => {
    const sections = buildSettingSections(sampleSettings);
    const authSection = sections.find((s) => s.id === 'auth');
    expect(authSection).toBeTruthy();
    expect(authSection.rows.some((r) => r.key === 'ui.auth.allow_register')).toBe(true);
  });

  it('place security.password_min_length dans la section security', () => {
    const sections = buildSettingSections(sampleSettings);
    const secSection = sections.find((s) => s.id === 'security');
    expect(secSection).toBeTruthy();
    expect(secSection.rows.some((r) => r.key === 'security.password_min_length')).toBe(true);
  });

  it('trie les sections par ordre croissant', () => {
    const sections = buildSettingSections(sampleSettings);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].order).toBeGreaterThanOrEqual(sections[i - 1].order);
    }
  });

  it('trie les rows par _fieldOrder dans chaque section', () => {
    const sections = buildSettingSections(sampleSettings);
    for (const section of sections) {
      for (let i = 1; i < section.rows.length; i++) {
        expect(section.rows[i]._fieldOrder).toBeGreaterThanOrEqual(section.rows[i - 1]._fieldOrder);
      }
    }
  });

  it('retourne un tableau vide pour une liste vide', () => {
    expect(buildSettingSections([])).toEqual([]);
  });

  it('marque _multiline a true pour les cles multiline', () => {
    const settings = [{ key: 'ui.auth.welcome_message', value: '', type: 'string', scope: 'admin' }];
    const sections = buildSettingSections(settings);
    const row = sections[0].rows[0];
    expect(row._multiline).toBe(true);
  });

  it('marque _multiline a false pour les cles non-multiline', () => {
    const settings = [{ key: 'ui.auth.allow_register', value: true, type: 'boolean', scope: 'admin' }];
    const sections = buildSettingSections(settings);
    const row = sections[0].rows[0];
    expect(row._multiline).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterSettingSections
// ---------------------------------------------------------------------------
describe('filterSettingSections', () => {
  const roleTerms = {
    studentSingular: 'n3beur',
    teacherShort: 'n3boss',
    teacherSingular: 'n3boss',
  };
  const resolveFn = (key) => resolveSettingLabel(key, roleTerms);

  const sampleSettings = [
    { key: 'ui.auth.allow_register', value: true, type: 'boolean', scope: 'admin', constraints: {} },
    { key: 'security.password_min_length', value: 8, type: 'number', scope: 'admin', constraints: { min: 4 } },
    { key: 'system.maintenance_mode', value: false, type: 'boolean', scope: 'admin', constraints: {} },
  ];
  const sections = buildSettingSections(sampleSettings);

  it('retourne toutes les sections pour une requete vide', () => {
    expect(filterSettingSections(sections, '', resolveFn)).toEqual(sections);
    expect(filterSettingSections(sections, '  ', resolveFn)).toEqual(sections);
  });

  it('filtre par cle de parametre', () => {
    const result = filterSettingSections(sections, 'password', resolveFn);
    expect(result.length).toBe(1);
    expect(result[0].rows[0].key).toBe('security.password_min_length');
  });

  it('filtre par label (insensible a la casse)', () => {
    const result = filterSettingSections(sections, 'maintenance', resolveFn);
    expect(result.length).toBe(1);
    expect(result[0].rows[0].key).toBe('system.maintenance_mode');
  });

  it('exclut les sections dont aucune ligne ne correspond', () => {
    const result = filterSettingSections(sections, 'zzzyyyy_inexistant', resolveFn);
    expect(result).toEqual([]);
  });

  it('ne modifie pas le tableau d\'entree (immutabilite)', () => {
    const original = JSON.stringify(sections);
    filterSettingSections(sections, 'password', resolveFn);
    expect(JSON.stringify(sections)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// countSettingRows
// ---------------------------------------------------------------------------
describe('countSettingRows', () => {
  it('compte le total de rows dans toutes les sections', () => {
    const sections = [
      { id: 'a', rows: [1, 2, 3] },
      { id: 'b', rows: [4, 5] },
    ];
    expect(countSettingRows(sections)).toBe(5);
  });

  it('retourne 0 pour un tableau vide', () => {
    expect(countSettingRows([])).toBe(0);
  });

  it('retourne 0 si toutes les sections ont des rows vides', () => {
    expect(countSettingRows([{ id: 'a', rows: [] }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Constantes SECTION_DEFS / KEY_META
// ---------------------------------------------------------------------------
describe('SECTION_DEFS', () => {
  it('contient les 8 sections attendues', () => {
    const expectedIds = ['auth', 'modules', 'content', 'tasks', 'progression', 'security', 'operations', 'other'];
    for (const id of expectedIds) {
      expect(SECTION_DEFS).toHaveProperty(id);
      expect(typeof SECTION_DEFS[id].title).toBe('string');
      expect(typeof SECTION_DEFS[id].order).toBe('number');
    }
  });
});

describe('KEY_META', () => {
  it('toutes les cles renvoient vers une section valide', () => {
    const validSections = new Set(Object.keys(SECTION_DEFS));
    for (const [key, meta] of Object.entries(KEY_META)) {
      if (meta.section) {
        expect(validSections.has(meta.section), `cle ${key} -> section "${meta.section}" invalide`).toBe(true);
      }
    }
  });

  it('les entrees avec dynamicLabel n\'ont pas de label statique', () => {
    for (const [, meta] of Object.entries(KEY_META)) {
      if (meta.dynamicLabel) {
        // Le label dynamique remplace le label statique : les deux ne doivent pas coexister.
        expect(meta.label).toBeUndefined();
      }
    }
  });
});
