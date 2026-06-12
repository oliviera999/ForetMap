import { describe, test, expect } from 'vitest';
import { DEFAULT_PUBLIC_SETTINGS, mergePublicSettings } from '../../src/utils/appPublicSettings';

describe('DEFAULT_PUBLIC_SETTINGS', () => {
  test('expose les sections attendues par le shell App', () => {
    expect(DEFAULT_PUBLIC_SETTINGS.auth.allow_register).toBe(true);
    expect(DEFAULT_PUBLIC_SETTINGS.map.default_map_student).toBe('foret');
    expect(DEFAULT_PUBLIC_SETTINGS.modules.tutorials_enabled).toBe(true);
    expect(DEFAULT_PUBLIC_SETTINGS.help.show_context_hints).toBe(true);
    expect(DEFAULT_PUBLIC_SETTINGS.visit.mascot.default_id).toBe('renard2-cut-spritesheet');
    expect(Array.isArray(DEFAULT_PUBLIC_SETTINGS.visit.mascot.allowed_ids)).toBe(true);
  });
});

describe('mergePublicSettings', () => {
  test('réponse nulle ou non-objet → état précédent inchangé', () => {
    expect(mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, null)).toBe(DEFAULT_PUBLIC_SETTINGS);
    expect(mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, 'oops')).toBe(DEFAULT_PUBLIC_SETTINGS);
  });

  test('les clefs de premier niveau écrasent la section correspondante', () => {
    const next = mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, {
      content: { 'app.loader': 'Chargement…' },
    });
    expect(next.content['app.loader']).toBe('Chargement…');
    // Les sections non mentionnées restent celles de prev.
    expect(next.modules).toBe(DEFAULT_PUBLIC_SETTINGS.modules);
  });

  test('les sections legacy ui.* sont fusionnées champ à champ avec prev', () => {
    const next = mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, {
      ui: {
        modules: { forum_enabled: false },
        help: { pulse_unseen_panels: false },
        map: { default_map_teacher: 'jardin' },
        auth: { allow_register: false },
        visit: { welcome: 'Bonjour' },
      },
    });
    expect(next.modules.forum_enabled).toBe(false);
    expect(next.modules.tutorials_enabled).toBe(true); // conservé depuis prev
    expect(next.help.pulse_unseen_panels).toBe(false);
    expect(next.help.show_context_hints).toBe(true);
    expect(next.map.default_map_teacher).toBe('jardin');
    expect(next.map.default_map_student).toBe('foret');
    expect(next.auth.allow_register).toBe(false);
    expect(next.auth.allow_guest_visit).toBe(true);
    expect(next.visit.welcome).toBe('Bonjour');
  });

  test('ui non-objet → ignoré sans casser la fusion', () => {
    const next = mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, { ui: 'broken' });
    expect(next.modules).toBe(DEFAULT_PUBLIC_SETTINGS.modules);
  });

  test('visit.mascot.dialog est replié dans visit.mascot', () => {
    const dialog = { bubbles: ['Salut !'] };
    const next = mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, {
      visit: { mascot: { dialog, default_id: 'sprout-rive' } },
    });
    expect(next.visit.mascot.dialog).toBe(dialog);
    expect(next.visit.mascot.default_id).toBe('sprout-rive');
  });

  test('ne mute pas l’objet prev', () => {
    const prev = JSON.parse(JSON.stringify(DEFAULT_PUBLIC_SETTINGS));
    const snapshot = JSON.parse(JSON.stringify(prev));
    mergePublicSettings(prev, {
      ui: { modules: { forum_enabled: false } },
      visit: { mascot: { dialog: { bubbles: [] } } },
    });
    expect(prev).toEqual(snapshot);
  });
});
