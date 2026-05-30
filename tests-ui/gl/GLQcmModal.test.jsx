import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLQcmModal } from '../../src/gl/components/GLQcmModal.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLQcmModal', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche la question et soumet une réponse', async () => {
    const user = userEvent.setup();
    vi.mocked(apiGL).mockImplementation((url, method) => {
      if (String(url).includes('/present')) {
        return Promise.resolve({
          presentationToken: 'token-test',
          question: 'Le fennec vit où ?',
          choices: [
            { id: 0, text: 'Désert' },
            { id: 1, text: 'Banquise' },
          ],
          glossaryTerms: [],
        });
      }
      if (method === 'POST') {
        return Promise.resolve({ correct: true, feedback: 'Bonne réponse !', scoreDelta: 1 });
      }
      return Promise.resolve({ question_code: 'QCM0001' });
    });

    render(
      <GLQcmModal
        open
        marker={{ id: 5, label: 'Quiz test', event_type: 'quiz', qcm_question_code: 'QCM0001' }}
        biomeSlugs={['sahara']}
        gameId={42}
        onClose={vi.fn()}
        onAnswered={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Le fennec vit où/i)).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Désert'));
    await user.click(screen.getByRole('button', { name: /Valider ma réponse/i }));

    await waitFor(() => {
      expect(screen.getByText(/Bonne réponse/i)).toBeInTheDocument();
    });
  });
});
