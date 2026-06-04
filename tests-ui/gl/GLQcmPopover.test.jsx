import React, { useState } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLQcmPopover } from '../../src/gl/components/GLQcmPopover.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

function PopoverWithParentResult(props) {
  const [result, setResult] = useState(null);
  return (
    <GLQcmPopover
      {...props}
      result={result}
      onSubmitResult={(data) => {
        setResult(data);
        props.onSubmitResult?.(data);
      }}
    />
  );
}

describe('GLQcmPopover', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche la question ancrée et valide une réponse', async () => {
    const user = userEvent.setup();
    const onSubmitResult = vi.fn();
    const feedbackText = 'Exact ! Les grandes oreilles du fennec dissipent la chaleur.';
    vi.mocked(apiGL).mockResolvedValue({ correct: true, feedback: feedbackText, scoreDelta: 1 });

    render(
      <PopoverWithParentResult
        open
        marker={{ id: 5, label: 'Repère quiz', x_pct: 40, y_pct: 55 }}
        gameId={42}
        teamId={7}
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
        onSubmitResult={onSubmitResult}
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
        expect.objectContaining({ questionCode: 'QCM0001', teamId: 7 }),
      );
      expect(onSubmitResult).toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(feedbackText);
    });

    expect(screen.queryByLabelText('Désert')).not.toBeInTheDocument();
  });

  test('applique themeStyle sur le portail (hors .gl-app)', () => {
    render(
      <GLQcmPopover
        open
        marker={{ id: 1, label: 'Thème' }}
        themeStyle={{ '--gl-color-primary': '#b91c1c' }}
        presentation={{
          presentationToken: 't',
          question: 'Couleur thème ?',
          choices: [{ id: 0, text: 'A' }, { id: 1, text: 'B' }],
        }}
        onClose={vi.fn()}
      />,
    );
    const overlay = document.querySelector('.gl-qcm-popover-overlay');
    expect(overlay?.style.getPropertyValue('--gl-color-primary')).toBe('#b91c1c');
  });
});
