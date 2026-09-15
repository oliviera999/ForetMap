/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceStatusBadge } from '../../src/shared/components/PresenceStatusBadge.jsx';
import { applyPresenceUpdateToRows } from '../../src/shared/presenceListPatch.js';

describe('PresenceStatusBadge', () => {
  it('affiche le libellé En ligne', () => {
    render(<PresenceStatusBadge status="online" />);
    expect(screen.getByLabelText(/En ligne/i)).toBeTruthy();
  });
});

describe('applyPresenceUpdateToRows', () => {
  it('met à jour la ligne ciblée sans toucher les autres', () => {
    const rows = [
      { id: '1', presence_status: 'offline' },
      { id: '2', presence_status: 'offline' },
    ];
    const next = applyPresenceUpdateToRows(rows, {
      userId: '1',
      status: 'online',
      label: 'En ligne',
    });
    expect(next[0].presence_status).toBe('online');
    expect(next[1].presence_status).toBe('offline');
  });
});
