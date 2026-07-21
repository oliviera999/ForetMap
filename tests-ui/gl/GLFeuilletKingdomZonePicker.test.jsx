import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLFeuilletKingdomZonePicker } from '../../src/gl/components/admin/GLFeuilletKingdomZonePicker.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('GLFeuilletKingdomZonePicker', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/chapters') return [{ id: 1, name: 'Chapitre 1' }];
      if (path.startsWith('/api/gl/kingdom-map/zones'))
        return { zones: [{ id: 7, label: 'Oasis', chapter_id: 1 }] };
      return {};
    });
  });

  test('charge les chapitres au montage', async () => {
    render(
      <GLFeuilletKingdomZonePicker feuilletCode="ep-01" kingdomZoneId={null} onLinked={vi.fn()} />,
    );
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/chapters'));
    expect(await screen.findByText('Chapitre 1')).toBeInTheDocument();
  });

  test('sélectionner un chapitre charge ses zones', async () => {
    render(
      <GLFeuilletKingdomZonePicker feuilletCode="ep-01" kingdomZoneId={null} onLinked={vi.fn()} />,
    );
    const chapterSelect = await screen.findByLabelText('Chapitre');
    fireEvent.change(chapterSelect, { target: { value: '1' } });
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/kingdom-map/zones?chapterId=1'),
    );
  });

  test('choisir une zone puis « Associer » persiste le lien et notifie', async () => {
    const onLinked = vi.fn();
    render(
      <GLFeuilletKingdomZonePicker feuilletCode="ep-01" kingdomZoneId={null} onLinked={onLinked} />,
    );

    const chapterSelect = await screen.findByLabelText('Chapitre');
    fireEvent.change(chapterSelect, { target: { value: '1' } });

    const zoneSelect = await screen.findByLabelText('Zone du royaume');
    await screen.findByText('Oasis');
    fireEvent.change(zoneSelect, { target: { value: '7' } });

    fireEvent.click(screen.getByText('Associer'));

    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/feuillets/ep-01/kingdom-zone',
        'PUT',
        { kingdomZoneId: 7 },
      ),
    );
    expect(onLinked).toHaveBeenCalledWith(7);
  });
});
