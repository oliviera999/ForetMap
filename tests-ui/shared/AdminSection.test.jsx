// @vitest-environment jsdom
//
// Accordéon des écrans admin (audit UI, D-3) : état ouvert/fermé mémorisé en
// localStorage (clé `foretmap.adminSection.<id>`), défaut fourni par l'appelant,
// et mode `forceOpen` (recherche active) qui ouvre sans persister.

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminSection } from '../../src/shared/components/AdminSection.jsx';

const KEY = 'foretmap.adminSection.demo';

beforeEach(() => {
  window.localStorage.clear();
});

function details() {
  return document.querySelector('details.admin-section');
}

describe('AdminSection', () => {
  test('fermé par défaut, titre dans le summary, contenu rendu', () => {
    render(
      <AdminSection id="demo" title="Section démo">
        <p>Contenu replié</p>
      </AdminSection>,
    );
    expect(screen.getByText('Section démo')).toBeInTheDocument();
    expect(details().open).toBe(false);
    expect(screen.getByText('Contenu replié')).toBeInTheDocument();
  });

  test('defaultOpen ouvre quand rien n’est mémorisé', () => {
    render(
      <AdminSection id="demo" title="Section démo" defaultOpen>
        <p>Contenu</p>
      </AdminSection>,
    );
    expect(details().open).toBe(true);
  });

  test('le toggle persiste l’état, relu au montage suivant', () => {
    const { unmount } = render(
      <AdminSection id="demo" title="Section démo">
        <p>Contenu</p>
      </AdminSection>,
    );
    // jsdom ne simule pas le clic natif sur <summary> : on émet l'événement toggle
    // après avoir ouvert l'élément, comme le ferait le navigateur.
    details().open = true;
    fireEvent(details(), new Event('toggle'));
    expect(window.localStorage.getItem(KEY)).toBe('1');
    unmount();

    render(
      <AdminSection id="demo" title="Section démo">
        <p>Contenu</p>
      </AdminSection>,
    );
    expect(details().open).toBe(true);
  });

  test('la valeur mémorisée « fermé » l’emporte sur defaultOpen', () => {
    window.localStorage.setItem(KEY, '0');
    render(
      <AdminSection id="demo" title="Section démo" defaultOpen>
        <p>Contenu</p>
      </AdminSection>,
    );
    expect(details().open).toBe(false);
  });

  test('forceOpen ouvre sans persister et annule la fermeture', () => {
    render(
      <AdminSection id="demo" title="Section démo" forceOpen>
        <p>Contenu</p>
      </AdminSection>,
    );
    expect(details().open).toBe(true);

    // Tentative de fermeture pendant la contrainte : rouverte, rien en storage.
    details().open = false;
    fireEvent(details(), new Event('toggle'));
    expect(details().open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe(null);
  });
});
