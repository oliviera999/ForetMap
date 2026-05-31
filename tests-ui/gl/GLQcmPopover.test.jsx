import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLQcmPopover } from '../../src/gl/components/GLQcmPopover.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLQcmPopover', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche la question ancrée et valide une réponse', async () => {
    const user = userEvent.setup();
    vi.mocked(apiGL).mockResolvedValue({ correct: true, feedback: 'Bonne réponse !', scoreDelta: 1 });

    render(
      <GLQcmPopover
        open
        marker={{ id: 5, label: 'Repère quiz', x_pct: 40, y_pct: 55 }}
        gameId={42}
        questionCode="QCM0001"
        presentation={{
          presentationToken: 'token-test',
          question: 'Le fennec vit où ?',
          choices: [
            { id: 0, text: 'Désert' },
            { id: 1, text: 'Banquise' },
          ],
          glossaryTerms: [],
        }}
        onClose={vi.fn()}
        onSubmitResult={vi.fn()}
      />
    );

    expect(document.querySelector('.gl-qcm-popover-overlay')).toBeTruthy();
    expect(document.querySelector('.gl-qcm-popover')).toBeTruthy();
    expect(screen.getByText(/Le fennec vit où/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Désert'));
    await user.click(screen.getByRole('button', { name: /C'est cette réponse !/i }));

    await waitFor(() => {
      expect(apiGL).toHaveBeenCalledWith(
        '/api/gl/games/42/qcm/answer',
        'POST',
        expect.objectContaining({ questionCode: 'QCM0001' }),
      );
    });
  });
});
