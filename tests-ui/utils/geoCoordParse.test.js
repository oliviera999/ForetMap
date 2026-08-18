import { describe, test, expect } from 'vitest';
import {
  formatGeoCoordinate,
  parseGeoCoordinate,
  parseGeoPair,
} from '../../src/utils/geoCoordParse.js';

describe('parseGeoCoordinate', () => {
  test('accepte indifféremment le point et la virgule décimale', () => {
    expect(parseGeoCoordinate('48.8534', 'lat')).toBeCloseTo(48.8534, 6);
    expect(parseGeoCoordinate('48,8534', 'lat')).toBeCloseTo(48.8534, 6);
    expect(parseGeoCoordinate(48.8534, 'lat')).toBeCloseTo(48.8534, 6);
  });

  test('tolère espaces, signe explicite et signes moins typographiques', () => {
    expect(parseGeoCoordinate('  -7,5898  ', 'lng')).toBeCloseTo(-7.5898, 6);
    expect(parseGeoCoordinate('+2.3488', 'lng')).toBeCloseTo(2.3488, 6);
    expect(parseGeoCoordinate('−7.5898', 'lng')).toBeCloseTo(-7.5898, 6);
  });

  test('lit les hémisphères (N/S/E/W/O), en préfixe comme en suffixe', () => {
    expect(parseGeoCoordinate('48.8534 N', 'lat')).toBeCloseTo(48.8534, 6);
    expect(parseGeoCoordinate('48.8534 S', 'lat')).toBeCloseTo(-48.8534, 6);
    expect(parseGeoCoordinate('7.5898 O', 'lng')).toBeCloseTo(-7.5898, 6);
    expect(parseGeoCoordinate('W 7.5898', 'lng')).toBeCloseTo(-7.5898, 6);
  });

  test('lit les degrés-minutes-secondes et degrés-minutes', () => {
    expect(parseGeoCoordinate('48°51\'12.2"N', 'lat')).toBeCloseTo(48.853389, 5);
    expect(parseGeoCoordinate("48° 51.2' N", 'lat')).toBeCloseTo(48.853333, 5);
    expect(parseGeoCoordinate('2°17\'40"E', 'lng')).toBeCloseTo(2.294444, 5);
  });

  test('refuse un axe incohérent avec la lettre saisie', () => {
    expect(parseGeoCoordinate('48.8534 N', 'lng')).toBeNull();
    expect(parseGeoCoordinate('2.3488 E', 'lat')).toBeNull();
  });

  test('refuse les valeurs hors bornes et les saisies illisibles', () => {
    expect(parseGeoCoordinate('91', 'lat')).toBeNull();
    expect(parseGeoCoordinate('181', 'lng')).toBeNull();
    expect(parseGeoCoordinate('48.85.34', 'lat')).toBeNull();
    expect(parseGeoCoordinate('nord', 'lat')).toBeNull();
    expect(parseGeoCoordinate('', 'lat')).toBeNull();
    expect(parseGeoCoordinate(null, 'lat')).toBeNull();
    expect(parseGeoCoordinate('48 2', 'lat')).toBeNull();
    expect(parseGeoCoordinate('48°51\'99"N', 'lat')).toBeNull();
  });
});

describe('parseGeoPair', () => {
  test('lit une paire collée, quel que soit le séparateur décimal', () => {
    expect(parseGeoPair('48.8534, 2.3488')).toEqual({ lat: 48.8534, lng: 2.3488 });
    expect(parseGeoPair('48,8534, 2,3488')).toEqual({ lat: 48.8534, lng: 2.3488 });
    expect(parseGeoPair('48.8534 2.3488')).toEqual({ lat: 48.8534, lng: 2.3488 });
    expect(parseGeoPair('48.8534; 2.3488')).toEqual({ lat: 48.8534, lng: 2.3488 });
  });

  test('remet la paire dans l’ordre lat/lng grâce aux hémisphères', () => {
    expect(parseGeoPair('2.3488E, 48.8534N')).toEqual({ lat: 48.8534, lng: 2.3488 });
  });

  test('lit les liens Google Maps et OpenStreetMap', () => {
    expect(parseGeoPair('https://www.google.com/maps/@48.8534,2.3488,17z')).toEqual({
      lat: 48.8534,
      lng: 2.3488,
    });
    expect(parseGeoPair('https://maps.google.com/?q=48.8534,2.3488')).toEqual({
      lat: 48.8534,
      lng: 2.3488,
    });
    expect(parseGeoPair('https://www.openstreetmap.org/#map=18/48.8534/2.3488')).toEqual({
      lat: 48.8534,
      lng: 2.3488,
    });
  });

  test('ne devine pas : un décimal français isolé n’est pas une paire', () => {
    expect(parseGeoPair('48,8534')).toBeNull();
    expect(parseGeoPair('48, 2')).toBeNull();
    expect(parseGeoPair('48.8534')).toBeNull();
    expect(parseGeoPair('')).toBeNull();
  });

  test('refuse une paire hors bornes', () => {
    expect(parseGeoPair('148.5, 2.3')).toBeNull();
  });
});

describe('formatGeoCoordinate', () => {
  test('rend une forme canonique en degrés décimaux', () => {
    expect(formatGeoCoordinate(48.8534)).toBe('48.8534');
    expect(formatGeoCoordinate(48.85338888888889)).toBe('48.8533889');
    expect(formatGeoCoordinate(null)).toBe('');
    expect(formatGeoCoordinate(Number.NaN)).toBe('');
  });
});
