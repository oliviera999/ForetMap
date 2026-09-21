// @vitest-environment jsdom
//
// Porte d'entrée du plan des personnels : ce que le front fait du retour Google.
//
// Deux régressions gardées ici. (1) Le retour du mode dédié (`type: 'staff'`) doit être
// mémorisé : un « Personnel » est un compte de type élève, il ne revient pas en `teacher`.
// (2) Un code d'erreur non traduit retombait sur « La connexion n'a pas abouti. Réessayez. »,
// message qui ne dit ni ce qui a échoué ni quoi faire — c'est celui que voyaient les
// personnels refusés à tort.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  consumeStaffOauthHash,
  getStaffToken,
  clearStaffToken,
  staffOauthErrorMessage,
} from '../../src/plan/staffSession.js';

/** Place le navigateur sur un retour OAuth (`#oauth=` / `#oauth_error=`). */
function landOn(hash) {
  window.history.replaceState({}, '', `/${hash}`);
}

function oauthHash(payload) {
  const raw = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#oauth=${encodeURIComponent(raw)}`;
}

describe('staffSession — retour Google', () => {
  beforeEach(() => {
    clearStaffToken();
    landOn('');
  });

  it('mémorise le jeton d’un retour `staff` (compte personnel, non enseignant)', () => {
    landOn(oauthHash({ type: 'staff', token: 'jeton-staff' }));
    expect(consumeStaffOauthHash()).toEqual({ status: 'ok' });
    expect(getStaffToken()).toBe('jeton-staff');
    // Le fragment est retiré de l'URL : un jeton n'a rien à faire dans la barre d'adresse.
    expect(window.location.hash).toBe('');
  });

  it('accepte encore un retour `teacher` (onglet ouvert avant déploiement)', () => {
    landOn(oauthHash({ type: 'teacher', token: 'jeton-prof' }));
    expect(consumeStaffOauthHash()).toEqual({ status: 'ok' });
    expect(getStaffToken()).toBe('jeton-prof');
  });

  it('un retour d’un autre mode ne laisse pas de jeton', () => {
    landOn(oauthHash({ type: 'student', student: { id: 'e-1' } }));
    expect(consumeStaffOauthHash()).toEqual({ status: 'error', code: 'oauth_staff_no_access' });
    expect(getStaffToken()).toBe('');
  });

  it('sans fragment, il n’y a rien à consommer', () => {
    expect(consumeStaffOauthHash()).toEqual({ status: 'none' });
  });
});

describe('staffSession — messages d’erreur', () => {
  const GENERIC = 'La connexion n’a pas abouti. Réessayez.';

  it('traduit tous les refus que le serveur sait émettre depuis ce produit', () => {
    const codes = [
      'oauth_staff_no_access',
      'oauth_staff_account_not_found',
      'oauth_teacher_account_not_found',
      'oauth_account_not_found',
      'oauth_teacher_email_is_student',
      'oauth_account_inactive',
      'oauth_teacher_inactive',
      'oauth_teacher_no_role',
      'oauth_email_not_allowed',
      'oauth_google_refused',
      'oauth_teacher_google_disabled',
      'oauth_student_google_disabled',
      'oauth_account_mismatch',
      'oauth_not_configured',
      'oauth_invalid_state',
      'oauth_missing_code',
    ];
    for (const code of codes) {
      expect(staffOauthErrorMessage(code), `code non traduit : ${code}`).not.toBe(GENERIC);
    }
  });

  it('garde un message de repli pour un code inconnu', () => {
    expect(staffOauthErrorMessage('oauth_inconnu')).toBe(GENERIC);
    expect(staffOauthErrorMessage('')).toBe(GENERIC);
  });
});
