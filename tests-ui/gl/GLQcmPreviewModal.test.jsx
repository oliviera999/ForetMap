import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLQcmPreviewModal } from '../../src/gl/components/admin/GLQcmPreviewModal.jsx';

function renderModal(props = {}) {
  return render(
    <GLQcmPreviewModal
      previewCode="Q1"
      presentLoading={false}
      answerLoading={false}
      presentation={{
        question: 'Quelle couleur ?',
        choices: [
          { id: 1, text: 'Bleu' },
          { id: 2, text: 'Rouge' },
        ],
      }}
      feedback={null}
      selectedChoiceId={null}
      onReload={vi.fn()}
      onSelectChoice={vi.fn()}
      onSubmitAnswer={vi.fn()}
      onClose={vi.fn()}
      onCloseFromFeedback={vi.fn()}
      {...props}
    />,
  );
}

describe('GLQcmPreviewModal', () => {
  test('ne rend rien sans code prévisualisé', () => {
    renderModal({ previewCode: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('affiche le code, la question et les choix', () => {
    renderModal();
    expect(screen.getByText('Aperçu — Q1')).toBeInTheDocument();
    expect(screen.getByText('Quelle couleur ?')).toBeInTheDocument();
    expect(screen.getByText('Bleu')).toBeInTheDocument();
    expect(screen.getByText('Rouge')).toBeInTheDocument();
  });

  test('affiche le chargement de présentation', () => {
    renderModal({ presentLoading: true });
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
  });

  test('remonte la sélection d’un choix', () => {
    const onSelectChoice = vi.fn();
    renderModal({ onSelectChoice });
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(onSelectChoice).toHaveBeenCalledWith(2);
  });

  test('le bouton Valider est désactivé sans choix sélectionné', () => {
    renderModal({ selectedChoiceId: null });
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  test('Valider actif et déclenche onSubmitAnswer quand un choix est sélectionné', () => {
    const onSubmitAnswer = vi.fn();
    renderModal({ selectedChoiceId: 1, onSubmitAnswer });
    const valider = screen.getByRole('button', { name: 'Valider' });
    expect(valider).not.toBeDisabled();
    fireEvent.click(valider);
    expect(onSubmitAnswer).toHaveBeenCalledTimes(1);
  });

  test('Re-mélanger appelle onReload, Fermer appelle onClose (phase question)', () => {
    const onReload = vi.fn();
    const onClose = vi.fn();
    renderModal({ onReload, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Re-mélanger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('affiche l’erreur de feedback en phase question', () => {
    renderModal({ feedback: { error: 'Validation impossible' } });
    expect(screen.getByText('Validation impossible')).toBeInTheDocument();
  });

  test('phase feedback : affiche le bloc résultat et les actions dédiées', () => {
    const onReload = vi.fn();
    const onCloseFromFeedback = vi.fn();
    renderModal({
      feedback: { correct: true, status: 'answered', isCorrect: true },
      onReload,
      onCloseFromFeedback,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle présentation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onCloseFromFeedback).toHaveBeenCalledTimes(1);
  });
});
