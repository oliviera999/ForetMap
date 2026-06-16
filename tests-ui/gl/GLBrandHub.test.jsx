/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { GLBrandHub } from '../../src/gl/components/GLBrandHub.jsx';

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
});
