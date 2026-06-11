/**
 * Tests unitaires pour src/utils/statsHelpers.js
 */
import { describe, it, expect } from 'vitest';
import {
  computeTotalValidated,
  computeTotalPending,
  computeActiveStudents,
  computeMaxDone,
  rankIcon,
  rankClass,
  computeCompletionRate,
  decorateRanks,
  isProfileAheadOfTasks,
  isProfileBehindTasks,
  computeTasksRemaining,
  estimateDataUrlBytes,
  validatePseudo,
  validateEmail,
  validateDescription,
  formatObservationAuthor,
  formatObservationDate,
  deriveProfileType,
  resolveProfileEndpoint,
} from '../../src/utils/statsHelpers.js';

// ─── Agrégats enseignant ──────────────────────────────────────────────────────

describe('computeTotalValidated', () => {
  it('somme les tâches validées de tous les élèves', () => {
    const students = [
      { stats: { done: 3, pending: 1, total: 4 } },
      { stats: { done: 7, pending: 0, total: 7 } },
    ];
    expect(computeTotalValidated(students)).toBe(10);
  });

  it('retourne 0 pour une liste vide', () => {
    expect(computeTotalValidated([])).toBe(0);
  });

  it('tolère une entrée non-tableau', () => {
    expect(computeTotalValidated(null)).toBe(0);
    expect(computeTotalValidated(undefined)).toBe(0);
  });

  it('traite les stats manquantes comme 0', () => {
    const students = [{ stats: {} }, { stats: { done: 5 } }];
    expect(computeTotalValidated(students)).toBe(5);
  });
});

describe('computeTotalPending', () => {
  it('somme les tâches en cours', () => {
    const students = [
      { stats: { pending: 2 } },
      { stats: { pending: 4 } },
    ];
    expect(computeTotalPending(students)).toBe(6);
  });

  it('retourne 0 pour une liste vide', () => {
    expect(computeTotalPending([])).toBe(0);
  });
});

describe('computeActiveStudents', () => {
  it('compte seulement les élèves ayant pris au moins une tâche', () => {
    const students = [
      { stats: { total: 0 } },
      { stats: { total: 3 } },
      { stats: { total: 1 } },
    ];
    expect(computeActiveStudents(students)).toBe(2);
  });

  it('retourne 0 quand tous ont total = 0', () => {
    const students = [{ stats: { total: 0 } }, { stats: { total: 0 } }];
    expect(computeActiveStudents(students)).toBe(0);
  });
});

// ─── Classement ───────────────────────────────────────────────────────────────

describe('computeMaxDone', () => {
  it('retourne le maximum des tâches validées', () => {
    const students = [
      { stats: { done: 3 } },
      { stats: { done: 9 } },
      { stats: { done: 5 } },
    ];
    expect(computeMaxDone(students)).toBe(9);
  });

  it('retourne au moins 1 pour éviter la division par zéro', () => {
    expect(computeMaxDone([])).toBe(1);
    expect(computeMaxDone([{ stats: { done: 0 } }])).toBe(1);
  });
});

describe('rankIcon', () => {
  it('retourne les médailles pour les 3 premiers', () => {
    expect(rankIcon(0)).toBe('🥇');
    expect(rankIcon(1)).toBe('🥈');
    expect(rankIcon(2)).toBe('🥉');
  });

  it('retourne le numéro pour les suivants', () => {
    expect(rankIcon(3)).toBe('4.');
    expect(rankIcon(9)).toBe('10.');
  });
});

describe('rankClass', () => {
  it('retourne les classes CSS correctes', () => {
    expect(rankClass(0)).toBe('gold');
    expect(rankClass(1)).toBe('silver');
    expect(rankClass(2)).toBe('bronze');
  });

  it('retourne une chaîne vide pour les autres rangs', () => {
    expect(rankClass(3)).toBe('');
    expect(rankClass(10)).toBe('');
  });
});

describe('computeCompletionRate', () => {
  it('calcule le pourcentage arrondi', () => {
    expect(computeCompletionRate(3, 10)).toBe(30);
    expect(computeCompletionRate(1, 3)).toBe(33);
    expect(computeCompletionRate(2, 3)).toBe(67);
  });

  it('retourne 0 quand total vaut 0', () => {
    expect(computeCompletionRate(5, 0)).toBe(0);
    expect(computeCompletionRate(0, 0)).toBe(0);
  });

  it('retourne 0 si done est null/undefined', () => {
    expect(computeCompletionRate(null, 10)).toBe(0);
    expect(computeCompletionRate(undefined, 10)).toBe(0);
  });
});

