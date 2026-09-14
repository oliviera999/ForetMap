import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
let token = 'jwt';
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => token,
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { FmJournalImportButton } from '../../../src/components/journal/FmJournalImportButton.jsx';

const base = { resourceType: 'plant', resourceRef: 12, title: 'Noisetier', learned: true };

describe('FmJournalImportButton — bouton d’import partagé, garde de session ForetMap', () => {
  beforeEach(() => {
    apiMock.mockReset();
    token = 'jwt';
  });

  test('sans session : rien ; module désactivé : rien', () => {
    token = '';
    const { container, unmount } = render(<FmJournalImportButton {...base} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    token = 'jwt';
    const { container: c2 } = render(<FmJournalImportButton {...base} enabled={false} />);
    expect(c2).toBeEmptyDOMElement();
  });

  test('non appris : indication ; appris : import via POST puis badge', async () => {
    const { unmount } = render(<FmJournalImportButton {...base} learned={false} />);
    expect(screen.getByText(/Marque-le comme appris/)).toBeInTheDocument();
    unmount();

    const onImported = vi.fn();
    apiMock.mockResolvedValue({ import: { id: 5 } });
    render(<FmJournalImportButton {...base} onImported={onImported} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter « Noisetier » au carnet' }));
    await waitFor(() => expect(screen.getByText('✓ Dans mon carnet')).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith('/api/user-journal/me/imports', 'POST', {
      resourceType: 'plant',
      resourceRef: '12',
      title: 'Noisetier',
    });
    expect(onImported).toHaveBeenCalledWith({ id: 5 });
  });

  test('échec : message d’erreur, bouton de nouveau actif ; déjà importé : badge direct', async () => {
    apiMock.mockRejectedValue(new Error('Quota'));
    const { unmount } = render(<FmJournalImportButton {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    await waitFor(() => expect(screen.getByText('Quota')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Ajouter/ })).not.toBeDisabled();
    unmount();

    render(<FmJournalImportButton {...base} alreadyImported />);
    expect(screen.getByText('✓ Dans mon carnet')).toBeInTheDocument();
    expect(screen.getByText('✓ Dans mon carnet').className).toContain('fm-journal-import__done');
  });
});
