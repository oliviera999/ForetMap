/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { GLBrandHub, cardImageDimensions } from '../../src/gl/components/GLBrandHub.jsx';

const slots = {
  hero: {
    imageUrl: '/uploads/gl_brand/hero.png',
    title: 'Gnomes & Licornes',
    subtitle: 'Aventure',
  },
  card_world: {
    imageUrl: '/uploads/gl_brand/world.png',
    title: 'Un monde',
    tab: 'world',
  },
  card_rules: {
    imageUrl: '/uploads/gl_brand/rules.png',
    title: 'Les règles',
    tab: 'rules',
  },
  card_spells: {
    imageUrl: '/uploads/gl_brand/spells.png',
    title: 'Sortilèges',
    tab: 'spells',
  },
};

describe('GLBrandHub', () => {
  let rectSpy;

  afterEach(() => {
    rectSpy?.mockRestore();
  });

  it('affiche les trois images de cartes et révèle la grille au montage', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      configurable: true,
      writable: true,
    });
    rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        return {
          top: 200,
          left: 0,
          bottom: 400,
          right: 900,
          width: 900,
          height: 200,
          x: 0,
          y: 200,
        };
      });

    render(<GLBrandHub slots={slots} onOpenTab={() => {}} />);

    expect(screen.getByRole('img', { name: 'Gnomes & Licornes' })).toBeTruthy();

    const cards = document.querySelector('.gl-brand-hub__cards');
    expect(cards).toBeTruthy();
    expect(cards.querySelector('img[src="/uploads/gl_brand/world.png"]')).toBeTruthy();
    expect(cards.querySelector('img[src="/uploads/gl_brand/rules.png"]')).toBeTruthy();
    expect(cards.querySelector('img[src="/uploads/gl_brand/spells.png"]')).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(cards.classList.contains('is-visible')).toBe(true);
  });

  it('applique le focal hero via variables CSS', () => {
    render(
      <GLBrandHub
        slots={{
          ...slots,
          hero: { ...slots.hero, frame: { focalX: 30, focalY: 70 } },
        }}
      />,
    );
    const hero = document.querySelector('.gl-brand-hub__hero');
    expect(hero.style.getPropertyValue('--gl-hero-focal-x')).toBe('30%');
    expect(hero.style.getPropertyValue('--gl-hero-focal-y')).toBe('70%');
  });

  // Écrans de séance, étape 6 (K11) : les vignettes ne pèsent plus sur le premier affichage.
  it('charge les vignettes à la demande, hors du fil principal, avec leurs dimensions', () => {
    render(
      <GLBrandHub
        slots={{
          ...slots,
          card_rules: { ...slots.card_rules, frame: { aspectRatio: '16/9' } },
        }}
      />,
    );
    const images = [...document.querySelectorAll('.gl-brand-hub__card-image')];
    expect(images).toHaveLength(3);
    for (const img of images) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
      expect(Number(img.getAttribute('width'))).toBe(800);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
    }
    const world = document.querySelector('img[src="/uploads/gl_brand/world.png"]');
    expect(world.getAttribute('height')).toBe('600');
    const rules = document.querySelector('img[src="/uploads/gl_brand/rules.png"]');
    expect(rules.getAttribute('height')).toBe('450');
  });

  it('cardImageDimensions suit le ratio du cadre, 4/3 à défaut', () => {
    expect(cardImageDimensions('4/3')).toEqual({ width: 800, height: 600 });
    expect(cardImageDimensions('1/1')).toEqual({ width: 800, height: 800 });
    expect(cardImageDimensions('21 / 9')).toEqual({ width: 800, height: 343 });
    expect(cardImageDimensions('auto')).toEqual({ width: 800, height: 600 });
    expect(cardImageDimensions('4/0')).toEqual({ width: 800, height: 600 });
    expect(cardImageDimensions(undefined)).toEqual({ width: 800, height: 600 });
  });
});
