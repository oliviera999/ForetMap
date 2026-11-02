import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AccessCodeGate } from '../../src/shared/components/AccessCodeGate.jsx';
import { PlanAccountGate } from '../../src/plan/components/PlanAccountGate.jsx';
import { accessIntroFor, accessKindFromBody } from '../../src/plan/utils/planAccessKind.js';
import { ENOV_PLAN_VARIANT, PLAN_VARIANT } from '../../src/plan/utils/planVariants.js';

/**
 * Écran de saisie d'un plan fermé : **code d'accès** (champ en clair, comportement inchangé) ou
 * **mot de passe** (vrai champ de mot de passe — masqué, bouton « Afficher », casse respectée,
 * reconnu par le gestionnaire de mots de passe du navigateur).
 */

describe('AccessCodeGate — code d’accès (inchangé)', () => {
  it('champ en clair, libellé « Code d’accès »', () => {
    render(<AccessCodeGate title="Plan" onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Code d’accès');
    expect(input.getAttribute('type')).toBe('text');
    expect(screen.queryByRole('button', { name: 'Afficher' })).toBeNull();
  });
});

describe('AccessCodeGate — mot de passe', () => {
  it('champ masqué, sans majuscules forcées, reconnu par le gestionnaire de mots de passe', () => {
    const { container } = render(
      <AccessCodeGate title="Plan e-nov" kind="password" onSubmit={vi.fn()} />,
    );
    const input = screen.getByLabelText('Mot de passe');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('spellcheck')).toBe('false');
    // Identifiant caché : le nom du plan, pour que le navigateur sache sous quel nom l'enregistrer.
    const username = container.querySelector('input[autocomplete="username"]');
    expect(username).toBeTruthy();
    expect(username.value).toBe('Plan e-nov');
    expect(username.hidden).toBe(true);
  });

  it('« Afficher » révèle le mot de passe, « Masquer » le recache', () => {
    render(<AccessCodeGate title="Plan" kind="password" onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Mot de passe');
    const toggle = screen.getByRole('button', { name: 'Afficher' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(input.getAttribute('type')).toBe('text');
    const hide = screen.getByRole('button', { name: 'Masquer' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(input.getAttribute('type')).toBe('password');
  });

  it('envoie le mot de passe tel quel (casse comprise) et dit « Mot de passe incorrect »', async () => {
    const onSubmit = vi.fn(async () => {
      throw Object.assign(new Error('refusé'), { status: 401 });
    });
    render(<AccessCodeGate title="Plan" kind="password" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: ' Enov2026Jury ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Enov2026Jury'));
    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.');
  });

  it('champ vide : demande le mot de passe, sans appel', () => {
    const onSubmit = vi.fn();
    render(<AccessCodeGate title="Plan" kind="password" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/mot de passe fourni/);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('PlanAccountGate — voie secondaire par mot de passe', () => {
  it('le lien et l’écran parlent de mot de passe', () => {
    render(
      <PlanAccountGate
        title="Plan personnels"
        codeAvailable
        codeKind="password"
        onSubmitCode={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Je n’ai pas de compte : entrer le mot de passe' }),
    );
    const input = screen.getByLabelText('Mot de passe');
    expect(input.getAttribute('type')).toBe('password');
  });

  it('par défaut, toujours le code', () => {
    render(<PlanAccountGate title="Plan personnels" codeAvailable onSubmitCode={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Je n’ai pas de compte : entrer un code' }),
    ).toBeTruthy();
  });
});

describe('planAccessKind', () => {
  it('lit `access_kind` d’un refus, code par défaut', () => {
    expect(accessKindFromBody({ access_kind: 'password' })).toBe('password');
    expect(accessKindFromBody({ access_kind: 'code' })).toBe('code');
    expect(accessKindFromBody({})).toBe('code');
    expect(accessKindFromBody(undefined)).toBe('code');
  });

  it('phrase d’accueil selon la nature du secret', () => {
    expect(accessIntroFor(PLAN_VARIANT, 'code')).toMatch(/Saisissez le code/);
    expect(accessIntroFor(PLAN_VARIANT, 'password')).toMatch(/Saisissez le mot de passe/);
    expect(accessIntroFor(ENOV_PLAN_VARIANT, 'password')).toMatch(/e-nov.*mot de passe/);
  });
});
