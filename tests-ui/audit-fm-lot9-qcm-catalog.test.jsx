import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QcmCatalogPanel } from '../src/shared/qcm/QcmCatalogPanel.jsx';

/**
 * Audit ForetMap du 19/11/2026, constat F7 : la liste du catalogue QCM était rechargée à
 * chaque frappe, sans garde « dernière réponse gagne ». Une réponse lente à une recherche
 * ancienne pouvait arriver après la plus récente et remplacer la liste affichée.
 */

const Button = ({ children, ...props }) => (
  <button type="button" {...props}>
    {children}
  </button>
);
const Field = ({ label, children }) => (
  <label>
    <span>{label}</span>
    {children}
  </label>
);
const Input = (props) => <input {...props} />;
const Select = ({ children, ...props }) => <select {...props}>{children}</select>;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPanel(request) {
  return render(
    <QcmCatalogPanel
      title="Catalogue"
      scopeQueryKey="theme"
      scopeLabel="Thème"
      listMeta={() => ''}
      adminBasePath="/api/quiz/admin"
      questionsListPath="/api/quiz/admin/questions"
      presentPath={(c) => `/p/${c}`}
      answerPath={(c) => `/a/${c}`}
      templateFilename="t.xlsx"
      exportFilename="e.xlsx"
      request={request}
      downloadFile={vi.fn()}
      FeedbackBlock={() => null}
      Button={Button}
      Field={Field}
      Input={Input}
      Select={Select}
    />,
  );
}

function listCalls(request) {
  return request.mock.calls.map(([path]) => path).filter((p) => p.includes('/admin/questions?'));
}

describe('QcmCatalogPanel — recherche (audit lot 9, F7)', () => {
  test('une frappe rapide ne déclenche qu’un chargement (anti-rebond)', async () => {
    const request = vi.fn(async (path) => (path.endsWith('/stats') ? {} : { items: [] }));
    renderPanel(request);
    await waitFor(() => expect(listCalls(request)).toHaveLength(1));

    const input = screen.getByPlaceholderText('trame…');
    fireEvent.change(input, { target: { value: 'c' } });
    fireEvent.change(input, { target: { value: 'ch' } });
    fireEvent.change(input, { target: { value: 'che' } });

    await waitFor(() => expect(listCalls(request)).toHaveLength(2));
    expect(listCalls(request)[1]).toContain('q=che');
    // Aucun chargement intermédiaire pour « c » ou « ch ».
    expect(listCalls(request).some((p) => /q=ch(&|$)|q=c(&|$)/.test(p))).toBe(false);
  });

  test('une réponse périmée n’écrase pas la liste de la recherche la plus récente', async () => {
    const pending = new Map();
    const request = vi.fn((path) => {
      if (path.endsWith('/stats')) return Promise.resolve({});
      const d = deferred();
      pending.set(path, d);
      return d.promise;
    });
    renderPanel(request);
    await waitFor(() => expect(listCalls(request)).toHaveLength(1));
    const first = listCalls(request)[0];

    const input = screen.getByPlaceholderText('trame…');
    fireEvent.change(input, { target: { value: 'chene' } });
    await waitFor(() => expect(listCalls(request)).toHaveLength(2));
    const second = listCalls(request)[1];

    // La recherche récente répond d'abord…
    await act(async () => {
      pending.get(second).resolve({
        items: [{ question_code: 'QF0002', question: 'Le chêne est-il un arbre ?' }],
      });
    });
    expect(await screen.findByText(/Le chêne est-il un arbre/)).toBeTruthy();

    // … puis la réponse du chargement initial, plus lente, arrive : elle est ignorée.
    await act(async () => {
      pending.get(first).resolve({
        items: [{ question_code: 'QF0001', question: 'Question sans rapport' }],
      });
    });
    expect(screen.queryByText(/Question sans rapport/)).toBeNull();
    expect(screen.getByText(/Le chêne est-il un arbre/)).toBeTruthy();
  });
});
