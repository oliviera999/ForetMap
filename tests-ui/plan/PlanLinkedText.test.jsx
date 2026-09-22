// @vitest-environment jsdom
//
// Rendu des textes éditoriaux du Plan des personnels (proflyautey).
//
// Les compléments réservés d'un lieu (`location_notes`) sont rédigés dans la console, avec la
// chaîne Markdown complète : paragraphes séparés d'une ligne vide, listes à puces « - ». Le
// Plan n'embarque volontairement pas `marked` — il est chargé sur le téléphone d'un agent, en
// réseau d'établissement — et rendait donc tout le texte dans un unique `<p>`. Or HTML replie
// les retours à la ligne en espaces : un encart aéré en blocs et en puces arrivait ici en un
// seul pavé, tirets compris, alors que le même texte s'affichait correctement sur la carte de
// travail et dans la Visite.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { PlanLinkedText } from '../../src/plan/utils/planLinkedText.jsx';

describe('PlanLinkedText — mise en blocs', () => {
  it('un texte d’une seule ligne reste un paragraphe unique portant la classe', () => {
    const { container } = render(
      <PlanLinkedText className="plan-place__lead" text="Entrée côté rue, code à la loge." />,
    );
    const root = container.firstChild;
    expect(root.tagName).toBe('P');
    expect(root.className).toBe('plan-place__lead');
    expect(root.textContent).toBe('Entrée côté rue, code à la loge.');
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });

  it('les lignes vides deviennent des paragraphes distincts', () => {
    const { container } = render(
      <PlanLinkedText
        className="plan-place__restricted-text"
        text={'Premier bloc.\n\nSecond bloc.'}
      />,
    );
    const root = container.firstChild;
    expect(root.tagName).toBe('DIV');
    expect(root.className).toBe('plan-place__restricted-text');
    const paragraphs = container.querySelectorAll('p.plan-place__para');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('Premier bloc.');
    expect(paragraphs[1].textContent).toBe('Second bloc.');
  });

  it('un retour à la ligne simple pose un <br>, pas une espace', () => {
    const { container } = render(<PlanLinkedText text={'Ligne une.\nLigne deux.'} />);
    expect(container.querySelectorAll('p.plan-place__para')).toHaveLength(1);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('les puces « - » deviennent une vraie liste, sans le tiret', () => {
    const { container } = render(
      <PlanLinkedText
        className="plan-place__restricted-text"
        text={'Consignes :\n- fermer le portillon\n- prévenir la loge'}
      />,
    );
    expect(container.querySelectorAll('p.plan-place__para')).toHaveLength(1);
    const items = container.querySelectorAll('ul.plan-place__list li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('fermer le portillon');
    expect(items[1].textContent).toBe('prévenir la loge');
    expect(container.textContent).not.toContain('- fermer');
  });

  it('un lien reste cliquable à l’intérieur d’une puce', () => {
    const { container } = render(
      <PlanLinkedText text={'- voir la [Fiche PDF](https://exemple.org/a.pdf)'} />,
    );
    const link = container.querySelector('ul.plan-place__list li a.plan-place__link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://exemple.org/a.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBe('Fiche PDF (ouvre un nouvel onglet)');
  });

  it('un texte vide ne rend rien', () => {
    const { container } = render(<PlanLinkedText text="   " />);
    expect(container.firstChild).toBeNull();
  });
});
