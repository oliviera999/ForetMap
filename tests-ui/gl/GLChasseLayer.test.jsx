import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GLChasseLayer } from '../../src/gl/components/tenir/GLChasseLayer.jsx';
import { GLVoileLayer } from '../../src/gl/components/tenir/GLVoileLayer.jsx';
import { isOluFrozen, resetOluFreeze } from '../../src/gl/utils/glOluFreeze.js';

const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|Krâ|Kraa|Grise|\bfaux\b|raté|perdu|classement/;

afterEach(() => resetOluFreeze());

describe('GLChasseLayer', () => {
  test('empreintes et contours publics, oiseau témoin muet (aria-hidden, sans texte), Olu gelé', () => {
    const carnet = {
      pages: [
        { zoneKey: 'z1', etat: 'endormie', contour: null },
        { zoneKey: 'z2', etat: 'revelee', contour: { x: 0.4, y: 0.5 } },
      ],
      empreintes: [
        { id: 1, teamId: 7, x: 0.1, y: 0.2, verdict: 'chaud' },
        { id: 2, teamId: 8, x: 0.9, y: 0.9, verdict: 'froid' },
      ],
      kraa: { x: 0.1, y: 0.2, etat: 'chaud', at: '2026-11-06T10:00:00Z' },
    };
    const { container } = render(
      <GLChasseLayer carnet={carnet} teams={[{ id: 7, color: '#111' }]} />,
    );
    expect(container.querySelectorAll('.gl-chasse-empreinte')).toHaveLength(2);
    expect(container.querySelectorAll('.gl-chasse-contour')).toHaveLength(1);
    expect(container.querySelector('polygon')).toBeNull();
    const kraa = screen.getByTestId('gl-kraa');
    expect(kraa).toHaveAttribute('aria-hidden', 'true');
    expect(kraa).toHaveAttribute('data-etat', 'chaud');
    expect(kraa.textContent).toBe('');
    expect(kraa.style.left).toBe('10%');
    expect(isOluFrozen()).toBe(true);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  test('sans carnet : rien ; sans oiseau : pas de silhouette', () => {
    const { container, rerender } = render(<GLChasseLayer carnet={null} />);
    expect(container.innerHTML).toBe('');
    rerender(<GLChasseLayer carnet={{ pages: [], empreintes: [], kraa: null }} />);
    expect(screen.queryByTestId('gl-kraa')).toBeNull();
    act(() => resetOluFreeze());
    expect(isOluFrozen()).toBe(false);
  });
});

describe('GLVoileLayer', () => {
  const markers = [0, 1, 2, 3].map((i) => ({
    id: i + 1,
    order_index: i,
    x_pct: 10 + i * 20,
    y_pct: 50,
  }));

  test('position −1 : rien ; position 1 : bande sur les cases 0–1, légende « le voile »', () => {
    const { container, rerender } = render(<GLVoileLayer markers={markers} position={-1} />);
    expect(container.innerHTML).toBe('');
    rerender(<GLVoileLayer markers={markers} position={1} />);
    const layer = screen.getByRole('img', { name: 'le voile' });
    expect(layer).toHaveAttribute('data-position', '1');
    expect(container.querySelectorAll('.gl-voile-case')).toHaveLength(2);
    expect(container.querySelector('.gl-voile-bande')).toHaveAttribute('points', '10,50 30,50');
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
