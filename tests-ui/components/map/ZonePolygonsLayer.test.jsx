// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ZonePolygonsLayer,
  parseZonesForLayer,
} from '../../../src/components/map/ZonePolygonsLayer.jsx';

const EMOJIS = ['🌳', '🌱'];

const zoneFixture = (over = {}) => ({
  id: 1,
  name: '🌳 Verger',
  color: '#86efac80',
  special: 0,
  points: JSON.stringify([
    { xp: 0, yp: 0 },
    { xp: 50, yp: 0 },
    { xp: 50, yp: 50 },
  ]),
  ...over,
});

function renderLayer(props = {}) {
  const defaults = {
    parsedZones: parseZonesForLayer([zoneFixture()], EMOJIS),
    iw: 200,
    ih: 100,
    inv: 1,
    mode: 'view',
    showLabels: true,
    editZoneId: null,
    zoneTaskVisualById: new Map(),
    zoneTutorialCountById: new Map(),
    emojiFontPx: 16,
    labelFontPx: 12,
    emojiLabelCenterGap: 14,
    onZoneOpen: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  const view = render(
    <svg>
      <g>
        <ZonePolygonsLayer {...merged} />
      </g>
    </svg>,
  );
  return { ...view, props: merged };
}

describe('parseZonesForLayer', () => {
  it('pré-parse points/emoji/nom et écarte les contours invalides', () => {
    const zones = [
      zoneFixture(),
      zoneFixture({ id: 2, points: 'pas-du-json' }),
      zoneFixture({ id: 3, points: JSON.stringify([{ xp: 1, yp: 1 }]) }),
      zoneFixture({ id: 4, points: null }),
    ];
    const parsed = parseZonesForLayer(zones, EMOJIS);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].zone.id).toBe(1);
    expect(parsed[0].pts).toHaveLength(3);
    expect(parsed[0].zoneEmoji).toBe('🌳');
    expect(parsed[0].zoneName).toBe('Verger');
  });

  it('préfère la colonne zones.emoji au préfixe du nom (audit C4)', () => {
    // Colonne présente : elle gagne, même si le nom porte un autre préfixe.
    const withColumn = parseZonesForLayer([zoneFixture({ emoji: '💧' })], EMOJIS);
    expect(withColumn[0].zoneEmoji).toBe('💧');
    expect(withColumn[0].zoneName).toBe('Verger');
    // Colonne vide/absente : repli sur le préfixe détecté (lignes non migrées).
    const legacy = parseZonesForLayer([zoneFixture({ emoji: '' })], EMOJIS);
    expect(legacy[0].zoneEmoji).toBe('🌳');
    // Préfixe indétectable (pas d'espace) mais colonne renseignée : l'emoji s'affiche quand même.
    const noSpace = parseZonesForLayer([zoneFixture({ name: '🌳Verger', emoji: '🌳' })], EMOJIS);
    expect(noSpace[0].zoneEmoji).toBe('🌳');
  });
});

