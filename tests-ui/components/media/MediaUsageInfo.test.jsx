import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaUsageInfo, formatUsageLocation } from '../../../src/components/media/MediaUsageInfo.jsx';

describe('formatUsageLocation', () => {
  test('repli sur « Référence » quand kind absent', () => {
    expect(formatUsageLocation({})).toBe('Référence');
  });

  test('compose kind, label et field', () => {
    expect(formatUsageLocation({ kind: 'Zone', label: 'Forêt', field: 'photo' }))
      .toBe('Zone — Forêt (photo)');
  });
});

describe('MediaUsageInfo', () => {
  test('non prêt → libellé « Usage… »', () => {
    render(<MediaUsageInfo ready={false} />);
    expect(screen.getByText('Usage…')).toBeTruthy();
  });

  test('prêt sans usage → « Inutilisée »', () => {
    render(<MediaUsageInfo ready usage={null} />);
    expect(screen.getByText('Inutilisée')).toBeTruthy();
  });

  test('prêt avec usage → badge de comptage et localisations limitées', () => {
    const usage = {
      count: 4,
      locations: [
        { kind: 'Zone', id: 1, field: 'photo', label: 'A' },
        { kind: 'Repère', id: 2, field: 'icon', label: 'B' },
      ],
    };
    render(<MediaUsageInfo ready usage={usage} limit={1} />);
    expect(screen.getByText('Utilisée · 4')).toBeTruthy();
    expect(screen.getByText('Zone — A (photo)')).toBeTruthy();
    // limit=1 → 1 affichée, 3 restantes
    expect(screen.getByText('+3 autres')).toBeTruthy();
  });

  test('une seule localisation restante → « +1 autre » au singulier', () => {
    const usage = {
      count: 2,
      locations: [
        { kind: 'Zone', id: 1, field: 'photo', label: 'A' },
        { kind: 'Repère', id: 2, field: 'icon', label: 'B' },
      ],
    };
    render(<MediaUsageInfo ready usage={usage} limit={1} />);
    expect(screen.getByText('+1 autre')).toBeTruthy();
  });
});
