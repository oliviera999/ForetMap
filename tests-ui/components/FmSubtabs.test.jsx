import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilesAdminSubTabs } from '../../src/components/profiles/ProfilesAdminSubTabs.jsx';

/**
 * Barre de sous-onglets commune (`.fm-subtabs`).
 *
 * L'administration portait quatre barres d'onglets visuellement différentes : `.top-tabs`
 * (Profils, Audit — soit la barre de navigation PRINCIPALE réemployée un niveau plus bas),
 * `.gl-subtabs` (Paramètres, style venu de Gnomes & Licornes), et des `btn btn-sm` déguisés
 * en onglets (Studio mascotte, Pédago — voir `mascot/MascotStudioModeTabs.test.jsx`). Ces
 * tests figent le contrat de la barre unique :
 * la classe de rail, l'état actif porté par `is-active` **et** par `aria-selected`, et le
 * fait que les onglets ne portent plus de classes de bouton.
 *
 * Le rendu (bordure, dégradé, hauteur) vient de `shared/styles/subtabs.css`, non chargé
 * par jsdom : on vérifie le balisage, pas les pixels.
 */
describe('barre de sous-onglets commune', () => {
  test('ProfilesAdminSubTabs : rail .fm-subtabs, onglet courant en is-active', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={vi.fn()}
        canManageProfiles
        accountsFilteredCount={128}
        accountsTotalCount={350}
      />,
    );

    const rail = screen.getByRole('tablist', { name: 'Sections profils' });
    expect(rail).toHaveClass('fm-subtabs');
    // La barre principale du professeur ne doit plus être empruntée par un sous-onglet.
    expect(rail).not.toHaveClass('top-tabs');

    const active = screen.getByRole('tab', { selected: true });
    expect(active).toHaveTextContent('Comptes');
    expect(active).toHaveClass('is-active');

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).not.toMatch(/\btop-tab\b/);
      expect(tab.className).not.toMatch(/\bbtn\b/);
    }
  });

  test('ProfilesAdminSubTabs : le compteur reste lisible sur l’onglet courant', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={vi.fn()}
        canManageProfiles
        accountsFilteredCount={128}
        accountsTotalCount={350}
      />,
    );
    // `.profiles-subtab-count` est en gris ; sur fond vert il lui faut la surcharge blanche
    // de `subtabs.css`, qui cible `.fm-subtabs > button.is-active`. Le balisage doit donc
    // garder le compteur À L'INTÉRIEUR du bouton actif.
    const active = screen.getByRole('tab', { selected: true });
    expect(active.querySelector('.profiles-subtab-count')).not.toBeNull();
  });
});