describe('ZonePolygonsLayer', () => {
  it('rend le polygone, l’emoji et le nom de zone (mode view)', () => {
    const { container, getByText } = renderLayer();
    const poly = container.querySelector('polygon');
    // 3 points en % convertis dans le monde image 200×100.
    expect(poly).toHaveAttribute('points', '0,0 100,0 100,50');
    expect(getByText('🌳')).toBeInTheDocument();
    expect(getByText('Verger')).toBeInTheDocument();
    expect(container.querySelector('g.map-zone-hit')).toBeTruthy();
  });

  it('transmet la zone au clic via onZoneOpen (handler stable côté parent)', () => {
    const onZoneOpen = vi.fn();
    const { container } = renderLayer({ onZoneOpen });
    fireEvent.click(container.querySelector('g.map-zone-hit'));
    expect(onZoneOpen).toHaveBeenCalledTimes(1);
    expect(onZoneOpen.mock.calls[0][0].id).toBe(1);
  });

  it('zone accessible au clavier en mode view (role/aria-label + Entrée)', () => {
    const onZoneOpen = vi.fn();
    const { container } = renderLayer({ onZoneOpen });
    const g = container.querySelector('g.map-zone-hit');
    expect(g).toHaveAttribute('role', 'button');
    expect(g).toHaveAttribute('tabindex', '0');
    expect(g).toHaveAttribute('aria-label', 'Verger');
    fireEvent.keyDown(g, { key: 'Enter' });
    expect(onZoneOpen).toHaveBeenCalledTimes(1);
    expect(onZoneOpen.mock.calls[0][0].id).toBe(1);
  });

  it('affiche les pastilles tâche et tutoriel comme avant', () => {
    const { container, getByText } = renderLayer({
      zoneTaskVisualById: new Map([[1, 'todo']]),
      zoneTutorialCountById: new Map([[1, 2]]),
    });
    expect(container.querySelector('.map-task-status--todo')).toBeTruthy();
    expect(container.querySelector('.map-tutorial-zone-dot')).toBeTruthy();
    expect(getByText('2 tutoriels liés')).toBeInTheDocument();
  });

  it('met en avant la zone sélectionnée et estompe les voisines', () => {
    const zones = [
      zoneFixture({ id: 1, name: '🌳 Verger' }),
      zoneFixture({
        id: 2,
        name: '🌱 Potager',
        points: JSON.stringify([
          { xp: 60, yp: 60 },
          { xp: 90, yp: 60 },
          { xp: 90, yp: 90 },
        ]),
      }),
    ];
    const { container } = renderLayer({
      parsedZones: parseZonesForLayer(zones, EMOJIS),
      selectedZoneId: 1,
    });
    const hits = container.querySelectorAll('g.map-zone-hit');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveClass('map-zone-hit--selected');
    expect(hits[0]).toHaveAttribute('aria-current', 'true');
    expect(hits[1]).toHaveClass('map-zone-hit--recessed');
    expect(hits[0].querySelector('polygon').getAttribute('stroke')).toBe('rgba(26,71,49,0.92)');
  });

  it('trace le contour des lieux « Infrastructure » en trait continu', () => {
    const { container } = renderLayer({
      parsedZones: parseZonesForLayer([zoneFixture({ is_infrastructure: true })], EMOJIS),
    });
    const poly = container.querySelector('polygon');
    expect(poly).not.toHaveAttribute('stroke-dasharray');
  });

  it('étiquettes masquées : emoji seul, comme la consultation', () => {
    const { queryByText } = renderLayer({ showLabels: false });
    expect(queryByText('🌳')).toBeInTheDocument();
    expect(queryByText('Verger')).toBeNull();
  });

  it('même anti-chevauchement que la consultation : deux zones superposées, emojis écartés', () => {
    const zones = [
      zoneFixture({ id: 1, name: '🌳 Verger' }),
      zoneFixture({ id: 2, name: '🌱 Potager' }),
    ];
    const { getByText } = renderLayer({ parsedZones: parseZonesForLayer(zones, EMOJIS) });
    // Le second emoji prend un point de repli de sa zone au lieu de recouvrir le premier.
    const [a, b] = ['🌳', '🌱'].map((emoji) => getByText(emoji));
    const gap = Math.hypot(
      Number(a.getAttribute('x')) - Number(b.getAttribute('x')),
      Number(a.getAttribute('y')) - Number(b.getAttribute('y')),
    );
    expect(gap).toBeGreaterThanOrEqual(16);
  });

  it('zones trop petites pour deux emojis : un seul reste', () => {
    const tiny = JSON.stringify([
      { xp: 40, yp: 40 },
      { xp: 44, yp: 40 },
      { xp: 44, yp: 48 },
      { xp: 40, yp: 48 },
    ]);
    const zones = [
      zoneFixture({ id: 1, name: '🌳 Verger', points: tiny }),
      zoneFixture({ id: 2, name: '🌱 Potager', points: tiny }),
    ];
    const { queryByText } = renderLayer({ parsedZones: parseZonesForLayer(zones, EMOJIS) });
    const shown = ['🌳', '🌱'].filter((emoji) => queryByText(emoji));
    expect(shown).toHaveLength(1);
  });

  it('nom dessous par défaut, à droite de l’emoji quand la place dessous est prise', () => {
    const rectPts = (x, y, w, h) =>
      JSON.stringify([
        { xp: x, yp: y },
        { xp: x + w, yp: y },
        { xp: x + w, yp: y + h },
        { xp: x, yp: y + h },
      ]);
    const verger = zoneFixture({ id: 1, name: '🌳 Verger', points: rectPts(10, 10, 80, 80) });
    const seul = renderLayer({ parsedZones: parseZonesForLayer([verger], EMOJIS, { aspect: 2 }) });
    const nameAlone = seul.getByText('Verger');
    const emojiAlone = seul.getByText('🌳');
    expect(nameAlone).toHaveAttribute('text-anchor', 'middle');
    expect(Number(nameAlone.getAttribute('y'))).toBeGreaterThan(
      Number(emojiAlone.getAttribute('y')),
    );
    seul.unmount();

    // « Mare », sélectionnée donc placée en premier, occupe la place sous l'emoji du Verger.
    const mare = zoneFixture({ id: 2, name: 'Mare', emoji: '', points: rectPts(48, 68, 4, 4) });
    const { getByText } = renderLayer({
      parsedZones: parseZonesForLayer([verger, mare], EMOJIS, { aspect: 2 }),
      selectedZoneId: 2,
    });
    const name = getByText('Verger');
    const emoji = getByText('🌳');
    expect(getByText('Mare')).toBeInTheDocument();
    expect(name).toHaveAttribute('text-anchor', 'start');
    expect(Number(name.getAttribute('x'))).toBeGreaterThan(Number(emoji.getAttribute('x')));
    expect(Number(name.getAttribute('y'))).toBeCloseTo(Number(emoji.getAttribute('y')), 0);
  });

  it('met en surbrillance la zone en édition de contour', () => {
    const { container } = renderLayer({ mode: 'edit-points', editZoneId: 1 });
    const poly = container.querySelector('polygon');
    expect(poly).toHaveAttribute('fill', 'rgba(82,183,136,0.35)');
    expect(poly).toHaveAttribute('stroke', '#52b788');
    // Pas de curseur pointeur ni de hit-class hors mode view.
    expect(container.querySelector('g.map-zone-hit')).toBeNull();
  });
});
