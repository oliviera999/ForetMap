import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';

import { GLNatureView } from '../../src/gl/components/GLNatureView.jsx';
import { GLAdventureView } from '../../src/gl/components/GLAdventureView.jsx';
import { GLMondeView } from '../../src/gl/components/GLMondeView.jsx';
import { GLJoueursView } from '../../src/gl/components/GLJoueursView.jsx';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';
import { GL_DISCOVERY_TOURS, GL_HUB_STEPS } from '../../src/gl/constants/glDiscoveryTour.js';

/**
 * Les ancres `data-gl-tour` **rendues**, pas seulement écrites.
 *
 * `tests/gl-tour-corpus-olu.test.js` vérifie qu'une ancre citée par un parcours existe
 * quelque part dans `src/gl/` — c'est une garantie de texte. Elle ne dit pas que
 * l'élément arrive dans le DOM. Une étape dont la cible ne se peint jamais est écartée
 * en silence par le moteur : le parcours rétrécit sans que rien ne le signale.
 *
 * Ces cas couvrent les quatre barres de sous-onglets, ancres des étapes d'orientation
 * partagées — donc celles qui, tombant, feraient disparaître une bulle de treize
 * parcours d'un coup.
 */

const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((key) => [key, true]));

function anchorOf(step) {
  const match = /^\[data-gl-tour="([a-z0-9-]+)"\]$/.exec(step.target || '');
  if (!match) throw new Error(`l’étape « ${step.key} » ne vise pas une ancre data-gl-tour`);
  return match[0];
}

describe('ancres de visite guidée GL', () => {
  test('la barre de sous-onglets « La nature » porte son ancre', () => {
    const { container } = render(
      <GLNatureView
        activeSubTab="ecosystemes"
        onSubTabChange={() => {}}
        gameState={{ game: { id: 1 } }}
        onOpenGlossaryTerm={() => {}}
      />,
    );
    expect(container.querySelector(anchorOf(GL_HUB_STEPS.nature))).not.toBeNull();
  });

  test('la barre de sous-onglets « L’aventure » porte son ancre', () => {
    const { container } = render(
      <GLAdventureView
        activeSubTab="history"
        onSubTabChange={() => {}}
        modules={allModules}
        gameState={{ game: { id: 1, chapter_spells: [] } }}
        onOpenGlossaryTerm={() => {}}
        onOpenLoreTerm={() => {}}
        onOpenSpell={() => {}}
        canSpellCast={false}
        onLaunchSpell={() => {}}
        isMj={false}
      />,
    );
    expect(container.querySelector(anchorOf(GL_HUB_STEPS.adventure))).not.toBeNull();
  });

  test('la barre de sous-onglets « Le monde G&L » porte son ancre', () => {
    const { container } = render(
      <GLMondeView
        activeSubTab="world"
        onSubTabChange={() => {}}
        modules={allModules}
        auth={null}
        onOpenGlossaryTerm={() => {}}
      />,
    );
    expect(container.querySelector(anchorOf(GL_HUB_STEPS.monde))).not.toBeNull();
  });

  test('la barre de sous-onglets « Les joueurs » porte son ancre', () => {
    const { container } = render(
      <GLJoueursView
        activeSubTab="stats"
        onSubTabChange={() => {}}
        modules={allModules}
        vitalityEnabled
        includeMarket={false}
        showStaffAdminUi={false}
        canModerateForum={false}
        auth={null}
        classes={[]}
      />,
    );
    expect(container.querySelector(anchorOf(GL_HUB_STEPS.joueurs))).not.toBeNull();
  });

  test('chaque étape d’orientation est bien partagée par les sous-onglets de son groupe', () => {
    // Une étape de hub recopiée au lieu d'être référencée divergerait à la première
    // réécriture : le studio n'en propose qu'une seule pour tout le groupe.
    const groups = {
      nature: ['ecosystemes', 'biodiversite', 'glossary'],
      adventure: ['history', 'selene-carnet', 'spells'],
      monde: ['world', 'rules', 'lore-glossary', 'tutorials'],
      joueurs: ['forum', 'market', 'stats'],
    };
    for (const [hub, tabs] of Object.entries(groups)) {
      for (const tab of tabs) {
        const first = GL_DISCOVERY_TOURS[tab]?.steps?.[0];
        expect(first, `parcours ${tab} : aucune étape`).toBeDefined();
        expect(first, `parcours ${tab} : n’ouvre pas sur l’étape « ${hub} »`).toBe(
          GL_HUB_STEPS[hub],
        );
      }
    }
  });
});