// ─── Décoration des paliers ───────────────────────────────────────────────────

describe('decorateRanks', () => {
  const steps = [
    { roleSlug: 'eleve_novice', min: 0, label: 'Novice' },
    { roleSlug: 'eleve_avance', min: 5, label: 'Avancé' },
    { roleSlug: 'eleve_chevronne', min: 10, label: 'Chevronné' },
  ];

  it('ajoute color et icon à chaque palier', () => {
    const result = decorateRanks(steps);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ color: '#94a3b8', icon: '🪨' });
    expect(result[1]).toMatchObject({ color: '#52b788', icon: '🌿' });
    expect(result[2]).toMatchObject({ color: '#1a4731', icon: '🏆' });
  });

  it("préfère l'emoji du palier s'il est défini", () => {
    const withEmoji = [{ roleSlug: 'eleve_novice', min: 0, label: 'Test', emoji: '🌳' }];
    const result = decorateRanks(withEmoji);
    expect(result[0].icon).toBe('🌳');
  });

  it("retourne un tableau vide si l'entrée n'est pas un tableau", () => {
    expect(decorateRanks(null)).toEqual([]);
    expect(decorateRanks(undefined)).toEqual([]);
  });

  it("utilise l'icône de secours 🌿 pour un slug inconnu", () => {
    const result = decorateRanks([{ roleSlug: 'inconnu', min: 0, label: 'X' }]);
    expect(result[0].icon).toBe('🌿');
  });
});

// ─── Alignement profil / palier tâches ───────────────────────────────────────

describe('isProfileAheadOfTasks', () => {
  it('retourne true si profil en avance', () => {
    expect(isProfileAheadOfTasks(true, 2, 1)).toBe(true);
  });

  it('retourne false si progression auto désactivée', () => {
    expect(isProfileAheadOfTasks(false, 2, 1)).toBe(false);
  });

  it('retourne false si index négatif', () => {
    expect(isProfileAheadOfTasks(true, -1, 1)).toBe(false);
    expect(isProfileAheadOfTasks(true, 2, -1)).toBe(false);
  });

  it('retourne false si même palier', () => {
    expect(isProfileAheadOfTasks(true, 1, 1)).toBe(false);
  });
});

describe('isProfileBehindTasks', () => {
  it('retourne true si profil en retard', () => {
    expect(isProfileBehindTasks(true, 1, 2)).toBe(true);
  });

  it('retourne false si progression auto désactivée', () => {
    expect(isProfileBehindTasks(false, 1, 2)).toBe(false);
  });

  it('retourne false si même palier', () => {
    expect(isProfileBehindTasks(true, 1, 1)).toBe(false);
  });
});

describe('computeTasksRemaining', () => {
  it('calcule les tâches manquantes', () => {
    expect(computeTasksRemaining(3, { min: 10 })).toBe(7);
  });

  it('ne retourne jamais un nombre négatif', () => {
    expect(computeTasksRemaining(15, { min: 10 })).toBe(0);
  });

  it('retourne 0 si pas de palier suivant', () => {
    expect(computeTasksRemaining(3, null)).toBe(0);
    expect(computeTasksRemaining(3, undefined)).toBe(0);
  });
});

// ─── Validation profil ────────────────────────────────────────────────────────

describe('estimateDataUrlBytes', () => {
  it('retourne 0 pour une chaîne vide', () => {
    expect(estimateDataUrlBytes('')).toBe(0);
    expect(estimateDataUrlBytes(null)).toBe(0);
  });

  it("estime la taille d'un data-URL simple", () => {
    // "AAAA" en base64 = 3 octets (sans padding)
    const dataUrl = 'data:image/png;base64,AAAA';
    expect(estimateDataUrlBytes(dataUrl)).toBe(3);
  });

  it('prend en compte le padding "=="', () => {
    const dataUrl = 'data:image/png;base64,AA==';
    expect(estimateDataUrlBytes(dataUrl)).toBe(1);
  });
});

describe('validatePseudo', () => {
  it('accepte un pseudo valide', () => {
    expect(validatePseudo('momo_lyautey')).toBe('');
    expect(validatePseudo('user.123')).toBe('');
    expect(validatePseudo('')).toBe('');
  });

  it('rejette un pseudo trop court', () => {
    expect(validatePseudo('ab')).not.toBe('');
  });

  it('rejette un pseudo trop long', () => {
    expect(validatePseudo('a'.repeat(31))).not.toBe('');
  });

  it('rejette les caractères interdits', () => {
    expect(validatePseudo('hello world')).not.toBe('');
    expect(validatePseudo('héros')).not.toBe('');
  });
});

