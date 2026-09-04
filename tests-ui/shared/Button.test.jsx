// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../src/shared/ui/Button.jsx';
import { GLButton } from '../../src/gl/components/ui/GLButton.jsx';

describe('Button (kit partagé)', () => {
  test('classes neutres par variante et taille, type button par défaut', () => {
    render(
      <Button variant="primary" size="sm" className="extra">
        Valider
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Valider' });
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.className).toBe('shared-btn shared-btn--primary shared-btn--sm extra');
  });

  test('variante inconnue → secondary ; loading désactive et annonce l’attente', () => {
    const onClick = vi.fn();
    render(
      <Button variant="fantaisie" loading onClick={onClick}>
        Envoyer
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('shared-btn--secondary');
    expect(btn.textContent).toBe('Chargement…');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('icône décorative et pleine largeur', () => {
    render(
      <Button icon={<span data-testid="ico" />} block>
        Ajouter
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Ajouter' });
    expect(btn.className).toContain('shared-btn--block');
    expect(btn.querySelector('.shared-btn__icon[aria-hidden]')).not.toBeNull();
  });

  test('GLButton : mêmes classes partagées plus les classes de thème G&L', () => {
    render(
      <GLButton variant="secondary" size="sm">
        Annuler
      </GLButton>,
    );
    const btn = screen.getByRole('button', { name: 'Annuler' });
    expect(btn.className).toContain('shared-btn shared-btn--secondary shared-btn--sm');
    expect(btn.className).toContain('gl-btn gl-btn--secondary gl-btn--sm');
  });
});
