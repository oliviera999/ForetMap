// @vitest-environment jsdom
//
// Porte d'entrée du plan des personnels : ce que le front fait du retour Google.
//
// Deux régressions gardées ici. (1) Le retour du mode dédié (`type: 'staff'`) doit être
// mémorisé : un « Personnel » est un compte de type élève, il ne revient pas en `teacher`.
// (2) Un code d'erreur non traduit retombait sur « La connexion n'a pas abouti. Réessayez. »,
// message qui ne dit ni ce qui a échoué ni quoi faire — c'est celui que voyaient les
// personnels refusés à tort.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import {
  consumeStaffOauthHash,
  getStaffToken,
  clearStaffToken,
  forgetRefusedStaffToken,
  STAFF_TOKEN_REFUSED_MESSAGE,
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

  it('transmet le profil refusé porté par le fragment', () => {
    landOn('#oauth_error=oauth_staff_no_access&mode=staff&role=n3beur%20novice');
    expect(consumeStaffOauthHash()).toEqual({
      status: 'error',
      code: 'oauth_staff_no_access',
      role: 'n3beur novice',
    });
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

  it('traduit tous les codes que le serveur sait émettre (relus dans le code serveur)', () => {
    // Liste relue à la source plutôt que recopiée : un code ajouté côté serveur sans message
    // ici retombait sur « La connexion n'a pas abouti », sans rien dire de la cause — c'est
    // ainsi qu'un conflit de liaison Google restait inexpliqué sur le plan des personnels.
    const sources = ['lib/auth/googleAuthService.js', 'routes/auth.js']
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n');
    const codes = [...new Set(sources.match(/'oauth_[a-z_]+'/g).map((c) => c.slice(1, -1)))];
    expect(codes).toContain('oauth_google_linked_elsewhere');
    expect(codes).toContain('oauth_server_error');
    for (const code of codes) {
      expect(staffOauthErrorMessage(code), `code non traduit : ${code}`).not.toMatch(
        /n’a pas abouti/,
      );
    }
  });

  it('nomme le profil vu par le serveur quand il est transmis', () => {
    const message = staffOauthErrorMessage('oauth_staff_no_access', 'n3beur novice');
    expect(message).toContain('n’a pas encore l’accès');
    expect(message).toContain('n3beur novice');
  });

  it('garde un message de repli, qui nomme le code inconnu', () => {
    expect(staffOauthErrorMessage('oauth_inconnu')).toContain('oauth_inconnu');
    expect(staffOauthErrorMessage('oauth_inconnu')).toMatch(/n’a pas abouti/);
    expect(staffOauthErrorMessage('')).toBe(GENERIC);
    // Le fragment se forge : une phrase glissée à la place du code n'est pas reprise.
    expect(staffOauthErrorMessage('Appelez le 0600000000')).toBe(GENERIC);
  });
});

describe('staffSession — jeton refusé par le serveur', () => {
  it('oublie le jeton et dépose le message pour l’écran d’entrée', () => {
    window.localStorage.setItem('staffplan_auth_token', 'jeton-expire');
    window.sessionStorage.clear();
    forgetRefusedStaffToken();
    expect(getStaffToken()).toBe('');
    expect(window.sessionStorage.getItem('staffplan:oauth-error')).toBe(
      STAFF_TOKEN_REFUSED_MESSAGE,
    );
  });
});
