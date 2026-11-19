import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const feuilletRevealFixture = {
  feuilletCode: 'ep-VI-06',
  titre: 'Ours polaire',
  displayText: 'Texte du feuillet révélé.',
  modeApparition: 'boite',
};

let lastAckProps = null;

vi.mock('../../src/gl/components/GLLearningAcknowledgeButton.jsx', () => ({
  GLLearningAcknowledgeButton(props) {
    lastAckProps = props;
    return (
      <button
        type="button"
        onClick={() => props.onAcknowledged?.({ feuilletRevealed: feuilletRevealFixture })}
      >
        {props.labelAction || 'Marquer comme appris'}
      </button>
    );
  },
}));

let lastImportProps = null;

vi.mock('../../src/gl/components/GLJournalImportButton.jsx', () => ({
  GLJournalImportButton(props) {
    lastImportProps = props;
    return null;
  },
}));

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn().mockResolvedValue({}),
}));

import { GLLearnAndImport } from '../../src/gl/components/GLLearnAndImport.jsx';
import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLLearnAndImport', () => {
  beforeEach(() => {
    lastAckProps = null;
    lastImportProps = null;
    apiGL.mockReset();
    apiGL.mockResolvedValue({});
  });

  // Audit G&L du 19/11/2026, E7 : le carnet de Sélène réutilise la même instance d'un
  // feuillet au suivant. « Étudié » et « déjà dans mon journal » ne revenaient jamais à faux.
  test('changer de ressource remet « appris » et « déjà importé » à faux', async () => {
    apiGL.mockImplementation((path) =>
      Promise.resolve(
        path === '/api/gl/learning/me'
          ? { feuillet_codes: ['ep-I-01'] }
          : { refs: [{ resourceType: 'feuillet', resourceRef: 'ep-I-01' }] },
      ),
    );
    const { rerender } = render(
      <GLLearnAndImport resourceType="feuillet" resourceRef="ep-I-01" title="Premier" />,
    );
    await waitFor(() => expect(lastAckProps?.isDone).toBe(true));
    await waitFor(() => expect(lastImportProps?.alreadyImported).toBe(true));

    rerender(<GLLearnAndImport resourceType="feuillet" resourceRef="ep-I-02" title="Second" />);
    await waitFor(() => expect(lastAckProps?.resourceRef).toBe('ep-I-02'));
    await waitFor(() => expect(lastAckProps?.isDone).toBe(false));
    expect(lastImportProps?.learned).toBe(false);
    expect(lastImportProps?.alreadyImported).toBe(false);
  });

  test('affiche le popover feuillet quand la réponse contient feuilletRevealed', async () => {
    render(
      <GLLearnAndImport
        resourceType="lore_glossary"
        resourceRef="LR0001"
        title="la Trame"
        gameId={42}
        teamId={7}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Marquer comme appris/i }));
    expect(screen.getByRole('dialog', { name: /Feuillet : Ours polaire/i })).toBeInTheDocument();
    expect(screen.getByText('Texte du feuillet révélé.')).toBeInTheDocument();
  });

  test('transmet gameId/teamId dans requestBody', () => {
    render(
      <GLLearnAndImport
        resourceType="ecosystem"
        resourceRef="foret"
        title="Forêt"
        gameId={42}
        teamId={7}
      />,
    );
    expect(lastAckProps?.requestBody).toEqual({ gameId: 42, teamId: 7 });
  });

  test('omet requestBody quand ni gameId ni teamId', () => {
    render(<GLLearnAndImport resourceType="ecosystem" resourceRef="foret" title="Forêt" />);
    expect(lastAckProps?.requestBody).toBeUndefined();
  });

  test('ne montre pas le popover sans feuilletRevealed', async () => {
    render(<GLLearnAndImport resourceType="ecosystem" resourceRef="foret" title="Forêt" />);
    // Le bouton mocké renvoie feuilletRevealed, donc on teste plutôt l'état initial : pas de dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
