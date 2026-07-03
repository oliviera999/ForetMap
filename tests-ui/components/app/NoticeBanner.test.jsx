import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoticeBanner } from '../../../src/components/app/NoticeBanner.jsx';

describe('NoticeBanner', () => {
  test('rend un role=alert avec le contenu et les styles partagés', () => {
    render(<NoticeBanner tone="warning">Serveur indisponible.</NoticeBanner>);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Serveur indisponible.');
    expect(banner).toHaveClass('fade-in');
    expect(banner).toHaveStyle({
      margin: '8px 12px 0',
      padding: '10px 14px',
      borderRadius: '12px',
      fontSize: '.9rem',
    });
  });

  test('tone=warning : palette ambre (identique à l’ancien bandeau serverDown)', () => {
    render(<NoticeBanner tone="warning">Alerte</NoticeBanner>);
    expect(screen.getByRole('alert')).toHaveStyle({
      background: '#fef3c7',
      border: '1px solid #f59e0b',
      color: '#78350f',
    });
  });

  test('tone=info : palette bleue (identique à l’ancien bandeau sessionValidationError)', () => {
    render(<NoticeBanner tone="info">Info</NoticeBanner>);
    expect(screen.getByRole('alert')).toHaveStyle({
      background: '#eff6ff',
      border: '1px solid #93c5fd',
      color: '#1e3a8a',
    });
  });

  test('tone inconnu ou absent : retombe sur warning', () => {
    render(<NoticeBanner>Défaut</NoticeBanner>);
    expect(screen.getByRole('alert')).toHaveStyle({ background: '#fef3c7' });
  });

  test('action : bouton .btn.btn-sm rendu et câblé, absent sans action', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <NoticeBanner tone="info" action={{ label: 'Réessayer', onClick }}>
        Message
      </NoticeBanner>,
    );
    const btn = screen.getByRole('button', { name: 'Réessayer' });
    expect(btn).toHaveClass('btn', 'btn-sm');
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<NoticeBanner tone="info">Message</NoticeBanner>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
