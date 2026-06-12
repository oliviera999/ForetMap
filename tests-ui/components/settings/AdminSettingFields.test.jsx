import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AdminTextSettingField,
  AdminNumberSettingField,
} from '../../../src/components/settings/AdminSettingFields.jsx';

describe('AdminTextSettingField', () => {
  function renderText(props = {}) {
    const onSave = vi.fn();
    const utils = render(
      <AdminTextSettingField
        rowKey="content.auth.title"
        label="Titre écran de connexion"
        row={{ scope: 'public', type: 'string', ...props.row }}
        serverValue={props.serverValue ?? 'Bienvenue'}
        disabled={false}
        onSave={onSave}
        {...props.extra}
      />,
    );
    return { onSave, ...utils };
  }

  test('rend libellé + portée, brouillon initialisé sur la valeur serveur', () => {
    renderText();
    expect(screen.getByText('Titre écran de connexion')).toBeTruthy();
    expect(screen.getByText('(Public)')).toBeTruthy();
    expect(screen.getByDisplayValue('Bienvenue')).toBeTruthy();
  });

  test('commit au blur seulement si la valeur a changé', () => {
    const { onSave } = renderText();
    const input = screen.getByDisplayValue('Bienvenue');
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Salut' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('content.auth.title', 'Salut');
  });

  test('multiline via _multiline ou maxLength > 100 → textarea avec maxLength', () => {
    renderText({ row: { _multiline: false, constraints: { maxLength: 500 } }, serverValue: 'Texte' });
    const area = screen.getByDisplayValue('Texte');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.maxLength).toBe(500);
  });

  test('resynchronisation du brouillon quand la valeur serveur change', () => {
    const onSave = vi.fn();
    const props = {
      rowKey: 'k',
      label: 'L',
      row: { scope: 'admin' },
      disabled: false,
      onSave,
    };
    const { rerender } = render(<AdminTextSettingField {...props} serverValue="" />);
    rerender(<AdminTextSettingField {...props} serverValue="Chargé du serveur" />);
    expect(screen.getByDisplayValue('Chargé du serveur')).toBeTruthy();
  });
});

describe('AdminNumberSettingField', () => {
  function renderNumber(props = {}) {
    const onSave = vi.fn();
    render(
      <AdminNumberSettingField
        rowKey="security.password_min_length"
        label="Longueur min mot de passe"
        row={{ scope: 'admin', type: 'number' }}
        serverValue={props.serverValue ?? 8}
        disabled={false}
        min={4}
        max={64}
        fallback={6}
        onSave={onSave}
      />,
    );
    return { onSave };
  }

  test('valeur serveur affichée + bornes min/max posées sur l’input', () => {
    renderNumber();
    const input = screen.getByDisplayValue('8');
    expect(input.min).toBe('4');
    expect(input.max).toBe('64');
  });

  test('commit au blur de l’entier saisi ; rien si inchangé', () => {
    const { onSave } = renderNumber();
    const input = screen.getByDisplayValue('8');
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('security.password_min_length', 12);
  });

  test('saisie non numérique → repli sur fallback au commit', () => {
    const { onSave } = renderNumber();
    const input = screen.getByDisplayValue('8');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('security.password_min_length', 6);
  });

  test('valeur serveur non numérique → brouillon initialisé sur fallback', () => {
    renderNumber({ serverValue: 'abc' });
    expect(screen.getByDisplayValue('6')).toBeTruthy();
  });
});
