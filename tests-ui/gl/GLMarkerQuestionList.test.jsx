import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLMarkerQuestionList } from '../../src/gl/components/GLMarkerQuestionList.jsx';

const ITEMS = [
  {
    question_code: 'QCM0001',
    biome_slug: 'desert',
    categorie_slug: 'faune',
    niveau: 'base',
    difficulte: 2,
    question: 'Où vit le fennec ?',
  },
  {
    question_code: 'QCM0002',
    biome_slug: 'desert',
    categorie_slug: 'flore',
    niveau: 'base',
    difficulte: 1,
    question: 'Quelle plante résiste à la chaleur ?',
  },
];

describe('GLMarkerQuestionList', () => {
  test('mode fixe : sélectionne une question au clic', async () => {
    const user = userEvent.setup();
    const onSelectFixed = vi.fn();

    render(
      <GLMarkerQuestionList
        items={ITEMS}
        mode="fixed"
        fixedQuestionCode=""
        onSelectFixed={onSelectFixed}
      />,
    );

    expect(screen.getByText('Où vit le fennec ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Choisir QCM0001/i }));
    expect(onSelectFixed).toHaveBeenCalledWith('QCM0001');
  });

  test('mode aléatoire : bascule une case à cocher', async () => {
    const user = userEvent.setup();
    const onToggleCode = vi.fn();

    render(
      <GLMarkerQuestionList
        items={ITEMS}
        mode="random"
        selectedQuestionCodes={[]}
        onToggleCode={onToggleCode}
      />,
    );

    await user.click(screen.getByLabelText('Inclure QCM0002'));
    expect(onToggleCode).toHaveBeenCalledWith('QCM0002');
  });
});
