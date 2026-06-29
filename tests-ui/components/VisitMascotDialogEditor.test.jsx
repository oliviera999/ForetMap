import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitMascotDialogEditor from '../../src/components/VisitMascotDialogEditor.jsx';

describe('VisitMascotDialogEditor — comportements personnalisés', () => {
  test('liste les déclencheurs personnalisés et édite leur bulle dans le profil', () => {
    const onProfileChange = vi.fn();
    render(
      <VisitMascotDialogEditor
        profile={{}}
        onProfileChange={onProfileChange}
        customTriggers={[
          { key: 'ambient_yawn', label: 'Bâille', type: 'periodic', dialog: ['Hmm...'] },
        ]}
      />,
    );
    // La section et le déclencheur apparaissent.
    expect(screen.getByText('Bulles des comportements personnalisés')).toBeTruthy();
    expect(screen.getByText('Bâille')).toBeTruthy();
    // La bulle inline est pré-remplie ; l'édition écrit sous la clé du déclencheur.
    const input = screen.getByDisplayValue('Hmm...');
    fireEvent.change(input, { target: { value: 'Quelle belle forêt' } });
    expect(onProfileChange).toHaveBeenCalled();
    const lastArg = onProfileChange.mock.calls.at(-1)[0];
    expect(lastArg.ambient_yawn).toEqual(['Quelle belle forêt']);
  });

  test('aucune section si pas de déclencheur personnalisé', () => {
    render(<VisitMascotDialogEditor profile={{}} onProfileChange={() => {}} />);
    expect(screen.queryByText('Bulles des comportements personnalisés')).toBeNull();
  });
});