describe('validateEmail', () => {
  it('accepte un email valide', () => {
    expect(validateEmail('user@example.com')).toBe('');
    expect(validateEmail('')).toBe('');
  });

  it('rejette un email invalide', () => {
    expect(validateEmail('pas-un-email')).not.toBe('');
    expect(validateEmail('a@b')).not.toBe('');
  });
});

describe('validateDescription', () => {
  it('accepte une description courte', () => {
    expect(validateDescription('Bonjour !')).toBe('');
    expect(validateDescription('')).toBe('');
  });

  it('rejette une description > 300 caractères', () => {
    expect(validateDescription('x'.repeat(301))).not.toBe('');
    expect(validateDescription('x'.repeat(300))).toBe('');
  });
});

// ─── Formatage des observations ───────────────────────────────────────────────

describe('formatObservationAuthor', () => {
  it('concatène prénom et nom', () => {
    expect(formatObservationAuthor({ first_name: 'Alice', last_name: 'Dupont' })).toBe('Alice Dupont');
  });

  it('retourne la valeur de repli si les deux sont vides', () => {
    expect(formatObservationAuthor({})).toBe('n3beur');
    expect(formatObservationAuthor(null)).toBe('n3beur');
  });

  it('gère un seul champ renseigné', () => {
    expect(formatObservationAuthor({ first_name: 'Alice' })).toBe('Alice');
    expect(formatObservationAuthor({ last_name: 'Dupont' })).toBe('Dupont');
  });
});

describe('formatObservationDate', () => {
  it('retourne une chaîne vide si la date est absente', () => {
    expect(formatObservationDate(null)).toBe('');
    expect(formatObservationDate('')).toBe('');
    expect(formatObservationDate(undefined)).toBe('');
  });

  it('formate la date en locale fr-FR', () => {
    // On vérifie juste que la sortie est une chaîne non vide
    const result = formatObservationDate('2024-03-15T10:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── Dérivation du type de profil ─────────────────────────────────────────────

describe('deriveProfileType', () => {
  const roleTerms = {
    teacherShort: 'Prof',
    studentSingular: 'Élève',
  };

  it('retourne "admin" pour un rôle admin', () => {
    expect(deriveProfileType({ auth: { roleSlug: 'admin' } }, roleTerms)).toBe('admin');
  });

  it('retourne teacherShort pour un rôle prof', () => {
    expect(deriveProfileType({ auth: { roleSlug: 'prof_foret' } }, roleTerms)).toBe('Prof');
  });

  it('retourne studentSingular pour un rôle eleve', () => {
    expect(deriveProfileType({ auth: { roleSlug: 'eleve_novice' } }, roleTerms)).toBe('Élève');
  });

  it('se replie sur userType teacher', () => {
    expect(deriveProfileType({ auth: { userType: 'teacher' } }, roleTerms)).toBe('Prof');
    expect(deriveProfileType({ auth: { userType: 'user' } }, roleTerms)).toBe('Prof');
  });

  it('se replie sur userType student', () => {
    expect(deriveProfileType({ auth: { userType: 'student' } }, roleTerms)).toBe('Élève');
  });

  it('retourne studentSingular par défaut', () => {
    expect(deriveProfileType({}, roleTerms)).toBe('Élève');
  });
});

// ─── Endpoint de sauvegarde du profil ────────────────────────────────────────

describe('resolveProfileEndpoint', () => {
  it("retourne l'endpoint admin pour un admin", () => {
    expect(resolveProfileEndpoint({ auth: { roleSlug: 'admin' } })).toBe('/api/auth/me/profile');
  });

  it("retourne l'endpoint admin pour un prof", () => {
    expect(resolveProfileEndpoint({ auth: { roleSlug: 'prof_foret' } })).toBe('/api/auth/me/profile');
  });

  it("retourne l'endpoint admin pour userType teacher", () => {
    expect(resolveProfileEndpoint({ auth: { userType: 'teacher' }, id: 42 })).toBe('/api/auth/me/profile');
  });

  it("retourne l'endpoint élève pour un rôle élève", () => {
    expect(resolveProfileEndpoint({ auth: { roleSlug: 'eleve_novice' }, id: 7 })).toBe('/api/students/7/profile');
  });

  it("retourne l'endpoint élève par défaut", () => {
    expect(resolveProfileEndpoint({ id: 99 })).toBe('/api/students/99/profile');
  });
});
