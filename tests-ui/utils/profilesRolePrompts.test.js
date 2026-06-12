import { describe, test, expect } from 'vitest';
import {
  promptRoleDetailsPatch,
  promptNewRoleProfile,
  promptDuplicateRoleProfile,
} from '../../src/utils/profilesRolePrompts.js';

/** Fabrique un promptFn qui rend les réponses dans l'ordre et journalise les (texte, défaut). */
function makePrompt(answers) {
  const calls = [];
  let i = 0;
  const fn = (text, defaultValue) => {
    calls.push({ text, defaultValue });
    return i < answers.length ? answers[i++] : null;
  };
  fn.calls = calls;
  return fn;
}

describe('promptRoleDetailsPatch', () => {
  const role = {
    id: 7,
    slug: 'eleve_novice',
    display_name: 'Novice',
    rank: 100,
    emoji: '🌱',
    min_done_tasks: 3,
    display_order: 2,
  };

  test('flux complet → payload PATCH normalisé', () => {
    const prompt = makePrompt(['  Mentor ', ' 🌳 ', ' 5 ', '4']);
    const res = promptRoleDetailsPatch(role, {}, prompt);
    expect(res).toEqual({
      payload: {
        display_name: 'Mentor',
        rank: 100,
        emoji: '🌳',
        min_done_tasks: 5,
        display_order: 4,
      },
    });
  });

  test('les brouillons du formulaire priment sur le rôle pour les valeurs par défaut', () => {
    const prompt = makePrompt(['Mentor', '🌳', '5', '4']);
    promptRoleDetailsPatch(role, { roleEmoji: '🔥', roleMinDoneTasks: '9', roleDisplayOrder: '8' }, prompt);
    expect(prompt.calls[1].defaultValue).toBe('🔥');
    expect(prompt.calls[2].defaultValue).toBe('9');
    expect(prompt.calls[3].defaultValue).toBe('8');
  });

  test('défauts issus du rôle quand pas de brouillon ; min_done_tasks null → chaîne vide', () => {
    const prompt = makePrompt(['Mentor', '🌳', '', '0']);
    const res = promptRoleDetailsPatch({ ...role, min_done_tasks: null, display_order: undefined }, {}, prompt);
    expect(prompt.calls[0].defaultValue).toBe('Novice');
    expect(prompt.calls[1].defaultValue).toBe('🌱');
    expect(prompt.calls[2].defaultValue).toBe('');
    expect(prompt.calls[3].defaultValue).toBe('0');
    expect(res.payload.min_done_tasks).toBeNull();
  });

  test('annulation à chaque étape → null', () => {
    expect(promptRoleDetailsPatch(role, {}, makePrompt([null]))).toBeNull();
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['   ']))).toBeNull(); // nom vide
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', null]))).toBeNull();
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', null]))).toBeNull();
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', '5', null]))).toBeNull();
  });

  test('niveau requis invalide → erreur dédiée ; ordre invalide → erreur dédiée', () => {
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', '-2', '4'])))
      .toEqual({ error: 'Niveau requis invalide (entier >= 0)' });
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', 'abc', '4'])))
      .toEqual({ error: 'Niveau requis invalide (entier >= 0)' });
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', '5', '-1'])))
      .toEqual({ error: "Ordre d'affichage invalide (entier >= 0)" });
    expect(promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '🌳', '5', 'zz'])))
      .toEqual({ error: "Ordre d'affichage invalide (entier >= 0)" });
  });

  test('emoji vidé → null dans le payload', () => {
    const res = promptRoleDetailsPatch(role, {}, makePrompt(['Mentor', '  ', '5', '4']));
    expect(res.payload.emoji).toBeNull();
  });
});

