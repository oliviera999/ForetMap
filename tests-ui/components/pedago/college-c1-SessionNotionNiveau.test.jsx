// @vitest-environment jsdom
// Chantier collège (flux C1, point 5) : le sélecteur « Quiz · niveau de notion » d'une séance
// porte la règle de palier (`cycle3` / `cycle4`) ; par défaut, « tout le public » laisse la
// classe de chaque élève préciser son palier.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(() => Promise.resolve([])),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { SessionConfigForm } = await import('../../../src/components/pedago/SessionsView.jsx');

function renderForm(session) {
  return render(
    <SessionConfigForm
      session={{ id: 's1', title: 'Séance', templateKey: 'college_reconaitre', ...session }}
      sessions={[]}
      maps={[]}
      plants={[]}
      idKeys={[]}
      onCancel={() => {}}
      onSaved={() => {}}
    />,
  );
}

function notionSelect() {
  const label = screen.getByText('Quiz · niveau de notion').closest('label');
  return within(label).getByRole('combobox');
}

describe('Séance — niveau de notion (règle de palier)', () => {
  it('séance collège sans réglage : « tout le collège » par défaut, plus « cycle 4 »', () => {
    renderForm({ level: 'college', config: {} });
    expect(notionSelect()).toHaveValue('college');
  });

  it('séance collège : cycle 3 et cycle 4 proposés, pas les niveaux du lycée', () => {
    renderForm({ level: 'college', config: {} });
    const values = within(notionSelect())
      .getAllByRole('option')
      .map((option) => option.value);
    expect(values).toEqual(['', 'college', 'cycle3', 'cycle4']);
  });

  it('séance lycée : défaut « tout le lycée », sans les cycles du collège', () => {
    renderForm({ level: 'lycee', config: {} });
    const select = notionSelect();
    expect(select).toHaveValue('lycee');
    const values = within(select)
      .getAllByRole('option')
      .map((option) => option.value);
    expect(values).not.toContain('cycle3');
    expect(values).not.toContain('cycle4');
  });

  it('une valeur enregistrée hors du public reste affichée', () => {
    renderForm({ level: 'lycee', config: { notionNiveau: 'cycle4' } });
    const select = notionSelect();
    expect(select).toHaveValue('cycle4');
  });
});
