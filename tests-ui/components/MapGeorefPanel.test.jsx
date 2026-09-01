import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve({})) }));

import { api } from '../../src/services/api';
import { MapGeorefPanel } from '../../src/components/settings/MapGeorefPanel.jsx';

const MAP = { id: 'foret', label: 'Forêt', georef: null, gps_enabled: false };
const VALID_GEOREF = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.85, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.84, lng: 2.3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Position/dimension déterministes pour la conversion clic → %.
  Object.defineProperty(HTMLImageElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
  });
});

describe('MapGeorefPanel', () => {
  test('un clic sur le plan place le premier point sans armement préalable', () => {
    render(<MapGeorefPanel map={MAP} imageUrl="/maps/map-foret.svg" />);
    // Au départ, le point 1 est ciblé automatiquement (bannière visible).
    expect(screen.getByText(/placer le point 1/i)).toBeTruthy();

    const img = screen.getByAltText('Plan Forêt');
    // L'image doit être exclue de la lightbox globale, sinon le clic ouvre l'aperçu plein écran.
    expect(img.hasAttribute('data-no-lightbox')).toBe(true);
    fireEvent.click(img, { clientX: 100, clientY: 50 });

    // 50 % / 50 % attendus, et le ciblage avance vers le point 2.
    expect(screen.getByText(/placer le point 2/i)).toBeTruthy();
    // La ligne du point 1 affiche désormais sa position (x50 y50).
    expect(screen.getByText('x50 y50')).toBeTruthy();
  });

  test('place les 3 points puis ne cible plus rien', () => {
    render(<MapGeorefPanel map={MAP} imageUrl="/maps/map-foret.svg" />);
    const img = screen.getByAltText('Plan Forêt');
    fireEvent.click(img, { clientX: 20, clientY: 10 });
    fireEvent.click(img, { clientX: 180, clientY: 10 });
    fireEvent.click(img, { clientX: 20, clientY: 90 });
    // Les 3 points placés → plus de bannière de ciblage.
    expect(screen.queryByText(/placer le point/i)).toBeNull();
    expect(screen.getByText('x10 y10')).toBeTruthy();
    expect(screen.getByText('x90 y10')).toBeTruthy();
    expect(screen.getByText('x10 y90')).toBeTruthy();
  });

  test('accepte une virgule décimale et la normalise à la sortie du champ', () => {
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: VALID_GEOREF, gps_enabled: true }}
        imageUrl="/maps/map-foret.svg"
      />,
    );

    const lat = screen.getByLabelText('Latitude point 1');
    // Saisie à la française : le champ conserve le texte tel quel pendant la frappe…
    fireEvent.change(lat, { target: { value: '48,8601' } });
    expect(lat.value).toBe('48,8601');
    // …puis il est réaffiché en degrés décimaux canoniques.
    fireEvent.blur(lat);
    expect(lat.value).toBe('48.8601');

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le calage GPS/i }));
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('/georef'),
      'PUT',
      expect.objectContaining({
        anchors: expect.arrayContaining([expect.objectContaining({ lat: 48.8601 })]),
        gps_enabled: true,
      }),
    );
  });

  test('coller une paire « lat, lng » renseigne les deux champs de la ligne', () => {
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: VALID_GEOREF, gps_enabled: false }}
        imageUrl="/maps/map-foret.svg"
      />,
    );

    fireEvent.change(screen.getByLabelText('Latitude point 2'), {
      target: { value: '33.5731, -7.5898' },
    });
    expect(screen.getByLabelText('Latitude point 2').value).toBe('33.5731');
    expect(screen.getByLabelText('Longitude point 2').value).toBe('-7.5898');
  });

  test('signale une coordonnée illisible sans effacer la saisie', () => {
    const onError = vi.fn();
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: VALID_GEOREF, gps_enabled: false }}
        imageUrl="/maps/map-foret.svg"
        onError={onError}
      />,
    );

    const lat = screen.getByLabelText('Latitude point 3');
    fireEvent.change(lat, { target: { value: '48°nord' } });
    expect(lat.value).toBe('48°nord');
    expect(lat.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toMatch(/Latitude non reconnue/i);

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le calage GPS/i }));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/incomplet/i));
    expect(api).not.toHaveBeenCalled();
  });

  test('affiche l’échelle déduite (dimensions du plan en mètres) pour un calage valide', () => {
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: VALID_GEOREF, gps_enabled: true }}
        imageUrl="/maps/map-foret.svg"
      />,
    );
    // VALID_GEOREF : 80 % ↔ 0,01° → plan ≈ 916 m × ~1392 m (arrondi à l'unité).
    expect(screen.getByText(/Échelle déduite/i).textContent).toMatch(/916 m × 139[12] m/);
  });

  test('bloque un calage aux échelles géographiquement incompatibles', () => {
    const onError = vi.fn();
    // 80 % du plan ≈ 3,7 m sur un axe, ≈ 55 m sur l'autre (cas audit BDD §3.1).
    const implausible = [
      { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
      { xp: 90, yp: 10, lat: 48.85, lng: 2.30005 },
      { xp: 10, yp: 90, lat: 48.8495, lng: 2.3 },
    ];
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: implausible, gps_enabled: false }}
        imageUrl="/maps/map-foret.svg"
        onError={onError}
      />,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/échelles incompatibles/i);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le calage GPS/i }));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/échelles incompatibles/i));
    expect(api).not.toHaveBeenCalled();
  });

  test('refuse un calage partiel au lieu d’envoyer un effacement implicite', () => {
    const onError = vi.fn();
    render(
      <MapGeorefPanel
        map={{ ...MAP, georef: VALID_GEOREF, gps_enabled: false }}
        imageUrl="/maps/map-foret.svg"
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText('Latitude point 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le calage GPS/i }));

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/incomplet/i));
    expect(api).not.toHaveBeenCalled();
  });
});