describe('promptNewRoleProfile', () => {
  test('flux complet → payload POST avec rang 150 et slug normalisé', () => {
    const prompt = makePrompt([' Eleve_Mentor ', 'Mentor', '🌳', '12', '7']);
    expect(promptNewRoleProfile(prompt)).toEqual({
      payload: {
        slug: 'eleve_mentor',
        display_name: 'Mentor',
        rank: 150,
        emoji: '🌳',
        min_done_tasks: 12,
        display_order: 7,
      },
    });
  });

  test('le nom proposé par défaut est le slug ; ordre par défaut 100', () => {
    const prompt = makePrompt(['n3boss_lycee', 'Boss lycée', '', '', '100']);
    const res = promptNewRoleProfile(prompt);
    expect(prompt.calls[1].defaultValue).toBe('n3boss_lycee');
    expect(prompt.calls[4].defaultValue).toBe('100');
    expect(res.payload).toMatchObject({ emoji: null, min_done_tasks: null, display_order: 100 });
  });

  test('annulation à chaque étape → null', () => {
    expect(promptNewRoleProfile(makePrompt([null]))).toBeNull();
    expect(promptNewRoleProfile(makePrompt(['  ']))).toBeNull();
    expect(promptNewRoleProfile(makePrompt(['s', null]))).toBeNull();
    expect(promptNewRoleProfile(makePrompt(['s', 'Nom', null]))).toBeNull();
    expect(promptNewRoleProfile(makePrompt(['s', 'Nom', '🌳', null]))).toBeNull();
    expect(promptNewRoleProfile(makePrompt(['s', 'Nom', '🌳', '3', null]))).toBeNull();
  });

  test('profil n3beur (eleve_*) : emoji et niveau requis obligatoires', () => {
    expect(promptNewRoleProfile(makePrompt(['eleve_x', 'X', '  ', '3', '1'])))
      .toEqual({ error: 'Un profil n3beur doit avoir un emoji' });
    expect(promptNewRoleProfile(makePrompt(['eleve_x', 'X', '🌳', '', '1'])))
      .toEqual({ error: 'Un profil n3beur doit avoir un niveau requis' });
  });

  test('saisies numériques invalides → erreurs dédiées', () => {
    expect(promptNewRoleProfile(makePrompt(['custom', 'X', '🌳', '-1', '1'])))
      .toEqual({ error: 'Niveau requis invalide (entier >= 0)' });
    expect(promptNewRoleProfile(makePrompt(['custom', 'X', '🌳', '3', 'nope'])))
      .toEqual({ error: "Ordre d'affichage invalide (entier >= 0)" });
  });
});

describe('promptDuplicateRoleProfile', () => {
  const role = { id: 4, slug: 'prof', display_name: 'n3boss' };

  test('flux complet → payload slug minuscule + nom trimé', () => {
    const prompt = makePrompt([' Prof_Copie ', '  n3boss bis ']);
    expect(promptDuplicateRoleProfile(role, prompt)).toEqual({
      payload: { slug: 'prof_copie', display_name: 'n3boss bis' },
    });
  });

  test('suggestions par défaut : slug nettoyé suffixé _copie, nom « (copie) »', () => {
    const prompt = makePrompt(['ok_slug', 'Nom']);
    promptDuplicateRoleProfile({ slug: 'éléve top!', display_name: 'Élève top' }, prompt);
    expect(prompt.calls[0].defaultValue).toBe('_l_ve_top__copie');
    expect(prompt.calls[1].defaultValue).toBe('Élève top (copie)');
  });

  test('slug absent → suggestion basée sur « profil » ; nom par défaut retombe sur le slug saisi', () => {
    const prompt = makePrompt(['clone', 'Nom']);
    promptDuplicateRoleProfile({ slug: '', display_name: '' }, prompt);
    expect(prompt.calls[0].defaultValue).toBe('profil_copie');
    expect(prompt.calls[1].defaultValue).toBe('clone (copie)');
  });

  test('annulation ou saisie vide → null', () => {
    expect(promptDuplicateRoleProfile(role, makePrompt([null]))).toBeNull();
    expect(promptDuplicateRoleProfile(role, makePrompt(['  ']))).toBeNull();
    expect(promptDuplicateRoleProfile(role, makePrompt(['slug', null]))).toBeNull();
    expect(promptDuplicateRoleProfile(role, makePrompt(['slug', ' ']))).toBeNull();
  });
});
